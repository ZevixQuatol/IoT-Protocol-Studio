#include "iotps/core/checksum.hpp"

#include <array>
#include <cstdint>
#include <iostream>

namespace {

int failures = 0;

void check(const bool condition, const char* expression, const int line) {
    if (!condition) {
        std::cerr << "line " << line << ": check failed: " << expression << '\n';
        ++failures;
    }
}

#define CHECK(expression) check((expression), #expression, __LINE__)

} // namespace

int main() {
    using namespace iotps::core;

    constexpr std::array<std::uint8_t, 4> sample{0x01U, 0x02U, 0x03U, 0x04U};
    CHECK(sum8(sample) == 0x0AU);
    CHECK(xor8(sample) == 0x04U);

    constexpr std::array<std::uint8_t, 9> standard{
        static_cast<std::uint8_t>('1'), static_cast<std::uint8_t>('2'),
        static_cast<std::uint8_t>('3'), static_cast<std::uint8_t>('4'),
        static_cast<std::uint8_t>('5'), static_cast<std::uint8_t>('6'),
        static_cast<std::uint8_t>('7'), static_cast<std::uint8_t>('8'),
        static_cast<std::uint8_t>('9'),
    };
    CHECK(crc16_modbus(standard) == 0x4B37U);

    return failures == 0 ? 0 : 1;
}
