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
    CHECK(spaced.has_value());
    if (const auto* bytes = spaced.value_if()) {
        CHECK(bytes->size() == 4);
        CHECK((*bytes)[0] == 0xAAU);
        CHECK((*bytes)[3] == 0x0AU);
        CHECK(format_hex(*bytes) == "AA 55 01 0A");
        CHECK(ascii_preview(*bytes) == ".U..");
    }

    const auto compact = parse_hex("0xAA55:01-0A");
    CHECK(compact.has_value());
    if (const auto* bytes = compact.value_if()) {
        CHECK(format_hex(*bytes) == "AA 55 01 0A");
    }

    const auto invalid = parse_hex("AA Z1");
    CHECK(!invalid.has_value());
    if (const auto* error = invalid.error_if()) {
        CHECK(error->code == HexErrorCode::invalid_character);
        CHECK(error->offset == 3);
    }

    const auto incomplete = parse_hex("AA 5");
    CHECK(!incomplete.has_value());
    if (const auto* error = incomplete.error_if()) {
        CHECK(error->code == HexErrorCode::incomplete_byte);
    }

    const auto empty = parse_hex(" \t\r\n");
    CHECK(!empty.has_value());
    if (const auto* error = empty.error_if()) {
        CHECK(error->code == HexErrorCode::empty_input);
    }

    return failures == 0 ? 0 : 1;
}
