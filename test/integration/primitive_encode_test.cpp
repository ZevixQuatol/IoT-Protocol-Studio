#include "iotps/core/codec/codec.hpp"
#include "iotps/core/hex.hpp"
#include "iotps/core/schema/loader.hpp"

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
    std::ifstream input{path, std::ios::binary};
    return {std::istreambuf_iterator<char>{input}, std::istreambuf_iterator<char>{}};
}

} // namespace

int main() {
    const auto vector_directory = std::filesystem::path{IOTPS_TEST_VECTOR_DIR};
    const auto schema =
        iotps::core::schema::load_yaml_file(vector_directory / "primitive-frame.schema.yaml");
    const auto bytes = iotps::core::parse_hex(read_file(vector_directory / "primitive-frame.hex"));

    CHECK(schema.has_value());
    CHECK(bytes.has_value());
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

    const auto encoded =
        codec.encode(definition, decoded.value().message, protocol.protocol.default_byte_order);
    CHECK(encoded.has_value());
    if (!encoded.has_value()) {
        return 1;
    }
    CHECK(encoded.value() == bytes.value());

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

    return failures == 0 ? 0 : 1;
}
