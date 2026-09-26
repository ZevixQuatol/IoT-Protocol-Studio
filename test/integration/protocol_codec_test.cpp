#include "iotps/core/checksum.hpp"
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

    const auto checksum_schema = schema::load_yaml(R"yaml(
schemaVersion: '0.1'
protocol:
  name: checksummed
  version: '1.0'
  defaultByteOrder: little
messages:
  frame:
    fields:
      - name: size
        type: uint8
        lengthOf: payload
      - name: payload
        type: bytes
        length: 2
      - name: crc
        type: uint16
    checksum:
      name: frame-crc
      algorithm: crc16-modbus
      targetField: crc
      rangeStart: 0
      rangeEnd: 5
      includeTarget: true
)yaml");
    CHECK(checksum_schema.has_value());
    if (checksum_schema.has_value()) {
        StructuredMessage frame{.message_name = "frame",
                                .fields = {{.name = "payload", .value = ByteBuffer{0x12, 0x34}}}};
        const auto encoded = encode_protocol_message(checksum_schema.value(), frame);
        CHECK(encoded.has_value());
        if (const auto* bytes = encoded.value_if()) {
            const ByteBuffer input{2, 0x12, 0x34, 0, 0};
            const auto expected_crc = crc16_modbus(input);
            CHECK(*bytes == (ByteBuffer{2, 0x12, 0x34, static_cast<std::uint8_t>(expected_crc),
                                        static_cast<std::uint8_t>(expected_crc >> 8)}));
            CHECK(decode_protocol_message(checksum_schema.value(), "frame", *bytes).has_value());
            auto damaged = *bytes;
            damaged.back() ^= 1;
            const auto rejected =
                decode_protocol_message(checksum_schema.value(), "frame", damaged);
            CHECK(!rejected.has_value());
            if (const auto* error = rejected.error_if()) {
                CHECK(error->detail.find("checksum_mismatch") != std::string::npos);
                CHECK(error->detail.find("expected") != std::string::npos);
                CHECK(error->detail.find("range [0,5)") != std::string::npos);
            }
        }
        auto invalid = checksum_schema.value();
        invalid.messages[0].checksum->range_end = 7;
        CHECK(!schema::validate(invalid).ok());
        invalid = checksum_schema.value();
        invalid.messages[0].checksum->algorithm = schema::ChecksumAlgorithm::custom;
        CHECK(!schema::validate(invalid).ok());

        auto one_byte = checksum_schema.value();
        one_byte.messages[0].fields.back().type = schema::FieldType::uint8;
        one_byte.messages[0].checksum->range_end = 4;
        one_byte.messages[0].checksum->include_target = false;
        for (const auto algorithm :
             {schema::ChecksumAlgorithm::sum8, schema::ChecksumAlgorithm::xor8}) {
            one_byte.messages[0].checksum->algorithm = algorithm;
            CHECK(schema::validate(one_byte).ok());
            const auto generated = encode_protocol_message(one_byte, frame);
            CHECK(generated.has_value());
            if (const auto* value = generated.value_if()) {
                const ByteBuffer input{2, 0x12, 0x34};
                const auto expected =
                    algorithm == schema::ChecksumAlgorithm::sum8 ? sum8(input) : xor8(input);
                CHECK(*value == (ByteBuffer{2, 0x12, 0x34, static_cast<std::uint8_t>(expected)}));
                CHECK(decode_protocol_message(one_byte, "frame", *value).has_value());
            }
        }
        one_byte.messages[0].checksum->target_field = "payload";
        CHECK(!schema::validate(one_byte).ok());
    }
    return failures == 0 ? 0 : 1;
}
