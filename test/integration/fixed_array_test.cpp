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

std::string primitive_text(const iotps::core::codec::PrimitiveValue& value) {
    return std::visit(
        [](const auto& item) {
            std::ostringstream output;
            if constexpr (std::is_same_v<std::decay_t<decltype(item)>, bool>) {
                output << (item ? "true" : "false");
            } else {
                output << std::setprecision(17) << item;
            }
            return output.str();
        },
        value);
}

std::string value_text(const iotps::core::codec::ScalarValue& value) {
    if (const auto* array = std::get_if<iotps::core::codec::ArrayValue>(&value)) {
        std::ostringstream output;
        output << '[';
        for (std::size_t index = 0; index < array->size(); ++index) {
            if (index != 0) {
                output << ',';
            }
            output << primitive_text((*array)[index]);
        }
        output << ']';
        return output.str();
    }
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
            } else {
                return "unsupported";
            }
        },
        value);
}

std::string render(const iotps::core::codec::DecodedMessage& decoded) {
    std::ostringstream output;
    for (std::size_t index = 0; index < decoded.message.fields.size(); ++index) {
        const auto& field = decoded.message.fields[index];
        const auto& range = decoded.field_ranges[index];
        output << field.name << '=' << value_text(field.value) << " @" << range.offset << '+'
               << range.length << '\n';
    }
    return output.str();
}

} // namespace

int main() {
    const auto vector_directory = std::filesystem::path{IOTPS_TEST_VECTOR_DIR};
    const auto schema =
        iotps::core::schema::load_yaml_file(vector_directory / "fixed-array-frame.schema.yaml");
    const auto bytes =
        iotps::core::parse_hex(read_file(vector_directory / "fixed-array-frame.hex"));
    const auto expected = read_file(vector_directory / "fixed-array-frame.expected");

    CHECK(schema.has_value());
    CHECK(bytes.has_value());
    CHECK(!expected.empty());
    if (!schema.has_value() || !bytes.has_value() || schema.value().messages.size() != 1) {
        return 1;
    }

    const auto& protocol = schema.value();
    const auto& definition = protocol.messages.front();
    const iotps::core::codec::FixedLayoutCodec codec;
    const auto decoded =
        codec.decode(definition, bytes.value(), protocol.protocol.default_byte_order);
    CHECK(decoded.has_value());
    if (!decoded.has_value()) {
        return 1;
    }
    CHECK(render(decoded.value()) == expected);
    CHECK(decoded.value().element_ranges.size() == 5);
    if (decoded.value().element_ranges.size() == 5) {
        CHECK(decoded.value().element_ranges[0].path == "sample.samples[0]");
        CHECK(decoded.value().element_ranges[0].offset == 2);
        CHECK(decoded.value().element_ranges[4].path == "sample.ratios[1]");
        CHECK(decoded.value().element_ranges[4].offset == 12);
    }

    auto message_without_derived_length = decoded.value().message;
    message_without_derived_length.fields.erase(message_without_derived_length.fields.begin() + 1);
    const auto encoded = codec.encode(definition, message_without_derived_length,
                                      protocol.protocol.default_byte_order);
    CHECK(encoded.has_value());
    if (encoded.has_value()) {
        CHECK(encoded.value() == bytes.value());
    }

    if (encoded.has_value()) {
        const auto round_trip =
            codec.decode(definition, encoded.value(), protocol.protocol.default_byte_order);
        CHECK(round_trip.has_value());
        if (round_trip.has_value()) {
            const auto& original_fields = decoded.value().message.fields;
            const auto& round_trip_fields = round_trip.value().message.fields;
            CHECK(round_trip_fields.size() == original_fields.size());
            if (round_trip_fields.size() == original_fields.size()) {
                for (std::size_t index = 0; index < original_fields.size(); ++index) {
                    CHECK(round_trip_fields[index].name == original_fields[index].name);
                    CHECK(round_trip_fields[index].value == original_fields[index].value);
                }
            }
        }
    }

    return failures == 0 ? 0 : 1;
}
