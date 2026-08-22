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
        .fields = {
            {.name = "command", .type = FieldType::uint8},
            {.name = "status", .type = FieldType::uint8},
        },
    };
    const StructuredMessage message{
        .message_name = "response",
        .fields = {
            {.name = "command", .value = std::uint64_t{0x81U}},
            {.name = "status", .value = std::uint64_t{0U}},
        },
    };

    const FixedLayoutCodec codec;
    const auto encoded = codec.encode(definition, message);
    CHECK(std::holds_alternative<ByteBuffer>(encoded));
    if (const auto* bytes = std::get_if<ByteBuffer>(&encoded)) {
        CHECK(*bytes == ByteBuffer({0x81U, 0x00U}));

        const auto decoded = codec.decode(definition, *bytes);
        CHECK(std::holds_alternative<DecodedMessage>(decoded));
        if (const auto* output = std::get_if<DecodedMessage>(&decoded)) {
            CHECK(output->message.message_name == "response");
            CHECK(output->message.fields.size() == 2);
            CHECK(std::get<std::uint64_t>(output->message.fields[0].value) == 0x81U);
            CHECK(output->field_ranges[1].offset == 1);
            CHECK(output->field_ranges[1].length == 1);
        }
    }

    auto invalid = message;
    invalid.fields[1].value = std::uint64_t{256U};
    const auto rejected = codec.encode(definition, invalid);
    CHECK(std::holds_alternative<CodecError>(rejected));
    if (const auto* error = std::get_if<CodecError>(&rejected)) {
        CHECK(error->code == CodecErrorCode::value_out_of_range);
        CHECK(error->path == "response.status");
    }

    return failures == 0 ? 0 : 1;
}
