#include "iotps/core/workspace/workspace.hpp"

#include "iotps/core/schema/loader.hpp"

#include <algorithm>
#include <c4/yml/std/string.hpp>
#include <cctype>
#include <fstream>
#include <optional>
#include <ryml.hpp>
#include <set>
#include <sstream>
#include <string>
#include <utility>

#if defined(_WIN32)
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>
#endif

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

WorkspaceDiagnostic make_error(const WorkspaceErrorCode code, std::string path,
                               std::string detail) {
    return {
        .code = code,
        .path = std::move(path),
        .detail = std::move(detail),
    };
}

Result<std::filesystem::path, WorkspaceDiagnostic>
normalize_protocol_path(const std::string_view value, std::string error_path) {
    if (value.empty()) {
        return make_error(WorkspaceErrorCode::protocol_path_empty, std::move(error_path),
                          "protocol path must not be empty");
    }
    if (value.find('\\') != std::string_view::npos) {
        return make_error(WorkspaceErrorCode::protocol_path_not_portable, std::move(error_path),
                          "project paths must use '/' separators");
    }

    auto relative_path = std::filesystem::u8path(value).lexically_normal();
    auto component = relative_path.begin();
    if (relative_path.is_absolute() || relative_path.has_root_name() ||
        relative_path.has_root_directory() || component == relative_path.end() ||
        component->generic_string() != "protocols" || ++component == relative_path.end()) {
        return make_error(WorkspaceErrorCode::protocol_path_outside_project, std::move(error_path),
                          "protocol path must name a file under 'protocols/'");
    }
    for (const auto& part : relative_path) {
        if (part == "..") {
            return make_error(WorkspaceErrorCode::protocol_path_outside_project,
                              std::move(error_path),
                              "protocol path must not leave the project directory");
        }
    }
    return relative_path;
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
            auto normalized = normalize_protocol_path(value, path);
            if (auto* error = normalized.error_if()) {
                attach_source(*error, protocol, parser);
                return *error;
            }
            auto relative_path = std::move(normalized).value();
            const auto portable_path = relative_path.generic_string();
            if (!unique_paths.insert(portable_path).second) {
                return make_error(WorkspaceErrorCode::duplicate_protocol_path, path,
                                  "duplicate protocol path '" + portable_path + "'", protocol,
                                  parser);
            }
            manifest.protocol_files.push_back(std::move(relative_path));
            ++index;
        }
        if (root.has_child("folderOrder")) {
            const auto order = root["folderOrder"];
            if (const auto error = require_sequence(order, "folderOrder", parser))
                return *error;
            for (const auto folder : order.children()) {
                if (const auto error = require_scalar(folder, "folderOrder", parser))
                    return *error;
                auto path = normalize_protocol_path(scalar(folder), "folderOrder");
                if (const auto* error = path.error_if())
                    return *error;
                manifest.folder_order.push_back(path.value());
            }
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

Result<std::filesystem::path, WorkspaceDiagnostic>
create_protocol_path(const std::string_view value) {
    if (value.empty()) {
        return make_error(WorkspaceErrorCode::protocol_path_empty, "$request.relativePath",
                          "protocol path must not be empty");
    }
    if (value.find('\\') != std::string_view::npos) {
        return make_error(WorkspaceErrorCode::protocol_path_not_portable, "$request.relativePath",
                          "project paths must use '/' separators");
    }

    const auto requested = std::filesystem::u8path(value);
    if (requested.is_absolute() || requested.has_root_name() || requested.has_root_directory()) {
        return make_error(WorkspaceErrorCode::protocol_path_outside_project,
                          "$request.relativePath",
                          "protocol path must be relative to the 'protocols/' directory");
    }
    for (const auto& part : requested) {
        if (part == "..") {
            return make_error(WorkspaceErrorCode::protocol_path_outside_project,
                              "$request.relativePath",
                              "protocol path must not leave the 'protocols/' directory");
        }
    }

    return normalize_protocol_path(
        (std::filesystem::path{"protocols"} / requested).lexically_normal().generic_string(),
        "$request.relativePath");
}

std::string protocol_yaml(const schema::ProtocolMetadata& protocol) {
    ryml::Tree tree;
    auto root = tree.rootref();
    root.set_map();
    root["schemaVersion"].save(std::string{schema::current_schema_version});
    auto metadata = root["protocol"];
    metadata.set_map();
    metadata["name"].save(protocol.name);
    if (!protocol.display_name.empty()) {
        metadata["displayName"].save(protocol.display_name);
    }
    metadata["version"].save(protocol.version);
    if (!protocol.description.empty()) {
        metadata["description"].save(protocol.description);
    }
    metadata["defaultByteOrder"].set_val(
        protocol.default_byte_order == schema::ByteOrder::little_endian ? "little" : "big");
    root["messages"].set_map();
    std::string output;
    ryml::emitrs_yaml(tree, &output);
    return output;
}

Result<std::string, WorkspaceDiagnostic>
append_protocol_reference(const std::string_view yaml, const std::string& source_name,
                          const std::string& portable_path) {
    try {
        ryml::EventHandlerTree event_handler{loader_callbacks()};
        ryml::Parser parser(&event_handler);
        auto tree = ryml::parse_in_arena(&parser, {source_name.data(), source_name.size()},
                                         {yaml.data(), yaml.size()});
        tree.rootref()["protocols"].append_child().save(portable_path);
        std::string output;
        ryml::emitrs_yaml(tree, &output);
        return output;
    } catch (const std::exception& error) {
        return make_error(WorkspaceErrorCode::project_manifest_write_failed, "$manifest",
                          "cannot update project manifest: " + std::string{error.what()});
    }
}

bool write_text_file(const std::filesystem::path& path, const std::string_view contents) {
    std::ofstream output{path, std::ios::binary | std::ios::trunc};
    output.write(contents.data(), static_cast<std::streamsize>(contents.size()));
    output.flush();
    return output.good();
}

void remove_file(const std::filesystem::path& path) {
    std::error_code ignored;
    std::filesystem::remove(path, ignored);
}

bool atomic_replace_file(const std::filesystem::path& source,
                         const std::filesystem::path& destination, std::error_code& error) {
#if defined(_WIN32)
    if (MoveFileExW(source.c_str(), destination.c_str(),
                    MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH) != FALSE) {
        error.clear();
        return true;
    }
    error = std::error_code{static_cast<int>(GetLastError()), std::system_category()};
#else
    std::filesystem::rename(source, destination, error);
#endif
    return !error;
}

std::string portable(const std::filesystem::path& path) {
    const auto utf8 = path.generic_u8string();
    return {utf8.begin(), utf8.end()};
}

bool linked_directory(const std::filesystem::path& path) {
#if defined(_WIN32)
    const auto attributes = GetFileAttributesW(path.c_str());
    return attributes != INVALID_FILE_ATTRIBUTES &&
           (attributes & FILE_ATTRIBUTE_REPARSE_POINT) != 0;
#else
    return std::filesystem::is_symlink(std::filesystem::symlink_status(path));
#endif
}

bool valid_name(const std::string_view name) {
    if (name.empty() || name == "." || name == ".." || name.back() == '.' || name.back() == ' ' ||
        name.find_first_of("/\\<>:\"|?*") != std::string_view::npos ||
        std::ranges::any_of(name, [](const unsigned char c) { return c < 32; }))
        return false;
    auto base = std::string{name.substr(0, name.find('.'))};
    std::ranges::transform(base, base.begin(), [](const unsigned char c) {
        return static_cast<char>(std::toupper(c));
    });
    return base != "CON" && base != "PRN" && base != "AUX" && base != "NUL" &&
           !(base.size() == 4 && (base.starts_with("COM") || base.starts_with("LPT")) &&
             base[3] >= '0' && base[3] <= '9');
}

bool safe_folder_path(const std::filesystem::path& root, const std::filesystem::path& relative) {
    if (relative.empty() || relative.is_absolute() || relative.has_root_name() ||
        *relative.begin() != "protocols")
        return false;
    auto current = root;
    for (const auto& part : relative) {
        if (!valid_name(portable(part)))
            return false;
        current /= part;
        if (linked_directory(current))
            return false;
    }
    return is_within(std::filesystem::weakly_canonical(current), root);
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
    try {
        const auto directory = root / "protocols";
        if (std::filesystem::exists(directory)) {
            if (linked_directory(directory)) {
                return make_error(WorkspaceErrorCode::invalid_folder_path, "protocols",
                                  "linked protocol directories are not supported");
            }
            for (auto it = std::filesystem::recursive_directory_iterator(directory);
                 it != std::filesystem::recursive_directory_iterator{}; ++it) {
                if (linked_directory(it->path())) {
                    it.disable_recursion_pending();
                    continue;
                }
                if (it->is_directory())
                    loaded.folders.push_back(it->path().lexically_relative(root));
            }
        }
        std::ranges::sort(loaded.folders);
        const auto& order = loaded.manifest.folder_order;
        std::stable_sort(loaded.folders.begin(), loaded.folders.end(),
                         [&](const auto& a, const auto& b) {
                             return std::ranges::find(order, a) < std::ranges::find(order, b);
                         });
    } catch (const std::exception& error) {
        return make_error(WorkspaceErrorCode::workspace_operation_failed, "protocols",
                          error.what());
    }
    return loaded;
}

ProjectLoadResult create_project(const std::filesystem::path& parent_directory,
                                 const std::string_view name) {
    if (!valid_name(name)) {
        return make_error(WorkspaceErrorCode::invalid_folder_path, "$name", "invalid project name");
    }
    std::filesystem::path destination;
    bool created = false;
    try {
        const auto parent = std::filesystem::canonical(parent_directory);
        destination = parent / std::filesystem::u8path(name);
        if (!std::filesystem::create_directory(destination)) {
            return make_error(WorkspaceErrorCode::workspace_operation_failed, "$name",
                              "a file or directory with this project name already exists");
        }
        created = true;
        std::filesystem::create_directory(destination / "protocols");
        ryml::Tree tree;
        auto root = tree.rootref();
        root.set_map();
        root["schemaVersion"].save(std::string{current_project_schema_version});
        root["project"].set_map();
        root["project"]["name"].save(std::string{name});
        root["protocols"].set_seq();
        std::string yaml;
        ryml::emitrs_yaml(tree, &yaml);
        if (!write_text_file(destination / "project.yaml", yaml)) {
            throw std::runtime_error("cannot write project manifest");
        }
        return load_project(destination);
    } catch (const std::exception& error) {
        if (created) {
            // Only remove the files created by this operation, never a pre-existing tree.
            remove_file(destination / "project.yaml");
            remove_file(destination / "protocols");
            remove_file(destination);
        }
        return make_error(WorkspaceErrorCode::workspace_operation_failed, "$directory",
                          error.what());
    }
}

ProjectLoadResult rename_project(const std::filesystem::path& project_directory,
                                 const std::string_view display_name) {
    if (display_name.empty() || display_name.size() > 400 ||
        std::ranges::all_of(display_name, [](const unsigned char c) { return std::isspace(c); }) ||
        std::ranges::any_of(display_name, [](const unsigned char c) { return c < 32; })) {
        return make_error(WorkspaceErrorCode::project_name_required, "project.displayName",
                          "a nonblank project display name is required (maximum 400 UTF-8 bytes)");
    }
    auto loaded = load_project(project_directory);
    if (const auto* error = loaded.error_if())
        return *error;
    const auto manifest = loaded.value().root_directory / "project.yaml";
    auto temporary = manifest;
    temporary += ".iotps.tmp";
    auto backup = manifest;
    backup += ".iotps.bak";
    try {
        for (const auto& path : {temporary, backup}) {
            if (std::filesystem::exists(std::filesystem::symlink_status(path)))
                throw std::runtime_error("temporary manifest or backup already exists");
        }
        std::ifstream input{manifest, std::ios::binary};
        std::ostringstream contents;
        contents << input.rdbuf();
        if (!input.is_open() || input.bad())
            throw std::runtime_error("cannot read manifest");
        input.close();
        const auto yaml = contents.str();
        ryml::EventHandlerTree event_handler{loader_callbacks()};
        ryml::Parser parser(&event_handler);
        auto tree = ryml::parse_in_arena(&parser, ryml::to_csubstr(yaml));
        auto name = tree.rootref()["project"]["displayName"];
        name.save(std::string{display_name});
        name.set_val_style(ryml::VAL_DQUO);
        std::string updated;
        ryml::emitrs_yaml(tree, &updated);
        auto validated = load_manifest(updated, portable(manifest));
        if (const auto* error = validated.error_if())
            return *error;
        if (!write_text_file(temporary, updated)) {
            remove_file(temporary);
            throw std::runtime_error("cannot write temporary manifest");
        }
        std::error_code error;
        std::filesystem::copy_file(manifest, backup, std::filesystem::copy_options::none, error);
        if (error) {
            remove_file(temporary);
            throw std::runtime_error(error.message());
        }
        if (!atomic_replace_file(temporary, manifest, error)) {
            remove_file(temporary);
            remove_file(backup);
            throw std::runtime_error(error.message());
        }
        auto reloaded = load_project(loaded.value().root_directory);
        if (!reloaded.has_value()) {
            if (!atomic_replace_file(backup, manifest, error))
                throw std::runtime_error("project reload and manifest restore failed: " +
                                         error.message());
            return reloaded;
        }
        remove_file(backup);
        return reloaded;
    } catch (const std::exception& error) {
        return make_error(WorkspaceErrorCode::project_manifest_write_failed, "$manifest",
                          error.what());
    }
}

ProjectLoadResult change_folder(const std::filesystem::path& project_directory,
                                const std::string_view action, const std::string_view path,
                                const std::string_view target_parent,
                                const std::string_view before) {
    auto loaded = load_project(project_directory);
    if (const auto* error = loaded.error_if())
        return *error;
    auto& project = loaded.value();
    const auto& root = project.root_directory;
    try {
        const auto source = std::filesystem::u8path(path);
        const auto parent = std::filesystem::u8path(target_parent);
        if (source == "protocols" || !safe_folder_path(root, source) ||
            (action != "create" && action != "delete" && action != "move" && action != "rename")) {
            return make_error(WorkspaceErrorCode::invalid_folder_path, "$path",
                              "invalid folder path or action");
        }
        auto destination = source;
        if (action == "create") {
            if (std::filesystem::exists(root / source)) {
                return make_error(WorkspaceErrorCode::workspace_operation_failed, "$path",
                                  "folder already exists");
            }
            if (source.parent_path() == "protocols")
                std::filesystem::create_directory(root / "protocols");
            if (!std::filesystem::is_directory(root / source.parent_path())) {
                return make_error(WorkspaceErrorCode::invalid_folder_path, "$path",
                                  "parent folder does not exist");
            }
        } else if (!std::filesystem::is_directory(root / source) ||
                   std::ranges::find(project.folders, source) == project.folders.end()) {
            return make_error(WorkspaceErrorCode::invalid_folder_path, "$path",
                              "folder does not exist");
        }
        if (action == "delete" && !std::filesystem::is_empty(root / source)) {
            return make_error(WorkspaceErrorCode::folder_not_empty, "$path",
                              "clear all folder contents before deleting it");
        }
        if (action == "move") {
            if (!safe_folder_path(root, parent) || !std::filesystem::is_directory(root / parent) ||
                is_within(parent, source)) {
                return make_error(WorkspaceErrorCode::invalid_folder_path, "$target",
                                  "cannot move a folder into itself or a descendant");
            }
            destination = parent / source.filename();
            if (destination != source && std::filesystem::exists(root / destination)) {
                return make_error(WorkspaceErrorCode::workspace_operation_failed, "$target",
                                  "destination already exists");
            }
            if (!before.empty()) {
                const auto sibling = std::filesystem::u8path(before);
                if (sibling == source || sibling.parent_path() != parent ||
                    std::ranges::find(project.folders, sibling) == project.folders.end()) {
                    return make_error(WorkspaceErrorCode::invalid_folder_path, "$before",
                                      "invalid sibling for sorting");
                }
            }
        }
        if (action == "rename") {
            if (!valid_name(target_parent) || !before.empty()) {
                return make_error(WorkspaceErrorCode::invalid_folder_path, "$name",
                                  "invalid folder name");
            }
            destination = source.parent_path() / parent;
            if (!safe_folder_path(root, destination) ||
                (destination != source && std::filesystem::exists(root / destination) &&
                 !std::filesystem::equivalent(root / source, root / destination))) {
                return make_error(WorkspaceErrorCode::invalid_folder_path, "$name",
                                  "destination already exists or is invalid");
            }
            if (destination == source)
                return loaded;
        }
        auto remap = [&](const std::filesystem::path& item) {
            if (action == "rename" && item == source)
                return destination;
            return (action == "move" || action == "rename") && is_within(item, source)
                       ? (destination / item.lexically_relative(source)).lexically_normal()
                       : item;
        };
        std::vector<std::filesystem::path> order;
        for (const auto& folder : project.folders) {
            if (folder != source || action == "rename")
                order.push_back(remap(folder));
        }
        if (action != "delete" && action != "rename") {
            order.insert(before.empty() ? order.end()
                                        : std::ranges::find(order, std::filesystem::u8path(before)),
                         destination);
        }
        const auto manifest = root / "project.yaml";
        auto temporary = manifest;
        temporary += ".iotps.tmp";
        if (std::filesystem::exists(std::filesystem::symlink_status(temporary))) {
            return make_error(WorkspaceErrorCode::project_manifest_write_failed, "$manifest",
                              "temporary manifest already exists");
        }
        std::ifstream input{manifest, std::ios::binary};
        std::ostringstream contents;
        contents << input.rdbuf();
        if (!input.is_open() || input.bad())
            throw std::runtime_error("cannot read manifest");
        input.close();
        const auto yaml = contents.str();
        ryml::EventHandlerTree event_handler{loader_callbacks()};
        ryml::Parser parser(&event_handler);
        auto tree = ryml::parse_in_arena(&parser, ryml::to_csubstr(yaml));
        for (auto protocol : tree.rootref()["protocols"].children()) {
            protocol.save(portable(remap(std::filesystem::u8path(scalar(protocol)))));
        }
        auto folders = tree.rootref()["folderOrder"];
        folders.set_seq();
        folders.clear_children();
        for (const auto& folder : order)
            folders.append_child().save(portable(folder));
        std::string updated;
        ryml::emitrs_yaml(tree, &updated);
        auto validated = load_manifest(updated, portable(manifest));
        if (const auto* error = validated.error_if())
            return *error;
        if (!write_text_file(temporary, updated)) {
            remove_file(temporary);
            throw std::runtime_error("cannot write temporary manifest");
        }
        std::error_code error;
        if (action == "create") {
            if (!std::filesystem::create_directory(root / source, error) && !error)
                error = std::make_error_code(std::errc::file_exists);
        } else if (action == "delete") {
            if (!std::filesystem::remove(root / source, error) && !error)
                error = std::make_error_code(std::errc::no_such_file_or_directory);
        } else if (source != destination)
            std::filesystem::rename(root / source, root / destination, error);
        if (error) {
            remove_file(temporary);
            throw std::runtime_error(error.message());
        }
        if (!atomic_replace_file(temporary, manifest, error)) {
            std::error_code rollback;
            if (action == "create")
                std::filesystem::remove(root / source, rollback);
            else if (action == "delete")
                std::filesystem::create_directory(root / source, rollback);
            else if (source != destination)
                std::filesystem::rename(root / destination, root / source, rollback);
            if (!rollback)
                remove_file(temporary);
            throw std::runtime_error(rollback ? "manifest save and folder rollback failed: " +
                                                    rollback.message()
                                              : error.message());
        }
        return load_project(root);
    } catch (const std::exception& error) {
        return make_error(WorkspaceErrorCode::workspace_operation_failed, "$folder", error.what());
    }
}

ProjectLoadResult create_protocol(const std::filesystem::path& project_directory,
                                  const ProtocolCreateRequest& request) {
    auto loaded = load_project(project_directory);
    if (const auto* error = loaded.error_if()) {
        return *error;
    }
    const auto& project = loaded.value();

    auto relative_path = create_protocol_path(request.relative_path);
    if (const auto* error = relative_path.error_if()) {
        return *error;
    }
    const auto portable_path = relative_path.value().generic_string();
    if (std::ranges::any_of(project.manifest.protocol_files, [&](const auto& existing) {
            return existing.generic_string() == portable_path;
        })) {
        return make_error(WorkspaceErrorCode::duplicate_protocol_path, "$request.relativePath",
                          "protocol path is already referenced: '" + portable_path + "'");
    }

    const auto yaml = protocol_yaml(request.protocol);
    auto parsed_schema = schema::load_yaml(yaml, "$request.protocol");
    if (const auto* error = parsed_schema.error_if()) {
        return WorkspaceDiagnostic{
            .code = WorkspaceErrorCode::protocol_schema_invalid,
            .path = "$request.protocol",
            .offset = error->offset,
            .detail = "schema error[" + std::string{schema::to_string(error->code)} + "] " +
                      error->path + ": " + error->detail,
            .source_location = error->source_location,
        };
    }

    const auto root = project.root_directory;
    const auto destination = root / relative_path.value();
    std::error_code filesystem_error;
    const auto resolved_parent =
        std::filesystem::weakly_canonical(destination.parent_path(), filesystem_error);
    if (filesystem_error || !is_within(resolved_parent, root)) {
        return make_error(WorkspaceErrorCode::protocol_path_outside_project,
                          "$request.relativePath",
                          "protocol path resolves outside the project directory");
    }

    filesystem_error.clear();
    const auto destination_status = std::filesystem::symlink_status(destination, filesystem_error);
    if (!filesystem_error && destination_status.type() != std::filesystem::file_type::not_found) {
        return make_error(WorkspaceErrorCode::protocol_file_already_exists, "$request.relativePath",
                          "protocol file already exists: '" + destination.string() + "'");
    }

    const auto manifest_path = root / "project.yaml";
    std::ifstream manifest_input{manifest_path, std::ios::binary};
    std::ostringstream manifest_contents;
    manifest_contents << manifest_input.rdbuf();
    if (!manifest_input.is_open() || manifest_input.bad()) {
        return make_error(WorkspaceErrorCode::project_manifest_read_failed, "$manifest",
                          "cannot read project manifest '" + manifest_path.string() + "'");
    }
    manifest_input.close();
    auto updated_manifest =
        append_protocol_reference(manifest_contents.str(), manifest_path.string(), portable_path);
    if (const auto* error = updated_manifest.error_if()) {
        return *error;
    }

    auto protocol_temporary = destination;
    protocol_temporary += ".iotps.tmp";
    auto manifest_temporary = manifest_path;
    manifest_temporary += ".iotps.tmp";
    auto manifest_backup = manifest_path;
    manifest_backup += ".iotps.bak";
    bool temporary_exists = false;
    for (const auto& temporary : {protocol_temporary, manifest_temporary, manifest_backup}) {
        filesystem_error.clear();
        temporary_exists = std::filesystem::exists(temporary, filesystem_error) || temporary_exists;
        if (filesystem_error) {
            return make_error(WorkspaceErrorCode::project_manifest_write_failed, "$manifest",
                              "cannot inspect temporary workspace files: " +
                                  filesystem_error.message());
        }
    }
    if (temporary_exists) {
        return make_error(WorkspaceErrorCode::project_manifest_write_failed, "$manifest",
                          "temporary workspace files already exist");
    }

    std::filesystem::create_directories(destination.parent_path(), filesystem_error);
    if (filesystem_error) {
        return make_error(WorkspaceErrorCode::protocol_directory_create_failed,
                          "$request.relativePath",
                          "cannot create protocol directory: " + filesystem_error.message());
    }
    if (!write_text_file(manifest_temporary, updated_manifest.value())) {
        remove_file(manifest_temporary);
        return make_error(WorkspaceErrorCode::project_manifest_write_failed, "$manifest",
                          "cannot write temporary project manifest");
    }
    if (!write_text_file(protocol_temporary, yaml)) {
        remove_file(manifest_temporary);
        remove_file(protocol_temporary);
        return make_error(WorkspaceErrorCode::protocol_file_write_failed, "$request.relativePath",
                          "cannot write temporary protocol file");
    }

    std::filesystem::rename(protocol_temporary, destination, filesystem_error);
    if (filesystem_error) {
        remove_file(manifest_temporary);
        remove_file(protocol_temporary);
        return make_error(WorkspaceErrorCode::protocol_file_write_failed, "$request.relativePath",
                          "cannot create protocol file: " + filesystem_error.message());
    }
    std::filesystem::rename(manifest_path, manifest_backup, filesystem_error);
    if (filesystem_error) {
        remove_file(destination);
        remove_file(manifest_temporary);
        return make_error(WorkspaceErrorCode::project_manifest_write_failed, "$manifest",
                          "cannot back up project manifest: " + filesystem_error.message());
    }
    std::filesystem::rename(manifest_temporary, manifest_path, filesystem_error);
    if (filesystem_error) {
        std::error_code restore_error;
        std::filesystem::rename(manifest_backup, manifest_path, restore_error);
        remove_file(destination);
        remove_file(manifest_temporary);
        return make_error(WorkspaceErrorCode::project_manifest_write_failed, "$manifest",
                          restore_error
                              ? "cannot replace or restore project manifest"
                              : "cannot replace project manifest: " + filesystem_error.message());
    }

    auto reloaded = load_project(root);
    if (const auto* error = reloaded.error_if()) {
        remove_file(manifest_path);
        std::error_code restore_error;
        std::filesystem::rename(manifest_backup, manifest_path, restore_error);
        remove_file(destination);
        if (restore_error) {
            return make_error(WorkspaceErrorCode::project_manifest_write_failed, "$manifest",
                              "created project failed validation and manifest restore failed");
        }
        return *error;
    }
    remove_file(manifest_backup);
    return reloaded;
}

ProjectLoadResult update_protocol(const std::filesystem::path& project_directory,
                                  const std::string_view relative_path_value,
                                  const std::string_view yaml) {
    auto loaded = load_project(project_directory);
    if (const auto* error = loaded.error_if()) {
        return *error;
    }
    const auto& project = loaded.value();

    auto relative_path = normalize_protocol_path(relative_path_value, "$request.relativePath");
    if (const auto* error = relative_path.error_if()) {
        return *error;
    }
    const auto portable_path = relative_path.value().generic_string();
    if (std::ranges::none_of(project.manifest.protocol_files, [&](const auto& existing) {
            return existing.generic_string() == portable_path;
        })) {
        return make_error(WorkspaceErrorCode::protocol_not_referenced, "$request.relativePath",
                          "protocol is not referenced by project.yaml: '" + portable_path + "'");
    }

    std::error_code filesystem_error;
    const auto destination = std::filesystem::weakly_canonical(
        project.root_directory / relative_path.value(), filesystem_error);
    if (filesystem_error || !is_within(destination, project.root_directory)) {
        return make_error(WorkspaceErrorCode::protocol_path_outside_project,
                          "$request.relativePath",
                          "protocol path resolves outside the project directory");
    }

    auto parsed_schema = schema::load_yaml(yaml, destination.string());
    if (const auto* error = parsed_schema.error_if()) {
        return WorkspaceDiagnostic{
            .code = WorkspaceErrorCode::protocol_schema_invalid,
            .path = error->path,
            .offset = error->offset,
            .detail = "schema error[" + std::string{schema::to_string(error->code)} + "] " +
                      error->path + ": " + error->detail,
            .source_location = error->source_location,
        };
    }

    auto temporary = destination;
    temporary += ".iotps.tmp";
    auto backup = destination;
    backup += ".iotps.bak";
    for (const auto& path : {temporary, backup}) {
        filesystem_error.clear();
        if (std::filesystem::exists(path, filesystem_error) || filesystem_error) {
            return make_error(WorkspaceErrorCode::protocol_file_write_failed,
                              "$request.relativePath",
                              "temporary protocol file already exists or cannot be inspected");
        }
    }
    if (!write_text_file(temporary, yaml)) {
        remove_file(temporary);
        return make_error(WorkspaceErrorCode::protocol_file_write_failed, "$request.relativePath",
                          "cannot write temporary protocol file");
    }

    std::filesystem::copy_file(destination, backup, std::filesystem::copy_options::none,
                               filesystem_error);
    if (filesystem_error) {
        remove_file(temporary);
        return make_error(WorkspaceErrorCode::protocol_file_write_failed, "$request.relativePath",
                          "cannot back up protocol file: " + filesystem_error.message());
    }
    if (!atomic_replace_file(temporary, destination, filesystem_error)) {
        remove_file(temporary);
        return make_error(WorkspaceErrorCode::protocol_file_write_failed, "$request.relativePath",
                          "cannot replace protocol file: " + filesystem_error.message());
    }

    auto reloaded = load_project(project.root_directory);
    if (const auto* error = reloaded.error_if()) {
        std::error_code restore_error;
        if (!atomic_replace_file(backup, destination, restore_error)) {
            return make_error(WorkspaceErrorCode::protocol_file_write_failed,
                              "$request.relativePath",
                              "updated project failed validation and protocol restore failed");
        }
        return *error;
    }
    remove_file(backup);
    return reloaded;
}

ProjectLoadResult update_field_display_name(const std::filesystem::path& project_directory,
                                            const FieldDisplayNameUpdateRequest& request) {
    return edit_schema(project_directory, {request.relative_path,
                                           "updateField",
                                           request.message_name,
                                           request.field_name,
                                           {{"displayName", request.display_name}}});
}

ProjectLoadResult edit_schema(const std::filesystem::path& project_directory,
                              const SchemaEditRequest& request) {
    auto loaded = load_project(project_directory);
    if (const auto* error = loaded.error_if()) {
        return *error;
    }
    const auto& project = loaded.value();
    auto relative_path = normalize_protocol_path(request.relative_path, "$request.relativePath");
    if (const auto* error = relative_path.error_if()) {
        return *error;
    }
    const auto portable_path = relative_path.value().generic_string();
    const auto protocol = std::ranges::find_if(project.protocols, [&](const auto& candidate) {
        return candidate.relative_path.generic_string() == portable_path;
    });
    if (protocol == project.protocols.end()) {
        return make_error(WorkspaceErrorCode::protocol_not_referenced, "$request.relativePath",
                          "protocol is not referenced by project.yaml: '" + portable_path + "'");
    }

    const auto source_path = project.root_directory / relative_path.value();
    std::ifstream input{source_path, std::ios::binary};
    if (!input.is_open()) {
        return make_error(WorkspaceErrorCode::protocol_file_load_failed, "$request.relativePath",
                          "cannot open protocol file '" + source_path.string() + "'");
    }
    std::ostringstream contents;
    contents << input.rdbuf();
    if (input.bad()) {
        return make_error(WorkspaceErrorCode::protocol_file_load_failed, "$request.relativePath",
                          "cannot read protocol file '" + source_path.string() + "'");
    }
    input.close();

    try {
        const auto& action = request.action;
        const bool is_message =
            action == "addMessage" || action == "updateMessage" || action == "deleteMessage";
        const bool is_field = action == "addField" || action == "updateField" ||
                              action == "deleteField" || action == "moveFieldUp" ||
                              action == "moveFieldDown";
        if (!is_message && !is_field)
            return make_error(WorkspaceErrorCode::workspace_operation_failed, "$request.action",
                              "unknown schema edit action");
        const bool patch = action.starts_with("add") || action.starts_with("update");
        if ((!patch && !request.properties.empty()) || request.properties.size() > 9)
            return make_error(WorkspaceErrorCode::workspace_operation_failed, "$request.properties",
                              "unexpected properties");
        std::set<std::string> keys;
        std::string next_name;
        for (const auto& [key, value] : request.properties) {
            const auto allowed = is_message
                                     ? std::string_view{"|name|displayName|typeId|"}
                                     : std::string_view{"|name|displayName|type|endian|length|"
                                                        "offset|lengthOf|elementType|count|"};
            if (key.empty() || key.find('|') != std::string::npos ||
                allowed.find("|" + key + "|") == std::string_view::npos ||
                !keys.insert(key).second || value.size() > 4096)
                return make_error(WorkspaceErrorCode::workspace_operation_failed,
                                  "$request.properties",
                                  "unknown, duplicate or oversized property");
            if (key == "name")
                next_name = value;
        }
        if ((keys.contains("name") || action.starts_with("add")) &&
            (next_name.empty() ||
             std::ranges::all_of(next_name, [](unsigned char c) { return std::isspace(c); }) ||
             std::ranges::any_of(next_name, [](unsigned char c) { return c < 32; })))
            return make_error(WorkspaceErrorCode::protocol_schema_invalid, "$request.name",
                              "a nonblank name is required");
        const auto yaml = contents.str();
        ryml::EventHandlerTree handler{loader_callbacks()};
        ryml::Parser parser(&handler);
        auto tree = ryml::parse_in_arena(&parser, ryml::to_csubstr(yaml));
        auto messages = tree.rootref()["messages"];
        const auto message_key = ryml::to_csubstr(request.message_name);
        if (action == "addMessage") {
            if (messages.has_child(ryml::to_csubstr(next_name)))
                return make_error(WorkspaceErrorCode::protocol_schema_invalid, "$request.name",
                                  "message name already exists");
        } else if (!messages.has_child(message_key)) {
            return make_error(WorkspaceErrorCode::protocol_message_not_found,
                              "$request.messageName", "message was not found");
        }
        auto message = action == "addMessage" ? messages.append_child() : messages[message_key];
        if (action == "addMessage") {
            message.set_key_serialized(next_name, ryml::KEY_DQUO);
            message.set_map();
            message["fields"].set_seq();
        }
        auto target = message;
        if (is_field) {
            if (!message.has_child("fields"))
                message["fields"].set_seq();
            auto fields = message["fields"];
            if (action == "addField") {
                target = fields.append_child();
                target.set_map();
            } else {
                target = ryml::NodeRef{};
                for (auto field : fields.children()) {
                    if (field.has_child("name") && scalar(field["name"]) == request.field_name) {
                        target = field;
                        break;
                    }
                }
                if (!target.valid())
                    return make_error(WorkspaceErrorCode::protocol_field_not_found,
                                      "$request.fieldName", "field was not found");
            }
            if (action == "deleteField") {
                fields.remove_child(target);
            } else if (action == "moveFieldUp") {
                const auto previous = target.prev_sibling();
                if (previous.valid())
                    target.move(fields, previous.prev_sibling());
            } else if (action == "moveFieldDown") {
                const auto next = target.next_sibling();
                if (next.valid())
                    target.move(fields, next);
            }
        } else if (action == "deleteMessage") {
            messages.remove_child(message);
        }
        if (patch) {
            for (const auto& [key, value] : request.properties) {
                if (is_message && key == "name") {
                    if (value != request.message_name && action != "addMessage" &&
                        messages.has_child(ryml::to_csubstr(value)))
                        return make_error(WorkspaceErrorCode::protocol_schema_invalid,
                                          "$request.name", "message name already exists");
                    target.set_key_serialized(value, ryml::KEY_DQUO);
                } else if (value.empty()) {
                    if (target.has_child(ryml::to_csubstr(key)))
                        target.remove_child(ryml::to_csubstr(key));
                } else {
                    auto property = target[ryml::to_csubstr(key)];
                    property.save(value);
                    property.set_val_style(ryml::VAL_DQUO);
                }
            }
            // A field rename must keep the supported intra-message references valid.
            if (action == "updateField" && keys.contains("name") &&
                next_name != request.field_name) {
                for (auto field : message["fields"].children()) {
                    if (field.has_child("lengthOf") &&
                        scalar(field["lengthOf"]) == request.field_name) {
                        field["lengthOf"].save(next_name);
                        field["lengthOf"].set_val_style(ryml::VAL_DQUO);
                    }
                }
                if (message.has_child("checksum") && message["checksum"].has_child("targetField") &&
                    scalar(message["checksum"]["targetField"]) == request.field_name) {
                    message["checksum"]["targetField"].save(next_name);
                    message["checksum"]["targetField"].set_val_style(ryml::VAL_DQUO);
                }
            }
        }
        std::string updated;
        ryml::emitrs_yaml(tree, &updated);
        // The existing save path validates the complete schema and rolls back failed persistence.
        return update_protocol(project.root_directory, portable_path, updated);
    } catch (const std::exception& error) {
        return make_error(WorkspaceErrorCode::protocol_schema_invalid, "$protocol", error.what());
    }
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
    case WorkspaceErrorCode::protocol_not_referenced:
        return "protocol_not_referenced";
    case WorkspaceErrorCode::protocol_message_not_found:
        return "protocol_message_not_found";
    case WorkspaceErrorCode::protocol_field_not_found:
        return "protocol_field_not_found";
    case WorkspaceErrorCode::protocol_file_already_exists:
        return "protocol_file_already_exists";
    case WorkspaceErrorCode::protocol_directory_create_failed:
        return "protocol_directory_create_failed";
    case WorkspaceErrorCode::protocol_file_write_failed:
        return "protocol_file_write_failed";
    case WorkspaceErrorCode::project_manifest_write_failed:
        return "project_manifest_write_failed";
    case WorkspaceErrorCode::invalid_folder_path:
        return "invalid_folder_path";
    case WorkspaceErrorCode::folder_not_empty:
        return "folder_not_empty";
    case WorkspaceErrorCode::workspace_operation_failed:
        return "workspace_operation_failed";
    }
    return "unknown";
}

} // namespace iotps::core::workspace
