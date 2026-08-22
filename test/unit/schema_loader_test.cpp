#include "iotps/core/schema/loader.hpp"

#include <filesystem>
#include <iostream>
#include <string_view>

namespace {

int failures = 0;

void check(const bool condition, const char* expression, const int line) {
    if (!condition) {
        std::cerr << "line " << line << ": check failed: " << expression << '\n';
        ++failures;
    }
}

#define CHECK(expression) check((expression), #expression, __LINE__)

constexpr std::string_view smart_sensor_yaml = R"yaml(schemaVersion: "0.1"
protocol:
  name: smart-sensor
  displayName: Smart Sensor
  version: "1.0"
  description: Smart temperature sensor protocol
  defaultByteOrder: little
messages:
  telemetry:
    displayName: Telemetry
    typeId: 1
    fields:
      - name: command
        displayName: Command
        type: uint8
      - name: temperature
        displayName: Temperature
        type: int16
        endian: little
      - name: checksum
        type: uint16
    checksum:
      name: checksum
      algorithm: crc16-modbus
      targetField: checksum
)yaml";

} // namespace

int main() {
    using namespace iotps::core::schema;

    const auto loaded = load_yaml(smart_sensor_yaml, "smart-sensor.yaml");
    CHECK(loaded.has_value());

    if (const auto* schema = loaded.value_if()) {
        CHECK(schema->schema_version == "0.1");
        CHECK(schema->protocol.name == "smart-sensor");
        CHECK(schema->protocol.display_name == "Smart Sensor");
        CHECK(schema->protocol.version == "1.0");
        CHECK(schema->protocol.default_byte_order == ByteOrder::little_endian);
        CHECK(schema->messages.size() == 1);

        if (!schema->messages.empty()) {
            const auto& message = schema->messages.front();
            CHECK(message.name == "telemetry");
            CHECK(message.display_name == "Telemetry");
            CHECK(message.type_id == 1);
            CHECK(message.fields.size() == 3);
            CHECK(message.fields[0].type == FieldType::uint8);
            CHECK(message.fields[1].type == FieldType::int16);
            CHECK(message.fields[1].byte_order == ByteOrder::little_endian);
            CHECK(message.checksum.has_value());
            if (message.checksum.has_value()) {
                CHECK(message.checksum->algorithm == ChecksumAlgorithm::crc16_modbus);
                CHECK(message.checksum->target_field == "checksum");
            }
        }
    }

    constexpr std::string_view unknown_field_type = R"yaml(schemaVersion: "0.1"
protocol:
  name: smart-sensor
  version: "1.0"
messages:
  telemetry:
    fields:
      - name: command
        type: uint128
)yaml";
    const auto rejected = load_yaml(unknown_field_type, "invalid-field-type.yaml");
    CHECK(!rejected.has_value());
    if (const auto* error = rejected.error_if()) {
        CHECK(error->code == SchemaErrorCode::yaml_unknown_field_type);
        CHECK(error->path == "messages.telemetry.fields[0].type");
        CHECK(error->detail == "unknown field type 'uint128'");
        CHECK(error->offset.has_value());
        CHECK(error->source_location.has_value());
        if (error->source_location.has_value()) {
            CHECK(error->source_location->source == "invalid-field-type.yaml");
            CHECK(error->source_location->line == 9);
            CHECK(error->source_location->column == 9);
        }
    }

    const auto malformed = load_yaml("{\n  a: b\n   [", "broken.yaml");
    CHECK(!malformed.has_value());
    if (const auto* error = malformed.error_if()) {
        CHECK(error->code == SchemaErrorCode::yaml_parse_error);
        CHECK(error->path == "$");
        CHECK(!error->detail.empty());
        CHECK(error->offset == 12);
        CHECK(error->source_location.has_value());
        if (error->source_location.has_value()) {
            CHECK(error->source_location->source == "broken.yaml");
            CHECK(error->source_location->line == 3);
            CHECK(error->source_location->column == 4);
        }
    }

    const auto sequence_root = load_yaml("- schemaVersion: \"0.1\"\n", "sequence-root.yaml");
    CHECK(!sequence_root.has_value());
    if (const auto* error = sequence_root.error_if()) {
        CHECK(error->code == SchemaErrorCode::yaml_root_mapping_required);
        CHECK(error->path == "$");
        CHECK(error->detail == "YAML document root must be a mapping");
        CHECK(error->source_location.has_value());
        if (error->source_location.has_value()) {
            CHECK(error->source_location->line == 1);
            CHECK(error->source_location->column == 1);
        }
    }

    constexpr std::string_view missing_protocol_name = R"yaml(schemaVersion: "0.1"
