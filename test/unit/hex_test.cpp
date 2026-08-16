#include "iotps/core/hex.hpp"

#include <iostream>
#include <string>

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

    const auto spaced = parse_hex("AA 55 01 0a");
    CHECK(std::holds_alternative<ByteBuffer>(spaced));
    if (const auto* bytes = std::get_if<ByteBuffer>(&spaced)) {
        CHECK(bytes->size() == 4);
        CHECK((*bytes)[0] == 0xAAU);
        CHECK((*bytes)[3] == 0x0AU);
        CHECK(format_hex(*bytes) == "AA 55 01 0A");
        CHECK(ascii_preview(*bytes) == ".U..");
    }

    const auto compact = parse_hex("0xAA55:01-0A");
    CHECK(std::holds_alternative<ByteBuffer>(compact));
    if (const auto* bytes = std::get_if<ByteBuffer>(&compact)) {
        CHECK(format_hex(*bytes) == "AA 55 01 0A");
    }

    const auto invalid = parse_hex("AA Z1");
    CHECK(std::holds_alternative<HexError>(invalid));
    if (const auto* error = std::get_if<HexError>(&invalid)) {
        CHECK(error->code == HexErrorCode::invalid_character);
        CHECK(error->position == 3);
    }

    const auto incomplete = parse_hex("AA 5");
    CHECK(std::holds_alternative<HexError>(incomplete));
    if (const auto* error = std::get_if<HexError>(&incomplete)) {
        CHECK(error->code == HexErrorCode::incomplete_byte);
    }

    const auto empty = parse_hex(" \t\r\n");
    CHECK(std::holds_alternative<HexError>(empty));
    if (const auto* error = std::get_if<HexError>(&empty)) {
        CHECK(error->code == HexErrorCode::empty_input);
    }

    return failures == 0 ? 0 : 1;
}
