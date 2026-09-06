#include "iotps/core/workspace/workspace.hpp"

#include <chrono>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <iterator>
#include <string_view>

#if defined(_WIN32)
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#endif

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

    // Exercise physical folder operations and persisted ordering through the same Core API as the
    // UI.
    const auto managed = temporary / "managed";
    CHECK(create_project(temporary, "managed").has_value());
    const auto managed_manifest = read_file(managed / "project.yaml");
    CHECK(!create_project(temporary, "managed").has_value());
    CHECK(read_file(managed / "project.yaml") == managed_manifest);
    CHECK(!create_project(temporary, "../escape").has_value());
    CHECK(!create_project(temporary, "CON").has_value());
    CHECK(!create_project(temporary, "trailing.").has_value());
    CHECK(change_folder(managed, "create", "protocols/a").has_value());
    CHECK(change_folder(managed, "create", "protocols/b").has_value());
    CHECK(change_folder(managed, "create", "protocols/a/nested").has_value());
    const auto nonempty = change_folder(managed, "delete", "protocols/a");
    CHECK(!nonempty.has_value());
    if (const auto* error = nonempty.error_if())
        CHECK(error->code == WorkspaceErrorCode::folder_not_empty);
    CHECK(!change_folder(managed, "delete", "protocols").has_value());
    CHECK(!change_folder(managed, "create", "protocols/../escape").has_value());
    CHECK(!change_folder(managed, "create", "protocols/a").has_value());
    CHECK(!change_folder(managed, "move", "protocols/a", "protocols/a/nested").has_value());
    CHECK(!change_folder(managed, "move", "protocols/a", "protocols", "protocols/missing")
               .has_value());
    CHECK(change_folder(managed, "move", "protocols/b", "protocols", "protocols/a").has_value());
    auto ordered = load_project(managed);
    CHECK(ordered.has_value());
    if (const auto* project = ordered.value_if()) {
        CHECK(project->folders.size() == 3);
        CHECK(project->folders[0] == "protocols/b");
        CHECK(project->manifest.folder_order[0] == "protocols/b");
    }
    CHECK(create_protocol(managed,
                          ProtocolCreateRequest{
                              .relative_path = "a/nested/sensor.protocol.yaml",
                              .protocol = {.name = "sensor", .version = "1.0"},
                          })
              .has_value());
    const auto protocol_bytes = read_file(managed / "protocols/a/nested/sensor.protocol.yaml");
    const auto moved = change_folder(managed, "move", "protocols/a", "protocols/b");
    CHECK(moved.has_value());
    CHECK(!std::filesystem::exists(managed / "protocols/a"));
    CHECK(read_file(managed / "protocols/b/a/nested/sensor.protocol.yaml") == protocol_bytes);
    if (const auto* project = moved.value_if()) {
        CHECK(project->protocols[0].relative_path == "protocols/b/a/nested/sensor.protocol.yaml");
    }
    CHECK(load_project(managed).has_value());
    CHECK(!change_folder(managed, "delete", "protocols/b/a/nested").has_value());
    CHECK(change_folder(managed, "move", "protocols/b/a", "protocols").has_value());
    CHECK(change_folder(managed, "delete", "protocols/b").has_value());
    CHECK(!std::filesystem::exists(managed / "protocols/b"));
    // Unknown contents (not just registered protocols) prevent deletion.
    CHECK(change_folder(managed, "create", "protocols/unknown").has_value());
    write_file(managed / "protocols/unknown/readme.txt", "keep me");
    CHECK(!change_folder(managed, "delete", "protocols/unknown").has_value());
    CHECK(read_file(managed / "protocols/unknown/readme.txt") == "keep me");
    // A staging file must never be overwritten; no folder movement occurs on failure.
    write_file(managed / "project.yaml.iotps.tmp", "reserved");
    CHECK(!change_folder(managed, "move", "protocols/a", "protocols/unknown").has_value());
    CHECK(std::filesystem::is_directory(managed / "protocols/a"));
    CHECK(read_file(managed / "project.yaml.iotps.tmp") == "reserved");
    std::filesystem::remove(managed / "project.yaml.iotps.tmp");

    CHECK(create_project(temporary, "中文项目").has_value());
    const auto unicode_project = temporary / std::filesystem::path{u8"中文项目"};
    CHECK(change_folder(unicode_project, "create", "protocols/设备").has_value());
    CHECK(change_folder(unicode_project, "create", "protocols/设备/数据").has_value());
    CHECK(change_folder(unicode_project, "move", "protocols/设备/数据", "protocols").has_value());
    CHECK(load_project(unicode_project).has_value());
