#include "iotps/core/codec/codec.hpp"

#include <algorithm>
#include <bit>
#include <limits>
#include <optional>
#include <utility>

namespace iotps::core::codec {
namespace {

static_assert(sizeof(float) == 4 && std::numeric_limits<float>::is_iec559);
static_assert(sizeof(double) == 8 && std::numeric_limits<double>::is_iec559);

CodecError make_error(const CodecErrorCode code, std::string path, const std::size_t offset,
                      std::string detail = {}) {
    return {
        .code = code,
        .path = std::move(path),
        .offset = offset,
        .detail = std::move(detail),
    };
}

std::string field_path(const schema::MessageDefinition& definition,
                       const schema::FieldDefinition& field) {
    return definition.name + "." + field.name;
}

std::optional<std::size_t> primitive_width(const schema::FieldType type) {
    switch (type) {
    case schema::FieldType::boolean:
    case schema::FieldType::int8:
    case schema::FieldType::uint8:
        return 1;
    case schema::FieldType::int16:
    case schema::FieldType::uint16:
        return 2;
    case schema::FieldType::int32:
    case schema::FieldType::uint32:
    case schema::FieldType::float32:
        return 4;
    case schema::FieldType::int64:
    case schema::FieldType::uint64:
    case schema::FieldType::float64:
        return 8;
    case schema::FieldType::bytes:
    case schema::FieldType::string:
        return std::nullopt;
    }
    return std::nullopt;
}

std::uint64_t read_unsigned(const std::span<const std::uint8_t> bytes, const std::size_t offset,
                            const std::size_t width, const schema::ByteOrder byte_order) {
    std::uint64_t value = 0;
    if (byte_order == schema::ByteOrder::little_endian) {
        for (std::size_t index = 0; index < width; ++index) {
            value |= static_cast<std::uint64_t>(bytes[offset + index]) << (index * 8U);
        }
        return value;
    }
    for (std::size_t index = 0; index < width; ++index) {
        value = value << 8U | bytes[offset + index];
    }
    return value;
}

ScalarValue decode_primitive(const schema::FieldType type, const std::uint64_t bits) {
    switch (type) {
    case schema::FieldType::boolean:
        return bits != 0;
    case schema::FieldType::int8:
        return static_cast<std::int64_t>(
            std::bit_cast<std::int8_t>(static_cast<std::uint8_t>(bits)));
    case schema::FieldType::uint8:
        return bits;
    case schema::FieldType::int16:
        return static_cast<std::int64_t>(
            std::bit_cast<std::int16_t>(static_cast<std::uint16_t>(bits)));
    case schema::FieldType::uint16:
        return bits;
    case schema::FieldType::int32:
        return static_cast<std::int64_t>(
            std::bit_cast<std::int32_t>(static_cast<std::uint32_t>(bits)));
    case schema::FieldType::uint32:
        return bits;
    case schema::FieldType::int64:
        return std::bit_cast<std::int64_t>(bits);
    case schema::FieldType::uint64:
        return bits;
    case schema::FieldType::float32:
        return static_cast<double>(std::bit_cast<float>(static_cast<std::uint32_t>(bits)));
    case schema::FieldType::float64:
        return std::bit_cast<double>(bits);
    case schema::FieldType::bytes:
    case schema::FieldType::string:
        return std::uint64_t{0};
    }
    return std::uint64_t{0};
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

        const auto value = std::ranges::find_if(
            message.fields, [&field](const FieldValue& item) { return item.name == field.name; });
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
                                      const std::span<const std::uint8_t> bytes,
                                      const schema::ByteOrder default_byte_order) const {
    DecodedMessage decoded{.message = {.message_name = definition.name}};
    decoded.message.fields.reserve(definition.fields.size());
    decoded.field_ranges.reserve(definition.fields.size());

    std::size_t offset = 0;
    for (const auto& field : definition.fields) {
        const auto path = field_path(definition, field);
        const auto width = primitive_width(field.type);
        if (!width.has_value()) {
            return make_error(CodecErrorCode::unsupported_field_type, path, offset,
                              "field type is not a fixed-width primitive");
        }
        if (offset > bytes.size() || bytes.size() - offset < *width) {
            const auto remaining = offset <= bytes.size() ? bytes.size() - offset : 0;
            return make_error(CodecErrorCode::insufficient_data, path, offset,
                              "field requires " + std::to_string(*width) + " bytes but only " +
                                  std::to_string(remaining) + " remain");
        }

        const auto byte_order = field.byte_order.value_or(default_byte_order);
        const auto bits = read_unsigned(bytes, offset, *width, byte_order);
        if (field.type == schema::FieldType::boolean && bits > 1U) {
            return make_error(CodecErrorCode::value_out_of_range, path, offset,
                              "boolean byte must be 0 or 1");
        }
        auto decoded_value = decode_primitive(field.type, bits);
        decoded.message.fields.push_back({.name = field.name, .value = std::move(decoded_value)});
        decoded.field_ranges.push_back({.path = path, .offset = offset, .length = *width});
        offset += *width;
    }

    if (offset != bytes.size()) {
        const auto trailing = bytes.size() - offset;
        return make_error(CodecErrorCode::unexpected_data, definition.name, offset,
                          std::to_string(trailing) + (trailing == 1 ? " trailing byte remains"
                                                                    : " trailing bytes remain"));
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
