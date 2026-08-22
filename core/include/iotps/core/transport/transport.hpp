#pragma once

#include "iotps/core/result.hpp"
#include "iotps/core/types.hpp"

#include <cstddef>
#include <cstdint>
#include <functional>
#include <span>
#include <string>
#include <string_view>

namespace iotps::core::transport {

enum class TransportState {
    closed,
    opening,
    open,
    closing,
    faulted,
};

enum class TransportErrorCode {
    invalid_configuration,
    already_open,
    not_open,
    open_failed,
    send_failed,
    receive_failed,
    close_failed,
    cancelled,
};

using TransportError = Error<TransportErrorCode>;
using TransportResult = Status<TransportError>;

struct TransportStatistics {
    std::uint64_t bytes_sent{0};
    std::uint64_t bytes_received{0};
    std::uint64_t messages_sent{0};
    std::uint64_t messages_received{0};
    std::uint64_t errors{0};
};

enum class TransportEventType {
    state_changed,
    data_received,
    error,
};

struct TransportEvent {
    TransportEventType type;
    TransportState state;
    ByteBuffer data;
    std::string error_code;
};

using TransportEventSink = std::function<void(const TransportEvent&)>;

class Transport {
  public:
    virtual ~Transport() = default;

    [[nodiscard]] virtual std::string_view kind() const noexcept = 0;
    [[nodiscard]] virtual TransportState state() const noexcept = 0;
    [[nodiscard]] virtual TransportStatistics statistics() const noexcept = 0;

    virtual void set_event_sink(TransportEventSink sink) = 0;
    [[nodiscard]] virtual TransportResult open() = 0;
    [[nodiscard]] virtual TransportResult close() = 0;
    [[nodiscard]] virtual TransportResult send(std::span<const std::uint8_t> bytes) = 0;
};

[[nodiscard]] bool is_success(const TransportResult& result) noexcept;
[[nodiscard]] std::string_view to_string(TransportErrorCode code) noexcept;

} // namespace iotps::core::transport
