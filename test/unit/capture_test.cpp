#include "iotps/core/transport/capture.hpp"

#include <algorithm>
#include <chrono>
#include <iostream>
#include <stdexcept>
#include <thread>
using namespace iotps::core;
using namespace iotps::core::transport;
void check(bool value, const char* message) {
    if (!value)
        throw std::runtime_error(message);
}
void number(ByteBuffer& bytes, std::uint32_t value, int width, bool little = false) {
    for (int i = 0; i < width; ++i)
        bytes.push_back(static_cast<std::uint8_t>(value >> (8 * (little ? i : width - i - 1))));
}
ByteBuffer packet(bool tcp, ByteBuffer payload, std::uint32_t seq = 1, std::uint8_t flags = 16,
                  bool receive = false, bool vlan = false) {
    ByteBuffer bytes(12, 0);
    if (vlan) {
        number(bytes, 0x8100, 2);
        number(bytes, 1, 2);
    }
    number(bytes, 0x800, 2);
    bytes.push_back(0x45);
    bytes.push_back(0);
    number(bytes, static_cast<std::uint32_t>(20 + (tcp ? 20 : 8) + payload.size()), 2);
    number(bytes, 0, 4);
    bytes.push_back(64);
    bytes.push_back(tcp ? 6 : 17);
    number(bytes, 0, 2);
    number(bytes, receive ? 0x0a000002 : 0x0a000001, 4);
    number(bytes, receive ? 0x0a000001 : 0x0a000002, 4);
    number(bytes, receive ? 9000 : 8000, 2);
    number(bytes, receive ? 8000 : 9000, 2);
    if (tcp) {
        number(bytes, seq, 4);
        number(bytes, 0, 4);
        bytes.push_back(0x50);
        bytes.push_back(flags);
        number(bytes, 0, 4);
        number(bytes, 0, 2);
    } else {
        number(bytes, static_cast<std::uint32_t>(payload.size() + 8), 2);
        number(bytes, 0, 2);
    }
    bytes.insert(bytes.end(), payload.begin(), payload.end());
    return bytes;
}
ByteBuffer header(bool little = true, bool nano = false) {
    ByteBuffer bytes;
    number(bytes, nano ? 0xa1b23c4d : 0xa1b2c3d4, 4, little);
    number(bytes, 2, 2, little);
    number(bytes, 4, 2, little);
    number(bytes, 0, 4, little);
    number(bytes, 0, 4, little);
    number(bytes, 65535, 4, little);
    number(bytes, 1, 4, little);
    return bytes;
}
void append(ByteBuffer& file, const ByteBuffer& bytes, std::uint32_t fraction = 0,
            bool little = true, std::uint32_t extra = 0) {
    number(file, 100, 4, little);
    number(file, fraction, 4, little);
    number(file, static_cast<std::uint32_t>(bytes.size()), 4, little);
    number(file, static_cast<std::uint32_t>(bytes.size()) + extra, 4, little);
    file.insert(file.end(), bytes.begin(), bytes.end());
}
std::vector<TcpRecord> frames(const CaptureResult& result) {
    std::vector<TcpRecord> rows;
    for (const auto& row : result.records)
        if (row.direction == "FRAME")
            rows.push_back(row);
    return rows;
}
bool issue(const CaptureResult& result, const std::string& text) {
    return std::ranges::any_of(result.records, [&](const auto& row) {
        return row.direction == "SYS" && row.detail.find(text) != std::string::npos;
    });
}
int main() {
    try {
        const FrameRule fixed{.mode = FrameMode::fixed, .fixed_size = 4};
        auto file = header();
        append(file, packet(false, {1, 2, 3, 4}, 1, 16, false, true), 1000);
        append(file, packet(false, {5, 6}, 1, 16, true), 2000);
        TcpSession offline;
        check(offline.set_framing(fixed).has_value(), "configure offline framing");
        const auto loaded = offline.import_capture(file, "10.0.0.1");
        check(offline.snapshot().statistics.bytes_sent == 0 && offline.snapshot().records.empty(),
              "offline import has no I/O or live records");
        auto rows = frames(loaded);
        check(rows.size() == 2 && rows[0].flow == "TX" && rows[1].flow == "RX" &&
                  rows[0].peer == rows[1].peer,
              "VLAN UDP flow and connection");
        check(rows[0].time_ms == 100001 && rows[1].data == ByteBuffer({5, 6}),
              "UDP boundaries and timestamp");
        schema::ProtocolSchema protocol{
            .protocol = {.name = "capture", .version = "1"},
            .messages = {{.name = "value",
                          .fields = {{.name = "sequence", .type = schema::FieldType::uint32}}}},
        };
        check(offline.bind_protocol(protocol, "wire.yaml", "value").has_value(),
              "bind capture protocol");
        auto decoded = frames(offline.import_capture(file, "10.0.0.1"));
        check(decoded[0].parsed && decoded[0].parsed->status == "ok" &&
                  decoded[0].parsed->fields[0].offset == 0 &&
                  decoded[0].parsed->fields[0].length == 4,
              "shared codec and field range");
        check(decoded[1].parsed && decoded[1].parsed->status == "error",
              "bad datagram keeps decode error");
        // An imported datagram can be sent through the existing real endpoint unchanged.
        TcpSession receiver, sender;
        check(receiver
                  .start_udp({.host = "127.0.0.1", .remote_host = "127.0.0.1", .remote_port = 9000})
                  .has_value(),
              "start replay receiver");
        const auto wait = [](const auto& ready) {
            const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds{5};
            while (!ready()) {
                check(std::chrono::steady_clock::now() < deadline, "capture replay wait timed out");
                std::this_thread::sleep_for(std::chrono::milliseconds{10});
            }
        };
        wait([&] { return receiver.snapshot().state == TransportState::open; });
        check(sender
                  .start_udp({.host = "127.0.0.1",
                              .remote_host = "127.0.0.1",
                              .remote_port = receiver.snapshot().port})
                  .has_value(),
              "start replay sender");
        wait([&] { return sender.snapshot().state == TransportState::open; });
        check(sender.send(sender.snapshot().peers.front().id, rows[0].data).has_value(),
              "replay imported bytes");
        wait([&] { return receiver.snapshot().statistics.bytes_received == rows[0].data.size(); });
        const auto replayed = receiver.snapshot();
        check(std::ranges::any_of(replayed.records,
                                  [&](const auto& row) {
                                      return row.direction == "RX" && row.data == rows[0].data;
                                  }),
              "real UDP replay preserves payload bytes");
        sender.stop();
        receiver.stop();
        for (bool little : {false, true})
            for (bool nano : {false, true}) {
                auto variant = header(little, nano);
                append(variant, packet(false, {7}), nano ? 123000000 : 123000, little);
                check(frames(import_pcap(variant, "10.0.0.1", {}))[0].time_ms == 100123,
                      "endian and timestamp variants");
            }
        file = header();
        append(file, packet(true, {}, 0xffffffff, 2));
        append(file, packet(true, {3, 4}, 2), 1000);
        append(file, packet(true, {1, 2}, 0), 2000);
        append(file, packet(true, {1, 2, 3}, 0), 3000);
        append(file, packet(true, {}, 4, 17), 4000);
        auto assembled = import_pcap(file, "10.0.0.1", fixed);
        rows = frames(assembled);
        check(rows.size() == 1 && rows[0].data == ByteBuffer({1, 2, 3, 4}) &&
                  rows[0].time_ms == 100002,
              "reassembly wrap, out of order, overlap deduplication");
        check(!issue(assembled, "gap"), "no invented gap");
        // Same displayed millisecond must not move an earlier response after a later request.
        file = header(true, true);
        append(file, packet(true, {3, 4, 5, 6}, 10, 16, true), 100000);
        append(file, packet(true, {1, 2, 3, 4}, 10, 16), 900000);
        rows = frames(import_pcap(file, "10.0.0.1", fixed));
        check(rows.size() == 2 && rows[0].flow == "RX" && rows[1].flow == "TX" &&
                  rows[0].time_ms == rows[1].time_ms,
              "sub-millisecond capture order is preserved");
        file = header();
        append(file, packet(true, {}, 9, 2));
        append(file, packet(true, {1, 2}, 10));
        append(file, packet(true, {5, 6}, 14), 1000);
        assembled = import_pcap(file, "10.0.0.1", fixed);
        check(frames(assembled).empty() && issue(assembled, "gap") &&
                  issue(assembled, "partial frame"),
              "never frame across missing bytes");
        file = header();
        append(file, packet(true, {}, 9, 2));
        append(file, packet(true, {1, 2, 3, 4}, 10));
        append(file, packet(true, {9}, 11), 1000);
        assembled = import_pcap(file, "10.0.0.1", fixed);
        check(frames(assembled).empty() && issue(assembled, "conflicting overlap"),
              "conflicting retransmission invalidates stream");
        file = header();
        append(file, packet(true, {1, 2, 3, 4}, 10));
        check(issue(import_pcap(file, "10.0.0.1", fixed), "SYN not captured"),
              "partial capture reports unknown start");
        check(issue(import_pcap(file, "10.0.0.1", {}), "framing is off"),
              "explicit disabled framing");
        file = header();
        auto truncated = packet(false, {1, 2, 3});
        truncated.pop_back();
        append(file, truncated, 0, true, 1);
        check(frames(import_pcap(file, "10.0.0.1", fixed)).empty() &&
                  issue(import_pcap(file, "10.0.0.1", fixed), "truncated"),
              "truncated payload skipped");
        file = header();
        auto fragmented = packet(false, {1});
        fragmented[20] = 0x20;
        append(file, fragmented);
        check(issue(import_pcap(file, "10.0.0.1", {}), "fragmentation"),
              "IP fragments explicitly unsupported");
        file = header();
        auto ipv6 = packet(false, {1});
        ipv6[12] = 0x86;
        ipv6[13] = 0xdd;
        append(file, ipv6);
        check(issue(import_pcap(file, "10.0.0.1", {}), "unsupported EtherType"),
              "unsupported network explicit");
        file = header();
        file.push_back(0);
        check(issue(import_pcap(file, "10.0.0.1", {}), "truncated packet header"),
              "partial record explicit");
        for (int kind = 0; kind < 3; kind++) {
            file = header();
            if (kind == 0)
                file[0] = 0x0a;
            if (kind == 1)
                file[20] = 101;
            bool rejected = false;
            try {
                (void)import_pcap(file, kind == 2 ? "999.0.0.1" : "10.0.0.1", {});
            } catch (const std::invalid_argument&) {
                rejected = true;
            }
            check(rejected, "container/link/address validation");
        }
        file = header();
        for (int i = 0; i < 600; i++)
            append(file, packet(false, {1}));
        auto bounded = import_pcap(file, "10.0.0.1", {});
        check(bounded.records.size() == 1000 && bounded.dropped > 0,
              "retained record ring bounded");
        for (std::size_t i = 0; i < bounded.records.size(); i++)
            check(bounded.records[i].id == i + 1, "stable increasing IDs");
        file = header();
        append(file, packet(true, {}, 9, 2));
        for (int i = 0; i < 600; i++)
            append(file, packet(true, {1, 2, 3, 4}, 10 + 4 * i), 1000 * i);
        append(file, packet(true, {}, 2410, 17), 600000);
        bounded = import_pcap(file, "10.0.0.1", fixed);
        check(bounded.records.size() == 1000 && bounded.dropped == 201,
              "TCP raw and reassembled frames share bounded retention");
        check(bounded.records.front().time_ms == 100100,
              "retention evicts oldest capture time rather than reconstruction order");
        check(std::ranges::any_of(
                  bounded.records,
                  [](const auto& row) { return row.direction == "TX" && row.time_ms == 100599; }),
              "newest raw TCP payload remains available for replay");
        file = header();
        for (int i = 599; i >= 0; --i)
            append(file, packet(false, {1}), 1000 * i);
        bounded = import_pcap(file, "10.0.0.1", {});
        check(bounded.records.front().time_ms == 100100,
              "nonmonotonic packet timestamps retain newest chronological window");
        file = header();
        schema::ProtocolSchema large_protocol{
            .protocol = {.name = "large", .version = "1"},
            .messages = {
                {.name = "packet",
                 .fields = {{.name = "data", .type = schema::FieldType::bytes, .length = 8000}}}}};
        for (int i = 0; i < 300; ++i)
            append(file, packet(false, ByteBuffer(8000, 0xaa)), 1000 * i);
        bounded = import_pcap(file, "10.0.0.1", {}, &large_protocol, "large.yaml", "packet");
        std::size_t retained = 0;
        for (const auto& record : bounded.records) {
            retained += record.data.size();
            if (record.parsed)
                for (const auto& field : record.parsed->fields)
                    retained += field.value.size();
        }
        check(retained <= 4 * 1024 * 1024 && bounded.dropped > 0,
              "offline retention accounts for parsed previews like live transport");
        std::cout << "capture checks passed\n";
    } catch (const std::exception& error) {
        std::cerr << error.what() << '\n';
        return 1;
    }
}
