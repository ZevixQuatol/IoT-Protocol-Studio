#include "iotps/core/codec/codec.hpp"

#include <algorithm>
#include <bit>
#include <cmath>
#include <functional>
#include <iterator>
#include <limits>
#include <optional>
#include <string>
#include <string_view>
#include <type_traits>
#include <utility>
#include <vector>

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
    case schema::FieldType::array:
        return std::nullopt;
    }
    return std::nullopt;
}

std::string_view field_type_name(const schema::FieldType type) {
    switch (type) {
    case schema::FieldType::uint8:
        return "uint8";
    case schema::FieldType::uint16:
        return "uint16";
    case schema::FieldType::uint32:
        return "uint32";
    case schema::FieldType::uint64:
        return "uint64";
    default:
        return "unsupported";
    }
}

bool is_unsigned_integer(const schema::FieldType type) {
    return type == schema::FieldType::uint8 || type == schema::FieldType::uint16 ||
           type == schema::FieldType::uint32 || type == schema::FieldType::uint64;
}

bool is_valid_utf8(const std::string_view value) {
    const auto continuation = [&value](const std::size_t index, const unsigned char minimum = 0x80U,
                                       const unsigned char maximum = 0xBFU) {
        if (index >= value.size()) {
            return false;
        }
        const auto byte = static_cast<unsigned char>(value[index]);
        return byte >= minimum && byte <= maximum;
    };

    for (std::size_t index = 0; index < value.size();) {
        const auto byte = static_cast<unsigned char>(value[index]);
        if (byte <= 0x7FU) {
            ++index;
        } else if (byte >= 0xC2U && byte <= 0xDFU && continuation(index + 1U)) {
            index += 2U;
        } else if (byte == 0xE0U && continuation(index + 1U, 0xA0U) && continuation(index + 2U)) {
            index += 3U;
        } else if (((byte >= 0xE1U && byte <= 0xECU) || (byte >= 0xEEU && byte <= 0xEFU)) &&
                   continuation(index + 1U) && continuation(index + 2U)) {
            index += 3U;
        } else if (byte == 0xEDU && continuation(index + 1U, 0x80U, 0x9FU) &&
                   continuation(index + 2U)) {
            index += 3U;
        } else if (byte == 0xF0U && continuation(index + 1U, 0x90U) && continuation(index + 2U) &&
                   continuation(index + 3U)) {
            index += 4U;
        } else if (byte >= 0xF1U && byte <= 0xF3U && continuation(index + 1U) &&
                   continuation(index + 2U) && continuation(index + 3U)) {
            index += 4U;
        } else if (byte == 0xF4U && continuation(index + 1U, 0x80U, 0x8FU) &&
                   continuation(index + 2U) && continuation(index + 3U)) {
            index += 4U;
        } else {
            return false;
        }
    }
    return true;
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

template <typename Target, typename Value>
PrimitiveBitsResult encode_signed_integer(const Value& value, const std::string& path,
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

template <typename Target, typename Value>
PrimitiveBitsResult encode_unsigned_integer(const Value& value, const std::string& path,
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

template <typename Value>
PrimitiveBitsResult encode_primitive_bits(const schema::FieldType type, const Value& value,
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
    case schema::FieldType::array:
        return make_error(CodecErrorCode::unsupported_field_type, path, offset);
    }
    return make_error(CodecErrorCode::unsupported_field_type, path, offset);
}

EncodeResult encode_fixed_text_or_bytes(const schema::FieldType type, const ScalarValue& value,
                                        const std::size_t length, const std::string& path,
                                        const std::size_t offset) {
    if (type == schema::FieldType::string) {
        const auto* text = std::get_if<std::string>(&value);
        if (text == nullptr) {
            return make_error(CodecErrorCode::type_mismatch, path, offset,
                              "expected std::string ScalarValue");
        }
        if (text->find('\0') != std::string::npos) {
            return make_error(CodecErrorCode::invalid_string_encoding, path, offset,
                              "UTF-8 string must not contain NUL");
        }
        if (!is_valid_utf8(*text)) {
            return make_error(CodecErrorCode::invalid_string_encoding, path, offset,
                              "string is not valid UTF-8");
        }
        if (text->size() > length) {
            return make_error(CodecErrorCode::value_out_of_range, path, offset,
                              "UTF-8 string requires " + std::to_string(text->size()) +
                                  " bytes but field length is " + std::to_string(length));
        }
        ByteBuffer output(length, 0U);
        std::ranges::transform(*text, output.begin(),
                               [](const char byte) { return static_cast<std::uint8_t>(byte); });
        return output;
    }

    const auto* raw_bytes = std::get_if<ByteBuffer>(&value);
    if (raw_bytes == nullptr) {
        return make_error(CodecErrorCode::type_mismatch, path, offset,
                          "expected ByteBuffer ScalarValue");
    }
    if (raw_bytes->size() != length) {
        return make_error(CodecErrorCode::value_out_of_range, path, offset,
                          "bytes value has length " + std::to_string(raw_bytes->size()) +
                              " but field length is " + std::to_string(length));
    }
    return *raw_bytes;
}

Result<ScalarValue, CodecError>
decode_fixed_text_or_bytes(const schema::FieldType type, const std::span<const std::uint8_t> bytes,
                           const std::string& path, const std::size_t offset) {
    if (type == schema::FieldType::bytes) {
        return ScalarValue{ByteBuffer{bytes.begin(), bytes.end()}};
    }

    const auto terminator = std::ranges::find(bytes, 0U);
    const auto text_length = static_cast<std::size_t>(terminator - bytes.begin());
    if (terminator != bytes.end()) {
        const auto non_zero = std::ranges::find_if(
            terminator + 1, bytes.end(), [](const std::uint8_t byte) { return byte != 0; });
        if (non_zero != bytes.end()) {
            return make_error(CodecErrorCode::invalid_string_padding, path,
                              offset + static_cast<std::size_t>(non_zero - bytes.begin()),
                              "non-zero byte follows string NUL terminator");
        }
    }

    std::string text;
    text.reserve(text_length);
    std::ranges::transform(bytes.first(text_length), std::back_inserter(text),
                           [](const std::uint8_t byte) { return static_cast<char>(byte); });
    if (!is_valid_utf8(text)) {
        return make_error(CodecErrorCode::invalid_string_encoding, path, offset,
                          "string bytes are not valid UTF-8");
    }
    return ScalarValue{std::move(text)};
}

PrimitiveValue decode_primitive(const schema::FieldType type, const std::uint64_t bits) {
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
    case schema::FieldType::array:
        return std::uint64_t{0};
    }
    return std::uint64_t{0};
}

struct LayoutField {
    const schema::FieldDefinition* definition;
    std::size_t offset;
    std::size_t length;
};

struct LayoutPlan {
    std::vector<LayoutField> fields;
    std::size_t frame_size{0};
};

auto find_layout_field(const LayoutPlan& plan, const std::string_view name) {
    return std::ranges::find_if(
        plan.fields, [name](const LayoutField& field) { return field.definition->name == name; });
}

Result<LayoutPlan, CodecError> build_layout(const schema::MessageDefinition& definition) {
    LayoutPlan plan;
    plan.fields.reserve(definition.fields.size());
    std::size_t cursor = 0;
    for (const auto& field : definition.fields) {
        const auto path = field_path(definition, field);
        const auto width = primitive_width(field.type);
        std::size_t length = 0;
        if (field.type == schema::FieldType::array) {
            if (!field.element_type.has_value()) {
                return make_error(CodecErrorCode::invalid_layout, path,
                                  field.offset.value_or(cursor),
                                  "array field requires elementType");
            }
            const auto element_width = primitive_width(*field.element_type);
            if (!element_width.has_value()) {
                return make_error(CodecErrorCode::invalid_layout, path,
                                  field.offset.value_or(cursor),
                                  "array elementType must be a fixed-width primitive");
            }
            if (!field.count.has_value()) {
                return make_error(CodecErrorCode::invalid_layout, path,
                                  field.offset.value_or(cursor), "array field requires count");
            }
            if (*field.count == 0) {
                return make_error(CodecErrorCode::invalid_layout, path,
                                  field.offset.value_or(cursor),
                                  "array count must be greater than zero");
            }
            if (field.length.has_value()) {
                return make_error(CodecErrorCode::invalid_layout, path,
                                  field.offset.value_or(cursor),
                                  "array field must not declare length");
            }
            if (*field.count > std::numeric_limits<std::size_t>::max() / *element_width) {
                return make_error(CodecErrorCode::invalid_layout, path,
                                  field.offset.value_or(cursor), "array wire length overflows");
            }
            length = *field.count * *element_width;
        } else {
            if (field.element_type.has_value() || field.count.has_value()) {
                return make_error(CodecErrorCode::invalid_layout, path,
                                  field.offset.value_or(cursor),
                                  "elementType and count require type array");
            }
            if (!width.has_value() && !field.length.has_value()) {
                return make_error(CodecErrorCode::invalid_layout, path,
                                  field.offset.value_or(cursor),
                                  "fixed string and bytes fields require length");
            }
            if (field.length.has_value() && *field.length == 0) {
                return make_error(CodecErrorCode::invalid_layout, path,
                                  field.offset.value_or(cursor),
                                  "field length must be greater than zero");
            }
            length = field.length.value_or(width.value_or(0));
            if (width.has_value() && length != *width) {
                return make_error(CodecErrorCode::invalid_layout, path,
                                  field.offset.value_or(cursor),
                                  "field length must match fixed-width primitive size");
            }
        }
        const auto offset = field.offset.value_or(cursor);
        if (offset > std::numeric_limits<std::size_t>::max() - length) {
            return make_error(CodecErrorCode::invalid_layout, path, offset,
                              "field offset and length overflow");
        }
        if (offset < cursor) {
            return make_error(CodecErrorCode::invalid_layout, path, offset,
                              "field layout overlaps the previous field");
        }
        plan.fields.push_back({.definition = &field, .offset = offset, .length = length});
        cursor = offset + length;
    }
    plan.frame_size = cursor;

    std::vector<std::optional<std::size_t>> length_targets(plan.fields.size());
    for (std::size_t field_index = 0; field_index < plan.fields.size(); ++field_index) {
        const auto& layout_field = plan.fields[field_index];
        const auto& field = *layout_field.definition;
        if (!field.length_of.has_value()) {
            continue;
        }
        const auto path = field_path(definition, field);
        if (!is_unsigned_integer(field.type)) {
            return make_error(CodecErrorCode::invalid_layout, path, layout_field.offset,
                              "lengthOf field must use uint8, uint16, uint32, or uint64");
        }
        const auto target = find_layout_field(plan, *field.length_of);
        if (target == plan.fields.end()) {
            return make_error(CodecErrorCode::invalid_layout, path, layout_field.offset,
                              "lengthOf references unknown field '" + *field.length_of + "'");
        }
        const auto target_index = static_cast<std::size_t>(target - plan.fields.begin());
        if (target_index == field_index) {
            return make_error(CodecErrorCode::invalid_layout, path, layout_field.offset,
                              "lengthOf must not reference its own field");
        }
        length_targets[field_index] = target_index;
    }

    enum class VisitState { unvisited, visiting, visited };
    std::vector states(plan.fields.size(), VisitState::unvisited);
    std::function<std::optional<CodecError>(std::size_t)> visit =
        [&](const std::size_t field_index) -> std::optional<CodecError> {
        states[field_index] = VisitState::visiting;
        if (const auto target = length_targets[field_index]; target.has_value()) {
            if (states[*target] == VisitState::unvisited) {
                if (auto error = visit(*target); error.has_value()) {
                    return error;
                }
            } else if (states[*target] == VisitState::visiting) {
                const auto& field = plan.fields[field_index];
                return make_error(CodecErrorCode::invalid_layout,
                                  field_path(definition, *field.definition), field.offset,
                                  "lengthOf dependency cycle");
            }
        }
        states[field_index] = VisitState::visited;
        return std::nullopt;
    };
    for (std::size_t field_index = 0; field_index < plan.fields.size(); ++field_index) {
        if (states[field_index] == VisitState::unvisited) {
            if (auto error = visit(field_index); error.has_value()) {
                return std::move(*error);
            }
        }
    }
    return plan;
}

PrimitiveBitsResult encode_length_bits(const schema::FieldDefinition& field,
                                       const LayoutField& target, const std::string& path,
                                       const std::size_t offset) {
    std::uint64_t maximum = std::numeric_limits<std::uint64_t>::max();
    switch (field.type) {
    case schema::FieldType::uint8:
        maximum = std::numeric_limits<std::uint8_t>::max();
        break;
    case schema::FieldType::uint16:
        maximum = std::numeric_limits<std::uint16_t>::max();
        break;
    case schema::FieldType::uint32:
        maximum = std::numeric_limits<std::uint32_t>::max();
        break;
    case schema::FieldType::uint64:
        break;
    default:
        return make_error(CodecErrorCode::invalid_layout, path, offset,
                          "lengthOf field must use uint8, uint16, uint32, or uint64");
    }
    if (!std::in_range<std::uint64_t>(target.length) || target.length > maximum) {
        return make_error(CodecErrorCode::length_value_out_of_range, path, offset,
                          "target field '" + target.definition->name + "' wire length " +
                              std::to_string(target.length) + " does not fit " +
                              std::string{field_type_name(field.type)});
    }
    return static_cast<std::uint64_t>(target.length);
}

} // namespace

