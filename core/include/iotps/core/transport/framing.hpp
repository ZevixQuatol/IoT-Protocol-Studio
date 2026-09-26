#pragma once

#include "iotps/core/types.hpp"

#include <chrono>
#include <cstddef>
#include <cstdint>
#include <optional>
#include <span>
#include <string>
#include <string_view>
#include <vector>

namespace iotps::core::transport {

inline constexpr std::size_t max_frame_buffer = 1024 * 1024;
inline constexpr auto frame_idle_timeout = std::chrono::seconds(5);

enum class FrameMode { off, fixed, length_field, delimiter };

struct FrameRule {
    FrameMode mode{FrameMode::off};
    std::size_t fixed_size{0};
    std::size_t length_offset{0};
    std::size_t length_size{0};
    // Total frame bytes = decoded length field value + adjustment.
    std::size_t length_adjustment{0};
    bool little_endian{false};
    // The delimiter is included in emitted frames.
    ByteBuffer delimiter;
};

[[nodiscard]] std::string frame_rule_error(const FrameRule& rule);

struct FrameOutput {
    ByteBuffer bytes;
    std::string error;
};

// One accumulator per connection. Frames and errors are separate from raw RX chunks.
class FrameAssembler {
  public:
    void configure(FrameRule rule);
    [[nodiscard]] std::vector<FrameOutput> feed(std::span<const std::uint8_t> bytes,
                                                std::chrono::steady_clock::time_point now);
    [[nodiscard]] std::optional<FrameOutput> expire(std::chrono::steady_clock::time_point now);
    [[nodiscard]] std::optional<FrameOutput> discard(std::string_view reason);

  private:
    FrameRule rule_;
    ByteBuffer pending_;
    std::chrono::steady_clock::time_point last_byte_{};
};

} // namespace iotps::core::transport
