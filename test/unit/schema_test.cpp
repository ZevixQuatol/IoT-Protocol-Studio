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

    auto missing_string_length = valid;
    missing_string_length.messages[0].fields[0].type = FieldType::string;
    const auto missing_string_length_validation = validate(missing_string_length);
    CHECK(contains_diagnostic(missing_string_length_validation,
                              SchemaErrorCode::field_length_required,
                              "messages[0].fields[0].length"));

    auto missing_bytes_length = valid;
    missing_bytes_length.messages[0].fields[0].type = FieldType::bytes;
    const auto missing_bytes_length_validation = validate(missing_bytes_length);
    CHECK(contains_diagnostic(missing_bytes_length_validation,
                              SchemaErrorCode::field_length_required,
                              "messages[0].fields[0].length"));

    auto fixed_text_layout = valid;
    fixed_text_layout.messages[0].fields = {
        {.name = "label", .type = FieldType::string, .length = 4},
        {.name = "payload", .type = FieldType::bytes, .length = 2, .offset = 3},
    };
    const auto fixed_text_layout_validation = validate(fixed_text_layout);
    CHECK(contains_diagnostic(fixed_text_layout_validation, SchemaErrorCode::field_layout_overlap,
                              "messages[0].fields[1].offset"));

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
    CHECK(to_string(SchemaErrorCode::field_length_required) == "field_length_required");

    auto length_field = valid;
    length_field.messages[0].fields = {
        {.name = "bodyLength", .type = FieldType::uint16, .length_of = "body"},
        {.name = "body", .type = FieldType::bytes, .length = 4},
    };
    CHECK(validate(length_field).ok());

    auto unknown_length_target = length_field;
    unknown_length_target.messages[0].fields[0].length_of = "missing";
    const auto unknown_length_target_validation = validate(unknown_length_target);
    CHECK(contains_diagnostic(unknown_length_target_validation,
                              SchemaErrorCode::length_field_target_not_found,
                              "messages[0].fields[0].lengthOf"));

    auto invalid_length_type = length_field;
    invalid_length_type.messages[0].fields[0].type = FieldType::int16;
    const auto invalid_length_type_validation = validate(invalid_length_type);
    CHECK(contains_diagnostic(invalid_length_type_validation,
                              SchemaErrorCode::length_field_type_unsupported,
                              "messages[0].fields[0].lengthOf"));

    auto self_referencing_length = length_field;
    self_referencing_length.messages[0].fields[0].length_of = "bodyLength";
    const auto self_referencing_validation = validate(self_referencing_length);
    CHECK(contains_diagnostic(self_referencing_validation,
                              SchemaErrorCode::length_field_self_reference,
                              "messages[0].fields[0].lengthOf"));

    auto cyclic_lengths = length_field;
    cyclic_lengths.messages[0].fields = {
        {.name = "firstLength", .type = FieldType::uint8, .length_of = "secondLength"},
        {.name = "secondLength", .type = FieldType::uint8, .length_of = "firstLength"},
    };
    const auto cyclic_lengths_validation = validate(cyclic_lengths);
    CHECK(contains_diagnostic(cyclic_lengths_validation,
                              SchemaErrorCode::length_field_dependency_cycle,
                              "messages[0].fields[1].lengthOf"));
    CHECK(to_string(SchemaErrorCode::length_field_target_not_found) ==
          "length_field_target_not_found");
    CHECK(to_string(SchemaErrorCode::length_field_type_unsupported) ==
          "length_field_type_unsupported");
    CHECK(to_string(SchemaErrorCode::length_field_self_reference) == "length_field_self_reference");
    CHECK(to_string(SchemaErrorCode::length_field_dependency_cycle) ==
          "length_field_dependency_cycle");

    auto fixed_array = valid;
    fixed_array.messages[0].fields = {
        {.name = "samples",
         .type = FieldType::array,
         .element_type = FieldType::uint16,
         .count = 3},
    };
    CHECK(validate(fixed_array).ok());

    auto missing_array_element_type = fixed_array;
    missing_array_element_type.messages[0].fields[0].element_type.reset();
    CHECK(contains_diagnostic(validate(missing_array_element_type),
                              SchemaErrorCode::array_element_type_required,
                              "messages[0].fields[0].elementType"));

    auto unsupported_array_element_type = fixed_array;
    unsupported_array_element_type.messages[0].fields[0].element_type = FieldType::string;
    CHECK(contains_diagnostic(validate(unsupported_array_element_type),
                              SchemaErrorCode::array_element_type_unsupported,
                              "messages[0].fields[0].elementType"));

    auto missing_array_count = fixed_array;
    missing_array_count.messages[0].fields[0].count.reset();
    CHECK(contains_diagnostic(validate(missing_array_count), SchemaErrorCode::array_count_required,
                              "messages[0].fields[0].count"));

    auto zero_array_count = fixed_array;
    zero_array_count.messages[0].fields[0].count = 0;
    CHECK(contains_diagnostic(validate(zero_array_count), SchemaErrorCode::array_count_zero,
                              "messages[0].fields[0].count"));

    auto overflowing_array = fixed_array;
    overflowing_array.messages[0].fields[0].element_type = FieldType::uint64;
    overflowing_array.messages[0].fields[0].count = std::numeric_limits<std::size_t>::max();
    CHECK(contains_diagnostic(validate(overflowing_array), SchemaErrorCode::array_length_overflow,
                              "messages[0].fields[0].count"));

    auto array_with_length = fixed_array;
    array_with_length.messages[0].fields[0].length = 6;
    CHECK(contains_diagnostic(validate(array_with_length),
                              SchemaErrorCode::array_length_not_allowed,
                              "messages[0].fields[0].length"));

    auto scalar_with_array_metadata = valid;
    scalar_with_array_metadata.messages[0].fields[0].element_type = FieldType::uint8;
    scalar_with_array_metadata.messages[0].fields[0].count = 2;
    CHECK(contains_diagnostic(validate(scalar_with_array_metadata),
                              SchemaErrorCode::array_metadata_not_allowed,
                              "messages[0].fields[0].elementType"));
    CHECK(to_string(SchemaErrorCode::array_element_type_required) == "array_element_type_required");
    CHECK(to_string(SchemaErrorCode::array_count_required) == "array_count_required");
    CHECK(to_string(SchemaErrorCode::array_length_overflow) == "array_length_overflow");

    return failures == 0 ? 0 : 1;
}
