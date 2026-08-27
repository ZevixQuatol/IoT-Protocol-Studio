#include "iotps/core/schema/loader.hpp"

#include <charconv>
#include <cstdint>
#include <fstream>
#include <optional>
#include <ryml.hpp>
#include <sstream>
#include <string>
#include <unordered_map>
#include <utility>

namespace iotps::core::schema {
namespace {

[[noreturn]] void throw_basic(const ryml::csubstr message, const ryml::ErrorDataBasic& error,
                              void*) {
    throw ryml::ExceptionBasic{message, error};
}

[[noreturn]] void throw_parse(const ryml::csubstr message, const ryml::ErrorDataParse& error,
                              void*) {
    throw ryml::ExceptionParse{message, error};
}

[[noreturn]] void throw_visit(const ryml::csubstr message, const ryml::ErrorDataVisit& error,
                              void*) {
    throw ryml::ExceptionVisit{message, error};
}

ryml::Callbacks loader_callbacks() {
    auto callbacks = ryml::Callbacks{};
    callbacks.set_error_basic(throw_basic);
    callbacks.set_error_parse(throw_parse);
    callbacks.set_error_visit(throw_visit);
    return callbacks;
}

std::string to_string(const ryml::csubstr value) {
    return {value.str, value.len};
}

std::string scalar(const ryml::ConstNodeRef node) {
    return to_string(node.val());
}

using SourceMap = std::unordered_map<std::string, ryml::id_type>;

void attach_source(SchemaDiagnostic& error, const ryml::ConstNodeRef node,
                   const ryml::Parser& parser) {
    const auto location = node.location(parser);
    error.offset = location.offset;
    error.source_location = SourceLocation{
        .source = to_string(location.name),
        .line = location.line + 1,
        .column = location.col + 1,
    };
}

SchemaDiagnostic make_error(const SchemaErrorCode code, std::string path, std::string detail,
                            const ryml::ConstNodeRef node, const ryml::Parser& parser) {
    SchemaDiagnostic error{
        .code = code,
        .path = std::move(path),
        .detail = std::move(detail),
    };
    attach_source(error, node, parser);
    return error;
}

std::optional<SchemaDiagnostic> require_mapping(const ryml::ConstNodeRef node,
                                                const std::string_view path,
                                                const ryml::Parser& parser) {
    if (node.is_map()) {
        return std::nullopt;
    }
    return make_error(SchemaErrorCode::yaml_node_type_mismatch, std::string{path},
                      "YAML node '" + std::string{path} + "' must be a mapping", node, parser);
}

std::optional<SchemaDiagnostic> require_sequence(const ryml::ConstNodeRef node,
                                                 const std::string_view path,
                                                 const ryml::Parser& parser) {
    if (node.is_seq()) {
        return std::nullopt;
    }
    return make_error(SchemaErrorCode::yaml_node_type_mismatch, std::string{path},
                      "YAML node '" + std::string{path} + "' must be a sequence", node, parser);
}

std::optional<SchemaDiagnostic> require_scalar(const ryml::ConstNodeRef node,
                                               const std::string_view path,
                                               const ryml::Parser& parser) {
    if (node.has_val() && !node.is_container()) {
        return std::nullopt;
    }
    return make_error(SchemaErrorCode::yaml_node_type_mismatch, std::string{path},
                      "YAML node '" + std::string{path} + "' must be a scalar", node, parser);
}

SchemaDiagnostic missing_node(const std::string_view path, const std::string_view kind,
                              const ryml::ConstNodeRef parent, const ryml::Parser& parser) {
    return make_error(SchemaErrorCode::yaml_required_node_missing, std::string{path},
                      "required YAML " + std::string{kind} + " '" + std::string{path} +
                          "' is missing",
                      parent, parser);
}

Result<ByteOrder, SchemaDiagnostic> byte_order(const ryml::ConstNodeRef node, std::string path,
                                               const ryml::Parser& parser) {
    const auto value = scalar(node);
    if (value == "big") {
        return ByteOrder::big_endian;
    }
    if (value == "little") {
        return ByteOrder::little_endian;
    }
    return make_error(SchemaErrorCode::yaml_unknown_byte_order, std::move(path),
                      "unknown byte order '" + value + "'", node, parser);
}

Result<FieldType, SchemaDiagnostic> field_type(const ryml::ConstNodeRef node, std::string path,
                                               const ryml::Parser& parser) {
    const auto value = scalar(node);
    if (value == "bool" || value == "boolean") {
        return FieldType::boolean;
    }
    if (value == "int8") {
        return FieldType::int8;
    }
    if (value == "int16") {
        return FieldType::int16;
    }
    if (value == "uint8") {
        return FieldType::uint8;
    }
    if (value == "uint16") {
        return FieldType::uint16;
    }
    if (value == "int32") {
        return FieldType::int32;
    }
    if (value == "uint32") {
        return FieldType::uint32;
    }
    if (value == "int64") {
        return FieldType::int64;
    }
    if (value == "uint64") {
        return FieldType::uint64;
    }
    if (value == "float32") {
        return FieldType::float32;
    }
    if (value == "float64") {
        return FieldType::float64;
    }
    if (value == "bytes") {
        return FieldType::bytes;
    }
    if (value == "string") {
        return FieldType::string;
    }
    return make_error(SchemaErrorCode::yaml_unknown_field_type, std::move(path),
                      "unknown field type '" + value + "'", node, parser);
}

Result<ChecksumAlgorithm, SchemaDiagnostic>
checksum_algorithm(const ryml::ConstNodeRef node, std::string path, const ryml::Parser& parser) {
    const auto value = scalar(node);
    if (value == "sum8") {
        return ChecksumAlgorithm::sum8;
    }
    if (value == "xor8") {
        return ChecksumAlgorithm::xor8;
    }
    if (value == "crc16-modbus") {
        return ChecksumAlgorithm::crc16_modbus;
    }
    if (value == "custom") {
        return ChecksumAlgorithm::custom;
    }
    return make_error(SchemaErrorCode::yaml_unknown_checksum_algorithm, std::move(path),
                      "unknown checksum algorithm '" + value + "'", node, parser);
}

Result<std::uint64_t, SchemaDiagnostic>
unsigned_integer(const ryml::ConstNodeRef node, std::string path, const ryml::Parser& parser) {
    const auto value = scalar(node);
    std::uint64_t output = 0;
    const auto [end, error] = std::from_chars(value.data(), value.data() + value.size(), output);
    if (error != std::errc{} || end != value.data() + value.size()) {
        auto detail = "YAML scalar '" + path + "' must be an unsigned integer";
        return make_error(SchemaErrorCode::yaml_invalid_scalar, std::move(path), std::move(detail),
                          node, parser);
    }
    return output;
}

Result<FieldDefinition, SchemaDiagnostic>
load_field(const ryml::ConstNodeRef node, const std::string_view yaml_path,
           const std::string_view domain_path, const ryml::Parser& parser, SourceMap& source_map) {
    if (const auto error = require_mapping(node, yaml_path, parser)) {
        return *error;
    }
    const auto name_path = std::string{yaml_path} + ".name";
    if (!node.has_child("name")) {
        return missing_node(name_path, "scalar", node, parser);
    }
    const auto type_path = std::string{yaml_path} + ".type";
    if (!node.has_child("type")) {
        return missing_node(type_path, "scalar", node, parser);
    }
    const auto name_node = node["name"];
    const auto type_node = node["type"];
    if (const auto error = require_scalar(name_node, name_path, parser)) {
        return *error;
    }
    if (const auto error = require_scalar(type_node, type_path, parser)) {
        return *error;
    }
    source_map.emplace(std::string{domain_path} + ".name", name_node.id());
    source_map.emplace(std::string{domain_path} + ".type", type_node.id());

    auto type = field_type(type_node, type_path, parser);
    if (const auto* error = type.error_if()) {
        return *error;
    }
    FieldDefinition field{
        .name = scalar(name_node),
        .type = type.value(),
    };
    if (node.has_child("displayName")) {
        const auto display_name_node = node["displayName"];
        const auto display_name_path = std::string{yaml_path} + ".displayName";
        if (const auto error = require_scalar(display_name_node, display_name_path, parser)) {
            return *error;
        }
        field.display_name = scalar(display_name_node);
    }
    if (node.has_child("endian")) {
        const auto endian_node = node["endian"];
        const auto endian_path = std::string{yaml_path} + ".endian";
        if (const auto error = require_scalar(endian_node, endian_path, parser)) {
            return *error;
        }
        source_map.emplace(std::string{domain_path} + ".endian", endian_node.id());
        auto order = byte_order(endian_node, endian_path, parser);
        if (const auto* error = order.error_if()) {
            return *error;
        }
        field.byte_order = order.value();
    }
    if (node.has_child("length")) {
        const auto length_node = node["length"];
        const auto length_path = std::string{yaml_path} + ".length";
        if (const auto error = require_scalar(length_node, length_path, parser)) {
            return *error;
        }
        source_map.emplace(std::string{domain_path} + ".length", length_node.id());
        auto length = unsigned_integer(length_node, length_path, parser);
        if (const auto* error = length.error_if()) {
            return *error;
        }
        field.length = static_cast<std::size_t>(length.value());
        if (length.value() != field.length.value()) {
            return make_error(SchemaErrorCode::yaml_invalid_scalar, length_path,
                              "YAML scalar '" + length_path + "' is outside size_t range",
                              length_node, parser);
        }
    }
    if (node.has_child("offset")) {
        const auto offset_node = node["offset"];
        const auto offset_path = std::string{yaml_path} + ".offset";
        if (const auto error = require_scalar(offset_node, offset_path, parser)) {
            return *error;
        }
        source_map.emplace(std::string{domain_path} + ".offset", offset_node.id());
        auto offset = unsigned_integer(offset_node, offset_path, parser);
        if (const auto* error = offset.error_if()) {
            return *error;
        }
        field.offset = static_cast<std::size_t>(offset.value());
        if (offset.value() != field.offset.value()) {
            return make_error(SchemaErrorCode::yaml_invalid_scalar, offset_path,
                              "YAML scalar '" + offset_path + "' is outside size_t range",
                              offset_node, parser);
        }
    }
    return field;
}

Result<MessageDefinition, SchemaDiagnostic>
load_message(const ryml::ConstNodeRef node, const std::string_view yaml_path,
             const std::size_t message_index, const ryml::Parser& parser, SourceMap& source_map) {
    if (const auto error = require_mapping(node, yaml_path, parser)) {
        return *error;
    }
    const auto domain_path = "messages[" + std::to_string(message_index) + "]";
    source_map.emplace(domain_path + ".name", node.id());
    MessageDefinition message{.name = to_string(node.key())};
    if (node.has_child("displayName")) {
        const auto display_name_node = node["displayName"];
        const auto display_name_path = std::string{yaml_path} + ".displayName";
        if (const auto error = require_scalar(display_name_node, display_name_path, parser)) {
            return *error;
        }
        message.display_name = scalar(display_name_node);
    }
    if (node.has_child("typeId")) {
        const auto type_id_node = node["typeId"];
        const auto type_id_path = std::string{yaml_path} + ".typeId";
        if (const auto error = require_scalar(type_id_node, type_id_path, parser)) {
            return *error;
        }
        source_map.emplace(domain_path + ".typeId", type_id_node.id());
        auto type_id = unsigned_integer(type_id_node, type_id_path, parser);
        if (const auto* error = type_id.error_if()) {
            return *error;
        }
        message.type_id = type_id.value();
    }
    const auto fields_path = std::string{yaml_path} + ".fields";
    if (!node.has_child("fields")) {
        return missing_node(fields_path, "sequence", node, parser);
    }
    const auto fields_node = node["fields"];
    if (const auto error = require_sequence(fields_node, fields_path, parser)) {
        return *error;
    }
    std::size_t field_index = 0;
    for (const auto field_node : fields_node.children()) {
        auto field = load_field(field_node, fields_path + "[" + std::to_string(field_index) + "]",
                                domain_path + ".fields[" + std::to_string(field_index) + "]",
                                parser, source_map);
        if (const auto* error = field.error_if()) {
            return *error;
        }
        message.fields.push_back(std::move(field).value());
        ++field_index;
    }
    if (node.has_child("checksum")) {
        const auto checksum = node["checksum"];
        const auto checksum_path = std::string{yaml_path} + ".checksum";
        if (const auto error = require_mapping(checksum, checksum_path, parser)) {
            return *error;
        }
        const auto checksum_name_path = checksum_path + ".name";
        const auto algorithm_path = checksum_path + ".algorithm";
        const auto target_field_path = checksum_path + ".targetField";
        if (!checksum.has_child("name")) {
            return missing_node(checksum_name_path, "scalar", checksum, parser);
        }
        if (!checksum.has_child("algorithm")) {
            return missing_node(algorithm_path, "scalar", checksum, parser);
        }
        if (!checksum.has_child("targetField")) {
            return missing_node(target_field_path, "scalar", checksum, parser);
        }
        const auto checksum_name = checksum["name"];
        const auto algorithm_node = checksum["algorithm"];
        const auto target_field = checksum["targetField"];
        if (const auto error = require_scalar(checksum_name, checksum_name_path, parser)) {
            return *error;
        }
        if (const auto error = require_scalar(algorithm_node, algorithm_path, parser)) {
            return *error;
        }
        if (const auto error = require_scalar(target_field, target_field_path, parser)) {
            return *error;
        }
        source_map.emplace(domain_path + ".checksum.targetField", target_field.id());
        auto algorithm = checksum_algorithm(algorithm_node, algorithm_path, parser);
        if (const auto* error = algorithm.error_if()) {
            return *error;
        }
        message.checksum = ChecksumDefinition{
            .name = scalar(checksum_name),
            .algorithm = algorithm.value(),
            .target_field = scalar(target_field),
        };
    }
    return message;
}

} // namespace

SchemaLoadResult load_yaml(const std::string_view yaml, std::string source_name) {
    try {
        ryml::EventHandlerTree event_handler{loader_callbacks()};
        ryml::Parser parser(&event_handler, ryml::ParserOptions{}.locations(true));
        const auto tree = ryml::parse_in_arena(&parser, {source_name.data(), source_name.size()},
                                               {yaml.data(), yaml.size()});
        const auto root = tree.rootref();
        if (!root.is_map()) {
            return make_error(SchemaErrorCode::yaml_root_mapping_required, "$",
                              "YAML document root must be a mapping", root, parser);
        }
        if (!root.has_child("schemaVersion")) {
            return make_error(SchemaErrorCode::schema_version_required, "schemaVersion",
                              "required YAML scalar 'schemaVersion' is missing", root, parser);
        }
        const auto schema_version = root["schemaVersion"];
        if (const auto error = require_scalar(schema_version, "schemaVersion", parser)) {
            return *error;
        }
        if (!root.has_child("protocol")) {
            return missing_node("protocol", "mapping", root, parser);
        }
        const auto protocol = root["protocol"];
        if (const auto error = require_mapping(protocol, "protocol", parser)) {
            return *error;
        }
        if (!protocol.has_child("name")) {
            return make_error(SchemaErrorCode::protocol_name_required, "protocol.name",
                              "required YAML scalar 'protocol.name' is missing", protocol, parser);
        }
        const auto protocol_name = protocol["name"];
        if (const auto error = require_scalar(protocol_name, "protocol.name", parser)) {
            return *error;
        }
        if (!protocol.has_child("version")) {
            return make_error(SchemaErrorCode::protocol_version_required, "protocol.version",
                              "required YAML scalar 'protocol.version' is missing", protocol,
                              parser);
        }
        const auto protocol_version = protocol["version"];
        if (const auto error = require_scalar(protocol_version, "protocol.version", parser)) {
            return *error;
        }
        if (!root.has_child("messages")) {
            return missing_node("messages", "mapping", root, parser);
        }
        const auto messages = root["messages"];
        if (const auto error = require_mapping(messages, "messages", parser)) {
            return *error;
        }

        ProtocolSchema schema{
            .schema_version = scalar(schema_version),
            .protocol =
                {
                    .name = scalar(protocol_name),
                    .version = scalar(protocol_version),
                },
        };
        SourceMap source_map;
        source_map.emplace("schemaVersion", schema_version.id());
        source_map.emplace("protocol.name", protocol_name.id());
        source_map.emplace("protocol.version", protocol_version.id());
        if (protocol.has_child("displayName")) {
            const auto display_name = protocol["displayName"];
            if (const auto error = require_scalar(display_name, "protocol.displayName", parser)) {
                return *error;
            }
            schema.protocol.display_name = scalar(display_name);
        }
        if (protocol.has_child("description")) {
            const auto description = protocol["description"];
            if (const auto error = require_scalar(description, "protocol.description", parser)) {
                return *error;
            }
            schema.protocol.description = scalar(description);
        }
        if (protocol.has_child("defaultByteOrder")) {
            const auto default_byte_order = protocol["defaultByteOrder"];
            if (const auto error =
                    require_scalar(default_byte_order, "protocol.defaultByteOrder", parser)) {
                return *error;
            }
            source_map.emplace("protocol.defaultByteOrder", default_byte_order.id());
            auto order = byte_order(default_byte_order, "protocol.defaultByteOrder", parser);
            if (const auto* error = order.error_if()) {
                return *error;
            }
            schema.protocol.default_byte_order = order.value();
        }
        std::size_t message_index = 0;
        for (const auto message_node : messages.children()) {
            const auto message_name = to_string(message_node.key());
            auto message = load_message(message_node, "messages." + message_name, message_index,
                                        parser, source_map);
            if (const auto* error = message.error_if()) {
                return *error;
            }
            schema.messages.push_back(std::move(message).value());
            ++message_index;
        }

        const auto validation = validate(schema);
        if (!validation.ok()) {
            auto error = validation.diagnostics.front();
            if (const auto source = source_map.find(error.path); source != source_map.end()) {
                attach_source(error, tree.cref(source->second), parser);
            }
            if (error.detail.empty()) {
                error.detail = std::string{to_string(error.code)};
            }
            return error;
        }
        return schema;
    } catch (const ryml::ExceptionParse& error) {
        const auto& location = error.errdata_parse.ymlloc;
        return SchemaDiagnostic{
            .code = SchemaErrorCode::yaml_parse_error,
            .path = "$",
            .offset = location.offset,
            .detail = error.what(),
            .source_location =
                SourceLocation{
                    .source = to_string(location.name),
                    .line = location.line,
                    .column = location.col,
                },
        };
    } catch (const ryml::ExceptionVisit& error) {
        return SchemaDiagnostic{
            .code = SchemaErrorCode::yaml_node_type_mismatch,
            .path = "$",
            .detail = error.what(),
        };
    } catch (const ryml::ExceptionBasic& error) {
        return SchemaDiagnostic{
            .code = SchemaErrorCode::yaml_parse_error,
            .path = "$",
            .detail = error.what(),
        };
    }
}

SchemaLoadResult load_yaml_file(const std::filesystem::path& path) {
    std::ifstream input{path, std::ios::binary};
    if (!input.is_open()) {
        return SchemaDiagnostic{
            .code = SchemaErrorCode::file_open_failed,
            .path = "$file",
            .detail = "cannot open Protocol Schema file '" + path.string() + "'",
        };
    }

    std::ostringstream contents;
    contents << input.rdbuf();
    if (input.bad()) {
        return SchemaDiagnostic{
            .code = SchemaErrorCode::file_read_failed,
            .path = "$file",
            .detail = "cannot read Protocol Schema file '" + path.string() + "'",
        };
    }
    return load_yaml(contents.str(), path.string());
}

} // namespace iotps::core::schema
