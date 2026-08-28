#include "iotps/core/codec/codec.hpp"
#include "iotps/core/hex.hpp"
#include "iotps/core/schema/loader.hpp"

#include <filesystem>
#include <fstream>
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
                return std::to_string(item);
            } else if constexpr (std::is_same_v<Value, std::string>) {
                return item;
            } else if constexpr (std::is_same_v<Value, iotps::core::ByteBuffer>) {
                return iotps::core::format_hex(item);
            } else {
                return "array";
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
        iotps::core::schema::load_yaml_file(vector_directory / "length-field-frame.schema.yaml");
    const auto bytes =
        iotps::core::parse_hex(read_file(vector_directory / "length-field-frame.hex"));
    const auto expected = read_file(vector_directory / "length-field-frame.expected");

    CHECK(schema.has_value());
    CHECK(bytes.has_value());
    CHECK(!expected.empty());
    if (!schema.has_value() || !bytes.has_value() || schema.value().messages.size() != 1) {
        return 1;
    }

    const auto& definition = schema.value().messages.front();
    const iotps::core::codec::FixedLayoutCodec codec;
    const auto decoded = codec.decode(definition, bytes.value());
    CHECK(decoded.has_value());
    if (!decoded.has_value()) {
        return 1;
    }
    CHECK(render(decoded.value()) == expected);

    const iotps::core::codec::StructuredMessage input{
        .message_name = "sample",
        .fields =
            {
                {.name = "marker", .value = std::uint64_t{0xA5U}},
                {.name = "body", .value = iotps::core::ByteBuffer{0xDEU, 0xADU, 0x00U, 0xFFU}},
                {.name = "trailer", .value = std::uint64_t{0x5AU}},
            },
    };
    const auto encoded = codec.encode(definition, input);
    CHECK(encoded.has_value());
    if (encoded.has_value()) {
        CHECK(encoded.value() == bytes.value());
    }

    const auto round_trip = codec.encode(definition, decoded.value().message);
    CHECK(round_trip.has_value());
    if (round_trip.has_value()) {
        CHECK(round_trip.value() == bytes.value());
    }

    return failures == 0 ? 0 : 1;
}
