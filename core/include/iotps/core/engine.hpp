#pragma once

#include "iotps/core/hex.hpp"

#include <cstdint>
#include <string>
#include <string_view>
#include <variant>

namespace iotps::core {

struct HexInspection {
    ByteBuffer bytes;
    std::string normalized_hex;
    std::string ascii;
    std::uint8_t sum8;
    std::uint8_t xor8;
    std::uint16_t crc16_modbus;
};

using HexInspectionResult = std::variant<HexInspection, HexError>;

class Engine final {
  public:
    [[nodiscard]] HexInspectionResult inspect_hex(std::string_view input) const;
};

} // namespace iotps::core
