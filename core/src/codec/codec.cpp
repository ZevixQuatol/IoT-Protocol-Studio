#include "iotps/core/codec/codec.hpp"

#include <algorithm>
#include <bit>
#include <cmath>
#include <limits>
#include <optional>
#include <type_traits>
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

void append_unsigned(ByteBuffer& bytes, const std::uint64_t value, const std::size_t width,
                     const schema::ByteOrder byte_order) {
    if (byte_order == schema::ByteOrder::little_endian) {
        for (std::size_t index = 0; index < width; ++index) {
            bytes.push_back(static_cast<std::uint8_t>(value >> (index * 8U)));
        }
        return;
    }
    for (std::size_t index = width; index > 0; --index) {
        const auto shift = (index - 1U) * 8U;
        bytes.push_back(static_cast<std::uint8_t>(value >> shift));
    }
}

using PrimitiveBitsResult = Result<std::uint64_t, CodecError>;

template <typename Target>
PrimitiveBitsResult encode_signed_integer(const ScalarValue& value, const std::string& path,
                                          const std::size_t offset) {
    const auto* signed_value = std::get_if<std::int64_t>(&value);
    if (signed_value == nullptr) {
        return make_error(CodecErrorCode::type_mismatch, path, offset,
                          "expected std::int64_t ScalarValue");
    }
    if (*signed_value < std::numeric_limits<Target>::min() ||
        *signed_value > std::numeric_limits<Target>::max()) {
        return make_error(CodecErrorCode::value_out_of_range, path, offset,
                          "value is outside int" + std::to_string(sizeof(Target) * 8U) + " range");
    }
    using UnsignedTarget = std::make_unsigned_t<Target>;
    return static_cast<std::uint64_t>(
        std::bit_cast<UnsignedTarget>(static_cast<Target>(*signed_value)));
}

template <typename Target>
PrimitiveBitsResult encode_unsigned_integer(const ScalarValue& value, const std::string& path,
                                            const std::size_t offset) {
    const auto* unsigned_value = std::get_if<std::uint64_t>(&value);
    if (unsigned_value == nullptr) {
        return make_error(CodecErrorCode::type_mismatch, path, offset,
                          "expected std::uint64_t ScalarValue");
    }
    if (*unsigned_value > std::numeric_limits<Target>::max()) {
        return make_error(CodecErrorCode::value_out_of_range, path, offset,
                          "value is outside uint" + std::to_string(sizeof(Target) * 8U) + " range");
    }
    return *unsigned_value;
}

PrimitiveBitsResult encode_primitive_bits(const schema::FieldType type, const ScalarValue& value,
                                          const std::string& path, const std::size_t offset) {
    switch (type) {
    case schema::FieldType::boolean: {
        const auto* boolean_value = std::get_if<bool>(&value);
        if (boolean_value == nullptr) {
            return make_error(CodecErrorCode::type_mismatch, path, offset,
                              "expected bool ScalarValue");
        }
        return *boolean_value ? 1U : 0U;
    }
    case schema::FieldType::int8:
        return encode_signed_integer<std::int8_t>(value, path, offset);
    case schema::FieldType::uint8:
        return encode_unsigned_integer<std::uint8_t>(value, path, offset);
    case schema::FieldType::int16:
        return encode_signed_integer<std::int16_t>(value, path, offset);
    case schema::FieldType::uint16:
        return encode_unsigned_integer<std::uint16_t>(value, path, offset);
    case schema::FieldType::int32:
        return encode_signed_integer<std::int32_t>(value, path, offset);
    case schema::FieldType::uint32:
        return encode_unsigned_integer<std::uint32_t>(value, path, offset);
    case schema::FieldType::int64:
        return encode_signed_integer<std::int64_t>(value, path, offset);
    case schema::FieldType::uint64:
        return encode_unsigned_integer<std::uint64_t>(value, path, offset);
    case schema::FieldType::float32: {
        const auto* floating_value = std::get_if<double>(&value);
        if (floating_value == nullptr) {
            return make_error(CodecErrorCode::type_mismatch, path, offset,
                              "expected double ScalarValue");
        }
        if (std::isfinite(*floating_value) &&
            std::abs(*floating_value) > std::numeric_limits<float>::max()) {
            return make_error(CodecErrorCode::value_out_of_range, path, offset,
                              "value is outside float32 range");
        }
        return static_cast<std::uint64_t>(
            std::bit_cast<std::uint32_t>(static_cast<float>(*floating_value)));
    }
    case schema::FieldType::float64: {
        const auto* floating_value = std::get_if<double>(&value);
        if (floating_value == nullptr) {
            return make_error(CodecErrorCode::type_mismatch, path, offset,
                              "expected double ScalarValue");
        }
        return std::bit_cast<std::uint64_t>(*floating_value);
    }
    case schema::FieldType::bytes:
    case schema::FieldType::string:
        return make_error(CodecErrorCode::unsupported_field_type, path, offset);
    }
    return make_error(CodecErrorCode::unsupported_field_type, path, offset);
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
                                      const StructuredMessage& message,
                                      const schema::ByteOrder default_byte_order) const {
    if (message.message_name != definition.name) {
        return make_error(CodecErrorCode::message_name_mismatch, "messageName", 0);
    }

    ByteBuffer bytes;
    bytes.reserve(definition.fields.size());
    for (const auto& field : definition.fields) {
        const auto path = field_path(definition, field);
        const auto width = primitive_width(field.type);
        if (!width.has_value()) {
            return make_error(CodecErrorCode::unsupported_field_type, path, bytes.size(),
                              "field type is not a fixed-width primitive");
        }

        const auto value = std::ranges::find_if(
            message.fields, [&field](const FieldValue& item) { return item.name == field.name; });
        if (value == message.fields.end()) {
            return make_error(CodecErrorCode::missing_field, path, bytes.size(),
                              "required field is missing");
        }
        const auto occurrences = std::ranges::count_if(
            message.fields, [&field](const FieldValue& item) { return item.name == field.name; });
        if (occurrences > 1) {
            return make_error(CodecErrorCode::duplicate_field, path, bytes.size(),
                              "field appears more than once");
        }

        auto bits = encode_primitive_bits(field.type, value->value, path, bytes.size());
        if (!bits.has_value()) {
            return std::move(bits).error();
        }
        append_unsigned(bytes, bits.value(), *width, field.byte_order.value_or(default_byte_order));
    }

    for (const auto& value : message.fields) {
        const auto definition_field =
            std::ranges::find_if(definition.fields, [&value](const schema::FieldDefinition& field) {
                return field.name == value.name;
            });
        if (definition_field == definition.fields.end()) {
            return make_error(CodecErrorCode::unexpected_field, definition.name + "." + value.name,
                              bytes.size(), "field is not defined by the message schema");
        }
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
    case CodecErrorCode::duplicate_field:
        return "duplicate_field";
    case CodecErrorCode::unexpected_field:
        return "unexpected_field";
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