#if defined(_WIN32)
    // Deny manifest replacement to exercise rollback after the physical folder was moved.
    const auto manifest_before_failure = read_file(managed / "project.yaml");
    const auto locked =
        CreateFileW((managed / "project.yaml").c_str(), GENERIC_READ, FILE_SHARE_READ, nullptr,
                    OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr);
    CHECK(locked != INVALID_HANDLE_VALUE);
    if (locked != INVALID_HANDLE_VALUE) {
        CHECK(!change_folder(managed, "move", "protocols/unknown", "protocols/a").has_value());
        CHECK(std::filesystem::is_directory(managed / "protocols/unknown"));
        CHECK(!std::filesystem::exists(managed / "protocols/a/unknown"));
        CHECK(read_file(managed / "project.yaml") == manifest_before_failure);
        CHECK(!std::filesystem::exists(managed / "project.yaml.iotps.tmp"));
        CloseHandle(locked);
    }
#endif
    CHECK(change_folder(managed, "create", "protocols/unknown/a").has_value());
    CHECK(!change_folder(managed, "move", "protocols/a", "protocols/unknown").has_value());

    const auto before_rename = load_project(managed);
    CHECK(before_rename.has_value());
    const auto renamed = change_folder(managed, "rename", "protocols/a", "设备");
    CHECK(renamed.has_value());
    if (const auto* project = renamed.value_if()) {
        CHECK(project->protocols[0].relative_path ==
              std::filesystem::path{u8"protocols/设备/nested/sensor.protocol.yaml"});
        CHECK(project->manifest.folder_order.size() ==
              before_rename.value().manifest.folder_order.size());
        for (std::size_t i = 0; i < project->manifest.folder_order.size(); ++i) {
            const auto& old = before_rename.value().manifest.folder_order[i];
            if (old == "protocols/a")
                CHECK(project->manifest.folder_order[i] ==
                      std::filesystem::path{u8"protocols/设备"});
        }
    }
    CHECK(read_file(managed /
                    std::filesystem::path{u8"protocols/设备/nested/sensor.protocol.yaml"}) ==
          protocol_bytes);
    CHECK(!std::filesystem::exists(managed / "protocols/a"));
    const auto before_invalid_rename = read_file(managed / "project.yaml");
    for (const auto name : {"unknown", "../outside", "CON", "trailing.", "a/b", ""})
        CHECK(!change_folder(managed, "rename", "protocols/设备", name).has_value());
    CHECK(read_file(managed / "project.yaml") == before_invalid_rename);
    CHECK(change_folder(managed, "rename", "protocols/设备", "设备").has_value());
    CHECK(change_folder(managed, "rename", "protocols/设备", "Device").has_value());
    CHECK(change_folder(managed, "rename", "protocols/Device", "device").has_value());
    CHECK(load_project(managed).has_value());

    write_file(managed / "project.yaml",
               read_file(managed / "project.yaml") + "customSetting: preserved\n");
    const auto renamed_project = rename_project(managed, "设备项目: \"Beta\"");
    CHECK(renamed_project.has_value());
    if (const auto* project = renamed_project.value_if()) {
        CHECK(project->manifest.metadata.display_name == "设备项目: \"Beta\"");
        CHECK(project->manifest.metadata.name == "managed");
        CHECK(project->root_directory == std::filesystem::canonical(managed));
    }
    CHECK(read_file(managed / "project.yaml").find("customSetting: preserved") !=
          std::string::npos);
    const auto renamed_manifest = read_file(managed / "project.yaml");
    CHECK(!rename_project(managed, "").has_value());
    CHECK(!rename_project(managed, "   ").has_value());
    CHECK(!rename_project(managed, "line\nbreak").has_value());
    CHECK(!rename_project(managed, std::string(401, 'x')).has_value());
    CHECK(read_file(managed / "project.yaml") == renamed_manifest);
    for (const auto suffix : {".iotps.tmp", ".iotps.bak"}) {
        const auto occupied = managed / (std::string{"project.yaml"} + suffix);
        write_file(occupied, "reserved");
        CHECK(!rename_project(managed, "Blocked").has_value());
        CHECK(read_file(occupied) == "reserved");
        CHECK(read_file(managed / "project.yaml") == renamed_manifest);
        std::filesystem::remove(occupied);
    }
#if defined(_WIN32)
    const auto rename_lock =
        CreateFileW((managed / "project.yaml").c_str(), GENERIC_READ, FILE_SHARE_READ, nullptr,
                    OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr);
    CHECK(rename_lock != INVALID_HANDLE_VALUE);
    if (rename_lock != INVALID_HANDLE_VALUE) {
        CHECK(!rename_project(managed, "Blocked").has_value());
        CHECK(!change_folder(managed, "rename", "protocols/device", "blocked").has_value());
        CHECK(read_file(managed / "project.yaml") == renamed_manifest);
        CHECK(std::filesystem::is_directory(managed / "protocols/device"));
        CHECK(!std::filesystem::exists(managed / "protocols/blocked"));
        CHECK(!std::filesystem::exists(managed / "project.yaml.iotps.tmp"));
        CHECK(!std::filesystem::exists(managed / "project.yaml.iotps.bak"));
        CloseHandle(rename_lock);
    }
#endif

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
