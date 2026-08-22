#include "iotps/core/codec/codec.hpp"

#include <algorithm>
#include <limits>
#include <utility>

namespace iotps::core::codec {
namespace {

CodecError make_error(const CodecErrorCode code, std::string path, const std::size_t offset) {
    return {.code = code, .path = std::move(path), .offset = offset};
}

std::string field_path(const schema::MessageDefinition& definition,
                       const schema::FieldDefinition& field) {
    return definition.name + "." + field.name;
}

} // namespace

EncodeResult FixedLayoutCodec::encode(const schema::MessageDefinition& definition,
                                      const StructuredMessage& message) const {
    if (message.message_name != definition.name) {
        return make_error(CodecErrorCode::message_name_mismatch, "messageName", 0);
    }

    ByteBuffer bytes;
    bytes.reserve(definition.fields.size());
    for (const auto& field : definition.fields) {
        const auto path = field_path(definition, field);
        if (field.type != schema::FieldType::uint8) {
            return make_error(CodecErrorCode::unsupported_field_type, path, bytes.size());
        }

        const auto value = std::ranges::find_if(message.fields, [&field](const FieldValue& item) {
            return item.name == field.name;
        });
        if (value == message.fields.end()) {
            return make_error(CodecErrorCode::missing_field, path, bytes.size());
        }

        const auto* unsigned_value = std::get_if<std::uint64_t>(&value->value);
        if (unsigned_value == nullptr) {
            return make_error(CodecErrorCode::type_mismatch, path, bytes.size());
        }
        if (*unsigned_value > std::numeric_limits<std::uint8_t>::max()) {
            return make_error(CodecErrorCode::value_out_of_range, path, bytes.size());
        }
        bytes.push_back(static_cast<std::uint8_t>(*unsigned_value));
    }

    return bytes;
}

DecodeResult FixedLayoutCodec::decode(const schema::MessageDefinition& definition,
                                      const std::span<const std::uint8_t> bytes) const {
    DecodedMessage decoded{.message = {.message_name = definition.name}};
    decoded.message.fields.reserve(definition.fields.size());
    decoded.field_ranges.reserve(definition.fields.size());

    std::size_t offset = 0;
    for (const auto& field : definition.fields) {
        const auto path = field_path(definition, field);
        if (field.type != schema::FieldType::uint8) {
            return make_error(CodecErrorCode::unsupported_field_type, path, offset);
        }
        if (offset >= bytes.size()) {
            return make_error(CodecErrorCode::insufficient_data, path, offset);
        }

        decoded.message.fields.push_back(
            {.name = field.name, .value = static_cast<std::uint64_t>(bytes[offset])});
        decoded.field_ranges.push_back({.path = path, .offset = offset, .length = 1});
        ++offset;
    }

    if (offset != bytes.size()) {
        return make_error(CodecErrorCode::unexpected_data, definition.name, offset);
    }
    return decoded;
}

std::string_view to_string(const CodecErrorCode code) noexcept {
    switch (code) {
    case CodecErrorCode::message_name_mismatch:
        return "message_name_mismatch";
    case CodecErrorCode::missing_field:
        return "missing_field";
    case CodecErrorCode::type_mismatch:
        return "type_mismatch";
    case CodecErrorCode::value_out_of_range:
        return "value_out_of_range";
    case CodecErrorCode::insufficient_data:
        return "insufficient_data";
    case CodecErrorCode::unexpected_data:
        return "unexpected_data";
    case CodecErrorCode::unsupported_field_type:
        return "unsupported_field_type";
    }
    return "unknown";
}

} // namespace iotps::core::codec
