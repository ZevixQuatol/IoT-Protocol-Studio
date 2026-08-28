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
    using namespace iotps::core;
    using namespace iotps::core::codec;

    const auto vector_directory = std::filesystem::path{IOTPS_TEST_VECTOR_DIR};
    const auto loaded_schema =
        schema::load_yaml_file(vector_directory / "primitive-frame.schema.yaml");
    const auto hex = read_file(vector_directory / "primitive-frame.hex");
    CHECK(loaded_schema.has_value());
    CHECK(!hex.empty());
    if (!loaded_schema.has_value()) {
        return 1;
    }

    const auto parsed_bytes = parse_hex(hex);
    CHECK(parsed_bytes.has_value());
    if (!parsed_bytes.has_value()) {
        return 1;
    }

    const auto decoded_binary =
        decode_protocol_message(loaded_schema.value(), "telemetry", parsed_bytes.value());
    CHECK(decoded_binary.has_value());
    if (const auto* decoded = decoded_binary.value_if()) {
        CHECK(decoded->message.message_name == "telemetry");
        CHECK(decoded->message.fields.size() == 7);
    }

    const auto decoded_hex = decode_protocol_hex(loaded_schema.value(), "telemetry", hex);
    CHECK(decoded_hex.has_value());
    if (const auto* decoded = decoded_hex.value_if()) {
        const auto encoded_binary =
            encode_protocol_message(loaded_schema.value(), decoded->message);
        CHECK(encoded_binary.has_value());
        if (const auto* bytes = encoded_binary.value_if()) {
            CHECK(*bytes == parsed_bytes.value());
        }

        const auto encoded_hex = encode_protocol_hex(loaded_schema.value(), decoded->message);
        CHECK(encoded_hex.has_value());
        if (const auto* normalized = encoded_hex.value_if()) {
            CHECK(*normalized == format_hex(parsed_bytes.value()));
        }
    }

    const auto unknown_message = decode_protocol_hex(loaded_schema.value(), "missing-message", hex);
    CHECK(!unknown_message.has_value());
    if (const auto* error = unknown_message.error_if()) {
        CHECK(error->code == ProtocolCodecErrorCode::message_not_found);
        CHECK(error->path == "messages.missing-message");
    }

    const auto invalid_hex = decode_protocol_hex(loaded_schema.value(), "telemetry", "01 ZZ");
    CHECK(!invalid_hex.has_value());
    if (const auto* error = invalid_hex.error_if()) {
        CHECK(error->code == ProtocolCodecErrorCode::hex_parse_failed);
        CHECK(error->path == "$hex");
        CHECK(error->offset == 3);
        CHECK(error->detail.find("invalid_character") != std::string::npos);
    }

    const auto truncated = decode_protocol_hex(loaded_schema.value(), "telemetry", "01");
    CHECK(!truncated.has_value());
    if (const auto* error = truncated.error_if()) {
        CHECK(error->code == ProtocolCodecErrorCode::decode_failed);
        CHECK(error->detail.find("insufficient_data") != std::string::npos);
    }

    StructuredMessage incomplete{.message_name = "telemetry"};
    const auto encode_failure = encode_protocol_message(loaded_schema.value(), incomplete);
    CHECK(!encode_failure.has_value());
    if (const auto* error = encode_failure.error_if()) {
        CHECK(error->code == ProtocolCodecErrorCode::encode_failed);
        CHECK(error->detail.find("missing_field") != std::string::npos);
    }

    CHECK(to_string(ProtocolCodecErrorCode::message_not_found) == "message_not_found");
    return failures == 0 ? 0 : 1;
}
