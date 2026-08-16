#include "iotps/core/checksum.hpp"

namespace iotps::core {

std::uint8_t sum8(const std::span<const std::uint8_t> bytes) noexcept {
    std::uint8_t result = 0;
    for (const auto byte : bytes) {
        result = static_cast<std::uint8_t>(result + byte);
    }
    return result;
}

std::uint8_t xor8(const std::span<const std::uint8_t> bytes) noexcept {
    std::uint8_t result = 0;
    for (const auto byte : bytes) {
        result = static_cast<std::uint8_t>(result ^ byte);
    }
    return result;
}

std::uint16_t crc16_modbus(const std::span<const std::uint8_t> bytes) noexcept {
    std::uint16_t crc = 0xFFFFU;
    for (const auto byte : bytes) {
        crc = static_cast<std::uint16_t>(crc ^ byte);
        for (int bit = 0; bit < 8; ++bit) {
            if ((crc & 0x0001U) != 0U) {
                crc = static_cast<std::uint16_t>((crc >> 1U) ^ 0xA001U);
            } else {
                crc = static_cast<std::uint16_t>(crc >> 1U);
            }
        }
    }
    return crc;
}

} // namespace iotps::core
