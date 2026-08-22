#include "iotps/core/simulator/simulator.hpp"

#include <cstdint>
#include <iostream>
#include <string_view>
#include <utility>
#include <variant>

namespace {

int failures = 0;

void check(const bool condition, const char* expression, const int line) {
    if (!condition) {
        std::cerr << "line " << line << ": check failed: " << expression << '\n';
        ++failures;
    }
}

#define CHECK(expression) check((expression), #expression, __LINE__)

class RecordingTransport final : public iotps::core::transport::Transport {
  public:
    [[nodiscard]] std::string_view kind() const noexcept override {
        return "recording";
    }
    [[nodiscard]] iotps::core::transport::TransportState state() const noexcept override {
        return state_;
    }
    [[nodiscard]] iotps::core::transport::TransportStatistics statistics() const noexcept override {
        return statistics_;
    }

    void set_event_sink(iotps::core::transport::TransportEventSink sink) override {
        sink_ = std::move(sink);
    }

    iotps::core::transport::TransportResult open() override {
        state_ = iotps::core::transport::TransportState::open;
        emit(iotps::core::transport::TransportEventType::state_changed);
        return std::monostate{};
    }

    iotps::core::transport::TransportResult close() override {
        state_ = iotps::core::transport::TransportState::closed;
        emit(iotps::core::transport::TransportEventType::state_changed);
        return std::monostate{};
    }

    iotps::core::transport::TransportResult
    send(const std::span<const std::uint8_t> bytes) override {
        last_sent.assign(bytes.begin(), bytes.end());
        statistics_.bytes_sent += bytes.size();
        ++statistics_.messages_sent;
        return std::monostate{};
    }

    iotps::core::ByteBuffer last_sent;

  private:
    void emit(const iotps::core::transport::TransportEventType type) const {
        if (sink_) {
            sink_({.type = type, .state = state_});
        }
    }

    iotps::core::transport::TransportState state_{iotps::core::transport::TransportState::closed};
    iotps::core::transport::TransportStatistics statistics_;
    iotps::core::transport::TransportEventSink sink_;
};

} // namespace

int main() {
    using namespace iotps::core;

    const schema::MessageDefinition definition{
        .name = "heartbeat",
        .fields = {{.name = "command", .type = schema::FieldType::uint8}},
    };
    const codec::StructuredMessage message{
        .message_name = "heartbeat",
        .fields = {{.name = "command", .value = std::uint64_t{0x02U}}},
    };

    const codec::FixedLayoutCodec codec;
    RecordingTransport transport;
    simulator::DeviceSimulator simulator(
        {.device_id = "device-001", .protocol_name = "smart-sensor", .connection_id = "loopback"},
        codec, transport);

    CHECK(simulator.state() == simulator::SimulatorState::offline);
    CHECK(simulator.start().has_value());
    CHECK(simulator.state() == simulator::SimulatorState::online);

    const auto sent = simulator.send(definition, message);
    CHECK(sent.has_value());
    CHECK(transport.last_sent == ByteBuffer({0x02U}));
    CHECK(transport.statistics().messages_sent == 1);

    CHECK(simulator.stop().has_value());
    CHECK(simulator.state() == simulator::SimulatorState::offline);

    const auto rejected = simulator.send(definition, message);
    CHECK(!rejected.has_value());
    if (const auto* error = rejected.error_if()) {
        CHECK(error->code == simulator::SimulatorErrorCode::not_running);
    }

    return failures == 0 ? 0 : 1;
}
