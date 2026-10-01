#include "iotps/core/transport/capture.hpp"

#include <algorithm>
#include <array>
#include <charconv>
#include <map>
#include <stdexcept>

namespace iotps::core::transport {
namespace {
using Bytes = std::span<const std::uint8_t>;
std::uint32_t integer(Bytes bytes, std::size_t at, std::size_t width, bool little = false) {
    if (at > bytes.size() || width > bytes.size() - at)
        throw std::runtime_error("Truncated PCAP header");
    std::uint32_t value = 0;
    for (std::size_t i = 0; i < width; ++i)
        value = (value << 8) | bytes[at + (little ? width - i - 1 : i)];
    return value;
}
std::string ip(Bytes bytes, std::size_t at) {
    return std::to_string(bytes[at]) + "." + std::to_string(bytes[at + 1]) + "." +
           std::to_string(bytes[at + 2]) + "." + std::to_string(bytes[at + 3]);
}
bool ipv4(const std::string& text) {
    std::size_t at = 0;
    for (int part = 0; part < 4; ++part) {
        const auto end = part == 3 ? text.size() : text.find('.', at);
        if (end == std::string::npos || end <= at || end - at > 3)
            return false;
        unsigned value = 0;
        const auto parsed = std::from_chars(text.data() + at, text.data() + end, value);
        if (parsed.ec != std::errc{} || parsed.ptr != text.data() + end || value > 255 ||
            (end - at > 1 && text[at] == '0'))
            return false;
        at = end + 1;
    }
    return at == text.size() + 1;
}
struct Segment {
    std::int64_t offset;
    std::int64_t time;
    ByteBuffer bytes;
};
struct Stream {
    std::optional<std::uint32_t> base;
    bool syn{false};
    bool unsafe{false};
    std::optional<std::int64_t> fin;
    std::vector<Segment> segments;
};
struct Connection {
    std::uint64_t id;
    std::string remote;
    std::optional<std::uint32_t> syn;
    bool reset{false};
    std::array<Stream, 2> streams;
};
} // namespace

CaptureResult import_pcap(Bytes file, const std::string& local, FrameRule framing,
                          const schema::ProtocolSchema* protocol, const std::string& path,
                          const std::string& message) {
    if (file.size() < 24 || file.size() > 16 * 1024 * 1024)
        throw std::invalid_argument("PCAP must be 24 bytes to 16 MiB");
    if (!ipv4(local))
        throw std::invalid_argument("Specify the captured local IPv4 address");
    if (const auto error = frame_rule_error(framing); !error.empty())
        throw std::invalid_argument(error);
    if (protocol && !message.empty() &&
        std::ranges::none_of(protocol->messages,
                             [&](const auto& item) { return item.name == message; }))
        throw std::invalid_argument("Unknown bound message");
    const auto magic = integer(file, 0, 4);
    const bool little = magic == 0xd4c3b2a1 || magic == 0x4d3cb2a1;
    const bool nano = magic == 0xa1b23c4d || magic == 0x4d3cb2a1;
    if (!little && magic != 0xa1b2c3d4 && magic != 0xa1b23c4d)
        throw std::invalid_argument(
            "Only classic PCAP is supported; convert PCAPNG before importing");
    if (integer(file, 4, 2, little) != 2 || integer(file, 6, 2, little) != 4)
        throw std::invalid_argument("Unsupported PCAP version (requires 2.4)");
    const auto snap = integer(file, 16, 4, little);
    if (!snap || (integer(file, 20, 4, little) & 0xffff) != 1)
        throw std::invalid_argument("Only Ethernet LINKTYPE 1 (including VLAN) is supported");

    CaptureResult result;
    std::size_t retained_bytes = 0, stream_bytes = 0, packets = 0, issues = 0;
    std::int64_t last_time = 0, last_precise = 0;
    std::vector<Connection> connections;
    std::map<std::string, std::size_t> active;
    std::vector<TcpRecord> diagnostics;
    std::map<std::string, std::size_t> issue_counts;
    const auto add = [&](std::int64_t time, std::string direction, std::uint64_t peer,
                         std::string address, ByteBuffer bytes, std::string detail,
                         std::string flow = {}, std::int64_t precise_time = -1) {
        TcpRecord record{};
        // Temporary sort key preserves sub-millisecond order; archive times remain ms.
        record.id = static_cast<std::uint64_t>(precise_time < 0 ? time * 1000000 : precise_time);
        record.time_ms = time;
        record.direction = std::move(direction);
        record.peer = peer;
        record.address = std::move(address);
        record.data = std::move(bytes);
        record.detail = std::move(detail);
        record.flow = std::move(flow);
        if (record.direction == "FRAME")
            record.parsed = parse_frame(protocol, path, message, record.data);
        retained_bytes += record.data.size();
        result.records.push_back(std::move(record));
        // ponytail: bounded 1000-record ring uses vector erase; replace if import profiling
        // warrants it.
        while (result.records.size() > 1000 || retained_bytes > 4 * 1024 * 1024) {
            retained_bytes -= result.records.front().data.size();
            result.records.erase(result.records.begin());
            ++result.dropped;
        }
    };
    const auto issue = [&](std::int64_t time, const std::string& text, std::uint64_t peer = 0,
                           const std::string& address = "") {
        ++issues;
        std::string category = "other";
        for (const auto* kind : {"truncated", "unsupported", "gap", "partial", "overlap", "limit",
                                 "SYN", "framing", "reset", "missing", "invalid"})
            if (text.find(kind) != std::string::npos) {
                category = kind;
                break;
            }
        ++issue_counts[category];
        TcpRecord record{};
        record.time_ms = time;
        record.direction = "SYS";
        record.peer = peer;
        record.address = address;
        record.detail = "PCAP: " + text;
        diagnostics.push_back(std::move(record));
        if (diagnostics.size() > 100) {
            diagnostics.erase(diagnostics.begin());
            ++result.dropped;
        }
    };
    for (std::size_t at = 24; at < file.size();) {
        if (++packets > 100000)
            throw std::invalid_argument("PCAP exceeds 100000 packets");
        if (file.size() - at < 16) {
            issue(last_time, "truncated packet header; remaining file skipped");
            break;
        }
        const auto seconds = integer(file, at, 4, little);
        const auto fraction = integer(file, at + 4, 4, little);
        const auto captured = integer(file, at + 8, 4, little);
        const auto original = integer(file, at + 12, 4, little);
        if (fraction >= (nano ? 1000000000u : 1000000u) || captured > original || captured > snap)
            throw std::invalid_argument("Invalid PCAP packet timestamp or length");
        const auto time =
            static_cast<std::int64_t>(seconds) * 1000 + fraction / (nano ? 1000000 : 1000);
        const auto precise = static_cast<std::int64_t>(seconds) * 1000000000 +
                             static_cast<std::int64_t>(fraction) * (nano ? 1 : 1000);
        last_time = std::max(last_time, time);
        last_precise = std::max(last_precise, precise);
        at += 16;
        if (captured > file.size() - at) {
            issue(time, "truncated packet data; remaining file skipped");
            break;
        }
        auto packet = file.subspan(at, captured);
        at += captured;
        const auto packet_issue = [&](const std::string& text) {
            issue(time, "packet " + std::to_string(packets) + ": " + text);
        };
        if (captured < original)
            packet_issue("capture truncated (snaplen); missing bytes are never decoded");
        if (packet.size() < 14) {
            packet_issue("truncated Ethernet header");
            continue;
        }
        auto type = integer(packet, 12, 2);
        std::size_t network = 14;
        while ((type == 0x8100 || type == 0x88a8) && network <= 22) {
            if (packet.size() < network + 4)
                break;
            type = integer(packet, network + 2, 2);
            network += 4;
        }
        if (type != 0x0800) {
            packet_issue("unsupported EtherType " + std::to_string(type) + " (IPv4 only)");
            continue;
        }
        packet = packet.subspan(network);
        if (packet.size() < 20 || packet[0] >> 4 != 4) {
            packet_issue("invalid/truncated IPv4 header");
            continue;
        }
        const auto header = static_cast<std::size_t>(packet[0] & 15) * 4;
        const auto total = integer(packet, 2, 2);
        if (header < 20 || total < header || packet.size() < total) {
            packet_issue("invalid/truncated IPv4 packet; payload skipped");
            continue;
        }
        if (integer(packet, 6, 2) & 0x3fff) {
            packet_issue("IPv4 fragmentation is unsupported; payload skipped");
            continue;
        }
        const auto source = ip(packet, 12), destination = ip(packet, 16);
        if ((source == local) == (destination == local)) {
            packet_issue("packet does not have exactly one local endpoint; payload skipped");
            continue;
        }
        const auto flow = source == local ? "TX" : "RX";
        const auto transport = packet[9];
        auto data = packet.subspan(header, total - header);
        if ((transport != 6 && transport != 17) || data.size() < (transport == 6 ? 20u : 8u)) {
            packet_issue("unsupported protocol or truncated TCP/UDP header");
            continue;
        }
        const auto source_port = integer(data, 0, 2), destination_port = integer(data, 2, 2);
        const auto remote = (source == local ? destination : source) + ":" +
                            std::to_string(source == local ? destination_port : source_port);
        const auto key = std::to_string(transport) + ":" + local + ":" +
                         std::to_string(source == local ? source_port : destination_port) + ":" +
                         remote;
        const auto get_connection = [&]() -> Connection& {
            if (!active.contains(key)) {
                if (connections.size() >= 128)
                    throw std::invalid_argument("PCAP exceeds 128 connections");
                active[key] = connections.size();
                connections.push_back(Connection{.id = connections.size() + 1, .remote = remote});
            }
            return connections[active.at(key)];
        };
        if (transport == 17) {
            const auto length = integer(data, 4, 2);
            if (length < 8 || length != data.size()) {
                packet_issue("invalid/truncated UDP datagram; payload skipped");
                continue;
            }
            data = data.subspan(8);
            const auto id = get_connection().id;
            add(time, flow, id, remote, {data.begin(), data.end()}, "PCAP UDP payload", {},
                precise);
            add(time, "FRAME", id, remote, {data.begin(), data.end()}, "PCAP UDP datagram", flow,
                precise);
            continue;
        }
        const auto tcp_header = static_cast<std::size_t>(data[12] >> 4) * 4;
        if (tcp_header < 20 || tcp_header > data.size()) {
            packet_issue("invalid TCP header length; payload skipped");
            continue;
        }
        const auto seq = integer(data, 4, 4);
        const auto flags = data[13];
        if (active.contains(key)) {
            const auto& previous = connections[active.at(key)];
            if (previous.reset ||
                ((flags & 2) && !(flags & 16) &&
                 ((!previous.syn && (previous.streams[0].base || previous.streams[1].base)) ||
                  (previous.syn && *previous.syn != seq) || previous.streams[0].fin ||
                  previous.streams[1].fin)))
                active.erase(key);
        }
        auto& connection = get_connection();
        auto& stream = connection.streams[flow == std::string{"TX"} ? 0 : 1];
        if ((flags & 2) && !(flags & 16))
            connection.syn = seq;
        if ((flags & 2) && !stream.base) {
            stream.base = seq + 1;
            stream.syn = true;
        }
        const auto payload_seq = seq + ((flags & 2) ? 1 : 0);
        data = data.subspan(tcp_header);
        if (!data.empty()) {
            if (!stream.base)
                stream.base = payload_seq;
            const auto relative = static_cast<std::int32_t>(payload_seq - *stream.base);
            if (data.size() > max_frame_buffer || stream_bytes + data.size() > 4 * 1024 * 1024) {
                if (!stream.unsafe)
                    issue(time, "TCP reassembly limit exceeded; stream decode skipped",
                          connection.id, remote);
                stream.unsafe = true;
            } else {
                stream_bytes += data.size();
                stream.segments.push_back({relative, precise, {data.begin(), data.end()}});
            }
            add(time, flow, connection.id, remote, {data.begin(), data.end()},
                "PCAP TCP segment (may be retransmitted/out of order)", {}, precise);
        }
        if (flags & 1)
            stream.fin =
                static_cast<std::int32_t>(payload_seq - stream.base.value_or(payload_seq)) +
                static_cast<std::int64_t>(data.size());
        if (flags & 4) {
            connection.reset = true;
            issue(time, "TCP reset", connection.id, remote);
        }
    }
    for (auto& connection : connections) {
        for (std::size_t direction = 0; direction < 2; ++direction) {
            auto& stream = connection.streams[direction];
            if (stream.segments.empty() || stream.unsafe)
                continue;
            std::ranges::stable_sort(stream.segments, {}, &Segment::offset);
            const auto first = stream.syn ? std::int64_t{0} : stream.segments.front().offset;
            if (!stream.syn)
                issue(stream.segments.front().time / 1000000,
                      "TCP SYN not captured; leading bytes and connection start are unknown",
                      connection.id, connection.remote);
            ByteBuffer bytes;
            std::vector<std::int64_t> byte_times;
            auto next = first;
            auto time = stream.segments.front().time;
            bool conflict = false;
            for (const auto& segment : stream.segments) {
                time = std::max(time, segment.time);
                if (segment.offset > next) {
                    issue(time / 1000000,
                          "TCP gap: " + std::to_string(segment.offset - next) +
                              " missing byte(s); remainder skipped",
                          connection.id, connection.remote);
                    break;
                }
                for (std::size_t i = 0; i < segment.bytes.size(); ++i) {
                    const auto offset = segment.offset + static_cast<std::int64_t>(i);
                    if (offset < first)
                        continue;
                    if (offset < next) {
                        if (bytes[static_cast<std::size_t>(offset - first)] != segment.bytes[i])
                            conflict = true;
                        byte_times[static_cast<std::size_t>(offset - first)] = std::min(
                            byte_times[static_cast<std::size_t>(offset - first)], segment.time);
                    } else {
                        bytes.push_back(segment.bytes[i]);
                        byte_times.push_back(segment.time);
                        ++next;
                    }
                }
                if (bytes.size() > max_frame_buffer) {
                    conflict = true;
                    break;
                }
            }
            if (conflict) {
                issue(time / 1000000,
                      "TCP conflicting overlap or stream exceeds 1 MiB; decode skipped",
                      connection.id, connection.remote);
                continue;
            }
            if (stream.fin && next < *stream.fin)
                issue(time / 1000000, "TCP bytes missing before FIN", connection.id,
                      connection.remote);
            if (!stream.fin && !connection.reset)
                issue(time / 1000000,
                      "TCP capture ended without FIN/RST; trailing completeness is unknown",
                      connection.id, connection.remote);
            if (framing.mode == FrameMode::off) {
                issue(time / 1000000, "TCP framing is off; raw segments only", connection.id,
                      connection.remote);
                continue;
            }
            FrameAssembler assembler;
            assembler.configure(framing);
            std::vector<std::pair<std::size_t, std::int64_t>> arrivals;
            std::int64_t available = 0;
            for (std::size_t i = 0; i < byte_times.size(); ++i) {
                available = std::max(available, byte_times[i]);
                if (arrivals.empty() || arrivals.back().second != available)
                    arrivals.emplace_back(i + 1, available);
                else
                    arrivals.back().first = i + 1;
            }
            std::size_t start = 0;
            for (const auto& [end, arrival] : arrivals) {
                for (auto& frame : assembler.feed(Bytes{bytes}.subspan(start, end - start),
                                                  std::chrono::steady_clock::time_point{
                                                      std::chrono::nanoseconds{arrival}})) {
                    if (!frame.error.empty())
                        issue(arrival / 1000000, frame.error, connection.id, connection.remote);
                    else
                        add(arrival / 1000000, "FRAME", connection.id, connection.remote,
                            std::move(frame.bytes), "PCAP reassembled TCP frame",
                            direction == 0 ? "TX" : "RX", arrival);
                }
                start = end;
            }
            if (const auto partial = assembler.discard("capture ended or stream gap"))
                issue(time / 1000000, partial->error, connection.id, connection.remote);
        }
    }
    for (auto& diagnostic : diagnostics)
        add(diagnostic.time_ms, "SYS", diagnostic.peer, std::move(diagnostic.address), {},
            std::move(diagnostic.detail));
    std::string counts;
    for (const auto& [kind, count] : issue_counts)
        counts += kind + "=" + std::to_string(count) + "; ";
    add(last_time, "SYS", 0, {}, {},
        "PCAP offline import: " + std::to_string(packets) + " packet(s), " +
            std::to_string(issues) + " issue(s) (" + counts +
            "); latest 100 diagnostics retained; classic Ethernet/VLAN IPv4 TCP/UDP; transport "
            "checksums not verified; no "
            "packets sent",
        {}, last_precise + 1);
    std::ranges::stable_sort(result.records, {}, &TcpRecord::id);
    for (std::size_t i = 0; i < result.records.size(); ++i)
        result.records[i].id = i + 1;
    return result;
}
} // namespace iotps::core::transport
