#include "iotps/core/schema/schema.hpp"

#include <algorithm>
#include <functional>
#include <charconv>
#include <limits>
#include <string>
#include <unordered_map>
#include <utility>

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
    case FieldType::array:
        return std::nullopt;
    }
    return std::nullopt;
}

std::optional<std::size_t> fixed_width(const FieldDefinition& field) {
    if (field.type == FieldType::array) {
        if (!field.element_type.has_value() || !field.count.has_value()) {
            return std::nullopt;
        }
        const auto element_width = primitive_width(*field.element_type);
        if (!element_width.has_value() || *field.count == 0 ||
            *field.count > std::numeric_limits<std::size_t>::max() / *element_width) {
            return std::nullopt;
        }
        return *element_width * *field.count;
    }
    if (const auto width = primitive_width(field.type); width.has_value()) {
        return field.length.value_or(*width);
    }
    return field.length;
}

bool is_unsigned_integer(const FieldType type) {
    return type == FieldType::uint8 || type == FieldType::uint16 || type == FieldType::uint32 ||
           type == FieldType::uint64;
}

bool valid_enum_value(const FieldType type, const std::string_view text) {
    const auto bits = primitive_width(type).value_or(0) * 8;
    if (bits == 0 || text.empty()) return false;
    if (is_unsigned_integer(type)) {
        std::uint64_t value = 0;
        const auto [end, error] = std::from_chars(text.data(), text.data() + text.size(), value);
        return error == std::errc{} && end == text.data() + text.size() &&
               std::to_string(value) == text && (bits == 64 || value < (std::uint64_t{1} << bits));
    }
    if (type != FieldType::int8 && type != FieldType::int16 && type != FieldType::int32 &&
        type != FieldType::int64) return false;
    std::int64_t value = 0;
    const auto [end, error] = std::from_chars(text.data(), text.data() + text.size(), value);
    return error == std::errc{} && end == text.data() + text.size() &&
           std::to_string(value) == text &&
           (bits == 64 || (value >= -(std::int64_t{1} << (bits - 1)) &&
                           value < (std::int64_t{1} << (bits - 1))));
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

            if (!field.enum_values.empty()) {
                const auto path = field_path(message_index, field_index, "enum");
                if (field.enum_values.size() > 64)
                    add_diagnostic(validation, SchemaErrorCode::enum_count_exceeded, path);
                if (!is_unsigned_integer(field.type) && field.type != FieldType::int8 &&
                     field.type != FieldType::int16 && field.type != FieldType::int32 &&
                     field.type != FieldType::int64)
                    add_diagnostic(validation, SchemaErrorCode::enum_type_unsupported, path);
                std::unordered_map<std::string, bool> names, values;
                for (const auto& item : field.enum_values) {
                    if (item.name.empty() || item.name.size() > 200 ||
                        item.name.find('=') != std::string::npos ||
                        std::ranges::any_of(item.name, [](unsigned char c) { return c < 32; }) ||
                        !valid_enum_value(field.type, item.value))
                        add_diagnostic(validation, SchemaErrorCode::enum_value_invalid, path);
                    if (!names.emplace(item.name, true).second)
                        add_diagnostic(validation, SchemaErrorCode::enum_duplicate_name, path);
                    if (!values.emplace(item.value, true).second)
                        add_diagnostic(validation, SchemaErrorCode::enum_duplicate_value, path);
                }
            }
            if (!field.bits.empty()) {
                const auto path = field_path(message_index, field_index, "bits");
                if (!is_unsigned_integer(field.type) || field.bits.size() > 64)
                    add_diagnostic(validation, SchemaErrorCode::bit_type_unsupported, path);
                std::unordered_map<std::string, bool> names;
                std::uint64_t occupied = 0;
                const auto capacity = primitive_width(field.type).value_or(0) * 8;
                for (const auto& bit : field.bits) {
                    if (bit.name.empty() || bit.name.size() > 100 ||
                        std::ranges::any_of(bit.name, [](unsigned char c) { return c < 32; }) ||
                        !names.emplace(bit.name, true).second || bit.width == 0 ||
                        bit.offset >= capacity || bit.width > capacity - bit.offset) {
                        add_diagnostic(validation, SchemaErrorCode::bit_invalid, path);
                        continue;
                    }
                    const auto mask = (bit.width == 64 ? ~std::uint64_t{0}
                                                       : ((std::uint64_t{1} << bit.width) - 1))
                                      << bit.offset;
                    if (occupied & mask)
                        add_diagnostic(validation, SchemaErrorCode::bit_overlap, path);
                    occupied |= mask;
                }
            }

            if (field.type == FieldType::array) {
                if (!field.element_type.has_value()) {
                    add_diagnostic(validation, SchemaErrorCode::array_element_type_required,
                                   field_path(message_index, field_index, "elementType"));
                } else if (!primitive_width(*field.element_type).has_value()) {
                    add_diagnostic(validation, SchemaErrorCode::array_element_type_unsupported,
                                   field_path(message_index, field_index, "elementType"));
                }
                if (!field.count.has_value()) {
                    add_diagnostic(validation, SchemaErrorCode::array_count_required,
                                   field_path(message_index, field_index, "count"));
                } else if (*field.count == 0) {
                    add_diagnostic(validation, SchemaErrorCode::array_count_zero,
                                   field_path(message_index, field_index, "count"));
                } else if (field.element_type.has_value()) {
                    if (const auto element_width = primitive_width(*field.element_type);
                        element_width.has_value() &&
                        *field.count > std::numeric_limits<std::size_t>::max() / *element_width) {
                        add_diagnostic(validation, SchemaErrorCode::array_length_overflow,
                                       field_path(message_index, field_index, "count"));
                    }
                }
                if (field.length.has_value()) {
                    add_diagnostic(validation, SchemaErrorCode::array_length_not_allowed,
                                   field_path(message_index, field_index, "length"));
                }
            } else {
                if (field.element_type.has_value()) {
                    add_diagnostic(validation, SchemaErrorCode::array_metadata_not_allowed,
                                   field_path(message_index, field_index, "elementType"));
                }
                if (field.count.has_value()) {
                    add_diagnostic(validation, SchemaErrorCode::array_metadata_not_allowed,
                                   field_path(message_index, field_index, "count"));
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
            }

            const auto effective_length = fixed_width(field);
            if (field.offset.has_value() && effective_length.has_value() &&
                *field.offset > std::numeric_limits<std::size_t>::max() - *effective_length) {
                add_diagnostic(validation, SchemaErrorCode::field_offset_overflow,
                               field_path(message_index, field_index, "offset"));
            }
        }

        if (!schema.protocol.message_type_field.empty()) {
            if (!message.type_id)
                add_diagnostic(validation, SchemaErrorCode::message_type_id_required,
                               message_path(message_index, "typeId"));
            const auto found = field_names.find(schema.protocol.message_type_field);
            if (found == field_names.end()) {
                add_diagnostic(validation, SchemaErrorCode::message_type_field_not_found,
                               message_path(message_index, "fields"));
            } else {
                const auto& field = message.fields[found->second];
                if (!is_unsigned_integer(field.type) || field.length_of ||
                    (message.checksum && message.checksum->target_field == field.name)) {
                    add_diagnostic(validation, SchemaErrorCode::message_type_field_invalid,
                                   field_path(message_index, found->second, "type"));
                } else if (message.type_id) {
                    const auto width = primitive_width(field.type).value();
                    if (width < 8 && (*message.type_id >> (width * 8)) != 0)
                        add_diagnostic(validation, SchemaErrorCode::message_type_id_out_of_range,
                                       message_path(message_index, "typeId"));
                }
            }
        }

        std::vector<std::optional<std::size_t>> length_targets(message.fields.size());
        for (std::size_t field_index = 0; field_index < message.fields.size(); ++field_index) {
            const auto& field = message.fields[field_index];
            if (!field.length_of.has_value()) {
                continue;
            }
            const auto path = field_path(message_index, field_index, "lengthOf");
            if (!is_unsigned_integer(field.type)) {
                add_diagnostic(validation, SchemaErrorCode::length_field_type_unsupported, path);
            }
            const auto target = field_names.find(*field.length_of);
            if (target == field_names.end()) {
                add_diagnostic(validation, SchemaErrorCode::length_field_target_not_found, path);
                continue;
            }
            if (target->second == field_index) {
                add_diagnostic(validation, SchemaErrorCode::length_field_self_reference, path);
                continue;
            }
            length_targets[field_index] = target->second;
        }

        enum class VisitState { unvisited, visiting, visited };
        std::vector states(message.fields.size(), VisitState::unvisited);
        std::function<void(std::size_t)> visit = [&](const std::size_t field_index) {
            states[field_index] = VisitState::visiting;
            if (const auto target = length_targets[field_index]; target.has_value()) {
                if (states[*target] == VisitState::unvisited) {
                    visit(*target);
                } else if (states[*target] == VisitState::visiting) {
                    add_diagnostic(validation, SchemaErrorCode::length_field_dependency_cycle,
                                   field_path(message_index, field_index, "lengthOf"));
                }
            }
            states[field_index] = VisitState::visited;
        };
        for (std::size_t field_index = 0; field_index < message.fields.size(); ++field_index) {
            if (states[field_index] == VisitState::unvisited) {
                visit(field_index);
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

        if (message.checksum.has_value()) {
            const auto& checksum = *message.checksum;
            const auto target = field_names.find(checksum.target_field);
            if (target == field_names.end()) {
                add_diagnostic(validation, SchemaErrorCode::checksum_field_not_found,
                               message_path(message_index, "checksum.targetField"));
            } else {
                const auto& field = message.fields[target->second];
                const auto expected = checksum.algorithm == ChecksumAlgorithm::crc16_modbus
                                          ? FieldType::uint16
                                          : FieldType::uint8;
                if (field.type != expected || field.length_of.has_value()) {
                    add_diagnostic(validation, SchemaErrorCode::checksum_target_invalid,
                                   message_path(message_index, "checksum.targetField"));
                }
            }
            if (checksum.algorithm == ChecksumAlgorithm::custom) {
                add_diagnostic(validation, SchemaErrorCode::checksum_algorithm_unsupported,
                               message_path(message_index, "checksum.algorithm"));
            }
            const auto start = checksum.range_start.value_or(0);
            const auto end = checksum.range_end.value_or(cursor);
            if (start >= end || end > cursor) {
                add_diagnostic(validation, SchemaErrorCode::checksum_range_invalid,
                               message_path(message_index, end > cursor || !checksum.range_start
                                                               ? "checksum.rangeEnd"
                                                               : "checksum.rangeStart"));
            }
        }
    }

    return validation;
}

std::optional<std::string_view> enum_name(const FieldDefinition& field,
                                          const std::string_view value) noexcept {
    for (const auto& item : field.enum_values)
        if (item.value == value) return item.name;
    return std::nullopt;
}

std::uint64_t bit_value(const std::uint64_t raw, const BitDefinition& bit) noexcept {
    if (bit.offset >= 64 || bit.width == 0 || bit.width > 64 - bit.offset) return 0;
    const auto mask = bit.width == 64 ? ~std::uint64_t{0}
                                      : (std::uint64_t{1} << bit.width) - 1;
    return (raw >> bit.offset) & mask;
}

MessageMatch identify_message(const ProtocolSchema& schema,
                              const std::span<const std::uint8_t> bytes) {
    if (schema.protocol.message_type_field.empty())
        return {.status = MatchStatus::unconfigured,
                .reason = "Protocol has no messageTypeField rule"};
    std::string matched;
    bool incomplete = false;
    for (const auto& message : schema.messages) {
        std::size_t cursor = 0;
        for (const auto& field : message.fields) {
            const auto width = wire_size(field);
            if (!width)
                return {.status = MatchStatus::unconfigured,
                        .reason = "Message has an unresolved field layout"};
            const auto offset = field.offset.value_or(cursor);
            if (field.name == schema.protocol.message_type_field) {
                if (offset > bytes.size() || *width > bytes.size() - offset) {
                    incomplete = true;
                } else {
                    std::uint64_t value = 0;
                    const bool little = field.byte_order.value_or(schema.protocol.default_byte_order) ==
                                        ByteOrder::little_endian;
                    for (std::size_t index = 0; index < *width; ++index)
                        value = (value << 8) | bytes[offset + (little ? *width - index - 1 : index)];
                    if (message.type_id && value == *message.type_id) {
                        if (!matched.empty())
                            return {.status = MatchStatus::ambiguous,
                                    .reason = "Multiple message rules match this frame"};
                        matched = message.name;
                    }
                }
                break;
            }
            cursor = offset + *width;
        }
    }
    if (incomplete)
        return {.status = MatchStatus::incomplete,
                .reason = "Frame is too short to evaluate every message rule"};
    if (matched.empty())
        return {.status = MatchStatus::unknown,
                .reason = "No message rule matches the frame"};
    return {.status = MatchStatus::matched, .message = std::move(matched)};
}

std::optional<std::size_t> wire_size(const FieldDefinition& field) noexcept {
    return fixed_width(field);
}

std::string_view to_string(const ByteOrder byte_order) noexcept {
    return byte_order == ByteOrder::little_endian ? "little" : "big";
}

std::string_view to_string(const FieldType type) noexcept {
    switch (type) {
    case FieldType::boolean:
        return "bool";
    case FieldType::int8:
        return "int8";
    case FieldType::uint8:
        return "uint8";
    case FieldType::int16:
        return "int16";
    case FieldType::uint16:
        return "uint16";
    case FieldType::int32:
        return "int32";
    case FieldType::uint32:
        return "uint32";
    case FieldType::int64:
        return "int64";
    case FieldType::uint64:
        return "uint64";
    case FieldType::float32:
        return "float32";
    case FieldType::float64:
        return "float64";
    case FieldType::bytes:
        return "bytes";
    case FieldType::string:
        return "string";
    case FieldType::array:
        return "array";
    }
    return "unknown";
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
    case SchemaErrorCode::message_type_id_required:
        return "message_type_id_required";
    case SchemaErrorCode::message_type_field_not_found:
        return "message_type_field_not_found";
    case SchemaErrorCode::message_type_field_invalid:
        return "message_type_field_invalid";
    case SchemaErrorCode::message_type_id_out_of_range:
        return "message_type_id_out_of_range";
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
    case SchemaErrorCode::length_field_type_unsupported:
        return "length_field_type_unsupported";
    case SchemaErrorCode::length_field_target_not_found:
        return "length_field_target_not_found";
    case SchemaErrorCode::length_field_self_reference:
        return "length_field_self_reference";
    case SchemaErrorCode::length_field_dependency_cycle:
        return "length_field_dependency_cycle";
    case SchemaErrorCode::array_element_type_required:
        return "array_element_type_required";
    case SchemaErrorCode::array_element_type_unsupported:
        return "array_element_type_unsupported";
    case SchemaErrorCode::array_count_required:
        return "array_count_required";
    case SchemaErrorCode::array_count_zero:
        return "array_count_zero";
    case SchemaErrorCode::array_length_overflow:
        return "array_length_overflow";
    case SchemaErrorCode::array_length_not_allowed:
        return "array_length_not_allowed";
    case SchemaErrorCode::array_metadata_not_allowed:
        return "array_metadata_not_allowed";
    case SchemaErrorCode::enum_type_unsupported:
        return "enum_type_unsupported";
    case SchemaErrorCode::enum_count_exceeded:
        return "enum_count_exceeded";
    case SchemaErrorCode::enum_value_invalid:
        return "enum_value_invalid";
    case SchemaErrorCode::enum_duplicate_name:
        return "enum_duplicate_name";
    case SchemaErrorCode::enum_duplicate_value:
        return "enum_duplicate_value";
    case SchemaErrorCode::bit_type_unsupported:
        return "bit_type_unsupported";
    case SchemaErrorCode::bit_invalid:
        return "bit_invalid";
    case SchemaErrorCode::bit_overlap:
        return "bit_overlap";
    case SchemaErrorCode::checksum_field_not_found:
        return "checksum_field_not_found";
    case SchemaErrorCode::checksum_target_invalid:
        return "checksum_target_invalid";
    case SchemaErrorCode::checksum_range_invalid:
        return "checksum_range_invalid";
    case SchemaErrorCode::checksum_algorithm_unsupported:
        return "checksum_algorithm_unsupported";
    }
    return "unknown";
}

} // namespace iotps::core::schema
