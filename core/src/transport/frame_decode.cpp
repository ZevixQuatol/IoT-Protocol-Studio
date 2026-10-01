#include "iotps/core/codec/codec.hpp"
#include "iotps/core/debug.hpp"
#include "iotps/core/hex.hpp"
#include "iotps/core/transport/capture.hpp"

#include <algorithm>

namespace iotps::core::transport {
std::optional<TcpParse> parse_frame(const schema::ProtocolSchema* protocol, const std::string& path,
                                    const std::string& bound_message,
                                    std::span<const std::uint8_t> bytes) {
    std::optional<TcpParse> parsed;
    if (protocol) {
        std::string message = bound_message;
        std::string reason;
        if (bound_message.empty()) {
            const auto match = schema::identify_message(*protocol, bytes);
            if (match.status == schema::MatchStatus::matched)
                message = match.message;
            else
                reason = match.reason;
        }
        parsed.emplace();
        parsed->protocol_path = path;
        parsed->message_name = message;
        if (!reason.empty()) {
            parsed->status = "unmatched";
            parsed->error = reason;
        } else {
            const auto decoded = codec::decode_protocol_message(*protocol, message, bytes);
            const auto definition = std::ranges::find_if(
                protocol->messages, [&](const auto& item) { return item.name == message; });
            parsed->checksum =
                definition != protocol->messages.end() && definition->checksum ? "" : "none";
            if (const auto* error = decoded.error_if()) {
                parsed->status = "error";
                parsed->error = error->detail;
                if (error->detail.find("checksum_mismatch") != std::string::npos)
                    parsed->checksum = "fail";
            } else {
                parsed->status = "ok";
                if (definition->checksum)
                    parsed->checksum = "pass";
                const auto& data = decoded.value();
                for (const auto& field : data.message.fields) {
                    const auto field_definition =
                        std::ranges::find_if(data.concrete_fields, [&](const auto& item) {
                            return item.name == field.name;
                        });
                    const auto range =
                        std::ranges::find_if(data.field_ranges, [&](const auto& item) {
                            return item.path == message + "." + field.name;
                        });
                    if (range == data.field_ranges.end() ||
                        field_definition == data.concrete_fields.end())
                        continue;
                    auto value = format_scalar(field.value);
                    if (value.size() > 512) {
                        std::size_t end = 512;
                        while (end > 0 && (static_cast<unsigned char>(value[end]) & 0xc0) == 0x80)
                            --end;
                        value = value.substr(0, end) + "...";
                    }
                    std::optional<std::string> enum_name;
                    if (!field_definition->enum_values.empty())
                        enum_name =
                            std::string{schema::enum_name(*field_definition, value).value_or("")};
                    parsed->fields.push_back(
                        {field.name, field_definition->display_name,
                         std::string{schema::to_string(field_definition->type)}, std::move(value),
                         range->offset, range->length, std::move(enum_name)});
                    if (const auto* raw = std::get_if<std::uint64_t>(&field.value)) {
                        auto& parsed_field = parsed->fields.back();
                        const auto order = field_definition->byte_order.value_or(
                            protocol->protocol.default_byte_order);
                        for (const auto& bit : field_definition->bits) {
                            const auto low = bit.offset / 8;
                            const auto high = (bit.offset + bit.width - 1) / 8;
                            const auto first = order == schema::ByteOrder::little_endian
                                                   ? low
                                                   : range->length - 1 - high;
                            parsed_field.bits.push_back(
                                {bit.name, bit.display_name,
                                 std::to_string(schema::bit_value(*raw, bit)),
                                 range->offset + first, high - low + 1, bit.offset, bit.width});
                        }
                    }
                }
            }
        }
    }
    return parsed;
}
} // namespace iotps::core::transport
