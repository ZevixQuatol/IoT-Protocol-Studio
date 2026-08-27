#include "iotps/core/schema/schema.hpp"

#include <algorithm>
#include <iostream>
#include <limits>
#include <string_view>

namespace {

int failures = 0;

void check(const bool condition, const char* expression, const int line) {
    if (!condition) {
        std::cerr << "line " << line << ": check failed: " << expression << '\n';
        ++failures;
    }
}

#define CHECK(expression) check((expression), #expression, __LINE__)

bool contains_diagnostic(const iotps::core::schema::SchemaValidation& validation,
                         const iotps::core::schema::SchemaErrorCode code,
                         const std::string_view path) {
    return std::ranges::any_of(validation.diagnostics, [code, path](const auto& diagnostic) {
        return diagnostic.code == code && diagnostic.path == path;
    });
}

} // namespace

int main() {
    using namespace iotps::core::schema;

    ProtocolSchema valid{
        .protocol = {.name = "smart-sensor", .display_name = "Smart Sensor", .version = "1.0"},
        .messages = {{.name = "telemetry",
                      .type_id = 1,
                      .fields = {{.name = "command", .type = FieldType::uint8}}}},
    };
    CHECK(validate(valid).ok());

    auto invalid = valid;
    invalid.messages.push_back(invalid.messages.front());
    invalid.messages.front().fields.front().name.clear();

    const auto validation = validate(invalid);
    CHECK(!validation.ok());
    CHECK(contains_diagnostic(validation, SchemaErrorCode::empty_field_name,
                              "messages[0].fields[0].name"));
    CHECK(contains_diagnostic(validation, SchemaErrorCode::duplicate_message_name,
                              "messages[1].name"));
    CHECK(to_string(SchemaErrorCode::duplicate_message_name) == "duplicate_message_name");

    auto zero_length = valid;
    zero_length.messages[0].fields[0].length = 0;
    const auto zero_length_validation = validate(zero_length);
    CHECK(contains_diagnostic(zero_length_validation, SchemaErrorCode::field_length_zero,
                              "messages[0].fields[0].length"));

    auto mismatched_length = valid;
    mismatched_length.messages[0].fields[0].length = 2;
    const auto mismatched_length_validation = validate(mismatched_length);
    CHECK(contains_diagnostic(mismatched_length_validation, SchemaErrorCode::field_length_mismatch,
                              "messages[0].fields[0].length"));

    auto overlapping_layout = valid;
    overlapping_layout.messages[0].fields.push_back(
        {.name = "status", .type = FieldType::uint8, .offset = 0});
    const auto overlapping_layout_validation = validate(overlapping_layout);
    CHECK(contains_diagnostic(overlapping_layout_validation, SchemaErrorCode::field_layout_overlap,
                              "messages[0].fields[1].offset"));

    auto overflowing_layout = valid;
    overflowing_layout.messages[0].fields[0].length = 1;
    overflowing_layout.messages[0].fields[0].offset = std::numeric_limits<std::size_t>::max();
    const auto overflowing_layout_validation = validate(overflowing_layout);
    CHECK(contains_diagnostic(overflowing_layout_validation, SchemaErrorCode::field_offset_overflow,
                              "messages[0].fields[0].offset"));

    return failures == 0 ? 0 : 1;
}
