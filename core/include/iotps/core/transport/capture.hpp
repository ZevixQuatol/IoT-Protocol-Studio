#pragma once

#include "iotps/core/transport/tcp.hpp"

namespace iotps::core::transport {
// Shared immutable frame decoding for live transport and offline captures.
[[nodiscard]] std::optional<TcpParse> parse_frame(const schema::ProtocolSchema* protocol,
                                                  const std::string& path,
                                                  const std::string& message,
                                                  std::span<const std::uint8_t> bytes);
struct CaptureResult {
    std::vector<TcpRecord> records;
    std::uint64_t dropped{0};
};
// Classic PCAP, Ethernet/VLAN, unfragmented IPv4 TCP/UDP. No sockets or sends.
// Invalid container/options throw; packet/stream issues become SYS records.
[[nodiscard]] CaptureResult import_pcap(std::span<const std::uint8_t> file,
                                        const std::string& local_ipv4, FrameRule framing,
                                        const schema::ProtocolSchema* protocol = nullptr,
                                        const std::string& path = {},
                                        const std::string& message = {});
} // namespace iotps::core::transport
