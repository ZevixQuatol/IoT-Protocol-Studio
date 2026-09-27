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
    const auto enum_schema = schema::load_yaml(R"yaml(schemaVersion: "0.1"
protocol:
  name: enum-test
  version: "1"
messages:
  event:
    fields:
      - name: status
        type: uint8
        enum:
          Off: 0
          On: 1
)yaml");
    CHECK(enum_schema.has_value());
    if (const auto* definition = enum_schema.value_if()) {
        for (const auto& [hex_value, numeric, known] :
             {std::tuple{"01", std::uint64_t{1}, true}, {"09", std::uint64_t{9}, false}}) {
            const auto decoded = decode_protocol_hex(*definition, "event", hex_value);
            CHECK(decoded.has_value());
            if (const auto* data = decoded.value_if()) {
                CHECK(std::get<std::uint64_t>(data->message.fields[0].value) == numeric);
                CHECK(schema::enum_name(definition->messages[0].fields[0],
                                        std::to_string(numeric)).has_value() == known);
                const auto encoded = encode_protocol_hex(*definition, data->message);
                CHECK(encoded.has_value());
                if (const auto* result = encoded.value_if())
                    CHECK(*result == format_hex(parse_hex(hex_value).value()));
            }
        }
    }
    const auto bits_schema = schema::load_yaml(R"yaml(schemaVersion: "0.1"
protocol:
  name: bits-test
  version: "1"
messages:
  event:
    fields:
      - name: flags
        type: uint16
        bits:
          ready: {offset: 0, width: 1}
          mode: {offset: 7, width: 3}
)yaml");
    CHECK(bits_schema.has_value());
    if (const auto* definition = bits_schema.value_if()) {
        const auto decoded = decode_protocol_hex(*definition, "event", "01 81");
        CHECK(decoded.has_value());
        if (const auto* data = decoded.value_if()) {
            CHECK(std::get<std::uint64_t>(data->message.fields[0].value) == 0x0181);
            CHECK(data->element_ranges.size() == 2);
            CHECK(data->element_ranges[0].path == "event.flags.ready");
            CHECK(data->element_ranges[0].offset == 1 && data->element_ranges[0].length == 1);
            CHECK(data->element_ranges[1].offset == 0 && data->element_ranges[1].length == 2);
            CHECK(data->element_ranges[1].bit_offset == 7);
            CHECK(schema::bit_value(0x0181, definition->messages[0].fields[0].bits[1]) == 3);
            const auto encoded = encode_protocol_hex(*definition, data->message);
            CHECK(encoded.has_value() && encoded.value() == "01 81");
        }
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

    const auto identified_schema = schema::load_yaml(R"yaml(
schemaVersion: '0.1'
protocol:
  name: identified
  version: '1.0'
  messageTypeField: kind
messages:
  ping:
    typeId: 2
    fields:
      - name: kind
        type: uint8
      - name: payload
        type: uint8
)yaml");
    CHECK(identified_schema.has_value());
    if (identified_schema.has_value()) {
        CHECK(identified_schema.value().protocol.message_type_field == "kind");
        StructuredMessage ping{.message_name = "ping",
                               .fields = {{"payload", std::uint64_t{7}}}};
        const auto encoded = encode_protocol_message(identified_schema.value(), ping);
        CHECK(encoded.has_value());
        if (encoded.has_value()) {
            CHECK(encoded.value() == ByteBuffer({2, 7}));
            CHECK(schema::identify_message(identified_schema.value(), encoded.value()).message ==
                  "ping");
        }
        ping.fields.push_back({"kind", std::uint64_t{3}});
        const auto mismatch = encode_protocol_message(identified_schema.value(), ping);
        CHECK(!mismatch.has_value());
        CHECK(mismatch.error_if() && mismatch.error_if()->code ==
                                         ProtocolCodecErrorCode::encode_failed);
    }

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
