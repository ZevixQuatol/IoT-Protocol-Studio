#include "iotps/core/transport/transport.hpp"

namespace iotps::core::transport {

bool is_success(const TransportResult& result) noexcept {
    return std::holds_alternative<std::monostate>(result);
}

std::string_view to_string(const TransportErrorCode code) noexcept {
    switch (code) {
    case TransportErrorCode::invalid_configuration:
        return "invalid_configuration";
    case TransportErrorCode::already_open:
        return "already_open";
    case TransportErrorCode::not_open:
        return "not_open";
    case TransportErrorCode::open_failed:
        return "open_failed";
    case TransportErrorCode::send_failed:
        return "send_failed";
    case TransportErrorCode::receive_failed:
        return "receive_failed";
    case TransportErrorCode::close_failed:
        return "close_failed";
    case TransportErrorCode::cancelled:
        return "cancelled";
    }
    return "unknown";
}

} // namespace iotps::core::transport