protocol:
  version: "1.0"
messages: {}
)yaml";
    const auto missing_name = load_yaml(missing_protocol_name, "missing-name.yaml");
    CHECK(!missing_name.has_value());
    if (const auto* error = missing_name.error_if()) {
        CHECK(error->code == SchemaErrorCode::protocol_name_required);
        CHECK(error->path == "protocol.name");
        CHECK(error->detail == "required YAML scalar 'protocol.name' is missing");
        CHECK(error->source_location.has_value());
        if (error->source_location.has_value()) {
            CHECK(error->source_location->line == 2);
            CHECK(error->source_location->column == 1);
        }
    }

    constexpr std::string_view messages_sequence = R"yaml(schemaVersion: "0.1"
protocol:
  name: smart-sensor
  version: "1.0"
messages: []
)yaml";
    const auto invalid_messages = load_yaml(messages_sequence, "messages-sequence.yaml");
    CHECK(!invalid_messages.has_value());
    if (const auto* error = invalid_messages.error_if()) {
        CHECK(error->code == SchemaErrorCode::yaml_node_type_mismatch);
        CHECK(error->path == "messages");
        CHECK(error->detail == "YAML node 'messages' must be a mapping");
        CHECK(error->source_location.has_value());
        if (error->source_location.has_value()) {
            CHECK(error->source_location->line == 5);
            CHECK(error->source_location->column == 1);
        }
    }

    constexpr std::string_view unknown_byte_order = R"yaml(schemaVersion: "0.1"
protocol:
  name: smart-sensor
  version: "1.0"
  defaultByteOrder: middle
messages: {}
)yaml";
    const auto invalid_byte_order = load_yaml(unknown_byte_order, "unknown-byte-order.yaml");
    CHECK(!invalid_byte_order.has_value());
    if (const auto* error = invalid_byte_order.error_if()) {
        CHECK(error->code == SchemaErrorCode::yaml_unknown_byte_order);
        CHECK(error->path == "protocol.defaultByteOrder");
        CHECK(error->detail == "unknown byte order 'middle'");
    }

    constexpr std::string_view unknown_checksum = R"yaml(schemaVersion: "0.1"
protocol:
  name: smart-sensor
  version: "1.0"
messages:
  telemetry:
    fields:
      - name: checksum
        type: uint8
    checksum:
      name: checksum
      algorithm: mystery-crc
      targetField: checksum
)yaml";
    const auto invalid_checksum = load_yaml(unknown_checksum, "unknown-checksum.yaml");
    CHECK(!invalid_checksum.has_value());
    if (const auto* error = invalid_checksum.error_if()) {
        CHECK(error->code == SchemaErrorCode::yaml_unknown_checksum_algorithm);
        CHECK(error->path == "messages.telemetry.checksum.algorithm");
        CHECK(error->detail == "unknown checksum algorithm 'mystery-crc'");
    }

    constexpr std::string_view invalid_type_id = R"yaml(schemaVersion: "0.1"
protocol:
  name: smart-sensor
  version: "1.0"
messages:
  telemetry:
    typeId: not-a-number
    fields: []
)yaml";
    const auto invalid_integer = load_yaml(invalid_type_id, "invalid-type-id.yaml");
    CHECK(!invalid_integer.has_value());
    if (const auto* error = invalid_integer.error_if()) {
        CHECK(error->code == SchemaErrorCode::yaml_invalid_scalar);
        CHECK(error->path == "messages.telemetry.typeId");
        CHECK(error->detail ==
              "YAML scalar 'messages.telemetry.typeId' must be an unsigned integer");
    }

    constexpr std::string_view duplicate_type_id = R"yaml(schemaVersion: "0.1"
protocol:
  name: smart-sensor
  version: "1.0"
messages:
  telemetry:
    typeId: 1
    fields: []
  heartbeat:
    typeId: 1
    fields: []
)yaml";
    const auto duplicate = load_yaml(duplicate_type_id, "duplicate-type-id.yaml");
    CHECK(!duplicate.has_value());
    if (const auto* error = duplicate.error_if()) {
        CHECK(error->code == SchemaErrorCode::duplicate_message_type_id);
        CHECK(error->path == "messages[1].typeId");
        CHECK(error->source_location.has_value());
        if (error->source_location.has_value()) {
            CHECK(error->source_location->source == "duplicate-type-id.yaml");
            CHECK(error->source_location->line == 10);
            CHECK(error->source_location->column == 5);
        }
    }

    constexpr std::string_view missing_schema_version = R"yaml(protocol:
  name: smart-sensor
  version: "1.0"
