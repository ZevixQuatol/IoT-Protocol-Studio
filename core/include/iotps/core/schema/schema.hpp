#pragma once

#include "iotps/core/result.hpp"

#include <cstddef>
#include <cstdint>
#include <optional>
#include <string>
#include <string_view>
#include <vector>

namespace iotps::core::schema {

inline constexpr std::string_view current_schema_version = "0.1";

enum class ByteOrder {
    big_endian,
    little_endian,
};

enum class FieldType {
    boolean,
    int8,
    uint8,
    int16,
    uint16,
    int32,
    uint32,
    int64,
    uint64,
    float32,
    float64,
    bytes,
    string,
};

enum class ChecksumAlgorithm {
    sum8,
    xor8,
    crc16_modbus,
    custom,
};

struct ProtocolMetadata {
    std::string name;
    std::string display_name;
    std::string version;
    std::string description;
    ByteOrder default_byte_order{ByteOrder::big_endian};
};

struct FieldDefinition {
    std::string name;
    std::string display_name;
    FieldType type{FieldType::uint8};
    std::optional<ByteOrder> byte_order;
    std::optional<std::size_t> length;
    std::optional<std::size_t> offset;
};

struct ChecksumDefinition {
    std::string name;
    ChecksumAlgorithm algorithm{ChecksumAlgorithm::sum8};
    std::string target_field;
};

struct MessageDefinition {
    std::string name;
    std::string display_name;
    std::optional<std::uint64_t> type_id;
    std::vector<FieldDefinition> fields;
    std::optional<ChecksumDefinition> checksum;
};

struct ProtocolSchema {
    std::string schema_version{current_schema_version};
    ProtocolMetadata protocol;
    std::vector<MessageDefinition> messages;
};

enum class SchemaErrorCode {
    file_open_failed,
    file_read_failed,
    yaml_parse_error,
    yaml_root_mapping_required,
    yaml_required_node_missing,
    yaml_node_type_mismatch,
    yaml_invalid_scalar,
    yaml_unknown_byte_order,
    yaml_unknown_field_type,
    yaml_unknown_checksum_algorithm,
    schema_version_required,
    unsupported_schema_version,
    protocol_name_required,
    protocol_version_required,
    message_name_required,
    duplicate_message_name,
    duplicate_message_type_id,
    empty_field_name,
    duplicate_field_name,
    field_length_zero,
    field_length_mismatch,
    field_offset_overflow,
    field_layout_overlap,
    checksum_field_not_found,
};

using SchemaDiagnostic = Error<SchemaErrorCode>;

struct SchemaValidation {
    std::vector<SchemaDiagnostic> diagnostics;

    [[nodiscard]] bool ok() const noexcept {
        return diagnostics.empty();
    }
};

[[nodiscard]] SchemaValidation validate(const ProtocolSchema& schema);
[[nodiscard]] std::string_view to_string(SchemaErrorCode code) noexcept;

} // namespace iotps::core::schema
