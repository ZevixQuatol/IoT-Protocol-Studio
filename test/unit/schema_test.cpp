#include "iotps/core/schema/schema.hpp"

#include <algorithm>
#include <iostream>
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

    return failures == 0 ? 0 : 1;
}