messages: {}
)yaml";
    const auto missing_version = load_yaml(missing_schema_version, "missing-schema-version.yaml");
    CHECK(!missing_version.has_value());
    if (const auto* error = missing_version.error_if()) {
        CHECK(error->code == SchemaErrorCode::schema_version_required);
        CHECK(error->path == "schemaVersion");
        CHECK(error->detail == "required YAML scalar 'schemaVersion' is missing");
        CHECK(error->source_location.has_value());
        if (error->source_location.has_value()) {
            CHECK(error->source_location->line == 1);
            CHECK(error->source_location->column == 1);
        }
    }

    constexpr std::string_view unsupported_schema_version = R"yaml(schemaVersion: "0.2"
protocol:
  name: smart-sensor
  version: "1.0"
messages: {}
)yaml";
    const auto unsupported_version =
        load_yaml(unsupported_schema_version, "unsupported-schema-version.yaml");
    CHECK(!unsupported_version.has_value());
    if (const auto* error = unsupported_version.error_if()) {
        CHECK(error->code == SchemaErrorCode::unsupported_schema_version);
        CHECK(error->path == "schemaVersion");
        CHECK(error->source_location.has_value());
        if (error->source_location.has_value()) {
            CHECK(error->source_location->line == 1);
            CHECK(error->source_location->column == 1);
        }
    }

    constexpr std::string_view additive_metadata = R"yaml(schemaVersion: "0.1"
toolMetadata:
  owner: studio
protocol:
  name: smart-sensor
  version: "1.0"
  extensionValue: 42
messages: {}
)yaml";
    CHECK(load_yaml(additive_metadata, "additive-metadata.yaml").has_value());

    constexpr std::string_view fields_mapping = R"yaml(schemaVersion: "0.1"
protocol:
  name: smart-sensor
  version: "1.0"
messages:
  telemetry:
    fields: {}
)yaml";
    const auto invalid_fields = load_yaml(fields_mapping, "fields-mapping.yaml");
    CHECK(!invalid_fields.has_value());
    if (const auto* error = invalid_fields.error_if()) {
        CHECK(error->code == SchemaErrorCode::yaml_node_type_mismatch);
        CHECK(error->path == "messages.telemetry.fields");
        CHECK(error->detail == "YAML node 'messages.telemetry.fields' must be a sequence");
        CHECK(error->source_location.has_value());
        if (error->source_location.has_value()) {
            CHECK(error->source_location->line == 7);
            CHECK(error->source_location->column == 5);
        }
    }

    constexpr std::string_view missing_field_type = R"yaml(schemaVersion: "0.1"
protocol:
  name: smart-sensor
  version: "1.0"
messages:
  telemetry:
    fields:
      - name: command
)yaml";
    const auto invalid_field = load_yaml(missing_field_type, "missing-field-type.yaml");
    CHECK(!invalid_field.has_value());
    if (const auto* error = invalid_field.error_if()) {
        CHECK(error->code == SchemaErrorCode::yaml_required_node_missing);
        CHECK(error->path == "messages.telemetry.fields[0].type");
        CHECK(error->detail ==
              "required YAML scalar 'messages.telemetry.fields[0].type' is missing");
    }

    const auto vector_directory = std::filesystem::path{IOTPS_TEST_VECTOR_DIR};
    const auto loaded_file = load_yaml_file(vector_directory / "smart-sensor.yaml");
    CHECK(loaded_file.has_value());
    if (const auto* schema = loaded_file.value_if()) {
        CHECK(schema->protocol.name == "smart-sensor");
        CHECK(schema->messages.size() == 1);
    }

    const auto invalid_file = load_yaml_file(vector_directory / "invalid-schema.yaml");
    CHECK(!invalid_file.has_value());
    if (const auto* error = invalid_file.error_if()) {
        CHECK(error->code == SchemaErrorCode::yaml_unknown_field_type);
        CHECK(error->path == "messages.telemetry.fields[0].type");
        CHECK(error->source_location.has_value());
    }

    const auto missing_file = load_yaml_file(vector_directory / "not-found.yaml");
    CHECK(!missing_file.has_value());
    if (const auto* error = missing_file.error_if()) {
        CHECK(error->code == SchemaErrorCode::file_open_failed);
        CHECK(error->path == "$file");
    }

    return failures == 0 ? 0 : 1;
}
