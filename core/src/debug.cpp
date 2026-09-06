#include "iotps/core/debug.hpp"

#include "iotps/core/checksum.hpp"
#include "iotps/core/hex.hpp"

#include <algorithm>
#include <bitset>
#include <charconv>
#include <chrono>
#include <cmath>
#include <iomanip>
#include <limits>
#include <locale>
#include <sstream>
#include <stdexcept>
#include <type_traits>

namespace iotps::core {
namespace {

constexpr std::size_t max_bytes = 65536;
// ponytail: synchronous tools are capped at 64 KiB; move larger captures to a streaming worker.
constexpr std::string_view alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

template <typename T> T number(std::string_view text, int base = 10) {
    T value{};
    std::from_chars_result parsed;
    if constexpr (std::is_floating_point_v<T>) {
        parsed = std::from_chars(text.data(), text.data() + text.size(), value);
    } else {
        parsed = std::from_chars(text.data(), text.data() + text.size(), value, base);
    }
    if (text.empty() || parsed.ec != std::errc{} || parsed.ptr != text.data() + text.size())
        throw std::invalid_argument("Invalid number: " + std::string(text));
    if constexpr (std::is_floating_point_v<T>) {
        if (!std::isfinite(value))
            throw std::invalid_argument("Number must be finite");
    }
    return value;
}

schema::FieldType numeric_type(std::string_view format) {
    using enum schema::FieldType;
    for (const auto type :
         {int8, uint8, int16, uint16, int32, uint32, int64, uint64, float32, float64})
        if (schema::to_string(type) == format)
            return type;
    throw std::invalid_argument("Unsupported format: " + std::string(format));
}

schema::MessageDefinition numeric_message(std::string_view format) {
    return {.name = "value", .fields = {{.name = "value", .type = numeric_type(format)}}};
}

void check_utf8(std::span<const std::uint8_t> bytes) {
    if (!is_valid_utf8(std::string(bytes.begin(), bytes.end())))
        throw std::invalid_argument("Invalid UTF-8");
}

std::string base64(std::span<const std::uint8_t> bytes) {
    std::string result;
    for (std::size_t i = 0; i < bytes.size(); i += 3) {
        const auto n = (static_cast<unsigned>(bytes[i]) << 16) |
                       (i + 1 < bytes.size() ? static_cast<unsigned>(bytes[i + 1]) << 8 : 0) |
                       (i + 2 < bytes.size() ? bytes[i + 2] : 0);
        result += alphabet[(n >> 18) & 63];
        result += alphabet[(n >> 12) & 63];
        result += i + 1 < bytes.size() ? alphabet[(n >> 6) & 63] : '=';
        result += i + 2 < bytes.size() ? alphabet[n & 63] : '=';
    }
    return result;
}

std::int64_t read_timestamp(const std::string& input, bool milliseconds) {
    using namespace std::chrono;
    const auto size = milliseconds ? 24U : 20U;
    if (input.size() != size || input[4] != '-' || input[7] != '-' || input[10] != 'T' ||
        input[13] != ':' || input[16] != ':' || input.back() != 'Z' ||
        (milliseconds && input[19] != '.'))
        throw std::invalid_argument("Use UTC YYYY-MM-DDTHH:MM:SSZ or YYYY-MM-DDTHH:MM:SS.mmmZ");
    const auto part = [&](std::size_t offset, std::size_t count) {
        return number<unsigned>(std::string_view(input).substr(offset, count));
    };
    const auto y = part(0, 4), h = part(11, 2), m = part(14, 2), s = part(17, 2);
    const year_month_day date{year{static_cast<int>(y)}, month{part(5, 2)}, day{part(8, 2)}};
    if (!y || !date.ok() || h > 23 || m > 59 || s > 59)
        throw std::invalid_argument("Invalid UTC date or time");
    const auto seconds =
        duration_cast<std::chrono::seconds>(sys_days{date}.time_since_epoch()).count() + h * 3600 +
        m * 60 + s;
    return milliseconds ? seconds * 1000 + part(20, 3) : seconds;
}

std::string write_timestamp(std::int64_t value, bool milliseconds) {
    using namespace std::chrono;
    const auto scale = milliseconds ? 1000LL : 1LL;
    if (value < -62135596800LL * scale || value >= 253402300800LL * scale)
        throw std::invalid_argument("UTC timestamp must be within years 0001..9999");
    const sys_time<std::chrono::milliseconds> time{
        std::chrono::milliseconds{milliseconds ? value : value * 1000}};
    const auto date = floor<days>(time);
    const year_month_day ymd{date};
    const hh_mm_ss clock{time - date};
    std::ostringstream output;
    output << std::setfill('0') << std::setw(4) << static_cast<int>(ymd.year()) << '-'
           << std::setw(2) << static_cast<unsigned>(ymd.month()) << '-' << std::setw(2)
           << static_cast<unsigned>(ymd.day()) << 'T' << std::setw(2) << clock.hours().count()
           << ':' << std::setw(2) << clock.minutes().count() << ':' << std::setw(2)
           << clock.seconds().count();
    if (milliseconds)
        output << '.' << std::setw(3) << clock.subseconds().count();
    return output.str() + 'Z';
}

ByteBuffer read_bytes(const std::string& input, std::string_view format, schema::ByteOrder order) {
    if (input.size() > max_bytes * 12)
        throw std::invalid_argument("Input exceeds 64 KiB byte limit");
    ByteBuffer bytes;
    if (format == "hex") {
        auto parsed = parse_hex(input);
        if (!parsed)
            throw std::invalid_argument(parsed.error_if()->detail);
        bytes = std::move(parsed).value();
    } else if (format == "bcd") {
        if (input.size() % 2 || input.find_first_not_of("0123456789") != std::string::npos)
            throw std::invalid_argument(
                "Unsigned packed BCD requires an even number of decimal digits");
        for (std::size_t i = 0; i < input.size(); i += 2)
            bytes.push_back(static_cast<std::uint8_t>((input[i] - '0') * 16 + input[i + 1] - '0'));
        if (order == schema::ByteOrder::little_endian)
            std::ranges::reverse(bytes);
    } else if (format == "timestamp-s" || format == "timestamp-ms") {
        return read_bytes(std::to_string(read_timestamp(input, format == "timestamp-ms")), "int64",
                          order);
    } else if (format == "utf8" || format == "ascii") {
        bytes.assign(input.begin(), input.end());
        check_utf8(bytes);
        if (format == "ascii" && std::ranges::any_of(bytes, [](auto b) { return b > 127; }))
            throw std::invalid_argument("ASCII requires bytes 0..127");
    } else if (format == "base64") {
        if (input.size() % 4 != 0)
            throw std::invalid_argument("Invalid Base64 length");
        for (std::size_t i = 0; i < input.size(); i += 4) {
            unsigned n = 0;
            for (std::size_t j = 0; j < 4; ++j) {
                auto value = alphabet.find(input[i + j]);
                if (input[i + j] == '=' && i + 4 == input.size() && j >= 2)
                    value = 0;
                if (value == std::string_view::npos)
                    throw std::invalid_argument("Invalid Base64");
                n = (n << 6) | static_cast<unsigned>(value);
            }
            bytes.push_back(static_cast<std::uint8_t>(n >> 16));
            if (input[i + 2] != '=')
                bytes.push_back(static_cast<std::uint8_t>(n >> 8));
            if (input[i + 3] != '=')
                bytes.push_back(static_cast<std::uint8_t>(n));
        }
        if (base64(bytes) != input)
            throw std::invalid_argument("Invalid Base64 padding");
    } else if (format == "binary" || format == "decimal") {
        std::istringstream stream(input);
        std::string token;
        while (stream >> token) {
            if (format == "binary" && token.size() != 8)
                throw std::invalid_argument("Binary requires eight bits per byte");
            const auto value = number<unsigned>(token, format == "binary" ? 2 : 10);
            if (value > 255)
                throw std::invalid_argument("Byte must be in 0..255");
            bytes.push_back(static_cast<std::uint8_t>(value));
        }
    } else {
        const auto definition = numeric_message(format);
        codec::ScalarValue value;
        if (format.starts_with("float"))
            value = number<double>(input);
        else if (format.starts_with("uint"))
            value = number<std::uint64_t>(input);
        else
            value = number<std::int64_t>(input);
        auto encoded = codec::FixedLayoutCodec{}.encode(
            definition, {.message_name = "value", .fields = {{"value", value}}}, order);
        if (!encoded)
            throw std::invalid_argument(encoded.error_if()->detail);
        bytes = std::move(encoded).value();
    }
    if (bytes.empty() || bytes.size() > max_bytes)
        throw std::invalid_argument("Byte count must be in 1..65536");
    return bytes;
}

std::string write_bytes(const ByteBuffer& bytes, std::string_view format, schema::ByteOrder order) {
    if (format == "timestamp-s" || format == "timestamp-ms")
        return write_timestamp(number<std::int64_t>(write_bytes(bytes, "int64", order)),
                               format == "timestamp-ms");
    if (format == "bcd") {
        std::string result;
        for (std::size_t i = 0; i < bytes.size(); ++i) {
            const auto b =
                bytes[order == schema::ByteOrder::little_endian ? bytes.size() - 1 - i : i];
            if (b / 16 > 9 || b % 16 > 9)
                throw std::invalid_argument("Invalid packed BCD digit");
            result += static_cast<char>('0' + b / 16);
            result += static_cast<char>('0' + b % 16);
        }
        return result;
    }
    if (format == "hex")
        return format_hex(bytes);
    if (format == "base64")
        return base64(bytes);
    if (format == "utf8" || format == "ascii") {
        check_utf8(bytes);
        if (format == "ascii" && std::ranges::any_of(bytes, [](auto b) { return b > 127; }))
            throw std::invalid_argument("ASCII requires bytes 0..127");
        return std::string(bytes.begin(), bytes.end());
    }
    if (format == "binary" || format == "decimal") {
        std::string result;
        for (auto byte : bytes) {
            if (!result.empty())
                result += ' ';
            result += format == "binary" ? std::bitset<8>(byte).to_string() : std::to_string(byte);
        }
        return result;
    }
    auto decoded = codec::FixedLayoutCodec{}.decode(numeric_message(format), bytes, order);
    if (!decoded)
        throw std::invalid_argument(decoded.error_if()->detail);
    return format_scalar(decoded.value().message.fields.front().value);
}

std::uint32_t reflect(std::uint32_t value, unsigned width) {
    std::uint32_t result = 0;
    for (unsigned bit = 0; bit < width; ++bit) {
        result = (result << 1) | (value & 1);
        value >>= 1;
    }
    return result;
}

} // namespace

std::string format_scalar(const codec::ScalarValue& value) {
    return std::visit(
        [](const auto& item) -> std::string {
            using T = std::decay_t<decltype(item)>;
            if constexpr (std::is_same_v<T, bool>)
                return item ? "true" : "false";
            else if constexpr (std::is_same_v<T, std::string>)
                return item;
            else if constexpr (std::is_same_v<T, ByteBuffer>)
                return format_hex(item);
            else if constexpr (std::is_same_v<T, codec::ArrayValue>) {
                std::string result = "[";
                for (const auto& element : item) {
                    if (result.size() > 1)
                        result += ", ";
                    result += std::visit(
                        [](auto scalar) { return format_scalar(codec::ScalarValue{scalar}); },
                        element);
                }
                return result + "]";
            } else {
                std::ostringstream stream;
                stream.imbue(std::locale::classic());
                stream << std::setprecision(std::numeric_limits<double>::max_digits10) << item;
                return stream.str();
            }
        },
        value);
}

DebugResult run_debug_tool(std::string_view operation, std::span<const std::string> args) {
    try {
        DebugOutput result;
        if (operation == "convert" && args.size() == 4) {
            if (args[3] != "big" && args[3] != "little")
                throw std::invalid_argument("Invalid byte order");
            const auto order = args[3] == "little" ? schema::ByteOrder::little_endian
                                                   : schema::ByteOrder::big_endian;
            auto bytes = read_bytes(args[0], args[1], order);
            if (args[2] == "reverse") {
                std::ranges::reverse(bytes);
                result.text = format_hex(bytes);
            } else
                result.text = write_bytes(bytes, args[2], order);
            result.hex = format_hex(bytes);
        } else if (operation == "bits" && args.size() == 3) {
            auto bytes = read_bytes(args[0], "hex", schema::ByteOrder::big_endian);
            const auto& op = args[1];
            if (op == "SHL" || op == "SHR") {
                const auto shift = number<std::size_t>(args[2]);
                const auto bits = bytes.size() * 8;
                if (shift > bits)
                    throw std::invalid_argument("Shift must be in 0..input bit count");
                ByteBuffer shifted(bytes.size(), 0);
                for (std::size_t i = 0; i < bits - shift; ++i) {
                    const auto source = op == "SHL" ? i + shift : i;
                    const auto target = op == "SHL" ? i : i + shift;
                    if (bytes[source / 8] & (1U << (7 - source % 8)))
                        shifted[target / 8] |= static_cast<std::uint8_t>(1U << (7 - target % 8));
                }
                bytes = std::move(shifted);
            } else {
                if (op != "XOR" && op != "AND" && op != "OR")
                    throw std::invalid_argument("Unsupported bit operation");
                const auto mask = read_bytes(args[2], "hex", schema::ByteOrder::big_endian);
                if (mask.size() != 1 && mask.size() != bytes.size())
                    throw std::invalid_argument("HEX mask must be one byte or match input length");
                for (std::size_t i = 0; i < bytes.size(); ++i) {
                    const auto value = mask[i % mask.size()];
                    bytes[i] = op == "XOR"   ? bytes[i] ^ value
                               : op == "AND" ? bytes[i] & value
                                             : bytes[i] | value;
                }
            }
            result.hex = result.text = format_hex(bytes);
        } else if ((operation == "find" || operation == "replace") && args.size() == 3) {
            const auto bytes = read_bytes(args[0], "hex", schema::ByteOrder::big_endian);
            const auto needle = read_bytes(args[1], "hex", schema::ByteOrder::big_endian);
            const auto replacement =
                args[2].empty() ? ByteBuffer{}
                                : read_bytes(args[2], "hex", schema::ByteOrder::big_endian);
            ByteBuffer edited;
            // Non-overlapping byte matches make replace-all deterministic, including deletion.
            for (std::size_t i = 0; i < bytes.size();) {
                if (needle.size() <= bytes.size() - i &&
                    std::equal(needle.begin(), needle.end(),
                               bytes.begin() + static_cast<std::ptrdiff_t>(i))) {
                    result.matches.push_back(i);
                    const auto& next = operation == "replace" ? replacement : needle;
                    if (edited.size() + next.size() > max_bytes)
                        throw std::invalid_argument("Result exceeds 64 KiB");
                    edited.insert(edited.end(), next.begin(), next.end());
                    i += needle.size();
                } else {
                    edited.push_back(bytes[i++]);
                }
                if (edited.size() > max_bytes)
                    throw std::invalid_argument("Result exceeds 64 KiB");
            }
            result.hex = format_hex(edited);
            result.text = std::to_string(result.matches.size());
        } else if (operation == "checksum" && args.size() == 10) {
            const auto bytes = read_bytes(args[0], "hex", schema::ByteOrder::big_endian);
            const auto start = number<std::size_t>(args[2]), end = number<std::size_t>(args[3]);
            if (start > end || end >= bytes.size())
                throw std::invalid_argument("Invalid inclusive byte offset range");
            const auto data = std::span(bytes).subspan(start, end - start + 1);
            const auto& algorithm = args[1];
            unsigned width = 8;
            std::uint32_t value = 0;
            if (algorithm == "SUM8")
                value = sum8(data);
            else if (algorithm == "XOR8")
                value = xor8(data);
            else if (algorithm == "LRC")
                value = static_cast<std::uint8_t>(0U - sum8(data));
            else if (algorithm == "SUM16") {
                width = 16;
                for (auto b : data)
                    value = (value + b) & 0xFFFF;
            } else {
                if (algorithm != "CRC")
                    throw std::invalid_argument("Unknown checksum algorithm");
                width = number<unsigned>(args[4]);
                if (width != 8 && width != 16 && width != 32)
                    throw std::invalid_argument("CRC width must be 8, 16 or 32");
                const auto mask = static_cast<std::uint32_t>((std::uint64_t{1} << width) - 1);
                const auto poly = number<std::uint32_t>(args[5], 16);
                value = number<std::uint32_t>(args[6], 16);
                const auto xor_out = number<std::uint32_t>(args[9], 16);
                if (!poly || poly > mask || value > mask || xor_out > mask ||
                    (args[7] != "0" && args[7] != "1") || (args[8] != "0" && args[8] != "1"))
                    throw std::invalid_argument("Invalid CRC parameters");
                for (auto byte : data) {
                    value ^= (args[7] == "1" ? reflect(byte, 8) : byte) << (width - 8);
                    for (unsigned bit = 0; bit < 8; ++bit)
                        value = ((value << 1) ^ ((value & (1U << (width - 1))) ? poly : 0)) & mask;
                }
                if (args[8] == "1")
                    value = reflect(value, width);
                value ^= xor_out;
            }
            std::ostringstream stream;
            stream << std::uppercase << std::hex << std::setfill('0')
                   << std::setw(static_cast<int>(width / 4)) << value;
            result.text = stream.str();
        } else
            throw std::invalid_argument("Invalid debug operation or arguments");
        return result;
    } catch (const std::exception& error) {
        return Error<DebugErrorCode>{.code = DebugErrorCode::invalid_input,
                                     .path = std::string(operation),
                                     .detail = error.what()};
    }
}

} // namespace iotps::core
