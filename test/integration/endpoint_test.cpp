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
        check(std::chrono::steady_clock::now() < end, "Endpoint wait timed out");
        std::this_thread::sleep_for(10ms);
    }
}
void opened(TcpSession& session) {
    wait_for([&] { return session.snapshot().state != TransportState::opening; });
    const auto status = session.snapshot();
    if (status.state != TransportState::open)
        throw std::runtime_error(status.error);
}
std::uint64_t target(TcpSession& session) {
    return session.snapshot().peers.front().id;
}
std::vector<TcpRecord> received(TcpSession& session, const std::string& direction = "RX") {
    auto records = session.snapshot(0, 1000, 4 * 1024 * 1024).records;
    std::erase_if(records, [&](const auto& item) { return item.direction != direction; });
    return records;
}
const ByteBuffer payload{0, 255, 128, 13};
schema::ProtocolSchema wire() {
    return {.protocol = {.name = "wire", .version = "1"},
            .messages = {{.name = "packet",
                          .fields = {{.name = "value", .type = schema::FieldType::uint32}}}}};
}
void unicast(const std::string& host) {
    TcpSession receiver, sender, second, collision;
    check(receiver.start_udp({host, 0, host, 9000}).has_value(), "start UDP receiver");
    opened(receiver);
    const auto port = receiver.snapshot().port;
    check(port > 0, "publish actual bound port");
    check(!receiver.start_udp({host, 0, host, port}).has_value(), "reject duplicate start");
    check(collision.start_udp({host, port, host, 9000}).has_value(), "start collision probe");
    wait_for([&] { return collision.snapshot().state == TransportState::faulted; });
    check(!collision.snapshot().error.empty(), "bind error detail");
    check(sender.start_udp({host, 0, host, port}).has_value(), "start UDP sender");
    check(second.start_udp({host, 0, host, port}).has_value(), "start second UDP sender");
    opened(sender);
    opened(second);
    check(receiver.set_device("device-A").has_value(), "configure record device identifier");
    check(!receiver.set_device(std::string(513, 'x')).has_value(),
          "reject oversized device identifier");
    check(!receiver.set_device("bad\nidentifier").has_value(), "reject device identifier controls");
    check(receiver.snapshot().device == "device-A",
          "invalid device update preserves configuration");
    check(receiver.bind_protocol(wire(), "protocols/wire.yaml", "packet").has_value(),
          "UDP bind protocol");
    FrameRule frame;
    frame.mode = FrameMode::fixed;
    frame.fixed_size = 1;
    check(receiver.set_framing(frame).has_value(), "set irrelevant stream framing");
    check(sender.send(target(sender), payload).has_value(), "send datagram");
    check(sender.send(target(sender), payload).has_value(), "send second datagram");
    wait_for([&] { return received(receiver).size() == 2; });
    const auto records = received(receiver);
    check(records[0].device == "device-A" && records[1].device == "device-A",
          "capture identifier on each record");
    check(receiver.set_device("device-B").has_value(), "change identifier for future records");
    check(received(receiver)[0].device == "device-A",
          "device update never rewrites historical records");
    check(records[0].data == payload && records[1].data == payload,
          "preserve consecutive datagram boundaries");
    check(records[0].address.find(std::to_string(sender.snapshot().port)) != std::string::npos,
          "actual source port differs from configured remote");
    const auto frames = received(receiver, "FRAME");
    check(frames.size() == 2 && frames[0].data == payload && frames[0].parsed &&
              frames[0].parsed->status == "ok",
          "decode each whole datagram, bypass stream frame size");
    check(second.send(target(second), ByteBuffer{7}).has_value(), "second sender datagram");
    wait_for([&] { return received(receiver).size() == 3; });
    check(received(receiver).back().device == "device-B", "new record takes new device identifier");
    check(received(receiver).back().address != records[0].address,
          "track multiple sources independently");
    check(received(receiver, "FRAME").back().parsed->status == "error",
          "short datagram reports decode error");
    check(!sender.send(target(sender), ByteBuffer(65508)).has_value(),
          "reject UDP oversized payload");
    const ByteBuffer large(65507, 0xa5);
    check(sender.send(target(sender), large).has_value(), "maximum IPv4-compatible UDP size");
    wait_for([&] { return received(receiver).size() == 4; });
    check(received(receiver).back().data == large, "large datagram never truncated");
    receiver.clear_records();
    check(receiver.snapshot().records.empty(), "clear UDP records");
    sender.stop();
    check(second.snapshot().state == TransportState::open &&
              receiver.snapshot().state == TransportState::open,
          "stop one session preserves others");
    check(second.send(target(second), payload).has_value(), "surviving sender still works");
    wait_for([&] { return received(receiver).size() == 1; });
    receiver.stop();
    check(second.send(target(second), payload).has_value(), "send to closed UDP port");
    std::this_thread::sleep_for(200ms);
    check(second.snapshot().state == TransportState::open,
          "UDP remote unreachable preserves local binding");
    second.stop();
    check(sender.snapshot().queued_bytes == 0 && !sender.send(1, payload).has_value(),
          "stop clears queue and blocks sends");
}
void network(const std::string& adapter, const std::string& broadcast) {
    TcpSession receiver, sender;
    check(receiver.start_udp({"0.0.0.0", 0, adapter, 9000}).has_value(), "network receiver");
    opened(receiver);
    const auto port = receiver.snapshot().port;
    check(sender.start_udp({adapter, 0, broadcast, port, "broadcast"}).has_value(),
          "broadcast sender");
    opened(sender);
    check(sender.send(target(sender), payload).has_value(), "broadcast send");
    wait_for([&] { return received(receiver).size() == 1; });
    check(received(receiver)[0].data == payload, "broadcast receive through selected adapter");
    sender.stop();
    receiver.stop();
    receiver.clear_records();
    check(receiver.start_udp({"0.0.0.0", port, "239.255.42.17", port, "multicast", adapter})
              .has_value(),
          "join group");
    opened(receiver);
    check(receiver.snapshot().multicast_joined, "joined state");
    check(sender.start_udp({adapter, 0, "239.255.42.17", port, "multicast", adapter}).has_value(),
          "multicast sender");
    opened(sender);
    check(sender.send(target(sender), payload).has_value(), "multicast send");
    wait_for([&] { return received(receiver).size() == 1; });
    check(received(receiver)[0].data == payload, "multicast receive through selected adapter");
    check(receiver.multicast_membership(false).has_value(), "leave group");
    check(!receiver.snapshot().multicast_joined, "left state");
    receiver.clear_records();
    check(sender.send(target(sender), payload).has_value(), "send after leave");
    std::this_thread::sleep_for(200ms);
    check(received(receiver).empty(), "left group receives no further multicast");
    check(receiver.multicast_membership(true).has_value(), "rejoin group");
    check(sender.send(target(sender), payload).has_value(), "send after rejoin");
    wait_for([&] { return received(receiver).size() == 1; });
    receiver.stop();
    sender.stop();
    check(!receiver.snapshot().multicast_joined, "stop releases membership");
    check(receiver.start_udp({"127.0.0.1", 0, "127.0.0.1", 9000}).has_value(),
          "reuse multicast session as unicast");
    opened(receiver);
    check(!receiver.multicast_membership(true).has_value(), "unicast cannot rejoin stale group");
}
void serial_pair(const std::string& a, const std::string& b) {
    TcpSession first, second, collision;
    check(first.start_serial({a}).has_value(), "open first serial device");
    opened(first);
    check(second.start_serial({b}).has_value(), "open second serial device");
    opened(second);
    check(collision.start_serial({a}).has_value(), "occupied serial probe");
    wait_for([&] { return collision.snapshot().state == TransportState::faulted; });
    check(!collision.snapshot().error.empty(), "occupied device feedback");
    FrameRule frame;
    frame.mode = FrameMode::fixed;
    frame.fixed_size = payload.size();
    check(second.set_framing(frame).has_value(), "serial framing");
    check(second.bind_protocol(wire(), "wire.yaml", "packet").has_value(), "serial binding");
    check(first.send(target(first), {payload.data(), 2}).has_value(), "serial first fragment");
    wait_for([&] { return second.snapshot().statistics.bytes_received == 2; });
    check(received(second, "FRAME").empty(), "serial partial frame");
    check(first.send(target(first), {payload.data() + 2, 2}).has_value(), "serial second fragment");
    wait_for([&] { return received(second, "FRAME").size() == 1; });
    const auto frame_record = received(second, "FRAME")[0];
    check(frame_record.data == payload && frame_record.parsed &&
              frame_record.parsed->status == "ok",
          "serial full frame parse");
    check(second.send(target(second), payload).has_value(), "serial reply");
    wait_for([&] { return first.snapshot().statistics.bytes_received == payload.size(); });
    first.stop();
    check(second.snapshot().state == TransportState::open, "serial session isolation");
    second.stop();
}
int main(int argc, char** argv) {
    try {
        TcpSession invalid;
        check(!invalid.start_serial({"COM0"}).has_value(), "reject serial device");
        check(!invalid.start_serial({"COM1", 0}).has_value(), "reject baud");
        check(!invalid.start_serial({"COM1", 115200, 8, "none", "1.5"}).has_value(),
              "reject incompatible stop bits");
        check(!invalid.start_serial({"COM1", 115200, 8, "bad"}).has_value(), "reject parity");
        check(!invalid.start_serial({"COM1", 115200, 8, "none", "1", "bad"}).has_value(),
              "reject flow control");
        check(invalid.start_serial({"COM999"}).has_value(), "probe absent serial device");
        wait_for([&] { return invalid.snapshot().state == TransportState::faulted; });
        check(!invalid.snapshot().error.empty(), "absent device failure recorded");
        invalid.stop();
        check(!invalid.start_udp({"127.0.0.1", 0, "::1", 9000}).has_value(),
              "reject mixed families");
        check(!invalid.start_udp({"0.0.0.0", 0, "239.1.1.1", 9000}).has_value(),
              "require multicast mode");
        check(!invalid.start_udp({"0.0.0.0", 0, "127.0.0.1", 9000, "multicast"}).has_value(),
              "reject non-group multicast");
        check(!invalid.multicast_membership(true).has_value(), "reject join on closed endpoint");
        unicast("127.0.0.1");
        unicast("::1");
        if (argc == 4 && std::string(argv[1]) == "--network") {
            network(argv[2], argv[3]);
            std::cout << "Real adapter broadcast, multicast, leave and rejoin passed\n";
        } else if (argc == 4 && std::string(argv[1]) == "--serial") {
            serial_pair(argv[2], argv[3]);
            std::cout << "Serial pair duplex, occupation, framing and decoding passed\n";
        } else {
            check(argc == 1,
                  "Usage: endpoint_test [--network adapter-ip broadcast-ip | --serial COMx COMy]");
            std::cout << "UDP IPv4/IPv6 datagrams, source addresses, decode, isolation and serial "
                         "validation passed; serial pair and real network checks require explicit "
                         "parameters\n";
        }
        return 0;
    } catch (const std::exception& error) {
        std::cerr << error.what() << '\n';
        return 1;
    }
}
