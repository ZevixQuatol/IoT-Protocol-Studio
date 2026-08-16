#pragma once

#include <cstddef>
#include <cstdint>
#include <span>
#include <string>
#include <string_view>
#include <variant>
#include <vector>

namespace iotps::core {

using ByteBuffer = std::vector<std::uint8_t>;

enum class HexErrorCode {
    empty_input,
    invalid_character,
    incomplete_byte,
};

struct HexError {
    HexErrorCode code;
    std::size_t position;
    std::string message;
};

using HexParseResult = std::variant<ByteBuffer, HexError>;

[[nodiscard]] HexParseResult parse_hex(std::string_view input);
[[nodiscard]] std::string format_hex(std::span<const std::uint8_t> bytes);
[[nodiscard]] std::string ascii_preview(std::span<const std::uint8_t> bytes);
[[nodiscard]] std::string_view to_string(HexErrorCode code) noexcept;

} // namespace iotps::core
