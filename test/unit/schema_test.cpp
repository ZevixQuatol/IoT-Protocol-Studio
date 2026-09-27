#include "iotps/core/schema/schema.hpp"

#include <algorithm>
#include <array>
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
    CHECK(to_string(ByteOrder::big_endian) == "big");
    CHECK(to_string(ByteOrder::little_endian) == "little");
    CHECK(to_string(FieldType::int32) == "int32");
    CHECK(wire_size(valid.messages[0].fields[0]) == 1);
    auto enumerated = valid;
    auto& enum_field = enumerated.messages[0].fields[0];
    enum_field.enum_values = {{"Off", "0"}, {"On", "1"}};
    CHECK(validate(enumerated).ok());
    CHECK(enum_name(enum_field, "1") == "On");
    CHECK(!enum_name(enum_field, "9").has_value());
    enum_field.enum_values[1].value = "256";
    CHECK(contains_diagnostic(validate(enumerated), SchemaErrorCode::enum_value_invalid,
                              "messages[0].fields[0].enum"));
    enum_field.enum_values[1].value = "0";
    CHECK(contains_diagnostic(validate(enumerated), SchemaErrorCode::enum_duplicate_value,
                              "messages[0].fields[0].enum"));
    enum_field.enum_values[1] = {"On", "1"};
    enum_field.type = FieldType::float32;
    CHECK(contains_diagnostic(validate(enumerated), SchemaErrorCode::enum_type_unsupported,
                              "messages[0].fields[0].enum"));
    enum_field.type = FieldType::int8;
    enum_field.enum_values = {{"Minimum", "-128"}};
    CHECK(validate(enumerated).ok());
    enum_field.enum_values[0].value = "-129";
    CHECK(contains_diagnostic(validate(enumerated), SchemaErrorCode::enum_value_invalid,
                              "messages[0].fields[0].enum"));
    enum_field.type = FieldType::uint64;
    enum_field.enum_values = {{"Maximum", "18446744073709551615"}};
    CHECK(validate(enumerated).ok());

    auto matching = valid;
    matching.protocol.message_type_field = "command";
    matching.messages.push_back({.name = "reply",
                                 .type_id = 2,
                                 .fields = {{.name = "prefix", .type = FieldType::uint8},
                                            {.name = "command", .type = FieldType::uint8}}});
    const std::array<std::uint8_t, 2> first{1, 9}, second{9, 2}, unknown{9, 9}, conflict{1, 2};
    const std::array<std::uint8_t, 1> short_frame{1};
    CHECK(validate(matching).ok());
    CHECK(identify_message(matching, first).message == "telemetry");
    CHECK(identify_message(matching, second).message == "reply");
    CHECK(identify_message(matching, unknown).status == MatchStatus::unknown);
    CHECK(identify_message(matching, conflict).status == MatchStatus::ambiguous);
    CHECK(identify_message(matching, short_frame).status == MatchStatus::incomplete);
    auto little = valid;
    little.protocol.message_type_field = "command";
    little.messages[0].type_id = 0x1234;
    little.messages[0].fields[0].type = FieldType::uint16;
    little.messages[0].fields[0].byte_order = ByteOrder::little_endian;
    const std::array<std::uint8_t, 2> little_frame{0x34, 0x12};
    CHECK(validate(little).ok());
    CHECK(identify_message(little, little_frame).message == "telemetry");
    matching.messages[1].fields[1].name = "other";
    CHECK(contains_diagnostic(validate(matching), SchemaErrorCode::message_type_field_not_found,
                              "messages[1].fields"));
    matching.messages[1].fields[1].name = "command";
    matching.messages[1].type_id = 256;
    CHECK(contains_diagnostic(validate(matching), SchemaErrorCode::message_type_id_out_of_range,
                              "messages[1].typeId"));
    matching.messages[1].type_id.reset();
    CHECK(contains_diagnostic(validate(matching), SchemaErrorCode::message_type_id_required,
                              "messages[1].typeId"));

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
    CHECK(to_string(FieldType::array) == "array");
    CHECK(wire_size(fixed_array.messages[0].fields[0]) == 6);

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
