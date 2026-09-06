#pragma once

#include "iotps/core/result.hpp"
#include "iotps/core/schema/schema.hpp"

#include <filesystem>
#include <string>
#include <string_view>
#include <vector>

namespace iotps::core::workspace {

inline constexpr std::string_view current_project_schema_version = "0.1";

struct ProjectMetadata {
    std::string name;
    std::string display_name;
    std::string version;
    std::string description;
};

struct ProjectManifest {
    std::string schema_version{current_project_schema_version};
    ProjectMetadata metadata;
    std::vector<std::filesystem::path> protocol_files;
    std::vector<std::filesystem::path> folder_order;
};

struct ProjectProtocol {
    std::filesystem::path relative_path;
    schema::ProtocolSchema schema;
};

struct Project {
    std::filesystem::path root_directory;
    ProjectManifest manifest;
    std::vector<ProjectProtocol> protocols;
    std::vector<std::filesystem::path> folders;
};

struct ProtocolCreateRequest {
    std::string relative_path;
    schema::ProtocolMetadata protocol;
};

struct FieldDisplayNameUpdateRequest {
    std::string relative_path;
    std::string message_name;
    std::string field_name;
    std::string display_name;
};

enum class WorkspaceErrorCode {
    project_directory_not_found,
    project_manifest_open_failed,
    project_manifest_read_failed,
    yaml_parse_error,
    yaml_root_mapping_required,
    yaml_required_node_missing,
    yaml_node_type_mismatch,
    schema_version_required,
    unsupported_schema_version,
    project_name_required,
    protocol_path_empty,
    protocol_path_not_portable,
    protocol_path_outside_project,
    duplicate_protocol_path,
    protocol_file_load_failed,
    protocol_schema_invalid,
    protocol_not_referenced,
    protocol_message_not_found,
    protocol_field_not_found,
    protocol_file_already_exists,
    protocol_directory_create_failed,
    protocol_file_write_failed,
    project_manifest_write_failed,
    invalid_folder_path,
    folder_not_empty,
    workspace_operation_failed,
};

using WorkspaceDiagnostic = Error<WorkspaceErrorCode>;
using ProjectLoadResult = Result<Project, WorkspaceDiagnostic>;

[[nodiscard]] ProjectLoadResult load_project(const std::filesystem::path& project_directory);
[[nodiscard]] ProjectLoadResult create_project(const std::filesystem::path& parent_directory,
                                               std::string_view name);
[[nodiscard]] ProjectLoadResult rename_project(const std::filesystem::path& project_directory,
                                               std::string_view display_name);
// For rename, target_parent is the new single folder name; the parent stays unchanged.
[[nodiscard]] ProjectLoadResult change_folder(const std::filesystem::path& project_directory,
                                              std::string_view action, std::string_view path,
                                              std::string_view target_parent = "protocols",
                                              std::string_view before = "");
[[nodiscard]] ProjectLoadResult create_protocol(const std::filesystem::path& project_directory,
                                                const ProtocolCreateRequest& request);
[[nodiscard]] ProjectLoadResult update_protocol(const std::filesystem::path& project_directory,
                                                std::string_view relative_path,
                                                std::string_view yaml);
[[nodiscard]] ProjectLoadResult
update_field_display_name(const std::filesystem::path& project_directory,
                          const FieldDisplayNameUpdateRequest& request);
[[nodiscard]] std::string_view to_string(WorkspaceErrorCode code) noexcept;

} // namespace iotps::core::workspace
