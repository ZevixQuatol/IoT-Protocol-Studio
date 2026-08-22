#pragma once

#include "iotps/core/codec/codec.hpp"
#include "iotps/core/transport/transport.hpp"

#include <string>
#include <string_view>
#include <variant>

namespace iotps::core::simulator {

struct SimulatorConfig {
    std::string device_id;
    std::string protocol_name;
    std::string connection_id;
};

enum class SimulatorState {
    offline,
    starting,
    online,
    stopping,
    error,
};

enum class SimulatorErrorCode {
    invalid_configuration,
    already_running,
    not_running,
    codec_failure,
    transport_failure,
};

using SimulatorError = Error<SimulatorErrorCode>;

struct SendReceipt {
    ByteBuffer bytes;
};

using SimulatorResult = Status<SimulatorError>;
using SendResult = Result<SendReceipt, SimulatorError>;

class DeviceSimulator final {
  public:
    DeviceSimulator(SimulatorConfig config, const codec::MessageCodec& codec,
                    transport::Transport& transport);

    [[nodiscard]] const SimulatorConfig& config() const noexcept {
        return config_;
    }
    [[nodiscard]] SimulatorState state() const noexcept {
        return state_;
    }

    [[nodiscard]] SimulatorResult start();
    [[nodiscard]] SimulatorResult stop();
    [[nodiscard]] SendResult
    send(const schema::MessageDefinition& definition, const codec::StructuredMessage& message,
         schema::ByteOrder default_byte_order = schema::ByteOrder::big_endian);

  private:
    SimulatorConfig config_;
    const codec::MessageCodec& codec_;
    transport::Transport& transport_;
    SimulatorState state_{SimulatorState::offline};
};

[[nodiscard]] std::string_view to_string(SimulatorErrorCode code) noexcept;

} // namespace iotps::core::simulator
