#pragma once

#include "iotps/core/result.hpp"
#include "iotps/core/types.hpp"

#include <cstddef>
#include <cstdint>
#include <span>
#include <string>
#include <string_view>

namespace iotps::core {

enum class HexErrorCode {
    empty_input,
    invalid_character,
    incomplete_byte,
};

using HexError = Error<HexErrorCode>;
using HexParseResult = Result<ByteBuffer, HexError>;

[[nodiscard]] bool is_valid_utf8(std::string_view value);

[[nodiscard]] HexParseResult parse_hex(std::string_view input);
[[nodiscard]] std::string format_hex(std::span<const std::uint8_t> bytes);
[[nodiscard]] std::string ascii_preview(std::span<const std::uint8_t> bytes);
[[nodiscard]] std::string_view to_string(HexErrorCode code) noexcept;

} // namespace iotps::core
