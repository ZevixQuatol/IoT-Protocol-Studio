#include "iotps/core/transport/correlation.hpp"
#include "iotps/core/transport/tcp.hpp"

#include <algorithm>
#include <chrono>
#include <iostream>
#include <stdexcept>
#include <thread>

using namespace iotps::core;
using namespace iotps::core::transport;
using namespace std::chrono_literals;

void check(bool value, const char* message) {
    if (!value)
        throw std::runtime_error(message);
}
template <typename Predicate> void wait_for(Predicate ready) {
    const auto end = std::chrono::steady_clock::now() + 5s;
    while (!ready()) {
        check(std::chrono::steady_clock::now() < end, "TCP wait timed out");
        std::this_thread::sleep_for(10ms);
    }
}
ByteBuffer traffic(const TcpSession& session, const std::string& direction) {
    ByteBuffer bytes;
    std::uint64_t cursor = 0;
    for (;;) {
        const auto snapshot = session.snapshot(cursor);
        for (const auto& record : snapshot.records)
            if (record.direction == direction)
                bytes.insert(bytes.end(), record.data.begin(), record.data.end());
        if (snapshot.records.empty())
            return bytes;
        cursor = snapshot.cursor;
    }
}
int main() {
    try {
        TcpSession server, first, second, collision;
        const ByteBuffer payload{0, 255, 1, 128, 13, 10};
        check(!first.start(false, "invalid", 9000).has_value(), "reject invalid IP");
        check(!first.start(false, std::string{"127.0.0.1\0invalid", 17}, 9000).has_value(),
              "reject embedded NUL instead of connecting to the prefix");
        check(!first.start(false, "127.0.0.1", 0).has_value(), "reject port zero");
        check(!first.send(1, payload).has_value(), "reject disconnected send");
        std::uint16_t port = 0;
        const auto seed = std::chrono::steady_clock::now().time_since_epoch().count();
        for (int attempt = 0; attempt < 100; ++attempt) {
            port = static_cast<std::uint16_t>(20000 + (seed % 30000 + attempt) % 30000);
            check(server.start(true, "127.0.0.1", port).has_value(), "start listener");
            wait_for([&] { return server.snapshot().state != TransportState::opening; });
            if (server.snapshot().state == TransportState::open)
                break;
        }
        check(server.snapshot().state == TransportState::open, "find free local port");
        check(!server.start(true, "127.0.0.1", port).has_value(), "reject duplicate start");
        check(collision.start(true, "127.0.0.1", port).has_value(),
              "start address collision probe");
        wait_for([&] { return collision.snapshot().state == TransportState::faulted; });
        check(!collision.snapshot().error.empty(), "listener error detail");
        check(first.start(false, "127.0.0.1", port).has_value(), "start first client");
        wait_for([&] {
            return first.snapshot().peers.size() == 1 && server.snapshot().peers.size() == 1;
        });
        const auto first_id = first.snapshot().peers.front().id;
        const auto server_first = server.snapshot().peers.front().id;
        check(second.start(false, "127.0.0.1", port).has_value(), "start second client");
        wait_for([&] {
            return second.snapshot().peers.size() == 1 && server.snapshot().peers.size() == 2;
        });
        FrameRule framing;
        framing.mode = FrameMode::fixed;
        framing.fixed_size = payload.size();
        check(server.set_framing(framing).has_value(), "configure fixed framing");
        check(first.set_framing(framing).has_value(), "configure transmitted framing");
        schema::ProtocolSchema protocol{
            .protocol = {.name = "wire", .version = "1", .message_type_field = "kind"},
            .messages =
                {{.name = "data",
                  .type_id = 0,
                  .fields = {{.name = "kind", .type = schema::FieldType::uint8},
                             {.name = "body", .type = schema::FieldType::bytes, .length = 5}}}},
        };
        check(server.bind_protocol(protocol, "protocols/wire.yaml").has_value(),
              "bind auto protocol");
        check(first.bind_protocol(protocol, "protocols/wire.yaml").has_value(),
              "bind outgoing protocol");
        check(!server.bind_protocol(protocol, "protocols/wire.yaml", "missing").has_value(),
              "reject missing bound message");
        check(first.send(first_id, {payload.data(), 3}).has_value(), "client send first half");
        wait_for([&] { return server.snapshot().statistics.bytes_received == 3; });
        check(traffic(server, "FRAME").empty(), "partial RX is not a frame");
        check(traffic(first, "FRAME").empty(), "partial TX is not a frame");
        check(first.send(first_id, {payload.data() + 3, payload.size() - 3}).has_value(),
              "client send second half");
        wait_for([&] { return server.snapshot().statistics.bytes_received == payload.size(); });
        check(traffic(server, "RX") == payload, "binary client to server");
        check(traffic(server, "FRAME") == payload, "separate completed frame");
        check(std::ranges::any_of(first.snapshot(0, 1000).records,
                                  [&](const auto& item) {
                                      return item.direction == "FRAME" && item.flow == "TX" &&
                                             item.data == payload && item.parsed &&
                                             item.parsed->status == "ok";
                                  }),
              "actual transmitted chunks form a decoded TX frame");
        check(std::ranges::any_of(server.snapshot(0, 1000).records,
                                  [](const auto& item) {
                                      return item.direction == "FRAME" &&
                                             item.detail.find("message data") != std::string::npos;
                                  }),
              "identified frame keeps raw bytes and message label");
        const auto frame_record = [&]() {
            const auto records = server.snapshot(0, 1000).records;
            const auto item =
                std::ranges::find_if(records.rbegin(), records.rend(), [](const auto& record) {
                    return record.direction == "FRAME";
                });
            check(item != records.rend(), "completed frame recorded");
            return *item;
        };
        check(frame_record().parsed && frame_record().parsed->status == "ok" &&
                  frame_record().parsed->fields.size() == 2 &&
                  frame_record().parsed->fields[0].offset == 0 &&
                  frame_record().parsed->fields[1].length == 5,
              "split frame decodes fields and byte ranges");
        check(std::ranges::none_of(server.snapshot(0, 1000).records,
                                   [](const auto& item) {
                                       return item.direction == "RX" && item.parsed.has_value();
                                   }),
              "raw RX never inherits frame parse");
        auto checked_protocol = protocol;
        checked_protocol.messages[0].fields[1].length = 4;
        checked_protocol.messages[0].fields.push_back(
            {.name = "crc", .type = schema::FieldType::uint8});
        checked_protocol.messages[0].checksum = {.name = "sum",
                                                 .algorithm = schema::ChecksumAlgorithm::sum8,
                                                 .target_field = "crc",
                                                 .range_start = 0,
                                                 .range_end = 5};
        check(server.bind_protocol(checked_protocol, "protocols/wire.yaml").has_value(),
              "bind checksummed protocol");
        const ByteBuffer valid_frame{0, 1, 2, 3, 4, 10};
        check(first.send(first_id, valid_frame).has_value(), "send valid checked frame");
        wait_for([&] { return server.snapshot().statistics.bytes_received == 12; });
        check(frame_record().parsed && frame_record().parsed->status == "ok" &&
                  frame_record().parsed->checksum == "pass" &&
                  frame_record().parsed->fields.size() == 3,
              "checksum passes on complete frame");
        const ByteBuffer bad_frame{0, 1, 2, 3, 4, 11};
        check(first.send(first_id, bad_frame).has_value(), "send bad checked frame");
        wait_for([&] { return server.snapshot().statistics.bytes_received == 18; });
        check(frame_record().parsed && frame_record().parsed->status == "error" &&
                  frame_record().parsed->checksum == "fail" &&
                  frame_record().parsed->error.find("checksum_mismatch") != std::string::npos,
              "checksum failure stays on frame record");
        const ByteBuffer unknown_frame{7, 1, 2, 3, 4, 10};
        check(first.send(first_id, unknown_frame).has_value(), "send unknown message frame");
        wait_for([&] { return server.snapshot().statistics.bytes_received == 24; });
        check(frame_record().parsed && frame_record().parsed->status == "unmatched" &&
                  !frame_record().parsed->error.empty(),
              "unknown message has clear result");
        ByteBuffer sticky = valid_frame;
        sticky.insert(sticky.end(), valid_frame.begin(), valid_frame.end());
        const auto frames_before =
            std::ranges::count_if(server.snapshot(0, 1000).records,
                                  [](const auto& item) { return item.direction == "FRAME"; });
        check(first.send(first_id, sticky).has_value(), "send two frames together");
        wait_for([&] { return server.snapshot().statistics.bytes_received == 36; });
        check(std::ranges::count_if(server.snapshot(0, 1000).records,
                                    [](const auto& item) { return item.direction == "FRAME"; }) ==
                      frames_before + 2 &&
                  frame_record().parsed && frame_record().parsed->status == "ok",
              "sticky receive yields two decoded frames");
        check(server.bind_protocol(protocol, "protocols/wire.yaml", "data").has_value(),
              "bind fixed message");
        check(server.snapshot().message_name == "data", "binding visible in snapshot");
        check(!server.bind_protocol(protocol, std::string(1025, 'x'), "data").has_value(),
              "binding path fits persisted traffic contract");
        check(server.snapshot().protocol_path == "protocols/wire.yaml",
              "invalid binding preserves previous protocol");
        // A protocol switch must not decode bytes received under the previous binding.
        const auto received_before_switch = server.snapshot().statistics.bytes_received;
        const auto frames_before_switch =
            std::ranges::count_if(server.snapshot(0, 1000).records,
                                  [](const auto& row) { return row.direction == "FRAME"; });
        check(first.send(first_id, {payload.data(), 3}).has_value(), "buffer old protocol prefix");
        wait_for([&] {
            return server.snapshot().statistics.bytes_received == received_before_switch + 3;
        });
        check(server.bind_protocol(protocol, "protocols/new.yaml", "data").has_value(),
              "switch protocol with partial RX frame");
        check(first.bind_protocol(protocol, "protocols/new.yaml", "data").has_value(),
              "switch protocol with partial TX frame");
        check(first.send(first_id, {payload.data() + 3, 3}).has_value(),
              "send new protocol suffix");
        wait_for([&] {
            return server.snapshot().statistics.bytes_received == received_before_switch + 6;
        });
        check(std::ranges::count_if(server.snapshot(0, 1000).records,
                                    [](const auto& row) { return row.direction == "FRAME"; }) ==
                  frames_before_switch,
              "protocol switch discards old partial bytes without inventing a frame");
        server.clear_binding();
        check(server.bind_protocol(protocol, "protocols/wire.yaml", "data").has_value(),
              "restore protocol after clearing partial frame");
        first.clear_binding();
        check(first.bind_protocol(protocol, "protocols/wire.yaml", "data").has_value(),
              "restore client binding");
        server.clear_binding();
        check(server.snapshot().protocol_path.empty(), "clear binding");
        check(traffic(first, "TX").size() == payload.size() * 7, "actual TX bytes");
        check(server.set_framing({}).has_value(), "disable framing");
        check(server.send(server_first, payload).has_value(), "selected server reply");
        wait_for([&] { return first.snapshot().statistics.bytes_received == payload.size(); });
        check(traffic(first, "RX") == payload, "binary server to client");
        const auto client_records = first.snapshot(0, 1000).records;
        const auto tx = std::ranges::find_if(client_records, [](const auto& item) {
            return item.flow == "TX" && item.parsed && item.parsed->status == "ok";
        });
        const auto rx = std::ranges::find_if(client_records, [](const auto& item) {
            return item.flow == "RX" && item.parsed && item.parsed->status == "ok";
        });
        check(tx != client_records.end() && rx != client_records.end(),
              "real decoded request and response");
        const std::vector<TcpRecord> exchange{*tx, *rx};
        const CorrelationRule rule{"protocols/wire.yaml", "data", "data", "kind", "kind", "TX",
                                   "connection",          60000};
        const auto associations = correlate(exchange, rule, rx->time_ms);
        check(associations.size() == 1 && associations[0].state == "matched" &&
                  associations[0].request == tx->id && associations[0].response == rx->id,
              "real loopback bytes decode and correlate in Core");
        check(first.set_framing({}).has_value(), "disable framing before raw large-payload checks");
        check(second.snapshot().statistics.bytes_received == 0, "reply isolated to selected peer");
        check(!first.send(first_id, {}).has_value(), "reject empty payload");
        check(!first.send(first_id, ByteBuffer(65537)).has_value(), "reject oversized payload");
        check(!server.send(99999, payload).has_value(), "reject stale target");
        const auto prior_cursor = first.snapshot().cursor;
        first.clear_records();
        check(first.snapshot().records.empty(), "clear records");
        check(first.snapshot().statistics.bytes_sent == payload.size() * 7,
              "clear retains counters");
        // Exercise segmentation and paged snapshots without assuming one recv per send.
        ByteBuffer large(65536);
        for (std::size_t i = 0; i < large.size(); ++i)
            large[i] = static_cast<std::uint8_t>(i % 256);
        check(server.send(server_first, large).has_value(), "64 KiB send");
        wait_for([&] {
            return first.snapshot().statistics.bytes_received == payload.size() + large.size();
        });
        check(traffic(first, "RX") == large, "reassemble RX chunks exactly");
        check(first.snapshot(prior_cursor).records.size() > 0, "cursor survives clear");
        const auto received_before = first.snapshot().statistics.bytes_received;
        for (std::uint64_t batch = 1; batch <= 10; ++batch) {
            for (int packet = 0; packet < 7; ++packet)
                check(server.send(server_first, large).has_value(), "bounded burst send");
            wait_for([&] {
                return first.snapshot().statistics.bytes_received ==
                       received_before + batch * 7 * large.size();
            });
        }
        check(first.snapshot().dropped > 0, "record ring evicts at capacity");
        check(traffic(first, "RX").size() <= 4 * 1024 * 1024, "record bytes stay bounded");
        const auto exported = first.snapshot(0, 1000, 4 * 1024 * 1024);
        check(exported.records.size() > first.snapshot(0).records.size(),
              "export captures complete retained ring");
        std::uint64_t cursor = 0;
        for (;;) {
            const auto page = first.snapshot(cursor);
            if (page.records.empty())
                break;
            std::size_t bytes = 0;
            for (const auto& record : page.records) {
                check(record.id > cursor, "paged records strictly ordered");
                cursor = record.id;
                bytes += record.data.size();
            }
            check(bytes <= 128 * 1024 && page.records.size() <= 128,
                  "bridge snapshot batch bounded");
            check(cursor == page.cursor, "snapshot cursor matches final record");
        }
        check(server.set_framing(framing).has_value(), "restore framing for truncation");
        check(first.send(first_id, {payload.data(), 2}).has_value(), "send incomplete frame");
        wait_for([&] { return server.snapshot().statistics.bytes_received == 44; });
        const auto frame_count =
            std::ranges::count_if(server.snapshot(0, 1000, 4 * 1024 * 1024).records,
                                  [](const auto& item) { return item.direction == "FRAME"; });
        check(server.disconnect(server_first).has_value(), "disconnect selected peer");
        wait_for([&] {
            return first.snapshot().state == TransportState::closed &&
                   server.snapshot().peers.size() == 1;
        });
        check(std::ranges::count_if(server.snapshot(0, 1000, 4 * 1024 * 1024).records,
                                    [](const auto& item) { return item.direction == "FRAME"; }) ==
                      frame_count &&
                  std::ranges::any_of(server.snapshot(0, 1000, 4 * 1024 * 1024).records,
                                      [](const auto& item) {
                                          return item.direction == "SYS" &&
                                                 item.detail.find("connection closed") !=
                                                     std::string::npos;
                                      }),
              "truncated bytes report system error without a false frame");
        check(server.snapshot().state == TransportState::open, "listener survives peer disconnect");
        check(second.snapshot().state == TransportState::open, "other peer survives disconnect");
        check(first.start(false, "127.0.0.1", port).has_value(), "manual reconnect");
        wait_for([&] {
            return first.snapshot().peers.size() == 1 && server.snapshot().peers.size() == 2;
        });
        check(first.snapshot().peers.front().id > first_id, "new connection identity");
        TcpSession auto_client;
        check(!auto_client.start(false, "127.0.0.1", port, 11, 1000).has_value(),
              "reject excessive retry count");
        check(auto_client.start(false, "127.0.0.1", port, 2, 1000).has_value(),
              "start auto reconnect client");
        wait_for([&] {
            return auto_client.snapshot().peers.size() == 1 && server.snapshot().peers.size() == 3;
        });
        const auto auto_server_peer = server.snapshot().peers.back().id;
        const auto auto_first_peer = auto_client.snapshot().peers.front().id;
        check(server.disconnect(auto_server_peer).has_value(), "drop auto client peer");
        wait_for([&] { return auto_client.snapshot().retries == 1; });
        check(!auto_client.send(auto_first_peer, payload).has_value(),
              "do not queue send while disconnected");
        wait_for([&] {
            return auto_client.snapshot().state == TransportState::open &&
                   auto_client.snapshot().peers.front().id > auto_first_peer;
        });
        check(auto_client.snapshot().queued_bytes == 0, "reconnect never replays queue");
        auto_client.stop();
        check(auto_client.snapshot().state == TransportState::closed, "manual stop ends retry");
        server.stop();
        wait_for([&] {
            return first.snapshot().state == TransportState::closed &&
                   second.snapshot().state == TransportState::closed;
        });
        check(server.snapshot().queued_bytes == 0, "stop releases queue");
        check(first.start(false, "127.0.0.1", port).has_value(), "probe refused connection");
        wait_for([&] { return first.snapshot().state == TransportState::faulted; });
        first.stop();
        check(first.snapshot().state == TransportState::closed, "stop after error");
        TcpSession ipv6_server, ipv6_client;
        check(ipv6_server.start(true, "::1", port).has_value(), "start IPv6 loopback listener");
        wait_for([&] { return ipv6_server.snapshot().state != TransportState::opening; });
        check(ipv6_server.snapshot().state == TransportState::open, "IPv6 listener opened");
        check(ipv6_client.start(false, "::1", port).has_value(), "start IPv6 loopback client");
        wait_for([&] {
            return ipv6_client.snapshot().peers.size() == 1 &&
                   ipv6_server.snapshot().peers.size() == 1;
        });
        check(ipv6_client.send(ipv6_client.snapshot().peers.front().id, payload).has_value(),
              "IPv6 client send");
        wait_for(
            [&] { return ipv6_server.snapshot().statistics.bytes_received == payload.size(); });
        check(traffic(ipv6_server, "RX") == payload, "IPv6 binary receive");
        ipv6_client.stop();
        ipv6_server.stop();
        std::cout << "TCP loopback: two peers, binary duplex, 64 KiB, errors, clear, disconnect "
                     "reconnect and IPv6 passed\n";
        return 0;
    } catch (const std::exception& error) {
        std::cerr << error.what() << '\n';
        return 1;
    }
}
