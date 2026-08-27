#include "iotps/core/codec/codec.hpp"

#include <cmath>
#include <cstdint>
#include <iostream>
#include <limits>
#include <string>
#include <variant>
#include <vector>

namespace {

int failures = 0;

void check(const bool condition, const char* expression, const int line) {
    if (!condition) {
        std::cerr << "line " << line << ": check failed: " << expression << '\n';
        ++failures;
    }
}

#define CHECK(expression) check((expression), #expression, __LINE__)

} // namespace

int main() {
    using namespace iotps::core;
    using namespace iotps::core::codec;
    using namespace iotps::core::schema;

    const MessageDefinition definition{
        .name = "response",
        .fields =
            {
                {.name = "command", .type = FieldType::uint8},
                {.name = "status", .type = FieldType::uint8},
            },
    };
    const StructuredMessage message{
        .message_name = "response",
        .fields =
            {
                {.name = "command", .value = std::uint64_t{0x81U}},
                {.name = "status", .value = std::uint64_t{0U}},
            },
    };

    const FixedLayoutCodec codec;
    const auto encoded = codec.encode(definition, message);
    CHECK(encoded.has_value());
    if (const auto* bytes = encoded.value_if()) {
        CHECK(*bytes == ByteBuffer({0x81U, 0x00U}));

        const auto decoded = codec.decode(definition, *bytes);
        CHECK(decoded.has_value());
        if (const auto* output = decoded.value_if()) {
            CHECK(output->message.message_name == "response");
            CHECK(output->message.fields.size() == 2);
            CHECK(std::get<std::uint64_t>(output->message.fields[0].value) == 0x81U);
            CHECK(output->field_ranges[1].offset == 1);
            CHECK(output->field_ranges[1].length == 1);
        }
    }
    const StructuredMessage reordered_message{
        .message_name = "response",
        .fields =
            {
                {.name = "status", .value = std::uint64_t{0U}},
                {.name = "command", .value = std::uint64_t{0x81U}},
            },
    };
    const auto reordered_encoded = codec.encode(definition, reordered_message);
    CHECK(reordered_encoded.has_value());
    if (const auto* bytes = reordered_encoded.value_if()) {
        CHECK(*bytes == ByteBuffer({0x81U, 0x00U}));
    }

    const MessageDefinition uint16_definition{
        .name = "measurement",
        .fields = {{.name = "reading", .type = FieldType::uint16}},
    };
    const auto uint16_decoded = codec.decode(uint16_definition, ByteBuffer{0x12U, 0x34U});
    CHECK(uint16_decoded.has_value());
    if (const auto* output = uint16_decoded.value_if()) {
        CHECK(std::get<std::uint64_t>(output->message.fields[0].value) == 0x1234U);
        CHECK(output->field_ranges[0].offset == 0);
        CHECK(output->field_ranges[0].length == 2);
    }

    const StructuredMessage uint16_message{
        .message_name = "measurement",
        .fields = {{.name = "reading", .value = std::uint64_t{0x1234U}}},
    };
    const auto uint16_encoded = codec.encode(uint16_definition, uint16_message);
    CHECK(uint16_encoded.has_value());
    if (const auto* bytes = uint16_encoded.value_if()) {
        CHECK(*bytes == ByteBuffer({0x12U, 0x34U}));
    }
    const auto uint16_little_encoded =
        codec.encode(uint16_definition, uint16_message, ByteOrder::little_endian);
    CHECK(uint16_little_encoded.has_value());
    if (const auto* bytes = uint16_little_encoded.value_if()) {
        CHECK(*bytes == ByteBuffer({0x34U, 0x12U}));
    }
    const MessageDefinition uint16_big_override_definition{
        .name = "measurement",
        .fields = {{.name = "reading",
                    .type = FieldType::uint16,
                    .byte_order = ByteOrder::big_endian}},
    };
    const auto uint16_big_override =
        codec.encode(uint16_big_override_definition, uint16_message, ByteOrder::little_endian);
    CHECK(uint16_big_override.has_value());
    if (const auto* bytes = uint16_big_override.value_if()) {
        CHECK(*bytes == ByteBuffer({0x12U, 0x34U}));
    }

    const MessageDefinition little_signed_definition{
        .name = "measurement",
        .fields = {{.name = "temperature",
                    .type = FieldType::int16,
                    .byte_order = ByteOrder::little_endian}},
    };
    const auto little_signed = codec.decode(little_signed_definition, ByteBuffer{0x00U, 0x80U});
    CHECK(little_signed.has_value());
    if (const auto* output = little_signed.value_if()) {
        CHECK(std::get<std::int64_t>(output->message.fields[0].value) == -32768);
        CHECK(output->field_ranges[0].length == 2);
    }

    const auto protocol_little =
        codec.decode(uint16_definition, ByteBuffer{0x34U, 0x12U}, ByteOrder::little_endian);
    CHECK(protocol_little.has_value());
    if (const auto* output = protocol_little.value_if()) {
        CHECK(std::get<std::uint64_t>(output->message.fields[0].value) == 0x1234U);
    }

    const MessageDefinition integer_definition{
        .name = "integer-values",
        .fields =
            {
                {.name = "enabled", .type = FieldType::boolean},
                {.name = "delta8", .type = FieldType::int8},
                {.name = "code8", .type = FieldType::uint8},
                {.name = "delta32", .type = FieldType::int32},
                {.name = "code32", .type = FieldType::uint32, .byte_order = ByteOrder::big_endian},
                {.name = "delta64", .type = FieldType::int64},
                {.name = "code64", .type = FieldType::uint64},
            },
    };
    const ByteBuffer integer_bytes{
        0x01U, 0x80U, 0xFFU, 0x78U, 0x56U, 0x34U, 0x12U, 0x89U, 0xABU,
        0xCDU, 0xEFU, 0xFEU, 0xFFU, 0xFFU, 0xFFU, 0xFFU, 0xFFU, 0xFFU,
        0xFFU, 0xEFU, 0xCDU, 0xABU, 0x89U, 0x67U, 0x45U, 0x23U, 0x01U,
    };
    const auto integers = codec.decode(integer_definition, integer_bytes, ByteOrder::little_endian);
    CHECK(integers.has_value());
    if (const auto* output = integers.value_if()) {
        CHECK(std::get<bool>(output->message.fields[0].value));
        CHECK(std::get<std::int64_t>(output->message.fields[1].value) == -128);
        CHECK(std::get<std::uint64_t>(output->message.fields[2].value) == 255U);
        CHECK(std::get<std::int64_t>(output->message.fields[3].value) == 0x12345678);
        CHECK(std::get<std::uint64_t>(output->message.fields[4].value) == 0x89ABCDEFU);
        CHECK(std::get<std::int64_t>(output->message.fields[5].value) == -2);
        CHECK(std::get<std::uint64_t>(output->message.fields[6].value) == 0x0123456789ABCDEFULL);
        CHECK(output->field_ranges[6].offset == 19);
        CHECK(output->field_ranges[6].length == 8);
    }
    const StructuredMessage integer_message{
        .message_name = "integer-values",
        .fields =
            {
                {.name = "enabled", .value = true},
                {.name = "delta8", .value = std::int64_t{-128}},
                {.name = "code8", .value = std::uint64_t{255U}},
                {.name = "delta32", .value = std::int64_t{0x12345678}},
                {.name = "code32", .value = std::uint64_t{0x89ABCDEFU}},
                {.name = "delta64", .value = std::int64_t{-2}},
                {.name = "code64", .value = std::uint64_t{0x0123456789ABCDEFULL}},
            },
    };
    const auto integers_encoded =
        codec.encode(integer_definition, integer_message, ByteOrder::little_endian);
    CHECK(integers_encoded.has_value());
    if (const auto* bytes = integers_encoded.value_if()) {
        CHECK(*bytes == integer_bytes);
    }

    const MessageDefinition boolean_definition{
        .name = "flags",
        .fields = {{.name = "enabled", .type = FieldType::boolean}},
    };
    const auto false_boolean = codec.decode(boolean_definition, ByteBuffer{0x00U});
    CHECK(false_boolean.has_value());
    if (const auto* output = false_boolean.value_if()) {
        CHECK(!std::get<bool>(output->message.fields[0].value));
    }
    const auto invalid_boolean = codec.decode(boolean_definition, ByteBuffer{0x02U});
    CHECK(!invalid_boolean.has_value());
    if (const auto* error = invalid_boolean.error_if()) {
        CHECK(error->code == CodecErrorCode::value_out_of_range);
        CHECK(error->path == "flags.enabled");
        CHECK(error->offset == 0);
        CHECK(error->detail == "boolean byte must be 0 or 1");
    }

    const MessageDefinition uint32_definition{
        .name = "measurement",
        .fields = {{.name = "counter", .type = FieldType::uint32}},
    };
    const auto truncated = codec.decode(uint32_definition, ByteBuffer{0x00U, 0x01U, 0x02U});
    CHECK(!truncated.has_value());
    if (const auto* error = truncated.error_if()) {
        CHECK(error->code == CodecErrorCode::insufficient_data);
        CHECK(error->path == "measurement.counter");
        CHECK(error->offset == 0);
        CHECK(error->detail == "field requires 4 bytes but only 3 remain");
    }

    const MessageDefinition floating_definition{
        .name = "floating-values",
        .fields =
            {
                {.name = "ratio", .type = FieldType::float32, .byte_order = ByteOrder::big_endian},
                {.name = "precise", .type = FieldType::float64},
            },
    };
    const ByteBuffer floating_bytes{
        0x3FU, 0xC0U, 0x00U, 0x00U, 0x00U, 0x00U, 0x00U, 0x00U, 0x00U, 0x00U, 0x02U, 0xC0U,
    };
    const auto floating =
        codec.decode(floating_definition, floating_bytes, ByteOrder::little_endian);
    CHECK(floating.has_value());
    if (const auto* output = floating.value_if()) {
        CHECK(std::get<double>(output->message.fields[0].value) == 1.5);
        CHECK(std::get<double>(output->message.fields[1].value) == -2.25);
        CHECK(output->field_ranges[0].offset == 0);
        CHECK(output->field_ranges[0].length == 4);
        CHECK(output->field_ranges[1].offset == 4);
        CHECK(output->field_ranges[1].length == 8);
    }
    const StructuredMessage floating_message{
        .message_name = "floating-values",
        .fields =
            {
                {.name = "ratio", .value = 1.5},
                {.name = "precise", .value = -2.25},
            },
    };
    const auto floating_encoded =
        codec.encode(floating_definition, floating_message, ByteOrder::little_endian);
    CHECK(floating_encoded.has_value());
    if (const auto* bytes = floating_encoded.value_if()) {
        CHECK(*bytes == floating_bytes);
    }

    const MessageDefinition string_definition{
        .name = "text-message",
        .fields = {{.name = "payload", .type = FieldType::string}},
    };
    const auto missing_string_length_decode = codec.decode(string_definition, ByteBuffer{});
    CHECK(!missing_string_length_decode.has_value());
    if (const auto* error = missing_string_length_decode.error_if()) {
        CHECK(error->code == CodecErrorCode::invalid_layout);
        CHECK(error->path == "text-message.payload");
        CHECK(error->offset == 0);
        CHECK(error->detail == "fixed string and bytes fields require length");
    }
    const StructuredMessage string_message{
        .message_name = "text-message",
        .fields = {{.name = "payload", .value = std::string{"hello"}}},
    };
    const auto missing_string_length_encode = codec.encode(string_definition, string_message);
    CHECK(!missing_string_length_encode.has_value());
    if (const auto* error = missing_string_length_encode.error_if()) {
        CHECK(error->code == CodecErrorCode::invalid_layout);
        CHECK(error->path == "text-message.payload");
        CHECK(error->offset == 0);
        CHECK(error->detail == "fixed string and bytes fields require length");
    }

    const auto trailing = codec.decode(boolean_definition, ByteBuffer{0x01U, 0x00U});
    CHECK(!trailing.has_value());
    if (const auto* error = trailing.error_if()) {
        CHECK(error->code == CodecErrorCode::unexpected_data);
        CHECK(error->path == "flags");
        CHECK(error->offset == 1);
        CHECK(error->detail == "1 trailing byte remains");
    }

    auto invalid = message;
    invalid.fields[1].value = std::uint64_t{256U};
    const auto rejected = codec.encode(definition, invalid);
    CHECK(!rejected.has_value());
    if (const auto* error = rejected.error_if()) {
        CHECK(error->code == CodecErrorCode::value_out_of_range);
        CHECK(error->path == "response.status");
        CHECK(error->offset == 1);
        CHECK(error->detail == "value is outside uint8 range");
    }

    const StructuredMessage missing_field_message{
        .message_name = "response",
        .fields = {{.name = "command", .value = std::uint64_t{0x81U}}},
    };
    const auto missing_field = codec.encode(definition, missing_field_message);
    CHECK(!missing_field.has_value());
    if (const auto* error = missing_field.error_if()) {
        CHECK(error->code == CodecErrorCode::missing_field);
        CHECK(error->path == "response.status");
        CHECK(error->offset == 1);
        CHECK(error->detail == "required field is missing");
    }

    const StructuredMessage wrong_boolean_type{
        .message_name = "flags",
        .fields = {{.name = "enabled", .value = std::uint64_t{1U}}},
    };
    const auto boolean_type_mismatch = codec.encode(boolean_definition, wrong_boolean_type);
    CHECK(!boolean_type_mismatch.has_value());
    if (const auto* error = boolean_type_mismatch.error_if()) {
        CHECK(error->code == CodecErrorCode::type_mismatch);
        CHECK(error->path == "flags.enabled");
        CHECK(error->offset == 0);
        CHECK(error->detail == "expected bool ScalarValue");
    }

    const StructuredMessage wrong_signed_type{
        .message_name = "measurement",
        .fields = {{.name = "temperature", .value = std::uint64_t{1U}}},
    };
    const auto signed_type_mismatch = codec.encode(little_signed_definition, wrong_signed_type);
    CHECK(!signed_type_mismatch.has_value());
    if (const auto* error = signed_type_mismatch.error_if()) {
        CHECK(error->code == CodecErrorCode::type_mismatch);
        CHECK(error->detail == "expected std::int64_t ScalarValue");
    }

    const StructuredMessage wrong_unsigned_type{
        .message_name = "measurement",
        .fields = {{.name = "reading", .value = std::int64_t{1}}},
    };
    const auto unsigned_type_mismatch = codec.encode(uint16_definition, wrong_unsigned_type);
    CHECK(!unsigned_type_mismatch.has_value());
    if (const auto* error = unsigned_type_mismatch.error_if()) {
        CHECK(error->code == CodecErrorCode::type_mismatch);
        CHECK(error->detail == "expected std::uint64_t ScalarValue");
    }

    auto wrong_floating_type = floating_message;
    wrong_floating_type.fields[0].value = std::uint64_t{1U};
    const auto floating_type_mismatch = codec.encode(floating_definition, wrong_floating_type);
    CHECK(!floating_type_mismatch.has_value());
    if (const auto* error = floating_type_mismatch.error_if()) {
        CHECK(error->code == CodecErrorCode::type_mismatch);
        CHECK(error->path == "floating-values.ratio");
        CHECK(error->detail == "expected double ScalarValue");
    }

    const StructuredMessage int16_overflow_message{
        .message_name = "measurement",
        .fields = {{.name = "temperature", .value = std::int64_t{32768}}},
    };
    const auto int16_overflow = codec.encode(little_signed_definition, int16_overflow_message);
    CHECK(!int16_overflow.has_value());
    if (const auto* error = int16_overflow.error_if()) {
        CHECK(error->code == CodecErrorCode::value_out_of_range);
        CHECK(error->path == "measurement.temperature");
        CHECK(error->offset == 0);
        CHECK(error->detail == "value is outside int16 range");
    }

    auto float32_overflow_message = floating_message;
    float32_overflow_message.fields[0].value = std::numeric_limits<double>::max();
    const auto float32_overflow = codec.encode(floating_definition, float32_overflow_message);
    CHECK(!float32_overflow.has_value());
    if (const auto* error = float32_overflow.error_if()) {
        CHECK(error->code == CodecErrorCode::value_out_of_range);
        CHECK(error->path == "floating-values.ratio");
        CHECK(error->offset == 0);
        CHECK(error->detail == "value is outside float32 range");
    }

    auto special_floating_message = floating_message;
    special_floating_message.fields[0].value = std::numeric_limits<double>::quiet_NaN();
    special_floating_message.fields[1].value = std::numeric_limits<double>::infinity();
    const auto special_floating =
        codec.encode(floating_definition, special_floating_message, ByteOrder::little_endian);
    CHECK(special_floating.has_value());
    if (const auto* bytes = special_floating.value_if()) {
        const auto special_decoded =
            codec.decode(floating_definition, *bytes, ByteOrder::little_endian);
        CHECK(special_decoded.has_value());
        if (const auto* output = special_decoded.value_if()) {
            CHECK(std::isnan(std::get<double>(output->message.fields[0].value)));
            CHECK(std::isinf(std::get<double>(output->message.fields[1].value)));
        }
    }

    auto duplicate_field_message = message;
    duplicate_field_message.fields.push_back({.name = "status", .value = std::uint64_t{1U}});
    const auto duplicate_field = codec.encode(definition, duplicate_field_message);
    CHECK(!duplicate_field.has_value());
    if (const auto* error = duplicate_field.error_if()) {
        CHECK(error->code == CodecErrorCode::duplicate_field);
        CHECK(error->path == "response.status");
        CHECK(error->offset == 1);
        CHECK(error->detail == "field appears more than once");
    }

    auto unexpected_field_message = message;
    unexpected_field_message.fields.push_back({.name = "debug", .value = std::uint64_t{1U}});
    const auto unexpected_field = codec.encode(definition, unexpected_field_message);
    CHECK(!unexpected_field.has_value());
    if (const auto* error = unexpected_field.error_if()) {
        CHECK(error->code == CodecErrorCode::unexpected_field);
        CHECK(error->path == "response.debug");
        CHECK(error->offset == 2);
        CHECK(error->detail == "field is not defined by the message schema");
    }

    const MessageDefinition padded_definition{
        .name = "padded",
        .fields =
            {
                {.name = "header", .type = FieldType::uint8, .length = 1, .offset = 0},
                {.name = "value",
                 .type = FieldType::uint16,
                 .byte_order = ByteOrder::little_endian,
                 .length = 2,
                 .offset = 2},
            },
    };
    const StructuredMessage padded_message{
        .message_name = "padded",
        .fields =
            {
                {.name = "header", .value = std::uint64_t{0xA5U}},
                {.name = "value", .value = std::uint64_t{0x1234U}},
            },
    };
    const auto padded_encoded = codec.encode(padded_definition, padded_message);
    CHECK(padded_encoded.has_value());
    if (const auto* padded_bytes = padded_encoded.value_if()) {
        CHECK(*padded_bytes == ByteBuffer({0xA5U, 0x00U, 0x34U, 0x12U}));

        const auto padded_decoded = codec.decode(padded_definition, *padded_bytes);
        CHECK(padded_decoded.has_value());
        if (const auto* output = padded_decoded.value_if()) {
            CHECK(output->message.fields.size() == 2);
            CHECK(std::get<std::uint64_t>(output->message.fields[0].value) == 0xA5U);
            CHECK(std::get<std::uint64_t>(output->message.fields[1].value) == 0x1234U);
            CHECK(output->field_ranges[0].offset == 0);
            CHECK(output->field_ranges[0].length == 1);
            CHECK(output->field_ranges[1].offset == 2);
            CHECK(output->field_ranges[1].length == 2);
        }
    }
    const auto padded_trailing =
        codec.decode(padded_definition, ByteBuffer{0xA5U, 0x00U, 0x34U, 0x12U, 0xFFU});
    CHECK(!padded_trailing.has_value());
    if (const auto* error = padded_trailing.error_if()) {
        CHECK(error->code == CodecErrorCode::unexpected_data);
        CHECK(error->path == "padded");
        CHECK(error->offset == 4);
        CHECK(error->detail == "1 trailing byte remains");
    }
    const auto non_zero_padding =
        codec.decode(padded_definition, ByteBuffer{0xA5U, 0xFFU, 0x34U, 0x12U});
    CHECK(non_zero_padding.has_value());
    if (const auto* output = non_zero_padding.value_if()) {
        CHECK(std::get<std::uint64_t>(output->message.fields[0].value) == 0xA5U);
        CHECK(std::get<std::uint64_t>(output->message.fields[1].value) == 0x1234U);
    }

    auto overlapping_definition = padded_definition;
    overlapping_definition.fields[1].offset = 0;
    const auto overlapping_decode = codec.decode(overlapping_definition, ByteBuffer{0x00U, 0x00U});
    CHECK(!overlapping_decode.has_value());
    if (const auto* error = overlapping_decode.error_if()) {
        CHECK(error->code == CodecErrorCode::invalid_layout);
        CHECK(error->path == "padded.value");
        CHECK(error->offset == 0);
        CHECK(error->detail == "field layout overlaps the previous field");
    }

    auto zero_length_definition = padded_definition;
    zero_length_definition.fields[0].length = 0;
    const auto zero_length_decode = codec.decode(zero_length_definition, ByteBuffer{});
    CHECK(!zero_length_decode.has_value());
    if (const auto* error = zero_length_decode.error_if()) {
        CHECK(error->code == CodecErrorCode::invalid_layout);
        CHECK(error->path == "padded.header");
        CHECK(error->offset == 0);
        CHECK(error->detail == "field length must be greater than zero");
    }

    auto mismatched_length_definition = padded_definition;
    mismatched_length_definition.fields[1].length = 1;
    const auto mismatched_length_encode =
        codec.encode(mismatched_length_definition, padded_message);
    CHECK(!mismatched_length_encode.has_value());
    if (const auto* error = mismatched_length_encode.error_if()) {
        CHECK(error->code == CodecErrorCode::invalid_layout);
        CHECK(error->path == "padded.value");
        CHECK(error->offset == 2);
        CHECK(error->detail == "field length must match fixed-width primitive size");
    }

    auto overflowing_layout_definition = padded_definition;
    overflowing_layout_definition.fields[0].offset = std::numeric_limits<std::size_t>::max();
    const auto overflowing_layout_encode =
        codec.encode(overflowing_layout_definition, padded_message);
    CHECK(!overflowing_layout_encode.has_value());
    if (const auto* error = overflowing_layout_encode.error_if()) {
        CHECK(error->code == CodecErrorCode::invalid_layout);
        CHECK(error->path == "padded.header");
        CHECK(error->offset == std::numeric_limits<std::size_t>::max());
        CHECK(error->detail == "field offset and length overflow");
    }
    CHECK(to_string(CodecErrorCode::invalid_layout) == "invalid_layout");

    const MessageDefinition fixed_text_definition{
        .name = "fixed-text",
        .fields =
            {
                {.name = "label", .type = FieldType::string, .length = 6, .offset = 0},
                {.name = "payload", .type = FieldType::bytes, .length = 3, .offset = 7},
            },
    };
    const StructuredMessage fixed_text_message{
        .message_name = "fixed-text",
        .fields =
            {
                {.name = "label", .value = std::string{"OK"}},
                {.name = "payload", .value = ByteBuffer{0x10U, 0x00U, 0xFFU}},
            },
    };
    const auto fixed_text_encoded = codec.encode(fixed_text_definition, fixed_text_message);
    CHECK(fixed_text_encoded.has_value());
    if (const auto* bytes = fixed_text_encoded.value_if()) {
        CHECK(*bytes ==
              ByteBuffer({0x4FU, 0x4BU, 0x00U, 0x00U, 0x00U, 0x00U, 0x00U, 0x10U, 0x00U, 0xFFU}));
        const auto fixed_text_decoded = codec.decode(fixed_text_definition, *bytes);
        CHECK(fixed_text_decoded.has_value());
        if (const auto* output = fixed_text_decoded.value_if()) {
            CHECK(std::get<std::string>(output->message.fields[0].value) == "OK");
            CHECK(std::get<ByteBuffer>(output->message.fields[1].value) ==
                  ByteBuffer({0x10U, 0x00U, 0xFFU}));
            CHECK(output->field_ranges[0].offset == 0);
            CHECK(output->field_ranges[0].length == 6);
            CHECK(output->field_ranges[1].offset == 7);
            CHECK(output->field_ranges[1].length == 3);
        }
    }

    auto missing_fixed_length = fixed_text_definition;
    missing_fixed_length.fields[0].length.reset();
    const auto missing_fixed_length_result = codec.decode(missing_fixed_length, ByteBuffer{});
    CHECK(!missing_fixed_length_result.has_value());
    if (const auto* error = missing_fixed_length_result.error_if()) {
        CHECK(error->code == CodecErrorCode::invalid_layout);
        CHECK(error->path == "fixed-text.label");
        CHECK(error->offset == 0);
        CHECK(error->detail == "fixed string and bytes fields require length");
    }

    auto oversized_string = fixed_text_message;
    oversized_string.fields[0].value = std::string{"toolong"};
    const auto oversized_string_result = codec.encode(fixed_text_definition, oversized_string);
    CHECK(!oversized_string_result.has_value());
    if (const auto* error = oversized_string_result.error_if()) {
        CHECK(error->code == CodecErrorCode::value_out_of_range);
        CHECK(error->path == "fixed-text.label");
        CHECK(error->offset == 0);
        CHECK(error->detail == "UTF-8 string requires 7 bytes but field length is 6");
    }

    auto embedded_nul_string = fixed_text_message;
    embedded_nul_string.fields[0].value = std::string{"A\0B", 3};
    const auto embedded_nul_result = codec.encode(fixed_text_definition, embedded_nul_string);
    CHECK(!embedded_nul_result.has_value());
    if (const auto* error = embedded_nul_result.error_if()) {
        CHECK(error->code == CodecErrorCode::invalid_string_encoding);
        CHECK(error->detail == "UTF-8 string must not contain NUL");
    }

    auto invalid_utf8_string = fixed_text_message;
    invalid_utf8_string.fields[0].value = std::string{"\xC3\x28", 2};
    const auto invalid_utf8_encode = codec.encode(fixed_text_definition, invalid_utf8_string);
    CHECK(!invalid_utf8_encode.has_value());
    if (const auto* error = invalid_utf8_encode.error_if()) {
        CHECK(error->code == CodecErrorCode::invalid_string_encoding);
        CHECK(error->detail == "string is not valid UTF-8");
    }

    for (const auto& invalid_text :
         std::vector<std::string>{std::string{"\xC0\xAF", 2}, std::string{"\xED\xA0\x80", 3},
                                  std::string{"\xF4\x90\x80\x80", 4}}) {
        auto invalid_unicode = fixed_text_message;
        invalid_unicode.fields[0].value = invalid_text;
        const auto invalid_unicode_result = codec.encode(fixed_text_definition, invalid_unicode);
        CHECK(!invalid_unicode_result.has_value());
        if (const auto* error = invalid_unicode_result.error_if()) {
            CHECK(error->code == CodecErrorCode::invalid_string_encoding);
        }
    }

    auto four_byte_utf8 = fixed_text_message;
    four_byte_utf8.fields[0].value = std::string{"\xF0\x9F\x8C\xA1", 4};
    const auto four_byte_utf8_encoded = codec.encode(fixed_text_definition, four_byte_utf8);
    CHECK(four_byte_utf8_encoded.has_value());
    if (const auto* bytes = four_byte_utf8_encoded.value_if()) {
        const auto four_byte_utf8_decoded = codec.decode(fixed_text_definition, *bytes);
        CHECK(four_byte_utf8_decoded.has_value());
        if (const auto* output = four_byte_utf8_decoded.value_if()) {
            CHECK(std::get<std::string>(output->message.fields[0].value) ==
                  std::get<std::string>(four_byte_utf8.fields[0].value));
        }
    }

    auto wrong_string_type = fixed_text_message;
    wrong_string_type.fields[0].value = ByteBuffer(6, 0U);
    const auto wrong_string_type_result = codec.encode(fixed_text_definition, wrong_string_type);
    CHECK(!wrong_string_type_result.has_value());
    if (const auto* error = wrong_string_type_result.error_if()) {
        CHECK(error->code == CodecErrorCode::type_mismatch);
        CHECK(error->detail == "expected std::string ScalarValue");
    }

    auto wrong_bytes_type = fixed_text_message;
    wrong_bytes_type.fields[1].value = std::string{"raw"};
    const auto wrong_bytes_type_result = codec.encode(fixed_text_definition, wrong_bytes_type);
    CHECK(!wrong_bytes_type_result.has_value());
    if (const auto* error = wrong_bytes_type_result.error_if()) {
        CHECK(error->code == CodecErrorCode::type_mismatch);
        CHECK(error->detail == "expected ByteBuffer ScalarValue");
    }

    auto wrong_bytes_length = fixed_text_message;
    wrong_bytes_length.fields[1].value = ByteBuffer{0x10U, 0x20U};
    const auto wrong_bytes_length_result = codec.encode(fixed_text_definition, wrong_bytes_length);
    CHECK(!wrong_bytes_length_result.has_value());
    if (const auto* error = wrong_bytes_length_result.error_if()) {
        CHECK(error->code == CodecErrorCode::value_out_of_range);
        CHECK(error->path == "fixed-text.payload");
        CHECK(error->offset == 7);
        CHECK(error->detail == "bytes value has length 2 but field length is 3");
    }

    const auto invalid_utf8_decode =
        codec.decode(fixed_text_definition, ByteBuffer{0xC3U, 0x28U, 0x00U, 0x00U, 0x00U, 0x00U,
                                                       0x00U, 0x10U, 0x00U, 0xFFU});
    CHECK(!invalid_utf8_decode.has_value());
    if (const auto* error = invalid_utf8_decode.error_if()) {
        CHECK(error->code == CodecErrorCode::invalid_string_encoding);
        CHECK(error->path == "fixed-text.label");
        CHECK(error->offset == 0);
        CHECK(error->detail == "string bytes are not valid UTF-8");
    }

    const auto non_zero_string_padding =
        codec.decode(fixed_text_definition, ByteBuffer{0x4FU, 0x4BU, 0x00U, 0x41U, 0x00U, 0x00U,
                                                       0x00U, 0x10U, 0x00U, 0xFFU});
    CHECK(!non_zero_string_padding.has_value());
    if (const auto* error = non_zero_string_padding.error_if()) {
        CHECK(error->code == CodecErrorCode::invalid_string_padding);
        CHECK(error->path == "fixed-text.label");
        CHECK(error->offset == 3);
        CHECK(error->detail == "non-zero byte follows string NUL terminator");
    }
    CHECK(to_string(CodecErrorCode::invalid_string_encoding) == "invalid_string_encoding");
    CHECK(to_string(CodecErrorCode::invalid_string_padding) == "invalid_string_padding");

    return failures == 0 ? 0 : 1;
}
