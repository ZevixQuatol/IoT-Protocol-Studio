#include "iotps/core/hex.hpp"

#include <cctype>
#include <iomanip>
#include <sstream>

namespace iotps::core {
namespace {

[[nodiscard]] bool is_separator(const char value) noexcept {
    const auto character = static_cast<unsigned char>(value);
    return std::isspace(character) != 0 || value == ',' || value == ':' || value == '-' ||
           value == '_';
}

[[nodiscard]] int hex_value(const char value) noexcept {
    if (value >= '0' && value <= '9') {
        return value - '0';
    }
    if (value >= 'a' && value <= 'f') {
        return value - 'a' + 10;
    }
    if (value >= 'A' && value <= 'F') {
        return value - 'A' + 10;
    }
    return -1;
}

[[nodiscard]] HexError make_error(const HexErrorCode code, const std::size_t position,
                                  std::string message) {
    return HexError{code, position, std::move(message)};
}

} // namespace

HexParseResult parse_hex(const std::string_view input) {
    ByteBuffer bytes;
    std::size_t position = 0;

    while (position < input.size()) {
        while (position < input.size() && is_separator(input[position])) {
            ++position;
        }
        if (position >= input.size()) {
            break;
        }

        if (position + 1 < input.size() && input[position] == '0' &&
            (input[position + 1] == 'x' || input[position + 1] == 'X')) {
            position += 2;
        }

        if (position >= input.size()) {
            return make_error(HexErrorCode::incomplete_byte, position,
                              "Expected two hexadecimal digits after 0x");
        }

        const auto high_position = position;
        const auto high = hex_value(input[position]);
        if (high < 0) {
            return make_error(HexErrorCode::invalid_character, position,
                              "Invalid character in hexadecimal input");
        }
        ++position;

        if (position >= input.size() || is_separator(input[position]) ||
            (position + 1 < input.size() && input[position] == '0' &&
             (input[position + 1] == 'x' || input[position + 1] == 'X'))) {
            return make_error(HexErrorCode::incomplete_byte, high_position,
                              "A hexadecimal byte must contain two digits");
        }

        const auto low = hex_value(input[position]);
        if (low < 0) {
            return make_error(HexErrorCode::invalid_character, position,
                              "Invalid character in hexadecimal input");
        }
        ++position;

        bytes.push_back(static_cast<std::uint8_t>((high << 4) | low));
    }

    if (bytes.empty()) {
        return make_error(HexErrorCode::empty_input, 0, "Hexadecimal input is empty");
    }

    return bytes;
}

std::string format_hex(const std::span<const std::uint8_t> bytes) {
    std::ostringstream output;
    output << std::uppercase << std::hex << std::setfill('0');

    for (std::size_t index = 0; index < bytes.size(); ++index) {
        if (index != 0) {
            output << ' ';
        }
        output << std::setw(2) << static_cast<unsigned int>(bytes[index]);
    }
    return output.str();
}

std::string ascii_preview(const std::span<const std::uint8_t> bytes) {
    std::string result;
    result.reserve(bytes.size());
    for (const auto byte : bytes) {
        result.push_back(byte >= 0x20U && byte <= 0x7EU ? static_cast<char>(byte) : '.');
    }
    return result;
}

std::string_view to_string(const HexErrorCode code) noexcept {
    switch (code) {
    case HexErrorCode::empty_input:
        return "empty_input";
    case HexErrorCode::invalid_character:
        return "invalid_character";
    case HexErrorCode::incomplete_byte:
        return "incomplete_byte";
    }
    return "unknown";
}

} // namespace iotps::core
