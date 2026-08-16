#pragma once

#include <cstdint>
#include <span>

namespace iotps::core {

[[nodiscard]] std::uint8_t sum8(std::span<const std::uint8_t> bytes) noexcept;
[[nodiscard]] std::uint8_t xor8(std::span<const std::uint8_t> bytes) noexcept;
[[nodiscard]] std::uint16_t crc16_modbus(std::span<const std::uint8_t> bytes) noexcept;

} // namespace iotps::core
