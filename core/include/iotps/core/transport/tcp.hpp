#pragma once

#include "iotps/core/schema/schema.hpp"
#include "iotps/core/transport/framing.hpp"
#include "iotps/core/transport/transport.hpp"

#include <memory>
#include <vector>

namespace iotps::core::transport {
struct CaptureResult;
struct SerialOptions {
    std::string device;
    std::uint32_t baud{115200};
    std::uint8_t data_bits{8};
    std::string parity{"none"};
    std::string stop_bits{"1"};
    std::string flow_control{"none"};
};
struct UdpOptions {
    std::string host{"0.0.0.0"};
    std::uint16_t port{0};
    std::string remote_host;
    std::uint16_t remote_port{0};
    std::string mode{"unicast"};
    std::string interface_address{"0.0.0.0"};
};
[[nodiscard]] std::vector<std::string> serial_devices();
[[nodiscard]] std::vector<std::string> network_interfaces();
struct TcpPeer {
    std::uint64_t id;
    std::string address;
};
struct TcpParsedBit {
    std::string name;
    std::string display_name;
    std::string value;
    std::size_t offset;
    std::size_t length;
    std::size_t bit_offset;
    std::size_t width;
};
struct TcpParsedField {
    std::string name;
    std::string display_name;
    std::string type;
    std::string value;
    std::size_t offset;
    std::size_t length;
    std::optional<std::string> enum_name;
    std::vector<TcpParsedBit> bits;
};
struct TcpParse {
    std::string protocol_path;
    std::string message_name;
    std::string status;
    std::string checksum;
    std::string error;
    std::vector<TcpParsedField> fields;
};
struct TcpRecord {
    std::uint64_t id;
    std::int64_t time_ms;
    std::string direction;
    std::uint64_t peer;
    std::string address;
    ByteBuffer data;
    std::string detail;
    std::optional<TcpParse> parsed;
    std::string device;
    std::string flow; // FRAME direction: TX or RX; older archives imply RX.
};
struct TcpSnapshot {
    std::string kind{"tcp"};
    bool multicast_joined{false};
    TransportState state{TransportState::closed};
    bool server{false};
    std::string host;
    std::uint16_t port{0};
    std::string error;
    TransportStatistics statistics;
    std::size_t queued_bytes{0};
    std::uint64_t dropped{0};
    std::uint64_t cursor{0};
    std::uint32_t retries{0};
    std::string protocol_path;
    std::string message_name;
    std::string device;
    std::vector<TcpPeer> peers;
    std::vector<TcpRecord> records;
};

// Shared communication records and codec pipeline; all I/O stays off the UI thread.
class TcpSession {
  public:
    TcpSession();
    ~TcpSession();
    TcpSession(const TcpSession&) = delete;
    TcpSession& operator=(const TcpSession&) = delete;
    [[nodiscard]] TransportResult start(bool server, std::string host, std::uint16_t port,
                                        std::uint32_t retry_limit = 0,
                                        std::uint32_t retry_interval_ms = 2000);
    [[nodiscard]] TransportResult start_serial(SerialOptions options);
    [[nodiscard]] TransportResult start_udp(UdpOptions options);
    [[nodiscard]] TransportResult multicast_membership(bool join);
    [[nodiscard]] TransportResult set_device(std::string identifier);
    void stop();
    [[nodiscard]] TransportResult send(std::uint64_t peer, std::span<const std::uint8_t> bytes);
    [[nodiscard]] TransportResult disconnect(std::uint64_t peer);
    [[nodiscard]] TransportResult set_framing(FrameRule rule);
    [[nodiscard]] TransportResult bind_protocol(schema::ProtocolSchema protocol, std::string path,
                                                std::string message = {});
    void clear_binding();
    void clear_records();
    [[nodiscard]] CaptureResult import_capture(std::span<const std::uint8_t> file,
                                               const std::string& local_ipv4) const;
    [[nodiscard]] TcpSnapshot snapshot(std::uint64_t after = 0, std::size_t max_records = 128,
                                       std::size_t max_bytes = 128 * 1024) const;

  private:
    struct Impl;
    std::unique_ptr<Impl> impl_;
};
} // namespace iotps::core::transport
