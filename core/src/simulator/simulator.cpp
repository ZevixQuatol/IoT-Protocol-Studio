#include "iotps/core/simulator/simulator.hpp"

#include <utility>

namespace iotps::core::simulator {
namespace {

SimulatorError make_error(const SimulatorErrorCode code, std::string source_code = {},
                          std::string path = {}) {
    return {.code = code, .source_code = std::move(source_code), .path = std::move(path)};
}

} // namespace

DeviceSimulator::DeviceSimulator(SimulatorConfig config, const codec::MessageCodec& codec,
                                 transport::Transport& transport)
    : config_(std::move(config)), codec_(codec), transport_(transport) {}

SimulatorResult DeviceSimulator::start() {
    if (config_.device_id.empty() || config_.protocol_name.empty() || config_.connection_id.empty()) {
        return make_error(SimulatorErrorCode::invalid_configuration);
    }
    if (state_ == SimulatorState::online) {
        return make_error(SimulatorErrorCode::already_running);
    }

    state_ = SimulatorState::starting;
    const auto opened = transport_.open();
    if (const auto* error = std::get_if<transport::TransportError>(&opened)) {
        state_ = SimulatorState::error;
        return make_error(SimulatorErrorCode::transport_failure,
                          std::string{transport::to_string(error->code)});
    }

    state_ = SimulatorState::online;
    return std::monostate{};
}

SimulatorResult DeviceSimulator::stop() {
    if (state_ == SimulatorState::offline) {
        return std::monostate{};
    }

    state_ = SimulatorState::stopping;
    const auto closed = transport_.close();
    if (const auto* error = std::get_if<transport::TransportError>(&closed)) {
        state_ = SimulatorState::error;
        return make_error(SimulatorErrorCode::transport_failure,
                          std::string{transport::to_string(error->code)});
    }

    state_ = SimulatorState::offline;
    return std::monostate{};
}

SendResult DeviceSimulator::send(const schema::MessageDefinition& definition,
                                 const codec::StructuredMessage& message) {
    if (state_ != SimulatorState::online) {
        return make_error(SimulatorErrorCode::not_running);
    }

    auto encoded = codec_.encode(definition, message);
    if (const auto* error = std::get_if<codec::CodecError>(&encoded)) {
        return make_error(SimulatorErrorCode::codec_failure,
                          std::string{codec::to_string(error->code)}, error->path);
    }

    auto bytes = std::get<ByteBuffer>(std::move(encoded));
    const auto sent = transport_.send(bytes);
    if (const auto* error = std::get_if<transport::TransportError>(&sent)) {
        state_ = SimulatorState::error;
        return make_error(SimulatorErrorCode::transport_failure,
                          std::string{transport::to_string(error->code)});
    }

    return SendReceipt{.bytes = std::move(bytes)};
}

std::string_view to_string(const SimulatorErrorCode code) noexcept {
    switch (code) {
    case SimulatorErrorCode::invalid_configuration:
        return "invalid_configuration";
    case SimulatorErrorCode::already_running:
        return "already_running";
    case SimulatorErrorCode::not_running:
        return "not_running";
    case SimulatorErrorCode::codec_failure:
        return "codec_failure";
    case SimulatorErrorCode::transport_failure:
        return "transport_failure";
    }
    return "unknown";
}

} // namespace iotps::core::simulator
