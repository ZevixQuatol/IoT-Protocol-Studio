#include "iotps/core/engine.hpp"

#include <cstddef>
#include <cstdint>
#include <string_view>

extern "C" int LLVMFuzzerTestOneInput(const std::uint8_t* data, const std::size_t size) {
    const auto input = std::string_view{reinterpret_cast<const char*>(data), size};
    const iotps::core::Engine engine;
    static_cast<void>(engine.inspect_hex(input));
    return 0;
}
