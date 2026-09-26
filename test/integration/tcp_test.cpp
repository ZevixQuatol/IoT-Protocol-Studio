#include "iotps/core/transport/tcp.hpp"

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
        check(first.send(first_id, payload).has_value(), "client send");
        wait_for([&] { return server.snapshot().statistics.bytes_received == payload.size(); });
        check(traffic(server, "RX") == payload, "binary client to server");
        check(traffic(first, "TX") == payload, "actual TX bytes");
        check(server.send(server_first, payload).has_value(), "selected server reply");
        wait_for([&] { return first.snapshot().statistics.bytes_received == payload.size(); });
        check(traffic(first, "RX") == payload, "binary server to client");
        check(second.snapshot().statistics.bytes_received == 0, "reply isolated to selected peer");
        check(!first.send(first_id, {}).has_value(), "reject empty payload");
        check(!first.send(first_id, ByteBuffer(65537)).has_value(), "reject oversized payload");
        check(!server.send(99999, payload).has_value(), "reject stale target");
        const auto prior_cursor = first.snapshot().cursor;
        first.clear_records();
        check(first.snapshot().records.empty(), "clear records");
        check(first.snapshot().statistics.bytes_sent == payload.size(), "clear retains counters");
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
        check(server.disconnect(server_first).has_value(), "disconnect selected peer");
        wait_for([&] {
            return first.snapshot().state == TransportState::closed &&
                   server.snapshot().peers.size() == 1;
        });
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
