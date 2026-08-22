#pragma once

#include "iotps/core/result.hpp"
#include "iotps/core/schema/schema.hpp"
#include "iotps/core/types.hpp"

#include <cstddef>
#include <cstdint>
#include <span>
#include <string>
#include <string_view>
#include <variant>
#include <vector>

namespace iotps::core::codec {

using ScalarValue =
    std::variant<bool, std::int64_t, std::uint64_t, double, std::string, ByteBuffer>;

struct FieldValue {
    std::string name;
    ScalarValue value;
};

struct StructuredMessage {
    std::string message_name;
    std::vector<FieldValue> fields;
};

struct FieldRange {
    std::string path;
    std::size_t offset;
    std::size_t length;
};

struct DecodedMessage {
    StructuredMessage message;
    std::vector<FieldRange> field_ranges;
};

enum class CodecErrorCode {
    message_name_mismatch,
    missing_field,
    duplicate_field,
    unexpected_field,
    type_mismatch,
    value_out_of_range,
    insufficient_data,
    unexpected_data,
    unsupported_field_type,
};

using CodecError = Error<CodecErrorCode>;
using EncodeResult = Result<ByteBuffer, CodecError>;
using DecodeResult = Result<DecodedMessage, CodecError>;

class MessageCodec {
  public:
    virtual ~MessageCodec() = default;

    [[nodiscard]] virtual EncodeResult
    encode(const schema::MessageDefinition& definition, const StructuredMessage& message,
           schema::ByteOrder default_byte_order = schema::ByteOrder::big_endian) const = 0;
    [[nodiscard]] virtual DecodeResult
    decode(const schema::MessageDefinition& definition, std::span<const std::uint8_t> bytes,
           schema::ByteOrder default_byte_order = schema::ByteOrder::big_endian) const = 0;
};

class FixedLayoutCodec final : public MessageCodec {
  public:
    [[nodiscard]] EncodeResult
    encode(const schema::MessageDefinition& definition, const StructuredMessage& message,
           schema::ByteOrder default_byte_order = schema::ByteOrder::big_endian) const override;
    [[nodiscard]] DecodeResult
    decode(const schema::MessageDefinition& definition, std::span<const std::uint8_t> bytes,
           schema::ByteOrder default_byte_order = schema::ByteOrder::big_endian) const override;
};

[[nodiscard]] std::string_view to_string(CodecErrorCode code) noexcept;

} // namespace iotps::core::codec
