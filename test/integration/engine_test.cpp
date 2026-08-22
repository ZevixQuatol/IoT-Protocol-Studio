#include "iotps/core/engine.hpp"

#include <filesystem>
#include <fstream>
#include <iostream>
#include <iterator>
#include <string>

namespace {

int failures = 0;

void check(const bool condition, const char* expression, const int line) {
    if (!condition) {
        std::cerr << "line " << line << ": check failed: " << expression << '\n';
        ++failures;
    }
}

#define CHECK(expression) check((expression), #expression, __LINE__)

std::string read_file(const std::filesystem::path& path) {
    std::ifstream input(path, std::ios::binary);
    return {std::istreambuf_iterator<char>(input), std::istreambuf_iterator<char>()};
}

} // namespace

int main() {
    const auto vector_dir = std::filesystem::path{IOTPS_TEST_VECTOR_DIR};
    const auto input = read_file(vector_dir / "basic-frame.hex");
    const auto expected = read_file(vector_dir / "basic-frame.expected");

    CHECK(!input.empty());
    CHECK(!expected.empty());

    const iotps::core::Engine engine;
    const auto result = engine.inspect_hex(input);
    CHECK(result.has_value());

    if (const auto* inspection = result.value_if()) {
        auto normalized_expected = expected;
        while (!normalized_expected.empty() &&
               (normalized_expected.back() == '\n' || normalized_expected.back() == '\r')) {
            normalized_expected.pop_back();
        }
        CHECK(inspection->normalized_hex == normalized_expected);
        CHECK(inspection->bytes.size() == 13);
        CHECK(inspection->ascii.size() == inspection->bytes.size());
    }

    return failures == 0 ? 0 : 1;
}
