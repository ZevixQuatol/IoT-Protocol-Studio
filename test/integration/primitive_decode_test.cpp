#include "iotps/core/codec/codec.hpp"
#include "iotps/core/hex.hpp"
#include "iotps/core/schema/loader.hpp"

#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <iterator>
#include <sstream>
#include <string>
#include <type_traits>
#include <variant>

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
    std::ifstream input{path, std::ios::binary};
    return {std::istreambuf_iterator<char>{input}, std::istreambuf_iterator<char>{}};
}

std::string scalar_text(const iotps::core::codec::ScalarValue& value) {
    return std::visit(
        [](const auto& item) -> std::string {
            using Value = std::decay_t<decltype(item)>;
            if constexpr (std::is_same_v<Value, bool>) {
                return item ? "true" : "false";
            } else if constexpr (std::is_same_v<Value, std::int64_t> ||
                                 std::is_same_v<Value, std::uint64_t>) {
                return std::to_string(item);
            } else if constexpr (std::is_same_v<Value, double>) {
                std::ostringstream output;
                output << std::setprecision(17) << item;
                return output.str();
            } else if constexpr (std::is_same_v<Value, std::string>) {
                return item;
            } else {
                return iotps::core::format_hex(item);
            }
        },
        value);
}

std::string render(const iotps::core::codec::DecodedMessage& decoded) {
    std::ostringstream output;
    for (std::size_t index = 0; index < decoded.message.fields.size(); ++index) {
        const auto& field = decoded.message.fields[index];
        const auto& range = decoded.field_ranges[index];
        output << field.name << '=' << scalar_text(field.value) << " @" << range.offset << '+'
               << range.length << '\n';
    }
    return output.str();
}

} // namespace

int main() {
    const auto vector_directory = std::filesystem::path{IOTPS_TEST_VECTOR_DIR};
    const auto schema =
        iotps::core::schema::load_yaml_file(vector_directory / "primitive-frame.schema.yaml");
    const auto hex = read_file(vector_directory / "primitive-frame.hex");
    const auto expected = read_file(vector_directory / "primitive-frame.expected");

    CHECK(schema.has_value());
    CHECK(!hex.empty());
    CHECK(!expected.empty());
    if (!schema.has_value() || hex.empty() || expected.empty()) {
        return 1;
    }

    const auto bytes = iotps::core::parse_hex(hex);
    CHECK(bytes.has_value());
    if (!bytes.has_value()) {
        return 1;
    }

    const auto& protocol = schema.value();
    CHECK(protocol.messages.size() == 1);
    if (protocol.messages.size() != 1) {
        return 1;
    }

    const iotps::core::codec::FixedLayoutCodec codec;
    const auto decoded = codec.decode(protocol.messages.front(), bytes.value(),
                                      protocol.protocol.default_byte_order);
    CHECK(decoded.has_value());
    if (const auto* output = decoded.value_if()) {
        CHECK(render(*output) == expected);
    }

    return failures == 0 ? 0 : 1;
}
