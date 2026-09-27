#include "iotps/core/workspace/workspace.hpp"

#include <chrono>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <iterator>
#include <limits>
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

    // Build a protocol entirely through the structured editor commands, then reopen it.
    const std::string editor_path = "protocols/designer.protocol.yaml";
    CHECK(create_protocol(managed, {.relative_path = "designer.protocol.yaml",
                                    .protocol = {.name = "designer", .version = "1.0"}})
              .has_value());
    const auto edit = [&](std::string action, std::string message, std::string field,
                          std::vector<std::pair<std::string, std::string>> properties = {}) {
        return edit_schema(managed, {editor_path, std::move(action), std::move(message),
                                     std::move(field), std::move(properties)});
    };
    CHECK(edit("addMessage", "", "",
               {{"name", "telemetry"}, {"displayName", "遥测"}, {"typeId", "18446744073709551615"}})
              .has_value());
    CHECK(edit("addField", "telemetry", "",
               {{"name", "payload"}, {"type", "bytes"}, {"length", "4"}, {"offset", "8"}})
              .has_value());
    CHECK(edit("addField", "telemetry", "",
               {{"name", "size"}, {"type", "uint8"}, {"lengthOf", "payload"}})
              .has_value());
    CHECK(edit("addField", "telemetry", "", {{"name", "enabled"}, {"type", "bool"}}).has_value());
    CHECK(edit("moveFieldUp", "telemetry", "size").has_value());
    const auto editor_schema = [&]() {
        auto reloaded = load_project(managed);
        CHECK(reloaded.has_value());
        return reloaded.value().protocols.back().schema;
    };
    CHECK(editor_schema().messages[0].fields[0].name == "size");
    CHECK(edit("moveFieldDown", "telemetry", "size").has_value());
    CHECK(editor_schema().messages[0].fields[1].name == "size");
    CHECK(edit("updateField", "telemetry", "payload",
               {{"name", "body: 数据"},
                {"length", "3"},
                {"offset", ""},
                {"displayName", "Body: \"data\""}})
              .has_value());
    auto edited = editor_schema();
    CHECK(edited.messages[0].fields[1].length_of == "body: 数据");
    CHECK(!edited.messages[0].fields[0].offset.has_value());
    CHECK(edited.messages[0].fields[0].display_name == "Body: \"data\"");
    CHECK(edited.messages[0].type_id == (std::numeric_limits<std::uint64_t>::max)());
    CHECK(edit("updateField", "telemetry", "enabled",
               {{"type", "uint8"}, {"enum", "Off=0\nOn=1"}}).has_value());
    CHECK(editor_schema().messages[0].fields[2].enum_values.size() == 2);
    CHECK(!edit("updateField", "telemetry", "enabled", {{"enum", "Off=0\nBad=256"}})
               .has_value());
    CHECK(!edit("updateField", "telemetry", "enabled", {{"enum", "Off=0\nOn=0"}})
               .has_value());
    CHECK(edit("updateField", "telemetry", "enabled",
               {{"type", "bool"}, {"enum", ""}}).has_value());
    const auto before_bad_edit = read_file(managed / editor_path);
    CHECK(!edit("deleteField", "telemetry", "body: 数据").has_value());
    CHECK(!edit("updateField", "telemetry", "enabled", {{"name", "size"}}).has_value());
    CHECK(!edit("updateField", "telemetry", "enabled", {{"type", "uint128"}}).has_value());
    CHECK(!edit("updateField", "telemetry", "enabled", {{"offset", "0"}}).has_value());
    CHECK(!edit("updateField", "telemetry", "enabled", {{"count", "2"}}).has_value());
    CHECK(!edit("updateField", "telemetry", "enabled",
                {{"type", "bytes"}, {"length", "18446744073709551616"}})
               .has_value());
    CHECK(!edit("updateField", "telemetry", "enabled", {{"customSetting", "bad"}}).has_value());
    CHECK(!edit("updateField", "telemetry", "enabled", {{"name", "one"}, {"name", "two"}})
               .has_value());
    CHECK(!edit("addMessage", "", "", {{"name", "telemetry"}}).has_value());
    CHECK(!edit("addMessage", "", "", {{"name", "   "}}).has_value());
    CHECK(!edit("addMessage", "", "", {{"name", "duplicateId"}, {"typeId", "18446744073709551615"}})
               .has_value());
    CHECK(!edit("unknown", "telemetry", "").has_value());
    CHECK(!edit("deleteField", "telemetry", "enabled", {{"name", "bad"}}).has_value());
    CHECK(!edit_schema(managed,
                       {"protocols/orphan.protocol.yaml", "addMessage", "", "", {{"name", "bad"}}})
               .has_value());
    CHECK(read_file(managed / editor_path) == before_bad_edit);
    CHECK(edit("updateField", "telemetry", "size",
               {{"lengthOf", ""}, {"type", "string"}, {"length", "2"}})
              .has_value());
    CHECK(edit("deleteField", "telemetry", "body: 数据").has_value());
    CHECK(edit("addField", "telemetry", "",
               {{"name", "samples"},
                {"type", "array"},
                {"elementType", "int16"},
                {"count", "3"},
                {"endian", "little"}})
              .has_value());
    CHECK(edit("updateField", "telemetry", "samples",
               {{"type", "uint32"}, {"elementType", ""}, {"count", ""}, {"endian", ""}})
              .has_value());
    edited = editor_schema();
    CHECK(!edited.messages[0].fields.back().element_type.has_value());
    CHECK(!edited.messages[0].fields.back().count.has_value());
    CHECK(!edited.messages[0].fields.back().byte_order.has_value());
    CHECK(edit("moveFieldDown", "telemetry", "samples").has_value());
    CHECK(edit("moveFieldUp", "telemetry", "size").has_value());
    CHECK(edit("addMessage", "", "", {{"name", "other"}}).has_value());
    CHECK(!edit("updateMessage", "telemetry", "", {{"name", "other"}}).has_value());
    CHECK(edit("updateMessage", "telemetry", "",
               {{"name", "遥测: v2"}, {"displayName", ""}, {"typeId", ""}})
              .has_value());
    edited = editor_schema();
    CHECK(edited.messages[0].name == "遥测: v2");
    CHECK(edited.messages[0].display_name.empty());
    CHECK(!edited.messages[0].type_id.has_value());
    CHECK(edited.messages[0].fields.size() == 3);
    const auto before_blocked_edit = read_file(managed / editor_path);
    write_file(managed / (editor_path + ".iotps.tmp"), "reserved");
    CHECK(!edit("deleteMessage", "遥测: v2", "").has_value());
    CHECK(read_file(managed / editor_path) == before_blocked_edit);
    std::filesystem::remove(managed / (editor_path + ".iotps.tmp"));
    CHECK(edit("deleteMessage", "遥测: v2", "").has_value());
    CHECK(edit("deleteMessage", "other", "").has_value());
    CHECK(editor_schema().messages.empty());

    // Template drafts round-trip exactly; schema compatibility and persistence failures are safe.
    CHECK(edit("addMessage", "", "", {{"name", "saved"}}).has_value());
    CHECK(edit("addField", "saved", "", {{"name", "number"}, {"type", "uint64"}}).has_value());
    CHECK(edit("addField", "saved", "", {{"name", "text"}, {"type", "string"}, {"length", "4"}})
              .has_value());
    CHECK(
        edit("addField", "saved", "", {{"name", "length"}, {"type", "uint8"}, {"lengthOf", "text"}})
            .has_value());
    const auto templates = [&](std::string_view action, std::string_view name = "draft",
                               std::vector<std::pair<std::string, std::string>> fields = {}) {
        return message_templates(managed, action, editor_path, "saved", name, fields);
    };
    const auto templates_path = managed / "message-templates.yaml";
    CHECK(templates("list").value().empty());
    CHECK(!std::filesystem::exists(templates_path));
    CHECK(templates("save", "草稿: v1",
                    {{"number", "18446744073709551615"}, {"text", "值: \"hi\"\n"}})
              .has_value());
    auto template_list = templates("list");
    if (const auto* error = template_list.error_if()) {
        std::cerr << "template round trip: " << error->detail << '\n';
        return 1;
    }
    CHECK(template_list.has_value() && template_list.value().size() == 1);
    CHECK(template_list.value()[0].compatible);
    CHECK(templates("load", "草稿: v1").value()[0].fields[0].value == "18446744073709551615");
    CHECK(templates("load", "草稿: v1").value()[0].fields[1].value == "值: \"hi\"\n");
    const auto saved_templates = read_file(templates_path);
    CHECK(!templates("save", "草稿: v1", {{"number", "0"}, {"text", ""}}).has_value());
    CHECK(!templates("save", "bad", {{"number", "0"}, {"number", "1"}}).has_value());
    CHECK(!templates("save", "bad", {{"number", "0"}, {"length", "1"}}).has_value());
    CHECK(!templates("save", "bad", {{"number", "0"}}).has_value());
    CHECK(!templates("delete", "missing").has_value());
    CHECK(!templates("load", "missing").has_value());
    CHECK(!templates("unknown").has_value());
    CHECK(!templates("save", " ", {{"number", "0"}, {"text", ""}}).has_value());
    CHECK(read_file(templates_path) == saved_templates);
    CHECK(edit("updateField", "saved", "number", {{"type", "uint32"}}).has_value());
    CHECK(!templates("list").value()[0].compatible);
    CHECK(!templates("load", "草稿: v1").has_value());
    CHECK(read_file(templates_path) == saved_templates);
    CHECK(templates("replace", "草稿: v1", {{"number", ""}, {"text", std::string{"a\0b", 3}}})
              .has_value());
    CHECK(templates("load", "草稿: v1").value()[0].fields[0].value.empty());
    CHECK(templates("load", "草稿: v1").value()[0].fields[1].value == std::string("a\0b", 3));
    const auto replaced_templates = read_file(templates_path);
    write_file(managed / "message-templates.yaml.iotps.tmp", "reserved");
    CHECK(!templates("delete", "草稿: v1").has_value());
    CHECK(read_file(templates_path) == replaced_templates);
    std::filesystem::remove(managed / "message-templates.yaml.iotps.tmp");
    write_file(templates_path, "version: 99\ntemplates: []\n");
    CHECK(!templates("save", "new", {{"number", "0"}, {"text", ""}}).has_value());
    CHECK(read_file(templates_path) == "version: 99\ntemplates: []\n");
    write_file(templates_path, "version: 1\ntemplates: [broken]\n");
    CHECK(!templates("list").has_value());
    write_file(templates_path, replaced_templates);
    CHECK(edit("addMessage", "", "", {{"name", "other"}}).has_value());
    CHECK(message_templates(managed, "save", editor_path, "other", "草稿: v1").has_value());
    CHECK(templates("list").value().size() == 1);
    CHECK(!message_templates(managed, "list", "protocols/missing.yaml", "saved").has_value());
    CHECK(templates("delete", "草稿: v1").has_value());
    CHECK(templates("list").value().empty());
    CHECK(message_templates(managed, "list", editor_path, "other").value().size() == 1);

    // Protocol display renames retain paths; batch deletion validates the entire set first.
    CHECK(rename_protocol(managed, editor_path, "重命名: 协议").has_value());
    CHECK(editor_schema().protocol.display_name == "重命名: 协议");
    CHECK(!rename_protocol(managed, editor_path, " ").has_value());
    CHECK(!rename_protocol(managed, "protocols/missing.yaml", "name").has_value());
    const auto before_delete = read_file(managed / "project.yaml");
    const auto before_protocol_delete = read_file(managed / editor_path);
    CHECK(!delete_protocols(managed, {}).has_value());
    CHECK(!delete_protocols(managed, {editor_path, editor_path}).has_value());
    CHECK(!delete_protocols(managed, {editor_path, "../outside.yaml"}).has_value());
    CHECK(!delete_protocols(managed, {editor_path, "protocols/missing.yaml"}).has_value());
    CHECK(read_file(managed / "project.yaml") == before_delete);
    CHECK(read_file(managed / editor_path) == before_protocol_delete);
    write_file(managed / "project.yaml.iotps.tmp", "reserved");
    CHECK(!delete_protocols(managed, {editor_path}).has_value());
    CHECK(read_file(managed / editor_path) == before_protocol_delete);
    std::filesystem::remove(managed / "project.yaml.iotps.tmp");
    CHECK(create_protocol(managed, {.relative_path = "delete-second.protocol.yaml",
                                    .protocol = {.name = "second", .version = "1.0"}})
              .has_value());
    write_file(managed / "protocols/delete-second.protocol.yaml.iotps.deleted", "reserved");
    CHECK(!delete_protocols(managed, {editor_path, "protocols/delete-second.protocol.yaml"})
               .has_value());
    CHECK(read_file(managed / editor_path) == before_protocol_delete);
    std::filesystem::remove(managed / "protocols/delete-second.protocol.yaml.iotps.deleted");
#if defined(_WIN32)
    const auto delete_manifest = read_file(managed / "project.yaml");
    const auto delete_lock =
        CreateFileW((managed / "project.yaml").c_str(), GENERIC_READ, FILE_SHARE_READ, nullptr,
                    OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr);
    CHECK(delete_lock != INVALID_HANDLE_VALUE);
    if (delete_lock != INVALID_HANDLE_VALUE) {
        CHECK(!delete_protocols(managed, {editor_path, "protocols/delete-second.protocol.yaml"})
                   .has_value());
        CHECK(read_file(managed / "project.yaml") == delete_manifest);
        CHECK(read_file(managed / editor_path) == before_protocol_delete);
        CHECK(std::filesystem::exists(managed / "protocols/delete-second.protocol.yaml"));
        CHECK(!std::filesystem::exists(managed / (editor_path + ".iotps.deleted")));
        CloseHandle(delete_lock);
    }
#endif
    CHECK(delete_protocols(managed, {editor_path, "protocols/delete-second.protocol.yaml"})
              .has_value());
    CHECK(!std::filesystem::exists(managed / editor_path));
    CHECK(!std::filesystem::exists(managed / "protocols/delete-second.protocol.yaml"));
    CHECK(load_project(managed).has_value());

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
