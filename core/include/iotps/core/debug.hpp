#pragma once

#include "iotps/core/codec/codec.hpp"
#include "iotps/core/result.hpp"

#include <span>
#include <string>
#include <string_view>
#include <vector>

namespace iotps::core {

struct DebugOutput {
    std::string text;
    std::string hex;
    std::vector<std::size_t> matches;
};

enum class DebugErrorCode { invalid_input };
using DebugResult = Result<DebugOutput, Error<DebugErrorCode>>;

// Converts and edits bytes in Core; the UI only supplies options and displays results.
[[nodiscard]] DebugResult run_debug_tool(std::string_view operation,
                                         std::span<const std::string> arguments);
[[nodiscard]] std::string format_scalar(const codec::ScalarValue& value);

} // namespace iotps::core
