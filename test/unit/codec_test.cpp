#include "iotps/core/codec/codec.hpp"

#include <cstdint>
#include <iostream>
#include <variant>

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

    const MessageDefinition string_definition{
        .name = "text-message",
        .fields = {{.name = "payload", .type = FieldType::string}},
    };
    const auto unsupported = codec.decode(string_definition, ByteBuffer{});
    CHECK(!unsupported.has_value());
    if (const auto* error = unsupported.error_if()) {
        CHECK(error->code == CodecErrorCode::unsupported_field_type);
        CHECK(error->path == "text-message.payload");
        CHECK(error->offset == 0);
        CHECK(error->detail == "field type is not a fixed-width primitive");
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
    }

    return failures == 0 ? 0 : 1;
}
