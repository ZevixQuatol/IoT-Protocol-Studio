#include "iotps/core/workspace/workspace.hpp"

#include "iotps/core/schema/loader.hpp"

#include <fstream>
#include <optional>
#include <ryml.hpp>
#include <set>
#include <sstream>
#include <string>
#include <utility>

namespace iotps::core::workspace {
namespace {

[[noreturn]] void throw_basic(const ryml::csubstr message, const ryml::ErrorDataBasic& error,
                              void*) {
    throw ryml::ExceptionBasic{message, error};
}

[[noreturn]] void throw_parse(const ryml::csubstr message, const ryml::ErrorDataParse& error,
                              void*) {
    throw ryml::ExceptionParse{message, error};
}

[[noreturn]] void throw_visit(const ryml::csubstr message, const ryml::ErrorDataVisit& error,
                              void*) {
    throw ryml::ExceptionVisit{message, error};
}

ryml::Callbacks loader_callbacks() {
    auto callbacks = ryml::Callbacks{};
    callbacks.set_error_basic(throw_basic);
    callbacks.set_error_parse(throw_parse);
    callbacks.set_error_visit(throw_visit);
    return callbacks;
}

std::string to_string(const ryml::csubstr value) {
    return {value.str, value.len};
}

std::string scalar(const ryml::ConstNodeRef node) {
    return to_string(node.val());
}

void attach_source(WorkspaceDiagnostic& error, const ryml::ConstNodeRef node,
                   const ryml::Parser& parser) {
    const auto location = node.location(parser);
    error.offset = location.offset;
    error.source_location = SourceLocation{
        .source = to_string(location.name),
        .line = location.line + 1,
        .column = location.col + 1,
    };
}

WorkspaceDiagnostic make_error(const WorkspaceErrorCode code, std::string path, std::string detail,
                               const ryml::ConstNodeRef node, const ryml::Parser& parser) {
    WorkspaceDiagnostic error{
        .code = code,
        .path = std::move(path),
        .detail = std::move(detail),
    };
    attach_source(error, node, parser);
    return error;
}

std::optional<WorkspaceDiagnostic> require_mapping(const ryml::ConstNodeRef node,
                                                   const std::string_view path,
                                                   const ryml::Parser& parser) {
    if (node.is_map()) {
        return std::nullopt;
    }
    return make_error(WorkspaceErrorCode::yaml_node_type_mismatch, std::string{path},
                      "YAML node '" + std::string{path} + "' must be a mapping", node, parser);
}

std::optional<WorkspaceDiagnostic> require_sequence(const ryml::ConstNodeRef node,
                                                    const std::string_view path,
                                                    const ryml::Parser& parser) {
    if (node.is_seq()) {
        return std::nullopt;
    }
    return make_error(WorkspaceErrorCode::yaml_node_type_mismatch, std::string{path},
                      "YAML node '" + std::string{path} + "' must be a sequence", node, parser);
}

std::optional<WorkspaceDiagnostic> require_scalar(const ryml::ConstNodeRef node,
                                                  const std::string_view path,
                                                  const ryml::Parser& parser) {
    if (node.has_val() && !node.is_container()) {
        return std::nullopt;
    }
    return make_error(WorkspaceErrorCode::yaml_node_type_mismatch, std::string{path},
                      "YAML node '" + std::string{path} + "' must be a scalar", node, parser);
}

WorkspaceDiagnostic missing_node(const std::string_view path, const std::string_view kind,
                                 const ryml::ConstNodeRef parent, const ryml::Parser& parser) {
    return make_error(WorkspaceErrorCode::yaml_required_node_missing, std::string{path},
                      "required YAML " + std::string{kind} + " '" + std::string{path} +
                          "' is missing",
                      parent, parser);
}

Result<ProjectManifest, WorkspaceDiagnostic> load_manifest(const std::string_view yaml,
                                                           std::string source_name) {
    try {
        ryml::EventHandlerTree event_handler{loader_callbacks()};
        ryml::Parser parser(&event_handler, ryml::ParserOptions{}.locations(true));
        const auto tree = ryml::parse_in_arena(&parser, {source_name.data(), source_name.size()},
                                               {yaml.data(), yaml.size()});
        const auto root = tree.rootref();
        if (!root.is_map()) {
            return make_error(WorkspaceErrorCode::yaml_root_mapping_required, "$",
                              "YAML document root must be a mapping", root, parser);
        }
        if (!root.has_child("schemaVersion")) {
            return make_error(WorkspaceErrorCode::schema_version_required, "schemaVersion",
                              "required YAML scalar 'schemaVersion' is missing", root, parser);
        }
        const auto schema_version = root["schemaVersion"];
        if (const auto error = require_scalar(schema_version, "schemaVersion", parser)) {
            return *error;
        }
        if (scalar(schema_version) != current_project_schema_version) {
            return make_error(WorkspaceErrorCode::unsupported_schema_version, "schemaVersion",
                              "unsupported project schema version '" + scalar(schema_version) + "'",
                              schema_version, parser);
        }
        if (!root.has_child("project")) {
            return missing_node("project", "mapping", root, parser);
        }
        const auto project = root["project"];
        if (const auto error = require_mapping(project, "project", parser)) {
            return *error;
        }
        if (!project.has_child("name")) {
            return make_error(WorkspaceErrorCode::project_name_required, "project.name",
                              "required YAML scalar 'project.name' is missing", project, parser);
        }
        const auto project_name = project["name"];
        if (const auto error = require_scalar(project_name, "project.name", parser)) {
            return *error;
        }
        if (scalar(project_name).empty()) {
            return make_error(WorkspaceErrorCode::project_name_required, "project.name",
                              "project name must not be empty", project_name, parser);
        }
        if (!root.has_child("protocols")) {
            return missing_node("protocols", "sequence", root, parser);
        }
        const auto protocols = root["protocols"];
        if (const auto error = require_sequence(protocols, "protocols", parser)) {
            return *error;
        }

        ProjectManifest manifest{
            .schema_version = scalar(schema_version),
            .metadata = {.name = scalar(project_name)},
        };
        for (const auto key : {"displayName", "version", "description"}) {
            if (!project.has_child(key)) {
                continue;
            }
            const auto node = project[key];
            const auto path = "project." + std::string{key};
            if (const auto error = require_scalar(node, path, parser)) {
                return *error;
            }
            if (std::string_view{key} == "displayName") {
                manifest.metadata.display_name = scalar(node);
            } else if (std::string_view{key} == "version") {
                manifest.metadata.version = scalar(node);
            } else {
                manifest.metadata.description = scalar(node);
            }
        }

        std::set<std::string> unique_paths;
        std::size_t index = 0;
        for (const auto protocol : protocols.children()) {
            const auto path = "protocols[" + std::to_string(index) + "]";
            if (const auto error = require_scalar(protocol, path, parser)) {
                return *error;
            }
            const auto value = scalar(protocol);
            if (value.empty()) {
                return make_error(WorkspaceErrorCode::protocol_path_empty, path,
                                  "protocol path must not be empty", protocol, parser);
            }
            if (value.find('\\') != std::string::npos) {
                return make_error(WorkspaceErrorCode::protocol_path_not_portable, path,
                                  "project paths must use '/' separators", protocol, parser);
            }
            auto relative_path = std::filesystem::u8path(value).lexically_normal();
            auto component = relative_path.begin();
            if (relative_path.is_absolute() || relative_path.has_root_name() ||
                relative_path.has_root_directory() || component == relative_path.end() ||
                component->generic_string() != "protocols" || ++component == relative_path.end()) {
                return make_error(WorkspaceErrorCode::protocol_path_outside_project, path,
                                  "protocol path must name a file under 'protocols/'", protocol,
                                  parser);
            }
            for (const auto& part : relative_path) {
                if (part == "..") {
                    return make_error(WorkspaceErrorCode::protocol_path_outside_project, path,
                                      "protocol path must not leave the project directory",
                                      protocol, parser);
                }
            }
            const auto portable_path = relative_path.generic_string();
            if (!unique_paths.insert(portable_path).second) {
                return make_error(WorkspaceErrorCode::duplicate_protocol_path, path,
                                  "duplicate protocol path '" + portable_path + "'", protocol,
                                  parser);
            }
            manifest.protocol_files.push_back(std::move(relative_path));
            ++index;
        }
        return manifest;
    } catch (const ryml::ExceptionParse& error) {
        const auto& location = error.errdata_parse.ymlloc;
        return WorkspaceDiagnostic{
            .code = WorkspaceErrorCode::yaml_parse_error,
            .path = "$",
            .offset = location.offset,
            .detail = error.what(),
            .source_location =
                SourceLocation{
                    .source = to_string(location.name),
                    .line = location.line,
                    .column = location.col,
                },
        };
    } catch (const ryml::ExceptionVisit& error) {
        return WorkspaceDiagnostic{
            .code = WorkspaceErrorCode::yaml_node_type_mismatch,
            .path = "$",
            .detail = error.what(),
        };
    } catch (const ryml::ExceptionBasic& error) {
        return WorkspaceDiagnostic{
            .code = WorkspaceErrorCode::yaml_parse_error,
            .path = "$",
            .detail = error.what(),
        };
    }
}

bool is_within(const std::filesystem::path& path, const std::filesystem::path& root) {
    const auto relative = path.lexically_relative(root);
    if (relative.empty() || relative.is_absolute()) {
        return false;
    }
    return relative.begin() == relative.end() || *relative.begin() != "..";
}

} // namespace

ProjectLoadResult load_project(const std::filesystem::path& project_directory) {
    std::error_code filesystem_error;
    if (!std::filesystem::is_directory(project_directory, filesystem_error)) {
        return WorkspaceDiagnostic{
            .code = WorkspaceErrorCode::project_directory_not_found,
            .path = "$directory",
            .detail = "project directory does not exist: '" + project_directory.string() + "'",
        };
    }

    const auto root = std::filesystem::weakly_canonical(project_directory, filesystem_error);
    if (filesystem_error) {
        return WorkspaceDiagnostic{
            .code = WorkspaceErrorCode::project_directory_not_found,
            .path = "$directory",
            .detail = "cannot resolve project directory '" + project_directory.string() + "'",
        };
    }
    const auto manifest_path = root / "project.yaml";
    std::ifstream input{manifest_path, std::ios::binary};
    if (!input.is_open()) {
        return WorkspaceDiagnostic{
            .code = WorkspaceErrorCode::project_manifest_open_failed,
            .path = "$file",
            .detail = "cannot open project manifest '" + manifest_path.string() + "'",
        };
    }
    std::ostringstream contents;
    contents << input.rdbuf();
    if (input.bad()) {
        return WorkspaceDiagnostic{
            .code = WorkspaceErrorCode::project_manifest_read_failed,
            .path = "$file",
            .detail = "cannot read project manifest '" + manifest_path.string() + "'",
        };
    }

    auto manifest_result = load_manifest(contents.str(), manifest_path.string());
    if (const auto* error = manifest_result.error_if()) {
        return *error;
    }

    Project loaded{
        .root_directory = root,
        .manifest = std::move(manifest_result).value(),
    };
    for (std::size_t index = 0; index < loaded.manifest.protocol_files.size(); ++index) {
        const auto& relative_path = loaded.manifest.protocol_files[index];
        const auto protocol_path = root / relative_path;
        const auto resolved = std::filesystem::weakly_canonical(protocol_path, filesystem_error);
        if (filesystem_error || !is_within(resolved, root)) {
            return WorkspaceDiagnostic{
                .code = WorkspaceErrorCode::protocol_path_outside_project,
                .path = "protocols[" + std::to_string(index) + "]",
                .detail = "protocol path resolves outside the project directory",
            };
        }

        auto protocol_result = schema::load_yaml_file(protocol_path);
        if (const auto* error = protocol_result.error_if()) {
            const auto file_error = error->code == schema::SchemaErrorCode::file_open_failed ||
                                    error->code == schema::SchemaErrorCode::file_read_failed;
            return WorkspaceDiagnostic{
                .code = file_error ? WorkspaceErrorCode::protocol_file_load_failed
                                   : WorkspaceErrorCode::protocol_schema_invalid,
                .path = "protocols[" + std::to_string(index) + "]",
                .offset = error->offset,
                .detail = "schema error[" + std::string{schema::to_string(error->code)} + "] " +
                          error->path + ": " + error->detail,
                .source_location = error->source_location,
            };
        }
        loaded.protocols.push_back(ProjectProtocol{
            .relative_path = relative_path,
            .schema = std::move(protocol_result).value(),
        });
    }
    return loaded;
}

std::string_view to_string(const WorkspaceErrorCode code) noexcept {
    switch (code) {
    case WorkspaceErrorCode::project_directory_not_found:
        return "project_directory_not_found";
    case WorkspaceErrorCode::project_manifest_open_failed:
        return "project_manifest_open_failed";
    case WorkspaceErrorCode::project_manifest_read_failed:
        return "project_manifest_read_failed";
    case WorkspaceErrorCode::yaml_parse_error:
        return "yaml_parse_error";
    case WorkspaceErrorCode::yaml_root_mapping_required:
        return "yaml_root_mapping_required";
    case WorkspaceErrorCode::yaml_required_node_missing:
        return "yaml_required_node_missing";
    case WorkspaceErrorCode::yaml_node_type_mismatch:
        return "yaml_node_type_mismatch";
    case WorkspaceErrorCode::schema_version_required:
        return "schema_version_required";
    case WorkspaceErrorCode::unsupported_schema_version:
        return "unsupported_schema_version";
    case WorkspaceErrorCode::project_name_required:
        return "project_name_required";
    case WorkspaceErrorCode::protocol_path_empty:
        return "protocol_path_empty";
    case WorkspaceErrorCode::protocol_path_not_portable:
        return "protocol_path_not_portable";
    case WorkspaceErrorCode::protocol_path_outside_project:
        return "protocol_path_outside_project";
    case WorkspaceErrorCode::duplicate_protocol_path:
        return "duplicate_protocol_path";
    case WorkspaceErrorCode::protocol_file_load_failed:
        return "protocol_file_load_failed";
    case WorkspaceErrorCode::protocol_schema_invalid:
        return "protocol_schema_invalid";
    }
    return "unknown";
}

} // namespace iotps::core::workspace
