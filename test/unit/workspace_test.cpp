#include "iotps/core/workspace/workspace.hpp"

#include <chrono>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <iterator>
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

void write_file(const std::filesystem::path& path, const std::string_view contents) {
    std::filesystem::create_directories(path.parent_path());
    std::ofstream output{path, std::ios::binary};
    output << contents;
}

std::string read_file(const std::filesystem::path& path) {
    std::ifstream input{path, std::ios::binary};
    return {std::istreambuf_iterator<char>{input}, std::istreambuf_iterator<char>{}};
}

} // namespace

int main() {
    using namespace iotps::core::workspace;

    const auto vector_directory = std::filesystem::path{IOTPS_TEST_VECTOR_DIR};
    const auto loaded = load_project(vector_directory / "project" / "smart-sensor");
    CHECK(loaded.has_value());
    if (const auto* project = loaded.value_if()) {
        CHECK(project->manifest.schema_version == "0.1");
        CHECK(project->manifest.metadata.name == "smart-sensor-studio");
        CHECK(project->manifest.metadata.display_name == "Smart Sensor Studio");
        CHECK(project->manifest.protocol_files.size() == 1);
        CHECK(project->protocols.size() == 1);
        if (!project->protocols.empty()) {
            CHECK(project->protocols[0].relative_path.generic_string() ==
                  "protocols/smart-sensor.protocol.yaml");
            CHECK(project->protocols[0].schema.protocol.name == "smart-sensor");
        }
    }

    const auto missing_manifest = load_project(vector_directory);
    CHECK(!missing_manifest.has_value());
    if (const auto* error = missing_manifest.error_if()) {
        CHECK(error->code == WorkspaceErrorCode::project_manifest_open_failed);
        CHECK(error->path == "$file");
    }

    const auto unique = std::chrono::steady_clock::now().time_since_epoch().count();
    const auto temporary =
        std::filesystem::temp_directory_path() / ("iotps-workspace-test-" + std::to_string(unique));
    std::filesystem::create_directories(temporary / "protocols");

    write_file(temporary / "project.yaml", R"yaml(schemaVersion: "9.9"
project:
  name: invalid-version
protocols: []
)yaml");
    const auto unsupported_version = load_project(temporary);
    CHECK(!unsupported_version.has_value());
    if (const auto* error = unsupported_version.error_if()) {
        CHECK(error->code == WorkspaceErrorCode::unsupported_schema_version);
        CHECK(error->path == "schemaVersion");
        CHECK(error->source_location.has_value());
    }

    write_file(temporary / "project.yaml", R"yaml(schemaVersion: "0.1"
project: {}
protocols: []
)yaml");
    const auto missing_name = load_project(temporary);
    CHECK(!missing_name.has_value());
    if (const auto* error = missing_name.error_if()) {
        CHECK(error->code == WorkspaceErrorCode::project_name_required);
        CHECK(error->path == "project.name");
    }

    write_file(temporary / "project.yaml", R"yaml(schemaVersion: "0.1"
project:
  name: empty-project
protocols: []
)yaml");
    const auto empty_project = load_project(temporary);
    CHECK(empty_project.has_value());
    if (const auto* project = empty_project.value_if()) {
        CHECK(project->protocols.empty());
    }

    write_file(temporary / "project.yaml", R"yaml(schemaVersion: "0.1"
project:
  name: nonportable-project
protocols:
  - protocols\device.yaml
)yaml");
    const auto nonportable_path = load_project(temporary);
    CHECK(!nonportable_path.has_value());
    if (const auto* error = nonportable_path.error_if()) {
        CHECK(error->code == WorkspaceErrorCode::protocol_path_not_portable);
        CHECK(error->path == "protocols[0]");
    }

    write_file(temporary / "project.yaml", R"yaml(schemaVersion: "0.1"
project:
  name: escaped-project
protocols:
  - ../outside.yaml
)yaml");
    const auto escaped_path = load_project(temporary);
    CHECK(!escaped_path.has_value());
    if (const auto* error = escaped_path.error_if()) {
        CHECK(error->code == WorkspaceErrorCode::protocol_path_outside_project);
        CHECK(error->path == "protocols[0]");
    }

    write_file(temporary / "project.yaml", R"yaml(schemaVersion: "0.1"
project:
  name: duplicate-project
protocols:
  - protocols/device.yaml
  - protocols/./device.yaml
)yaml");
    const auto duplicate_path = load_project(temporary);
    CHECK(!duplicate_path.has_value());
    if (const auto* error = duplicate_path.error_if()) {
        CHECK(error->code == WorkspaceErrorCode::duplicate_protocol_path);
        CHECK(error->path == "protocols[1]");
    }

    write_file(temporary / "project.yaml", R"yaml(schemaVersion: "0.1"
project:
  name: missing-protocol-project
protocols:
  - protocols/missing.protocol.yaml
)yaml");
    const auto missing_protocol = load_project(temporary);
    CHECK(!missing_protocol.has_value());
    if (const auto* error = missing_protocol.error_if()) {
        CHECK(error->code == WorkspaceErrorCode::protocol_file_load_failed);
        CHECK(error->path == "protocols[0]");
    }

    write_file(temporary / "project.yaml", R"yaml(schemaVersion: "0.1"
project:
  name: invalid-schema-project
protocols:
  - protocols/invalid.protocol.yaml
)yaml");
    write_file(temporary / "protocols" / "invalid.protocol.yaml",
               R"yaml(schemaVersion: "0.1"
protocol:
  name: invalid
  version: "1.0"
messages:
  telemetry:
    fields:
      - name: value
        type: uint128
)yaml");
    const auto invalid_schema = load_project(temporary);
    CHECK(!invalid_schema.has_value());
    if (const auto* error = invalid_schema.error_if()) {
        CHECK(error->code == WorkspaceErrorCode::protocol_schema_invalid);
        CHECK(error->path == "protocols[0]");
        CHECK(error->source_location.has_value());
        CHECK(error->detail.find("yaml_unknown_field_type") != std::string::npos);
    }

    std::filesystem::remove_all(temporary / "protocols");
    write_file(temporary / "project.yaml", R"yaml(schemaVersion: "0.1"
project:
  name: protocol-creation-project
protocols: []
customSetting: preserved
)yaml");
    const auto original_manifest = read_file(temporary / "project.yaml");

    const auto invalid_metadata =
        create_protocol(temporary, ProtocolCreateRequest{
                                       .relative_path = "invalid.protocol.yaml",
                                       .protocol = {.name = "", .version = "1.0"},
                                   });
    CHECK(!invalid_metadata.has_value());
    if (const auto* error = invalid_metadata.error_if()) {
        CHECK(error->code == WorkspaceErrorCode::protocol_schema_invalid);
        CHECK(error->path == "$request.protocol");
    }
    CHECK(read_file(temporary / "project.yaml") == original_manifest);
    CHECK(!std::filesystem::exists(temporary / "protocols" / "invalid.protocol.yaml"));

    const auto escaped_create =
        create_protocol(temporary, ProtocolCreateRequest{
                                       .relative_path = "../escaped.protocol.yaml",
                                       .protocol = {.name = "escaped", .version = "1.0"},
                                   });
    CHECK(!escaped_create.has_value());
    if (const auto* error = escaped_create.error_if()) {
        CHECK(error->code == WorkspaceErrorCode::protocol_path_outside_project);
        CHECK(error->path == "$request.relativePath");
    }
    CHECK(!std::filesystem::exists(temporary / "escaped.protocol.yaml"));

    const auto nonportable_create =
        create_protocol(temporary, ProtocolCreateRequest{
                                       .relative_path = "vendor\\device.protocol.yaml",
                                       .protocol = {.name = "nonportable", .version = "1.0"},
                                   });
    CHECK(!nonportable_create.has_value());
    if (const auto* error = nonportable_create.error_if()) {
        CHECK(error->code == WorkspaceErrorCode::protocol_path_not_portable);
    }

    const ProtocolCreateRequest request{
        .relative_path = "vendors/acme/telemetry.protocol.yaml",
        .protocol =
            {
                .name = "acme-telemetry",
                .display_name = "ACME \"Telemetry\"",
                .version = "1.0",
                .description = "Created: nested protocol",
                .default_byte_order = iotps::core::schema::ByteOrder::little_endian,
            },
    };
    const auto created = create_protocol(temporary, request);
    CHECK(created.has_value());
    if (const auto* error = created.error_if()) {
        std::cerr << "create_protocol failed: " << to_string(error->code) << ": " << error->detail
                  << '\n';
    }
    if (const auto* project = created.value_if()) {
        CHECK(project->protocols.size() == 1);
        if (!project->protocols.empty()) {
            CHECK(project->protocols[0].relative_path.generic_string() ==
                  "protocols/vendors/acme/telemetry.protocol.yaml");
            CHECK(project->protocols[0].schema.protocol.name == "acme-telemetry");
            CHECK(project->protocols[0].schema.protocol.display_name == "ACME \"Telemetry\"");
            CHECK(project->protocols[0].schema.protocol.default_byte_order ==
                  iotps::core::schema::ByteOrder::little_endian);
        }
    }
    CHECK(std::filesystem::is_regular_file(temporary / "protocols" / "vendors" / "acme" /
                                           "telemetry.protocol.yaml"));
    CHECK(read_file(temporary / "project.yaml").find("customSetting: preserved") !=
          std::string::npos);

    const auto protocol_path =
        temporary / "protocols" / "vendors" / "acme" / "telemetry.protocol.yaml";
    const auto original_protocol = read_file(protocol_path);
    const auto invalid_update =
        update_protocol(temporary, "protocols/vendors/acme/telemetry.protocol.yaml",
                        R"yaml(schemaVersion: "0.1"
protocol:
  name: invalid-update
  version: "1.0"
messages:
  telemetry:
    fields:
      - name: value
        type: uint128
)yaml");
    CHECK(!invalid_update.has_value());
    if (const auto* error = invalid_update.error_if()) {
        CHECK(error->code == WorkspaceErrorCode::protocol_schema_invalid);
        CHECK(error->path == "messages.telemetry.fields[0].type");
        CHECK(error->source_location.has_value());
    }
    CHECK(read_file(protocol_path) == original_protocol);

    const auto updated =
        update_protocol(temporary, "protocols/vendors/acme/telemetry.protocol.yaml",
                        R"yaml(schemaVersion: "0.1"
protocol:
  name: updated-telemetry
  displayName: Updated Telemetry
  version: "2.0"
  defaultByteOrder: big
messages:
  telemetry:
    displayName: Telemetry
    fields:
      - name: temperature
        displayName: Temperature
        type: int16
        customSetting: preserved
)yaml");
    CHECK(updated.has_value());
    if (const auto* project = updated.value_if()) {
        CHECK(project->protocols[0].schema.protocol.name == "updated-telemetry");
        CHECK(project->protocols[0].schema.protocol.version == "2.0");
    }
    CHECK(read_file(protocol_path).find("updated-telemetry") != std::string::npos);
    CHECK(!std::filesystem::exists(protocol_path.string() + ".iotps.tmp"));
    CHECK(!std::filesystem::exists(protocol_path.string() + ".iotps.bak"));

    const auto field_updated = update_field_display_name(
        temporary, {
                       .relative_path = "protocols/vendors/acme/telemetry.protocol.yaml",
                       .message_name = "telemetry",
                       .field_name = "temperature",
                       .display_name = "Ambient: \"Temperature\"",
                   });
    CHECK(field_updated.has_value());
    if (const auto* project = field_updated.value_if()) {
        CHECK(project->protocols[0].schema.messages[0].fields[0].display_name ==
              "Ambient: \"Temperature\"");
    }
    const auto field_updated_yaml = read_file(protocol_path);
    CHECK(field_updated_yaml.find("customSetting: preserved") != std::string::npos);
    CHECK(field_updated_yaml.find("Ambient: ") != std::string::npos);

    const auto before_missing_updates = read_file(protocol_path);
    const auto missing_message = update_field_display_name(
        temporary, {
                       .relative_path = "protocols/vendors/acme/telemetry.protocol.yaml",
                       .message_name = "missing",
                       .field_name = "temperature",
                       .display_name = "Ignored",
                   });
    CHECK(!missing_message.has_value());
    if (const auto* error = missing_message.error_if()) {
        CHECK(error->code == WorkspaceErrorCode::protocol_message_not_found);
        CHECK(error->path == "$request.messageName");
    }
    const auto missing_field = update_field_display_name(
        temporary, {
                       .relative_path = "protocols/vendors/acme/telemetry.protocol.yaml",
                       .message_name = "telemetry",
                       .field_name = "missing",
                       .display_name = "Ignored",
                   });
    CHECK(!missing_field.has_value());
    if (const auto* error = missing_field.error_if()) {
        CHECK(error->code == WorkspaceErrorCode::protocol_field_not_found);
        CHECK(error->path == "$request.fieldName");
    }
    CHECK(read_file(protocol_path) == before_missing_updates);

    write_file(protocol_path.string() + ".iotps.tmp", "occupied");
    const auto blocked_update = update_field_display_name(
        temporary, {
                       .relative_path = "protocols/vendors/acme/telemetry.protocol.yaml",
                       .message_name = "telemetry",
                       .field_name = "temperature",
                       .display_name = "Blocked",
                   });
    CHECK(!blocked_update.has_value());
    if (const auto* error = blocked_update.error_if()) {
        CHECK(error->code == WorkspaceErrorCode::protocol_file_write_failed);
    }
    CHECK(read_file(protocol_path) == before_missing_updates);
    std::filesystem::remove(protocol_path.string() + ".iotps.tmp");

    const auto unreferenced_update =
        update_protocol(temporary, "protocols/orphan.protocol.yaml", original_protocol);
    CHECK(!unreferenced_update.has_value());
    if (const auto* error = unreferenced_update.error_if()) {
        CHECK(error->code == WorkspaceErrorCode::protocol_not_referenced);
    }

    const auto duplicate_create = create_protocol(temporary, request);
    CHECK(!duplicate_create.has_value());
    if (const auto* error = duplicate_create.error_if()) {
        CHECK(error->code == WorkspaceErrorCode::duplicate_protocol_path);
    }

    write_file(temporary / "protocols" / "orphan.protocol.yaml", "already exists");
    const auto existing_file =
        create_protocol(temporary, ProtocolCreateRequest{
                                       .relative_path = "orphan.protocol.yaml",
                                       .protocol = {.name = "orphan", .version = "1.0"},
                                   });
    CHECK(!existing_file.has_value());
    if (const auto* error = existing_file.error_if()) {
        CHECK(error->code == WorkspaceErrorCode::protocol_file_already_exists);
    }

    std::error_code cleanup_error;
    std::filesystem::remove_all(temporary, cleanup_error);
    CHECK(!cleanup_error);
    CHECK(to_string(WorkspaceErrorCode::duplicate_protocol_path) == "duplicate_protocol_path");
    CHECK(to_string(WorkspaceErrorCode::protocol_file_already_exists) ==
          "protocol_file_already_exists");
    CHECK(to_string(WorkspaceErrorCode::protocol_not_referenced) == "protocol_not_referenced");
    CHECK(to_string(WorkspaceErrorCode::protocol_message_not_found) ==
          "protocol_message_not_found");
    CHECK(to_string(WorkspaceErrorCode::protocol_field_not_found) == "protocol_field_not_found");

    return failures == 0 ? 0 : 1;
}
