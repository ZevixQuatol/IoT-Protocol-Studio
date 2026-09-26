#pragma once

#include "iotps/core/transport/transport.hpp"

#include <memory>
#include <vector>

namespace iotps::core::transport {
struct TcpPeer {
    std::uint64_t id;
    std::string address;
};
struct TcpRecord {
    std::uint64_t id;
    std::int64_t time_ms;
    std::string direction;
    std::uint64_t peer;
    std::string address;
    ByteBuffer data;
    std::string detail;
};
struct TcpSnapshot {
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
    std::vector<TcpPeer> peers;
    std::vector<TcpRecord> records;
};

// One client connection or one listener (up to 16 peers). Socket work stays off the UI thread.
class TcpSession {
  public:
    TcpSession();
    ~TcpSession();
    TcpSession(const TcpSession&) = delete;
    TcpSession& operator=(const TcpSession&) = delete;
    [[nodiscard]] TransportResult start(bool server, std::string host, std::uint16_t port,
                                        std::uint32_t retry_limit = 0,
                                        std::uint32_t retry_interval_ms = 2000);
    void stop();
    [[nodiscard]] TransportResult send(std::uint64_t peer, std::span<const std::uint8_t> bytes);
    [[nodiscard]] TransportResult disconnect(std::uint64_t peer);
    void clear_records();
    [[nodiscard]] TcpSnapshot snapshot(std::uint64_t after = 0, std::size_t max_records = 128,
                                       std::size_t max_bytes = 128 * 1024) const;

  private:
    struct Impl;
    std::unique_ptr<Impl> impl_;
};
} // namespace iotps::core::transport
