#include "iotps/core/schema/schema.hpp"

#include <limits>
#include <string>
#include <unordered_map>

namespace iotps::core::schema {
namespace {

void add_diagnostic(SchemaValidation& validation, const SchemaErrorCode code, std::string path) {
    validation.diagnostics.push_back({.code = code, .path = std::move(path)});
}

std::string message_path(const std::size_t message_index, const std::string_view suffix) {
    return "messages[" + std::to_string(message_index) + "]." + std::string{suffix};
}

std::string field_path(const std::size_t message_index, const std::size_t field_index,
                       const std::string_view suffix) {
    return "messages[" + std::to_string(message_index) + "].fields[" + std::to_string(field_index) +
           "]." + std::string{suffix};
}

std::optional<std::size_t> primitive_width(const FieldType type) {
    switch (type) {
    case FieldType::boolean:
    case FieldType::int8:
    case FieldType::uint8:
        return 1;
    case FieldType::int16:
    case FieldType::uint16:
        return 2;
    case FieldType::int32:
    case FieldType::uint32:
    case FieldType::float32:
        return 4;
    case FieldType::int64:
    case FieldType::uint64:
    case FieldType::float64:
        return 8;
    case FieldType::bytes:
    case FieldType::string:
        return std::nullopt;
    }
    return std::nullopt;
}

std::optional<std::size_t> fixed_width(const FieldDefinition& field) {
    if (const auto width = primitive_width(field.type); width.has_value()) {
        return field.length.value_or(*width);
    }
    return field.length;
}

} // namespace

SchemaValidation validate(const ProtocolSchema& schema) {
    SchemaValidation validation;

    if (schema.schema_version.empty()) {
        add_diagnostic(validation, SchemaErrorCode::schema_version_required, "schemaVersion");
    } else if (schema.schema_version != current_schema_version) {
        add_diagnostic(validation, SchemaErrorCode::unsupported_schema_version, "schemaVersion");
    }

    if (schema.protocol.name.empty()) {
        add_diagnostic(validation, SchemaErrorCode::protocol_name_required, "protocol.name");
    }
    if (schema.protocol.version.empty()) {
        add_diagnostic(validation, SchemaErrorCode::protocol_version_required, "protocol.version");
    }

    std::unordered_map<std::string, std::size_t> message_names;
    std::unordered_map<std::uint64_t, std::size_t> message_type_ids;

    for (std::size_t message_index = 0; message_index < schema.messages.size(); ++message_index) {
        const auto& message = schema.messages[message_index];
        if (message.name.empty()) {
            add_diagnostic(validation, SchemaErrorCode::message_name_required,
                           message_path(message_index, "name"));
        } else if (!message_names.emplace(message.name, message_index).second) {
            add_diagnostic(validation, SchemaErrorCode::duplicate_message_name,
                           message_path(message_index, "name"));
        }

        if (message.type_id.has_value() &&
            !message_type_ids.emplace(*message.type_id, message_index).second) {
            add_diagnostic(validation, SchemaErrorCode::duplicate_message_type_id,
                           message_path(message_index, "typeId"));
        }

        std::unordered_map<std::string, std::size_t> field_names;
        for (std::size_t field_index = 0; field_index < message.fields.size(); ++field_index) {
            const auto& field = message.fields[field_index];
            if (field.name.empty()) {
                add_diagnostic(validation, SchemaErrorCode::empty_field_name,
                               field_path(message_index, field_index, "name"));
            } else if (!field_names.emplace(field.name, field_index).second) {
                add_diagnostic(validation, SchemaErrorCode::duplicate_field_name,
                               field_path(message_index, field_index, "name"));
            }

            if (field.length.has_value() && *field.length == 0) {
                add_diagnostic(validation, SchemaErrorCode::field_length_zero,
                               field_path(message_index, field_index, "length"));
            }

            const auto width = primitive_width(field.type);
            if (!width.has_value() && !field.length.has_value()) {
                add_diagnostic(validation, SchemaErrorCode::field_length_required,
                               field_path(message_index, field_index, "length"));
            }
            if (field.length.has_value() && width.has_value() && *field.length != *width) {
                add_diagnostic(validation, SchemaErrorCode::field_length_mismatch,
                               field_path(message_index, field_index, "length"));
            }

            const auto effective_length = fixed_width(field);
            if (field.offset.has_value() && effective_length.has_value() &&
                *field.offset > std::numeric_limits<std::size_t>::max() - *effective_length) {
                add_diagnostic(validation, SchemaErrorCode::field_offset_overflow,
                               field_path(message_index, field_index, "offset"));
            }
        }

        std::size_t cursor = 0;
        for (std::size_t field_index = 0; field_index < message.fields.size(); ++field_index) {
            const auto& field = message.fields[field_index];
            const auto width = fixed_width(field);
            if (!width.has_value()) {
                continue;
            }
            const auto length = *width;
            const auto offset = field.offset.value_or(cursor);
            if (offset > std::numeric_limits<std::size_t>::max() - length) {
                continue;
            }
            if (offset < cursor) {
                add_diagnostic(validation, SchemaErrorCode::field_layout_overlap,
                               field_path(message_index, field_index, "offset"));
            }
            cursor = offset + length;
        }

        if (message.checksum.has_value() && !field_names.contains(message.checksum->target_field)) {
            add_diagnostic(validation, SchemaErrorCode::checksum_field_not_found,
                           message_path(message_index, "checksum.targetField"));
        }
    }

    return validation;
}

std::string_view to_string(const SchemaErrorCode code) noexcept {
    switch (code) {
    case SchemaErrorCode::file_open_failed:
        return "file_open_failed";
    case SchemaErrorCode::file_read_failed:
        return "file_read_failed";
    case SchemaErrorCode::yaml_parse_error:
        return "yaml_parse_error";
    case SchemaErrorCode::yaml_root_mapping_required:
        return "yaml_root_mapping_required";
    case SchemaErrorCode::yaml_required_node_missing:
        return "yaml_required_node_missing";
    case SchemaErrorCode::yaml_node_type_mismatch:
        return "yaml_node_type_mismatch";
    case SchemaErrorCode::yaml_invalid_scalar:
        return "yaml_invalid_scalar";
    case SchemaErrorCode::yaml_unknown_byte_order:
        return "yaml_unknown_byte_order";
    case SchemaErrorCode::yaml_unknown_field_type:
        return "yaml_unknown_field_type";
    case SchemaErrorCode::yaml_unknown_checksum_algorithm:
        return "yaml_unknown_checksum_algorithm";
    case SchemaErrorCode::schema_version_required:
        return "schema_version_required";
    case SchemaErrorCode::unsupported_schema_version:
        return "unsupported_schema_version";
    case SchemaErrorCode::protocol_name_required:
        return "protocol_name_required";
    case SchemaErrorCode::protocol_version_required:
        return "protocol_version_required";
    case SchemaErrorCode::message_name_required:
        return "message_name_required";
    case SchemaErrorCode::duplicate_message_name:
        return "duplicate_message_name";
    case SchemaErrorCode::duplicate_message_type_id:
        return "duplicate_message_type_id";
    case SchemaErrorCode::empty_field_name:
        return "empty_field_name";
    case SchemaErrorCode::duplicate_field_name:
        return "duplicate_field_name";
    case SchemaErrorCode::field_length_required:
        return "field_length_required";
    case SchemaErrorCode::field_length_zero:
        return "field_length_zero";
    case SchemaErrorCode::field_length_mismatch:
        return "field_length_mismatch";
    case SchemaErrorCode::field_offset_overflow:
        return "field_offset_overflow";
    case SchemaErrorCode::field_layout_overlap:
        return "field_layout_overlap";
    case SchemaErrorCode::checksum_field_not_found:
        return "checksum_field_not_found";
    }
    return "unknown";
}

} // namespace iotps::core::schema