EncodeResult FixedLayoutCodec::encode(const schema::MessageDefinition& definition,
                                      const StructuredMessage& message,
                                      const schema::ByteOrder default_byte_order) const {
    if (message.message_name != definition.name) {
        return make_error(CodecErrorCode::message_name_mismatch, "messageName", 0);
    }

    auto layout = build_layout(definition);
    if (!layout.has_value()) {
        return std::move(layout).error();
    }

    ByteBuffer bytes(layout.value().frame_size, 0U);
    for (const auto& layout_field : layout.value().fields) {
        const auto& field = *layout_field.definition;
        const auto path = field_path(definition, field);

        const auto value = std::ranges::find_if(
            message.fields, [&field](const FieldValue& item) { return item.name == field.name; });
        const auto occurrences = std::ranges::count_if(
            message.fields, [&field](const FieldValue& item) { return item.name == field.name; });
        if (occurrences > 1) {
            return make_error(CodecErrorCode::duplicate_field, path, layout_field.offset,
                              "field appears more than once");
        }

        if (field.length_of.has_value()) {
            const auto target = find_layout_field(layout.value(), *field.length_of);
            auto bits = encode_length_bits(field, *target, path, layout_field.offset);
            if (!bits.has_value()) {
                return std::move(bits).error();
            }
            ByteBuffer encoded_field;
            encoded_field.reserve(layout_field.length);
            append_unsigned(encoded_field, bits.value(), layout_field.length,
                            field.byte_order.value_or(default_byte_order));
            std::ranges::copy(encoded_field, bytes.begin() + layout_field.offset);
            continue;
        }

        if (value == message.fields.end()) {
            return make_error(CodecErrorCode::missing_field, path, layout_field.offset,
                              "required field is missing");
        }

        if (field.type == schema::FieldType::string || field.type == schema::FieldType::bytes) {
            auto encoded = encode_fixed_text_or_bytes(field.type, value->value, layout_field.length,
                                                      path, layout_field.offset);
            if (!encoded.has_value()) {
                return std::move(encoded).error();
            }
            std::ranges::copy(encoded.value(), bytes.begin() + layout_field.offset);
            continue;
        }

        if (field.type == schema::FieldType::array) {
            const auto* values = std::get_if<ArrayValue>(&value->value);
            if (values == nullptr) {
                return make_error(CodecErrorCode::type_mismatch, path, layout_field.offset,
                                  "expected ArrayValue ScalarValue");
            }
            if (values->size() != *field.count) {
                return make_error(CodecErrorCode::array_count_mismatch, path, layout_field.offset,
                                  "array has " + std::to_string(values->size()) +
                                      " elements but schema count is " +
                                      std::to_string(*field.count));
            }
            const auto element_width = *primitive_width(*field.element_type);
            ByteBuffer encoded_field;
            encoded_field.reserve(layout_field.length);
            for (std::size_t index = 0; index < values->size(); ++index) {
                const auto element_offset = layout_field.offset + index * element_width;
                auto bits =
                    encode_primitive_bits(*field.element_type, (*values)[index],
                                          path + "[" + std::to_string(index) + "]", element_offset);
                if (!bits.has_value()) {
                    return std::move(bits).error();
                }
                append_unsigned(encoded_field, bits.value(), element_width,
                                field.byte_order.value_or(default_byte_order));
            }
            std::ranges::copy(encoded_field, bytes.begin() + layout_field.offset);
            continue;
        }

        auto bits = encode_primitive_bits(field.type, value->value, path, layout_field.offset);
        if (!bits.has_value()) {
            return std::move(bits).error();
        }
        ByteBuffer encoded_field;
        encoded_field.reserve(layout_field.length);
        append_unsigned(encoded_field, bits.value(), layout_field.length,
                        field.byte_order.value_or(default_byte_order));
        std::ranges::copy(encoded_field, bytes.begin() + layout_field.offset);
    }

    for (const auto& value : message.fields) {
        const auto definition_field =
            std::ranges::find_if(definition.fields, [&value](const schema::FieldDefinition& field) {
                return field.name == value.name;
            });
        if (definition_field == definition.fields.end()) {
            return make_error(CodecErrorCode::unexpected_field, definition.name + "." + value.name,
                              layout.value().frame_size,
                              "field is not defined by the message schema");
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

    auto layout = build_layout(definition);
    if (!layout.has_value()) {
        return std::move(layout).error();
    }

    for (const auto& layout_field : layout.value().fields) {
        const auto& field = *layout_field.definition;
        const auto path = field_path(definition, field);
        if (layout_field.offset > bytes.size() ||
            bytes.size() - layout_field.offset < layout_field.length) {
            const auto remaining =
                layout_field.offset <= bytes.size() ? bytes.size() - layout_field.offset : 0;
            return make_error(CodecErrorCode::insufficient_data, path, layout_field.offset,
                              "field requires " + std::to_string(layout_field.length) +
                                  " bytes but only " + std::to_string(remaining) + " remain");
        }

        ScalarValue decoded_value;
        if (field.type == schema::FieldType::string || field.type == schema::FieldType::bytes) {
            auto value = decode_fixed_text_or_bytes(
                field.type, bytes.subspan(layout_field.offset, layout_field.length), path,
                layout_field.offset);
            if (!value.has_value()) {
                return std::move(value).error();
            }
            decoded_value = std::move(value).value();
        } else if (field.type == schema::FieldType::array) {
            const auto element_width = *primitive_width(*field.element_type);
            const auto byte_order = field.byte_order.value_or(default_byte_order);
            ArrayValue values;
            values.reserve(*field.count);
            for (std::size_t index = 0; index < *field.count; ++index) {
                const auto element_offset = layout_field.offset + index * element_width;
                const auto element_path = path + "[" + std::to_string(index) + "]";
                const auto bits = read_unsigned(bytes, element_offset, element_width, byte_order);
                if (*field.element_type == schema::FieldType::boolean && bits > 1U) {
                    return make_error(CodecErrorCode::value_out_of_range, element_path,
                                      element_offset, "boolean byte must be 0 or 1");
                }
                values.push_back(decode_primitive(*field.element_type, bits));
                decoded.element_ranges.push_back(
                    {.path = element_path, .offset = element_offset, .length = element_width});
            }
            decoded_value = std::move(values);
        } else {
            const auto byte_order = field.byte_order.value_or(default_byte_order);
            const auto bits =
                read_unsigned(bytes, layout_field.offset, layout_field.length, byte_order);
            if (field.type == schema::FieldType::boolean && bits > 1U) {
                return make_error(CodecErrorCode::value_out_of_range, path, layout_field.offset,
                                  "boolean byte must be 0 or 1");
            }
            decoded_value = std::visit([](const auto& value) -> ScalarValue { return value; },
                                       decode_primitive(field.type, bits));
        }
        decoded.message.fields.push_back({.name = field.name, .value = std::move(decoded_value)});
        decoded.field_ranges.push_back(
            {.path = path, .offset = layout_field.offset, .length = layout_field.length});
    }

    if (layout.value().frame_size != bytes.size()) {
        const auto trailing = bytes.size() - layout.value().frame_size;
        return make_error(CodecErrorCode::unexpected_data, definition.name,
                          layout.value().frame_size,
                          std::to_string(trailing) + (trailing == 1 ? " trailing byte remains"
                                                                    : " trailing bytes remain"));
    }

    for (const auto& layout_field : layout.value().fields) {
        const auto& field = *layout_field.definition;
        if (!field.length_of.has_value()) {
            continue;
        }
        const auto target = find_layout_field(layout.value(), *field.length_of);
        const auto declared = read_unsigned(bytes, layout_field.offset, layout_field.length,
                                            field.byte_order.value_or(default_byte_order));
        if (!std::in_range<std::uint64_t>(target->length) ||
            declared != static_cast<std::uint64_t>(target->length)) {
            return make_error(CodecErrorCode::length_value_mismatch, field_path(definition, field),
                              layout_field.offset,
                              "declared length " + std::to_string(declared) +
                                  " does not match target field '" + target->definition->name +
                                  "' wire length " + std::to_string(target->length));
        }
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
    case CodecErrorCode::invalid_layout:
        return "invalid_layout";
    case CodecErrorCode::invalid_string_encoding:
        return "invalid_string_encoding";
    case CodecErrorCode::invalid_string_padding:
        return "invalid_string_padding";
    case CodecErrorCode::length_value_mismatch:
        return "length_value_mismatch";
    case CodecErrorCode::length_value_out_of_range:
        return "length_value_out_of_range";
    case CodecErrorCode::array_count_mismatch:
        return "array_count_mismatch";
    }
    return "unknown";
}

} // namespace iotps::core::codec
