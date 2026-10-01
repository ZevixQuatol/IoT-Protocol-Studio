#pragma once
#include "iotps/core/transport/tcp.hpp"

namespace iotps::core::transport {
struct CorrelationRule {
    std::string protocol, request_message, response_message, request_field, response_field;
    std::string request_flow{"TX"}, scope{"connection"};
    std::int64_t timeout_ms{5000};
};
struct Correlation {
    std::uint64_t request{0}, response{0};
    std::string state, reason;
    std::int64_t elapsed_ms{0};
};
[[nodiscard]] std::string correlation_rule_error(const CorrelationRule& rule);
// Analyze retained immutable frames; no transport I/O and no schema re-decoding.
[[nodiscard]] std::vector<Correlation> correlate(std::span<const TcpRecord> records,
                                                 const CorrelationRule& rule, std::int64_t now_ms);
} // namespace iotps::core::transport
