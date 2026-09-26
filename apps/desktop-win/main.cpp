#include "iotps/core/codec/codec.hpp"
#include "iotps/core/debug.hpp"
#include "iotps/core/engine.hpp"
#include "iotps/core/hex.hpp"
#include "iotps/core/transport/tcp.hpp"
#include "iotps/core/version.hpp"
#include "iotps/core/workspace/workspace.hpp"
#include "resource.h"
#include "tcp_smoke.hpp"
#include "tcp_windows.hpp"
#include "webview/webview.h"

#include <algorithm>
#include <atomic>
#include <cctype>
#include <charconv>
#include <cmath>
#include <dwmapi.h>
#include <filesystem>
#include <fstream>
#include <limits>
#include <map>
#include <memory>
#include <optional>
#include <shobjidl.h>
#include <sstream>
#include <stdexcept>
#include <string>
#include <string_view>
#include <system_error>
#include <type_traits>
#include <variant>
#include <vector>
#include <windows.h>
#include <windowsx.h>
#include <wrl/client.h>

namespace {

[[nodiscard]] std::string architecture_name() {
#if defined(_M_X64) || defined(__x86_64__)
    return "x86_64";
#elif defined(_M_ARM64) || defined(__aarch64__)
    return "arm64";
#else
    return "unknown";
#endif
}

[[nodiscard]] std::filesystem::path executable_directory() {
    std::wstring buffer(32768, L'\0');
    const auto length =
        GetModuleFileNameW(nullptr, buffer.data(), static_cast<DWORD>(buffer.size()));
    if (length == 0 || length >= buffer.size()) {
        return std::filesystem::current_path();
    }
    buffer.resize(length);
    return std::filesystem::path{buffer}.parent_path();
}

[[nodiscard]] std::optional<std::string> development_url() {
    constexpr auto variable = "IOTPS_WEB_UI_URL";
    const auto required = GetEnvironmentVariableA(variable, nullptr, 0);
    if (required == 0) {
        return std::nullopt;
    }

    std::string value(required, '\0');
    const auto length = GetEnvironmentVariableA(variable, value.data(), required);
    if (length == 0 || length >= required) {
        return std::nullopt;
    }
    value.resize(length);
    return value;
}

[[nodiscard]] std::string json_string(const std::string_view value) {
    constexpr char hex_digits[] = "0123456789ABCDEF";
    std::string result;
    result.reserve(value.size() + 2);
    result.push_back('"');
    for (const auto character : value) {
        const auto byte = static_cast<unsigned char>(character);
        switch (character) {
        case '"':
            result.append("\\\"");
            break;
        case '\\':
            result.append("\\\\");
            break;
        case '\b':
            result.append("\\b");
            break;
        case '\f':
            result.append("\\f");
            break;
        case '\n':
            result.append("\\n");
            break;
        case '\r':
            result.append("\\r");
            break;
        case '\t':
            result.append("\\t");
            break;
        default:
            if (byte < 0x20U) {
                result.append("\\u00");
                result.push_back(hex_digits[(byte >> 4U) & 0x0FU]);
                result.push_back(hex_digits[byte & 0x0FU]);
            } else {
                result.push_back(character);
            }
            break;
        }
    }
    result.push_back('"');
    return result;
}

[[nodiscard]] std::optional<std::vector<std::string>>
string_arguments(const std::string_view request) {
    std::size_t position = 0;
    const auto skip_whitespace = [&] {
        while (position < request.size() &&
               std::isspace(static_cast<unsigned char>(request[position])) != 0) {
            ++position;
        }
    };
    skip_whitespace();
    if (position >= request.size() || request[position++] != '[') {
        return std::nullopt;
    }

    std::vector<std::string> values;
    skip_whitespace();
    if (position < request.size() && request[position] == ']') {
        ++position;
        skip_whitespace();
        return position == request.size() ? std::optional{std::move(values)} : std::nullopt;
    }

    while (position < request.size()) {
        if (request[position++] != '"') {
            return std::nullopt;
        }
        std::string value;
        bool complete = false;
        while (position < request.size()) {
            const auto character = request[position++];
            if (character == '"') {
                complete = true;
                break;
            }
            if (character != '\\') {
                value.push_back(character);
                continue;
            }
            if (position >= request.size()) {
                return std::nullopt;
            }
            switch (request[position++]) {
            case '"':
                value.push_back('"');
                break;
            case '\\':
                value.push_back('\\');
                break;
            case '/':
                value.push_back('/');
                break;
            case 'b':
                value.push_back('\b');
                break;
            case 'f':
                value.push_back('\f');
                break;
            case 'n':
                value.push_back('\n');
                break;
            case 'r':
                value.push_back('\r');
                break;
            case 't':
                value.push_back('\t');
                break;
            default:
                return std::nullopt;
            }
        }
        if (!complete) {
            return std::nullopt;
        }
        values.push_back(std::move(value));
        skip_whitespace();
        if (position < request.size() && request[position] == ',') {
            ++position;
            skip_whitespace();
            continue;
        }
        if (position < request.size() && request[position] == ']') {
            ++position;
            skip_whitespace();
            return position == request.size() ? std::optional{std::move(values)} : std::nullopt;
        }
        return std::nullopt;
    }
    return std::nullopt;
}

[[nodiscard]] std::optional<std::string> first_string_argument(const std::string_view request) {
    const auto values = string_arguments(request);
    if (!values.has_value() || values->size() != 1) {
        return std::nullopt;
    }
    return values->front();
}

[[nodiscard]] std::string error_response(const std::string_view code,
                                         const std::string_view message,
                                         const std::size_t position) {
    return "{\"ok\":false,\"source\":\"native-core\",\"error\":{\"code\":" + json_string(code) +
           ",\"message\":" + json_string(message) + ",\"position\":" + std::to_string(position) +
           "}}";
}

[[nodiscard]] std::string core_info() {
    return "{\"product\":" + json_string(iotps::core::product_name) +
           ",\"version\":" + json_string(iotps::core::version) +
           ",\"platform\":\"Windows\",\"architecture\":" + json_string(architecture_name()) +
           ",\"source\":\"native-core\"}";
}

[[nodiscard]] std::string path_utf8(const std::filesystem::path& path) {
    const auto value = path.generic_u8string();
    return {reinterpret_cast<const char*>(value.data()), value.size()};
}

[[nodiscard]] std::string read_text_file(const std::filesystem::path& path) {
    std::ifstream input{path, std::ios::binary};
    if (!input.is_open()) {
        throw std::runtime_error("Opening workspace file failed: " + path_utf8(path));
    }
    std::ostringstream contents;
    contents << input.rdbuf();
    if (input.bad()) {
        throw std::runtime_error("Reading workspace file failed: " + path_utf8(path));
    }
    return contents.str();
}

[[nodiscard]] std::string workspace_error_response(const std::string_view code,
                                                   const std::string_view message,
                                                   const std::string_view path = {},
                                                   const std::size_t line = 0,
                                                   const std::size_t column = 0) {
    return "{\"ok\":false,\"source\":\"native-workspace\",\"error\":{\"code\":" +
           json_string(code) + ",\"message\":" + json_string(message) +
           ",\"path\":" + json_string(path) + ",\"line\":" + std::to_string(line) +
           ",\"column\":" + std::to_string(column) + "}}";
}

void append_protocol_schema(std::ostringstream& response,
                            const iotps::core::schema::ProtocolSchema& schema) {
    response << "{\"version\":" << json_string(schema.schema_version)
             << ",\"protocolVersion\":" << json_string(schema.protocol.version)
             << ",\"defaultByteOrder\":"
             << json_string(iotps::core::schema::to_string(schema.protocol.default_byte_order))
             << ",\"messageTypeField\":" << json_string(schema.protocol.message_type_field)
             << ",\"messages\":[";
    for (std::size_t message_index = 0; message_index < schema.messages.size(); ++message_index) {
        const auto& message = schema.messages[message_index];
        if (message_index != 0) {
            response << ',';
        }
        response << "{\"name\":" << json_string(message.name)
                 << ",\"displayName\":" << json_string(message.display_name) << ",\"typeId\":";
        if (message.type_id.has_value()) {
            response << json_string(std::to_string(*message.type_id));
        } else {
            response << "null";
        }
        response << ",\"checksumTarget\":"
                 << (message.checksum ? json_string(message.checksum->target_field) : "null")
                 << ",\"fields\":[";

        std::size_t cursor = 0;
        for (std::size_t field_index = 0; field_index < message.fields.size(); ++field_index) {
            const auto& field = message.fields[field_index];
            const auto length = iotps::core::schema::wire_size(field);
            const auto offset = field.offset.value_or(cursor);
            if (field_index != 0) {
                response << ',';
            }
            response << "{\"name\":" << json_string(field.name)
                     << ",\"displayName\":" << json_string(field.display_name)
                     << ",\"type\":" << json_string(iotps::core::schema::to_string(field.type))
                     << ",\"offset\":" << json_string(std::to_string(offset)) << ",\"length\":";
            if (length.has_value()) {
                response << json_string(std::to_string(*length));
                cursor = offset + *length;
            } else {
                response << "null";
            }
            response << ",\"byteOrder\":"
                     << json_string(iotps::core::schema::to_string(
                            field.byte_order.value_or(schema.protocol.default_byte_order)))
                     << ",\"byteOrderInherited\":"
                     << (field.byte_order.has_value() ? "false" : "true") << ",\"lengthOf\":";
            if (field.length_of.has_value()) {
                response << json_string(*field.length_of);
            } else {
                response << "null";
            }
            response << ",\"declaredOffset\":"
                     << (field.offset ? json_string(std::to_string(*field.offset)) : "null")
                     << ",\"declaredLength\":"
                     << (field.length ? json_string(std::to_string(*field.length)) : "null");
            response << ",\"elementType\":";
            if (field.element_type.has_value()) {
                response << json_string(iotps::core::schema::to_string(*field.element_type));
            } else {
                response << "null";
            }
            response << ",\"count\":";
            if (field.count.has_value()) {
                response << json_string(std::to_string(*field.count));
            } else {
                response << "null";
            }
            response << '}';
        }
        response << "]}";
    }
    response << "]}";
}

[[nodiscard]] std::string workspace_project_response(const iotps::core::workspace::Project& project,
                                                     const bool cancelled = false) {
    const auto& metadata = project.manifest.metadata;
    const auto project_name = metadata.display_name.empty() ? metadata.name : metadata.display_name;
    std::ostringstream response;
    response << "{\"ok\":true,\"source\":\"native-workspace\",\"cancelled\":"
             << (cancelled ? "true" : "false")
             << ",\"project\":{\"name\":" << json_string(project_name)
             << ",\"description\":" << json_string(metadata.description)
             << ",\"rootPath\":" << json_string(path_utf8(project.root_directory))
             << ",\"protocols\":[";
    for (std::size_t index = 0; index < project.protocols.size(); ++index) {
        const auto& protocol = project.protocols[index];
        const auto& protocol_metadata = protocol.schema.protocol;
        if (index != 0) {
            response << ',';
        }
        response << "{\"name\":"
                 << json_string(protocol_metadata.display_name.empty()
                                    ? protocol_metadata.name
                                    : protocol_metadata.display_name)
                 << ",\"path\":" << json_string(path_utf8(protocol.relative_path))
                 << ",\"content\":"
                 << json_string(read_text_file(project.root_directory / protocol.relative_path))
                 << ",\"schema\":";
        append_protocol_schema(response, protocol.schema);
        response << '}';
    }
    response << "],\"folders\":[";
    for (std::size_t index = 0; index < project.folders.size(); ++index) {
        if (index != 0)
            response << ',';
        response << json_string(path_utf8(project.folders[index]));
    }
    response << "]}}";
    return response.str();
}

[[nodiscard]] std::string empty_workspace_response(const bool cancelled = false) {
    return "{\"ok\":true,\"source\":\"native-workspace\",\"cancelled\":" +
           std::string{cancelled ? "true" : "false"} + ",\"project\":null}";
}

[[nodiscard]] std::string
workspace_result_response(const iotps::core::workspace::ProjectLoadResult& result) {
    if (const auto* error = result.error_if()) {
        const auto line = error->source_location.has_value() ? error->source_location->line : 0;
        const auto column = error->source_location.has_value() ? error->source_location->column : 0;
        return workspace_error_response(iotps::core::workspace::to_string(error->code),
                                        error->detail, error->path, line, column);
    }
    try {
        return workspace_project_response(result.value());
    } catch (const std::exception& error) {
        return workspace_error_response("protocol_file_read_failed", error.what());
    }
}

[[nodiscard]] std::optional<std::filesystem::path>
select_project_directory(const HWND owner,
                         const wchar_t* title = L"Open IoT Protocol Studio project") {
    Microsoft::WRL::ComPtr<IFileOpenDialog> dialog;
    if (FAILED(CoCreateInstance(CLSID_FileOpenDialog, nullptr, CLSCTX_INPROC_SERVER,
                                IID_PPV_ARGS(&dialog)))) {
        throw std::runtime_error("Creating the project directory picker failed");
    }
    FILEOPENDIALOGOPTIONS options{};
    if (FAILED(dialog->GetOptions(&options)) ||
        FAILED(dialog->SetOptions(options | FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM))) {
        throw std::runtime_error("Configuring the project directory picker failed");
    }
    dialog->SetTitle(title);
    const auto shown = dialog->Show(owner);
    if (shown == HRESULT_FROM_WIN32(ERROR_CANCELLED)) {
        return std::nullopt;
    }
    if (FAILED(shown)) {
        throw std::runtime_error("Showing the project directory picker failed");
    }

    Microsoft::WRL::ComPtr<IShellItem> selection;
    PWSTR selected_path = nullptr;
    if (FAILED(dialog->GetResult(&selection)) ||
        FAILED(selection->GetDisplayName(SIGDN_FILESYSPATH, &selected_path))) {
        throw std::runtime_error("Reading the selected project directory failed");
    }
    std::filesystem::path result{selected_path};
    CoTaskMemFree(selected_path);
    return result;
}

[[nodiscard]] std::string load_workspace(const std::filesystem::path& path,
                                         std::optional<std::filesystem::path>& current_project) {
    auto loaded = iotps::core::workspace::load_project(path);
    if (!loaded.has_value())
        return workspace_result_response(loaded);
    // Commit the active project only after its full UI response can be read successfully.
    auto response = workspace_project_response(loaded.value());
    current_project = loaded.value().root_directory;
    return response;
}

[[nodiscard]] std::string open_workspace(const HWND owner,
                                         std::optional<std::filesystem::path>& current_project) {
    try {
        const auto selected = select_project_directory(owner);
        if (!selected.has_value()) {
            return empty_workspace_response(true);
        }
        return load_workspace(*selected, current_project);
    } catch (const std::exception& error) {
        return workspace_error_response("directory_picker_failed", error.what());
    }
}

[[nodiscard]] std::string
current_workspace(const std::optional<std::filesystem::path>& current_project) {
    return current_project.has_value()
               ? workspace_result_response(iotps::core::workspace::load_project(*current_project))
               : empty_workspace_response();
}

[[nodiscard]] std::string
create_workspace_protocol(const std::string_view request,
                          const std::optional<std::filesystem::path>& current_project) {
    const auto arguments = string_arguments(request);
    if (!arguments.has_value() || arguments->size() != 6) {
        return workspace_error_response("invalid_request", "createProtocol expects six strings");
    }
    if (!current_project.has_value()) {
        return workspace_error_response("project_not_open",
                                        "Open a project before creating a protocol");
    }
    const auto& byte_order = (*arguments)[5];
    if (byte_order != "big" && byte_order != "little") {
        return workspace_error_response("invalid_byte_order",
                                        "byteOrder must be 'big' or 'little'");
    }

    return workspace_result_response(iotps::core::workspace::create_protocol(
        *current_project,
        {
            .relative_path = (*arguments)[0],
            .protocol =
                {
                    .name = (*arguments)[1],
                    .display_name = (*arguments)[2],
                    .version = (*arguments)[3],
                    .description = (*arguments)[4],
                    .default_byte_order = byte_order == "little"
                                              ? iotps::core::schema::ByteOrder::little_endian
                                              : iotps::core::schema::ByteOrder::big_endian,
                },
        }));
}

[[nodiscard]] std::string
save_workspace_protocol(const std::string_view request,
                        const std::optional<std::filesystem::path>& current_project) {
    const auto arguments = string_arguments(request);
    if (!arguments.has_value() || arguments->size() != 2) {
        return workspace_error_response("invalid_request", "saveProtocol expects two strings");
    }
    if (!current_project.has_value()) {
        return workspace_error_response("project_not_open",
                                        "Open a project before saving a protocol");
    }
    return workspace_result_response(iotps::core::workspace::update_protocol(
        *current_project, (*arguments)[0], (*arguments)[1]));
}

[[nodiscard]] std::string
update_workspace_field_display_name(const std::string_view request,
                                    const std::optional<std::filesystem::path>& current_project) {
    const auto arguments = string_arguments(request);
    if (!arguments.has_value() || arguments->size() != 4) {
        return workspace_error_response("invalid_request",
                                        "updateFieldDisplayName expects four strings");
    }
    if (!current_project.has_value()) {
        return workspace_error_response("project_not_open",
                                        "Open a project before updating a field");
    }
    return workspace_result_response(iotps::core::workspace::update_field_display_name(
        *current_project, {
                              .relative_path = (*arguments)[0],
                              .message_name = (*arguments)[1],
                              .field_name = (*arguments)[2],
                              .display_name = (*arguments)[3],
                          }));
}

template <typename Integer>
[[nodiscard]] std::optional<Integer> parse_integer(const std::string_view value) {
    if (value.empty()) {
        return std::nullopt;
    }
    Integer parsed{};
    const auto result = std::from_chars(value.data(), value.data() + value.size(), parsed, 10);
    if (result.ec != std::errc{} || result.ptr != value.data() + value.size()) {
        return std::nullopt;
    }
    return parsed;
}

[[nodiscard]] std::string_view trim_view(const std::string_view value) {
    std::size_t first = 0;
    while (first < value.size() && std::isspace(static_cast<unsigned char>(value[first])) != 0) {
        ++first;
    }
    std::size_t last = value.size();
    while (last > first && std::isspace(static_cast<unsigned char>(value[last - 1])) != 0) {
        --last;
    }
    return value.substr(first, last - first);
}

[[nodiscard]] std::optional<double> parse_float(const std::string_view value) {
    const auto trimmed = trim_view(value);
    if (trimmed.empty()) {
        return std::nullopt;
    }
    try {
        std::size_t consumed = 0;
        const auto parsed = std::stod(std::string{trimmed}, &consumed);
        if (consumed != trimmed.size() || !std::isfinite(parsed)) {
            return std::nullopt;
        }
        return parsed;
    } catch (const std::exception&) {
        return std::nullopt;
    }
}

[[nodiscard]] std::optional<iotps::core::codec::PrimitiveValue>
parse_primitive_value(const iotps::core::schema::FieldType type, const std::string_view value) {
    const auto trimmed = trim_view(value);
    switch (type) {
    case iotps::core::schema::FieldType::boolean:
        if (trimmed == "true") {
            return true;
        }
        if (trimmed == "false") {
            return false;
        }
        return std::nullopt;
    case iotps::core::schema::FieldType::int8:
    case iotps::core::schema::FieldType::int16:
    case iotps::core::schema::FieldType::int32:
    case iotps::core::schema::FieldType::int64:
        if (const auto parsed = parse_integer<std::int64_t>(trimmed); parsed.has_value()) {
            return *parsed;
        }
        return std::nullopt;
    case iotps::core::schema::FieldType::uint8:
    case iotps::core::schema::FieldType::uint16:
    case iotps::core::schema::FieldType::uint32:
    case iotps::core::schema::FieldType::uint64:
        if (const auto parsed = parse_integer<std::uint64_t>(trimmed); parsed.has_value()) {
            return *parsed;
        }
        return std::nullopt;
    case iotps::core::schema::FieldType::float32:
    case iotps::core::schema::FieldType::float64:
        if (const auto parsed = parse_float(trimmed); parsed.has_value()) {
            return *parsed;
        }
        return std::nullopt;
    default:
        return std::nullopt;
    }
}

[[nodiscard]] std::optional<iotps::core::codec::ScalarValue>
parse_field_value(const iotps::core::schema::FieldDefinition& field, const std::string_view value) {
    switch (field.type) {
    case iotps::core::schema::FieldType::string:
        return std::string{value};
    case iotps::core::schema::FieldType::bytes: {
        const auto parsed = iotps::core::parse_hex(trim_view(value));
        if (parsed.has_value()) {
            return std::move(parsed).value();
        }
        return std::nullopt;
    }
    case iotps::core::schema::FieldType::array: {
        if (!field.element_type.has_value()) {
            return std::nullopt;
        }
        iotps::core::codec::ArrayValue values;
        const auto trimmed = trim_view(value);
        if (trimmed.empty()) {
            return values;
        }
        std::size_t start = 0;
        while (start <= trimmed.size()) {
            const auto comma = trimmed.find(',', start);
            const auto end = comma == std::string_view::npos ? trimmed.size() : comma;
            const auto parsed =
                parse_primitive_value(*field.element_type, trimmed.substr(start, end - start));
            if (!parsed.has_value()) {
                return std::nullopt;
            }
            values.push_back(*parsed);
            if (comma == std::string_view::npos) {
                break;
            }
            start = comma + 1;
        }
        return values;
    }
    default:
        if (const auto parsed = parse_primitive_value(field.type, value); parsed.has_value()) {
            return std::visit(
                [](const auto& primitive) -> iotps::core::codec::ScalarValue { return primitive; },
                *parsed);
        }
        return std::nullopt;
    }
}

[[nodiscard]] std::string
encode_error_response(const std::string_view code, const std::string_view message,
                      const std::string_view path = {},
                      const std::optional<std::size_t> offset = std::nullopt) {
    std::string response = "{\"ok\":false,\"source\":\"native-core\",\"error\":{";
    response += "\"code\":" + json_string(code) + ",\"message\":" + json_string(message) +
                ",\"path\":" + json_string(path);
    if (offset.has_value()) {
        response += ",\"offset\":" + std::to_string(*offset);
    }
    response += "}}";
    return response;
}

[[nodiscard]] std::string
encode_protocol_message(const std::string_view request,
                        const std::optional<std::filesystem::path>& current_project) {
    const auto arguments = string_arguments(request);
    if (!arguments.has_value() || arguments->size() < 2 || (arguments->size() - 2) % 2 != 0) {
        return encode_error_response(
            "invalid_request",
            "encodeProtocolMessage expects relativePath, messageName, and field name/value pairs");
    }
    if (!current_project.has_value()) {
        return encode_error_response("project_not_open",
                                     "Open a project before encoding a message");
    }

    const auto loaded = iotps::core::workspace::load_project(*current_project);
    if (const auto* error = loaded.error_if()) {
        return encode_error_response(iotps::core::workspace::to_string(error->code), error->detail,
                                     error->path, error->offset);
    }
    const auto& project = loaded.value();
    const auto protocol = std::ranges::find_if(project.protocols, [&](const auto& candidate) {
        return candidate.relative_path.generic_string() == (*arguments)[0];
    });
    if (protocol == project.protocols.end()) {
        return encode_error_response("protocol_not_referenced",
                                     "protocol is not referenced by project.yaml: '" +
                                         (*arguments)[0] + "'",
                                     "relativePath");
    }
    const auto message =
        std::ranges::find_if(protocol->schema.messages, [&](const auto& candidate) {
            return candidate.name == (*arguments)[1];
        });
    if (message == protocol->schema.messages.end()) {
        return encode_error_response("protocol_message_not_found",
                                     "message was not found: '" + (*arguments)[1] + "'",
                                     "messageName");
    }

    iotps::core::codec::StructuredMessage structured{.message_name = (*arguments)[1]};
    structured.fields.reserve((arguments->size() - 2) / 2);
    for (std::size_t index = 2; index < arguments->size(); index += 2) {
        const auto& field_name = (*arguments)[index];
        const auto field = std::ranges::find_if(
            message->fields, [&](const auto& candidate) { return candidate.name == field_name; });
        if (field == message->fields.end()) {
            return encode_error_response("protocol_field_not_found",
                                         "field was not found in message '" + (*arguments)[1] +
                                             "': '" + field_name + "'",
                                         "fields." + field_name);
        }
        const auto parsed = parse_field_value(*field, (*arguments)[index + 1]);
        if (!parsed.has_value()) {
            return encode_error_response(
                "encode_input_invalid",
                "cannot parse value for field '" + field_name + "' as " +
                    std::string{iotps::core::schema::to_string(field->type)},
                (*arguments)[1] + "." + field_name);
        }
        structured.fields.push_back({.name = field_name, .value = std::move(*parsed)});
    }

    const auto encoded = iotps::core::codec::encode_protocol_hex(protocol->schema, structured);
    if (const auto* error = encoded.error_if()) {
        return encode_error_response(iotps::core::codec::to_string(error->code), error->detail,
                                     error->path, error->offset);
    }
    const auto bytes = iotps::core::parse_hex(encoded.value());
    if (encoded.value().empty()) {
        return R"({"ok":true,"source":"native-core","normalizedHex":"","ascii":"","byteCount":0})";
    }
    if (const auto* error = bytes.error_if()) {
        return encode_error_response("encode_failed", error->detail);
    }
    return "{\"ok\":true,\"source\":\"native-core\",\"normalizedHex\":" +
           json_string(encoded.value()) +
           ",\"ascii\":" + json_string(iotps::core::ascii_preview(bytes.value())) +
           ",\"byteCount\":" + std::to_string(bytes.value().size()) + "}";
}

[[nodiscard]] std::string debug_tool(const std::string& request) {
    const auto args = string_arguments(request);
    if (!args || args->empty() || request.size() > 2 * 1024 * 1024)
        return encode_error_response("invalid_request", "Invalid debug request");
    const auto result = iotps::core::run_debug_tool((*args)[0], std::span(*args).subspan(1));
    if (const auto* error = result.error_if())
        return encode_error_response("invalid_input", error->detail, error->path, error->offset);
    const auto& output = result.value();
    std::ostringstream json;
    json << "{\"ok\":true,\"text\":" << json_string(output.text)
         << ",\"hex\":" << json_string(output.hex) << ",\"matches\":[";
    for (std::size_t i = 0; i < output.matches.size(); ++i) {
        if (i)
            json << ',';
        json << output.matches[i];
    }
    json << "]}";
    return json.str();
}

[[nodiscard]] std::string
decode_debug_message(const std::string& request,
                     const std::optional<std::filesystem::path>& current_project) {
    const auto args = string_arguments(request);
    if (!args || args->size() != 3 || request.size() > 1024 * 1024)
        return encode_error_response("invalid_request", "Decode expects protocol, message and HEX");
    if (!current_project)
        return encode_error_response("project_not_open", "Open a project first");
    const auto loaded = iotps::core::workspace::load_project(*current_project);
    if (const auto* error = loaded.error_if())
        return encode_error_response(iotps::core::workspace::to_string(error->code), error->detail,
                                     error->path, error->offset);
    const auto& project = loaded.value();
    const auto protocol = std::ranges::find_if(project.protocols, [&](const auto& item) {
        return item.relative_path.generic_string() == (*args)[0];
    });
    if (protocol == project.protocols.end())
        return encode_error_response("protocol_not_referenced",
                                     "Protocol is not in the open project");
    const auto decoded =
        iotps::core::codec::decode_protocol_hex(protocol->schema, (*args)[1], (*args)[2]);
    if (const auto* error = decoded.error_if())
        return encode_error_response(iotps::core::codec::to_string(error->code), error->detail,
                                     error->path, error->offset);
    const auto message = std::ranges::find_if(
        protocol->schema.messages, [&](const auto& item) { return item.name == (*args)[1]; });
    std::ostringstream json;
    json << "{\"ok\":true,\"fields\":[";
    const auto& data = decoded.value();
    for (std::size_t i = 0; i < data.message.fields.size(); ++i) {
        if (i)
            json << ',';
        const auto& field = data.message.fields[i];
        const auto definition = std::ranges::find_if(
            message->fields, [&](const auto& item) { return item.name == field.name; });
        const auto range = std::ranges::find_if(data.field_ranges, [&](const auto& item) {
            return item.path == message->name + "." + field.name;
        });
        if (range == data.field_ranges.end())
            return encode_error_response("decode_failed", "Missing field byte range");
        json << "{\"name\":" << json_string(field.name)
             << ",\"displayName\":" << json_string(definition->display_name)
             << ",\"type\":" << json_string(iotps::core::schema::to_string(definition->type))
             << ",\"value\":" << json_string(iotps::core::format_scalar(field.value))
             << ",\"offset\":" << range->offset << ",\"length\":" << range->length << '}';
    }
    json << "]}";
    return json.str();
}

[[nodiscard]] std::string debug_file(HWND owner, const std::string& request, int kind = 0) {
    try {
        const std::size_t limit = kind == 1 ? 16 * 1024 * 1024 : 1024 * 1024;
        if (request.size() > limit + 1024)
            return encode_error_response("invalid_request", "File request exceeds size limit");
        const auto args = string_arguments(request);
        if (!args || args->size() != 2 || ((*args)[0] != "open" && (*args)[0] != "save") ||
            (kind == 2 && (*args)[0] != "save") || (*args)[1].size() > limit)
            return encode_error_response("invalid_request",
                                         "Invalid file request or size limit exceeded");
        const bool save = (*args)[0] == "save";
        Microsoft::WRL::ComPtr<IFileDialog> dialog;
        if (FAILED(CoCreateInstance(save ? CLSID_FileSaveDialog : CLSID_FileOpenDialog, nullptr,
                                    CLSCTX_INPROC_SERVER, IID_PPV_ARGS(&dialog))))
            throw std::runtime_error("Cannot create file dialog");
        const COMDLG_FILTERSPEC filters[]{{kind == 1   ? L"IoT traffic records (*.iottraffic.json)"
                                           : kind == 2 ? L"IoT diagnostic log (*.iotlog.json)"
                                                       : L"IoT Debug annotations (*.iotdebug.json)",
                                           kind == 1   ? L"*.iottraffic.json"
                                           : kind == 2 ? L"*.iotlog.json"
                                                       : L"*.iotdebug.json"},
                                          {L"JSON (*.json)", L"*.json"}};
        dialog->SetFileTypes(2, filters);
        dialog->SetDefaultExtension(kind == 1   ? L"iottraffic.json"
                                    : kind == 2 ? L"iotlog.json"
                                                : L"iotdebug.json");
        dialog->SetFileName(kind == 1   ? L"traffic.iottraffic.json"
                            : kind == 2 ? L"diagnostics.iotlog.json"
                                        : L"annotations.iotdebug.json");
        dialog->SetTitle(kind == 1 ? (save ? L"Export traffic records" : L"Import traffic records")
                         : kind == 2
                             ? L"Export diagnostic log"
                             : (save ? L"Export debug annotations" : L"Import debug annotations"));
        FILEOPENDIALOGOPTIONS options{};
        if (FAILED(dialog->GetOptions(&options)) ||
            FAILED(dialog->SetOptions(options | FOS_FORCEFILESYSTEM |
                                      (save ? FOS_OVERWRITEPROMPT : FOS_FILEMUSTEXIST))))
            throw std::runtime_error("Cannot configure file dialog");
        const auto shown = dialog->Show(owner);
        if (shown == HRESULT_FROM_WIN32(ERROR_CANCELLED))
            return R"({"ok":true,"cancelled":true,"content":""})";
        if (FAILED(shown))
            throw std::runtime_error("File dialog failed");
        Microsoft::WRL::ComPtr<IShellItem> selection;
        PWSTR name = nullptr;
        if (FAILED(dialog->GetResult(&selection)) ||
            FAILED(selection->GetDisplayName(SIGDN_FILESYSPATH, &name)))
            throw std::runtime_error("Cannot read file selection");
        const std::filesystem::path path(name);
        CoTaskMemFree(name);
        if (!save) {
            if (std::filesystem::file_size(path) > limit)
                throw std::runtime_error("File exceeds size limit");
            std::ifstream stream(path, std::ios::binary);
            if (!stream)
                throw std::runtime_error("Cannot open annotation file");
            std::string content(limit + 1, '\0');
            stream.read(content.data(), static_cast<std::streamsize>(content.size()));
            if (stream.bad())
                throw std::runtime_error("Cannot read annotation file");
            content.resize(static_cast<std::size_t>(stream.gcount()));
            if (content.size() > limit)
                throw std::runtime_error("File exceeds size limit");
            return "{\"ok\":true,\"cancelled\":false,\"content\":" + json_string(content) + "}";
        }
        // Write beside the target, then replace atomically; failed saves preserve the old file.
        const auto temp = std::filesystem::path(path.wstring() + L"." +
                                                std::to_wstring(GetTickCount64()) + L".tmp");
        const auto handle = CreateFileW(temp.c_str(), GENERIC_WRITE, 0, nullptr, CREATE_NEW,
                                        FILE_ATTRIBUTE_NORMAL, nullptr);
        if (handle == INVALID_HANDLE_VALUE)
            throw std::runtime_error("Cannot create temporary annotation file");
        DWORD written = 0;
        const auto& content = (*args)[1];
        const bool saved = WriteFile(handle, content.data(), static_cast<DWORD>(content.size()),
                                     &written, nullptr) &&
                           written == content.size() && FlushFileBuffers(handle);
        CloseHandle(handle);
        if (!saved || !MoveFileExW(temp.c_str(), path.c_str(),
                                   MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH)) {
            DeleteFileW(temp.c_str());
            throw std::runtime_error("Cannot save annotation file; original file was preserved");
        }
        return R"({"ok":true,"cancelled":false,"content":""})";
    } catch (const std::exception& error) {
        return encode_error_response("file_error", error.what());
    }
}

[[nodiscard]] std::string inspect_hex(const std::string& request,
                                      const iotps::core::Engine& engine) {
    try {
        const auto input = first_string_argument(request);
        if (!input.has_value()) {
            return error_response("invalid_request", "inspectHex expects one string argument", 0);
        }

        const auto result = engine.inspect_hex(*input);
        if (const auto* error = result.error_if()) {
            return error_response(iotps::core::to_string(error->code), error->detail,
                                  error->offset.value_or(0));
        }

        const auto& inspection = result.value();
        std::ostringstream bytes;
        bytes << '[';
        for (std::size_t index = 0; index < inspection.bytes.size(); ++index) {
            if (index != 0) {
                bytes << ',';
            }
            bytes << static_cast<unsigned int>(inspection.bytes[index]);
        }
        bytes << ']';

        return "{\"ok\":true,\"source\":\"native-core\",\"normalizedHex\":" +
               json_string(inspection.normalized_hex) +
               ",\"ascii\":" + json_string(inspection.ascii) +
               ",\"byteCount\":" + std::to_string(inspection.bytes.size()) +
               ",\"bytes\":" + bytes.str() + ",\"sum8\":" + std::to_string(inspection.sum8) +
               ",\"xor8\":" + std::to_string(inspection.xor8) +
               ",\"crc16Modbus\":" + std::to_string(inspection.crc16_modbus) + '}';
    } catch (const std::exception& error) {
        return error_response("bridge_error", error.what(), 0);
    }
}

constexpr auto missing_ui_html = R"html(
<!doctype html>
<html>
  <head><meta charset="utf-8"><title>IoT Protocol Studio</title></head>
  <body style="margin:0;background:#0d1117;color:#e6edf3;font:14px Segoe UI;padding:32px">
    <h2>IoT Protocol Studio</h2>
    <p>Web UI assets were not found beside the executable.</p>
  </body>
</html>)html";

constexpr auto smoke_test_script = R"js(
window.addEventListener("DOMContentLoaded", () => {
  let attemptsRemaining = 50;
  const originalTheme = window.localStorage.getItem("iotps.theme");
  const report = (result) => {
    if (originalTheme === null) {
      window.localStorage.removeItem("iotps.theme");
    } else {
      window.localStorage.setItem("iotps.theme", originalTheme);
    }
    window.iotpsSmokeResult(result);
  };
  const verify = () => {
    const shell = document.querySelector(".app-shell");
    const titlebar = document.querySelector(".titlebar");
    const schemaButton = document.querySelector(".schema-button.active");
    const debug = document.querySelector(".debug-button");
    const settings = document.querySelector(".settings-button");
    const sidebar = document.querySelector(".schema-sidebar");
    const sidebarResizeHandle = document.querySelector(".sidebar-resize-handle");
    const contentCard = document.querySelector(".content-card");
    const framingRules = document.querySelectorAll(".tcp-framing select option");
    const bindingForms = document.querySelectorAll(".tcp-framing");
    const windowControls = document.querySelectorAll(".window-control");
    if (shell && titlebar && schemaButton && debug && settings && sidebar &&
        sidebarResizeHandle && contentCard && framingRules.length >= 4 && bindingForms.length >= 2 &&
        windowControls.length === 3) {
      Promise.all([
        window.iotpsWorkspaceCurrent(),
        window.iotpsWorkspaceCreateProtocol(
          "smoke.protocol.yaml", "smoke", "", "1.0", "", "big"),
        window.iotpsWorkspaceSaveProtocol("protocols/smoke.protocol.yaml", "messages: {}"),
        window.iotpsWorkspaceUpdateFieldDisplayName(
          "protocols/smoke.protocol.yaml", "message", "field", "Display name"),
        window.iotpsWorkspaceClose(),
        Promise.resolve(window.iotpsWindowAction("maximize"))
          .then((result) => result?.ok && window.iotpsWindowAction("maximize")),
        window.iotpsWorkspaceChangeFolder("create", "protocols/smoke", "protocols", ""),
        window.iotpsWorkspaceCreate(),
        window.iotpsDebugTool("convert", "FF FF FF FF FF FF FF FF", "hex", "uint64", "big"),
        window.iotpsDebugTool("checksum", "31 32 33 34 35 36 37 38 39", "CRC", "0", "8", "16", "8005", "FFFF", "1", "1", "0"),
        window.iotpsDebugDecode("missing", "missing", "00"),
        window.iotpsDebugFile("invalid", ""),
        window.iotpsSmokeDecodeFixture(),
      ])
        .then(async ([current, createResult, saveResult, fieldResult, closed, windowResult, folderResult, projectResult, converted, checksum, decoded, file, fixture]) => {
          await window.iotpsTcp("smoke", "create");
          const tcpPoll = await window.iotpsTcp("smoke", "poll", "0");
          const tcpInvalid = await window.iotpsTcp("smoke", "start", "client", "bad-ip", "9000");
          const tcpHex = await window.iotpsTcp("smoke", "send", "1", "GG");
          const tcpFrame = await window.iotpsTcp("smoke", "frame", "fixed", "4");
          const tcpFrameInvalid = await window.iotpsTcp("smoke", "frame", "length", "0", "3", "1", "big");
          const tcpBindOff = await window.iotpsTcp("smoke", "bind", "off");
          const tcpBindNoProject = await window.iotpsTcp("smoke", "bind", "protocols/a.yaml", "");
          await window.iotpsTcp("smoke", "destroy");
          if (!tcpPoll?.ok || tcpPoll.state !== "closed" || !Array.isArray(tcpPoll.records) || tcpInvalid?.ok || tcpHex?.ok || !tcpFrame?.ok || tcpFrameInvalid?.error?.code !== "invalid_configuration" || !tcpBindOff?.ok || tcpBindNoProject?.error?.code !== "project_not_open") {
            report("tcp-bridge-failed"); return;
          }
          if (!fixture?.ok || fixture.fields?.[0]?.value !== "4660" || fixture.fields[0].offset !== 0 || fixture.fields[0].length !== 2) {
            report("debug-decode-fixture-failed"); return;
          }
          if (!converted?.ok || converted.text !== "18446744073709551615" || !checksum?.ok || checksum.text !== "4B37" || decoded?.error?.code !== "project_not_open" || file?.error?.code !== "invalid_request") {
            report("debug-tools-bridge-failed"); return;
          }
          if (!windowResult?.ok) {
            report("window-controls-failed");
            return;
          }
          if (!current?.ok || current.project !== null || !closed?.ok ||
              closed.project !== null || createResult?.ok ||
              createResult?.error?.code !== "project_not_open" || saveResult?.ok ||
              saveResult?.error?.code !== "project_not_open" || fieldResult?.ok ||
              fieldResult?.error?.code !== "project_not_open" || folderResult?.ok ||
              folderResult?.error?.code !== "project_not_open" || projectResult?.ok ||
              projectResult?.error?.code !== "invalid_request") {
            report("workspace-bridge-failed");
            return;
          }
          const noProjectRename = await window.iotpsWorkspaceRename("Smoke");
          const fixturePath = await window.iotpsSmokeProjectPath();
          const reopened = await window.iotpsWorkspaceOpen(fixturePath);
          const invalidRename = await window.iotpsWorkspaceRename("");
          const failedOpen = await window.iotpsWorkspaceOpen(fixturePath + "/missing-project");
          const retained = await window.iotpsWorkspaceCurrent();
          await window.iotpsWorkspaceClose();
          if (noProjectRename?.error?.code !== "project_not_open" || !reopened?.ok ||
              reopened.project?.protocols.length !== 1 || invalidRename?.error?.code !== "project_name_required" ||
              failedOpen?.ok || retained.project?.rootPath !== reopened.project?.rootPath) {
            report("project-management-bridge-failed"); return;
          }
          const editable = await window.iotpsSmokeSchemaFixture();
          if (!editable?.ok) { report("schema-fixture-failed"); return; }
          await window.iotpsWorkspaceOpen(editable.project.rootPath);
          const path = editable.project.protocols[0].path;
          const edit = async (action, message, field, ...properties) => {
            const result = await window.iotpsWorkspaceEditSchema(path, action, message, field, ...properties);
            if (!result.ok) throw new Error("schema edit failed: " + action);
            return result.project.protocols[0];
          };
          await edit("addMessage", "", "", "name", "packet", "typeId", "18446744073709551615");
          await edit("addField", "packet", "", "name", "value", "type", "uint16", "endian", "little");
          await edit("addField", "packet", "", "name", "flag", "type", "uint8");
          const renamed = await edit("updateField", "packet", "value", "name", "reading", "displayName", "Reading");
          await window.iotpsTcp("smoke-binding", "create");
          const bound = await window.iotpsTcp("smoke-binding", "bind", path, "packet");
          const boundPoll = await window.iotpsTcp("smoke-binding", "poll", "0");
          const invalidBinding = await window.iotpsTcp("smoke-binding", "bind", path, "missing");
          await window.iotpsTcp("smoke-binding", "destroy");
          if (!bound?.ok || boundPoll?.messageName !== "packet" || invalidBinding?.error?.code !== "invalid_configuration") {
            report("tcp-binding-bridge-failed"); return;
          }
          const savedTemplate = await window.iotpsMessageTemplates("save", path, "packet", "Smoke", "reading", "4660", "flag", "1");
          const duplicateTemplate = await window.iotpsMessageTemplates("save", path, "packet", "Smoke", "reading", "0", "flag", "0");
          await window.iotpsWorkspaceClose();
          await window.iotpsWorkspaceOpen(editable.project.rootPath);
          const loadedTemplate = await window.iotpsMessageTemplates("load", path, "packet", "Smoke");
          const encodedTemplate = await window.iotpsEncodeProtocolMessage(path, "packet", ...(loadedTemplate.templates?.[0]?.fields ?? []).flatMap((field) => [field.name, field.value]));
          const deletedTemplate = await window.iotpsMessageTemplates("delete", path, "packet", "Smoke");
          if (!savedTemplate?.ok || duplicateTemplate.error?.code !== "message_template_conflict" ||
              !loadedTemplate?.ok || !encodedTemplate?.ok || encodedTemplate.normalizedHex !== "34 12 01" ||
              !deletedTemplate?.ok || deletedTemplate.templates.length !== 0) {
            report("message-template-bridge-failed"); return;
          }
          const parsedField = renamed.schema.messages[0].fields[1];
          const invalid = await window.iotpsWorkspaceEditSchema(path, "updateField", "packet", "reading", "type", "uint128");
          const encoded = await window.iotpsEncodeProtocolMessage(path, "packet", "reading", "4660", "flag", "1");
          if (invalid?.ok || parsedField.offset !== "2" || parsedField.declaredOffset !== null ||
              parsedField.declaredLength !== null || !encoded?.ok || encoded.normalizedHex !== "34 12 01" ||
              renamed.schema.messages[0].typeId !== "18446744073709551615") {
            report("schema-edit-bridge-failed"); return;
          }
          const moved = await edit("moveFieldUp", "packet", "flag");
          if (moved.schema.messages[0].fields[0].name !== "flag") {
            report("schema-reorder-bridge-failed"); return;
          }
          await edit("deleteField", "packet", "flag");
          await edit("updateMessage", "packet", "", "name", "updated");
          const empty = await edit("deleteMessage", "updated", "");
          if (empty.schema.messages.length !== 0) { report("schema-delete-bridge-failed"); return; }
          const renamedProtocol = await window.iotpsWorkspaceProtocols("rename", path, "Renamed protocol");
          const rejectedDelete = await window.iotpsWorkspaceProtocols("delete", path, "../outside.yaml");
          const deletedProtocol = await window.iotpsWorkspaceProtocols("delete", path);
          if (!renamedProtocol?.ok || renamedProtocol.project.protocols[0].name !== "Renamed protocol" ||
              rejectedDelete?.ok || !deletedProtocol?.ok || deletedProtocol.project.protocols.length !== 0) {
            report("protocol-management-bridge-failed"); return;
          }
          await window.iotpsWorkspaceClose();
          debug.click();
          window.setTimeout(() => {
            if (!document.querySelector(".debug-page") ||
                !document.querySelector("#debug-hex-input") ||
                !document.querySelector(".debug-format-button") ||
                document.querySelector(".debug-page > .content-header") ||
                document.querySelector(".schema-sidebar") ||
                document.querySelector(".sidebar-resize-handle")) {
              report("debug-navigation-failed");
              return;
            }
            settings.click();
            window.setTimeout(() => {
              const lightTheme = document.querySelector(".light-choice");
              const darkTheme = document.querySelector(".dark-choice");
              if (!document.querySelector(".settings-page") ||
                  !document.querySelector(".settings-body") ||
                  !document.querySelector("#settings-theme-title") ||
                  !lightTheme ||
                  !darkTheme ||
                  !document.querySelector("#settings-core-title") ||
                  document.querySelector(".schema-sidebar") ||
                  document.querySelector(".sidebar-resize-handle") ||
                  document.querySelector(".sidebar-footer")) {
                report("settings-navigation-failed");
                return;
              }
              lightTheme.click();
              window.setTimeout(() => {
                if (document.documentElement.dataset.theme !== "light" ||
                    window.localStorage.getItem("iotps.theme") !== "light") {
                  report("light-theme-failed");
                  return;
                }
                darkTheme.click();
                window.setTimeout(() => {
                  if (document.documentElement.dataset.theme !== "dark" ||
                      window.localStorage.getItem("iotps.theme") !== "dark") {
                    report("dark-theme-failed");
                    return;
                  }
                  document.querySelector(".history-back")?.click();
                  window.setTimeout(() => {
                    if (!document.querySelector(".debug-page") ||
                        !document.querySelector(".debug-button.active") ||
                        document.querySelector(".schema-sidebar") ||
                        document.querySelector(".sidebar-resize-handle")) {
                      report("debug-history-failed");
                      return;
                    }
                    document.querySelector(".history-back")?.click();
                    window.setTimeout(() => {
                      if (!document.querySelector(".schema-page") ||
                          !document.querySelector(".schema-button.active") ||
                          !document.querySelector(".schema-sidebar") ||
                          !document.querySelector(".sidebar-resize-handle")) {
                        report("history-navigation-failed");
                        return;
                      }
                      Promise.resolve(window.iotpsCoreInfo())
                        .then((info) =>
                          report(info?.source === "native-core" ? "pass" : "core-bridge-failed"),
                        )
                        .catch(() => report("core-bridge-failed"));
                    }, 0);
                  }, 0);
                }, 0);
              }, 0);
            }, 0);
          }, 0);
        })
        .catch(() => report("bridge-failed"));
      return;
    }
    attemptsRemaining -= 1;
    if (attemptsRemaining > 0) {
      window.setTimeout(verify, 100);
      return;
    }
    report("render-failed");
  };
  verify();
});
)js";

constexpr auto packaged_ui_url = "https://iotps.local/index.html";
constexpr auto packaged_ui_host = L"iotps.local";
WNDPROC original_window_proc = nullptr;

[[nodiscard]] LRESULT resize_hit_test(const HWND window, const LPARAM position) {
    if (IsZoomed(window)) {
        return HTCLIENT;
    }

    RECT bounds{};
    if (!GetWindowRect(window, &bounds)) {
        return HTCLIENT;
    }
    const auto x = GET_X_LPARAM(position);
    const auto y = GET_Y_LPARAM(position);
    const auto border_x = GetSystemMetrics(SM_CXSIZEFRAME) + GetSystemMetrics(SM_CXPADDEDBORDER);
    const auto border_y = GetSystemMetrics(SM_CYSIZEFRAME) + GetSystemMetrics(SM_CXPADDEDBORDER);
    const auto left = x < bounds.left + border_x;
    const auto right = x >= bounds.right - border_x;
    const auto top = y < bounds.top + border_y;
    const auto bottom = y >= bounds.bottom - border_y;

    if (top && left) {
        return HTTOPLEFT;
    }
    if (top && right) {
        return HTTOPRIGHT;
    }
    if (bottom && left) {
        return HTBOTTOMLEFT;
    }
    if (bottom && right) {
        return HTBOTTOMRIGHT;
    }
    if (left) {
        return HTLEFT;
    }
    if (right) {
        return HTRIGHT;
    }
    if (top) {
        return HTTOP;
    }
    if (bottom) {
        return HTBOTTOM;
    }
    return HTCLIENT;
}

LRESULT CALLBACK custom_window_proc(const HWND window, const UINT message, const WPARAM w_param,
                                    const LPARAM l_param) {
    if (message == WM_NCCALCSIZE) {
        return 0;
    }
    if (message == WM_NCHITTEST) {
        const auto hit = resize_hit_test(window, l_param);
        if (hit != HTCLIENT) {
            return hit;
        }
    }
    if (message == WM_GETMINMAXINFO) {
        auto* sizing = reinterpret_cast<MINMAXINFO*>(l_param);
        MONITORINFO monitor_info{.cbSize = sizeof(MONITORINFO)};
        if (GetMonitorInfoW(MonitorFromWindow(window, MONITOR_DEFAULTTONEAREST), &monitor_info)) {
            sizing->ptMaxPosition = {
                monitor_info.rcWork.left - monitor_info.rcMonitor.left,
                monitor_info.rcWork.top - monitor_info.rcMonitor.top,
            };
            sizing->ptMaxSize = {
                monitor_info.rcWork.right - monitor_info.rcWork.left,
                monitor_info.rcWork.bottom - monitor_info.rcWork.top,
            };
        }
        return 0;
    }
    return CallWindowProcW(original_window_proc, window, message, w_param, l_param);
}

[[nodiscard]] HWND native_window(webview::webview& window) {
    auto window_result = window.window();
    window_result.ensure_ok();
    return static_cast<HWND>(window_result.value());
}

void apply_application_icon(const HWND window) {
    using Icon = std::unique_ptr<std::remove_pointer_t<HICON>, decltype(&DestroyIcon)>;
    // Keep both sizes alive for the window class; release them at process shutdown.
    static const Icon big_icon{
        static_cast<HICON>(LoadImageW(GetModuleHandleW(nullptr), MAKEINTRESOURCEW(IDI_APP_ICON),
                                      IMAGE_ICON, GetSystemMetrics(SM_CXICON),
                                      GetSystemMetrics(SM_CYICON), 0)),
        DestroyIcon};
    static const Icon small_icon{
        static_cast<HICON>(LoadImageW(GetModuleHandleW(nullptr), MAKEINTRESOURCEW(IDI_APP_ICON),
                                      IMAGE_ICON, GetSystemMetrics(SM_CXSMICON),
                                      GetSystemMetrics(SM_CYSMICON), 0)),
        DestroyIcon};
    if (!big_icon || !small_icon) {
        throw std::runtime_error("Loading the application icons failed");
    }

    SendMessageW(window, WM_SETICON, ICON_BIG, reinterpret_cast<LPARAM>(big_icon.get()));
    SendMessageW(window, WM_SETICON, ICON_SMALL, reinterpret_cast<LPARAM>(small_icon.get()));
    SetClassLongPtrW(window, GCLP_HICON, reinterpret_cast<LONG_PTR>(big_icon.get()));
    SetClassLongPtrW(window, GCLP_HICONSM, reinterpret_cast<LONG_PTR>(small_icon.get()));
}

void enable_custom_titlebar(const HWND window) {
    const auto style = GetWindowLongPtrW(window, GWL_STYLE);
    if (SetWindowLongPtrW(window, GWL_STYLE, style & ~static_cast<LONG_PTR>(WS_CAPTION)) == 0) {
        throw std::runtime_error("Removing the native title bar failed");
    }
    SetLastError(ERROR_SUCCESS);
    const auto previous_proc =
        SetWindowLongPtrW(window, GWLP_WNDPROC, reinterpret_cast<LONG_PTR>(custom_window_proc));
    if (previous_proc == 0 && GetLastError() != ERROR_SUCCESS) {
        throw std::runtime_error("Installing the custom window frame failed");
    }
    original_window_proc = reinterpret_cast<WNDPROC>(previous_proc);
    if (!SetWindowPos(window, nullptr, 0, 0, 0, 0,
                      SWP_FRAMECHANGED | SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE)) {
        throw std::runtime_error("Refreshing the custom title bar frame failed");
    }

    constexpr auto border_color_attribute = static_cast<DWMWINDOWATTRIBUTE>(34);
    constexpr COLORREF no_border = 0xFFFFFFFE;
    DwmSetWindowAttribute(window, border_color_attribute, &no_border, sizeof(no_border));
}

[[nodiscard]] bool custom_resize_frame_ready(const HWND window) {
    if (SendMessageW(window, WM_GETICON, ICON_BIG, 0) == 0 ||
        SendMessageW(window, WM_GETICON, ICON_SMALL, 0) == 0) {
        return false;
    }
    RECT bounds{};
    if (!GetWindowRect(window, &bounds)) {
        return false;
    }
    const auto middle_y = bounds.top + (bounds.bottom - bounds.top) / 2;
    const auto middle_x = bounds.left + (bounds.right - bounds.left) / 2;
    const auto left = SendMessageW(window, WM_NCHITTEST, 0, MAKELPARAM(bounds.left + 1, middle_y));
    const auto top = SendMessageW(window, WM_NCHITTEST, 0, MAKELPARAM(middle_x, bounds.top + 1));
    const auto bottom_right =
        SendMessageW(window, WM_NCHITTEST, 0, MAKELPARAM(bounds.right - 1, bounds.bottom - 1));
    return left == HTLEFT && top == HTTOP && bottom_right == HTBOTTOMRIGHT;
}

[[nodiscard]] std::string handle_window_action(const HWND window, const std::string& request) {
    const auto action = first_string_argument(request);
    if (!action.has_value()) {
        return R"({"ok":false})";
    }

    if (*action == "drag") {
        ReleaseCapture();
        SendMessageW(window, WM_NCLBUTTONDOWN, HTCAPTION, 0);
    } else if (*action == "minimize") {
        ShowWindow(window, SW_MINIMIZE);
    } else if (*action == "maximize") {
        ShowWindow(window, IsZoomed(window) ? SW_RESTORE : SW_MAXIMIZE);
    } else if (*action == "close") {
        PostMessageW(window, WM_CLOSE, 0, 0);
    } else {
        return R"({"ok":false})";
    }
    return R"({"ok":true})";
}

void throw_if_failed(const HRESULT result, const std::string_view operation) {
    if (SUCCEEDED(result)) {
        return;
    }

    std::ostringstream message;
    message << operation << " failed with HRESULT 0x" << std::hex << std::uppercase
            << static_cast<unsigned long>(result);
    throw std::runtime_error(message.str());
}

void navigate_to_packaged_ui(webview::webview& window, const std::filesystem::path& ui_directory) {
    auto controller_result = window.browser_controller();
    controller_result.ensure_ok();
    auto* controller = static_cast<ICoreWebView2Controller*>(controller_result.value());

    Microsoft::WRL::ComPtr<ICoreWebView2> browser;
    throw_if_failed(controller->get_CoreWebView2(browser.GetAddressOf()),
                    "Getting the WebView2 browser");

    Microsoft::WRL::ComPtr<ICoreWebView2_3> browser_v3;
    throw_if_failed(browser.As(&browser_v3), "Getting the WebView2 virtual host API");

    const auto absolute_directory = std::filesystem::absolute(ui_directory).wstring();
    throw_if_failed(
        browser_v3->SetVirtualHostNameToFolderMapping(packaged_ui_host, absolute_directory.c_str(),
                                                      COREWEBVIEW2_HOST_RESOURCE_ACCESS_KIND_DENY),
        "Mapping the packaged Web UI directory");
    window.navigate(packaged_ui_url).ensure_ok();
}

} // namespace

int WINAPI WinMain(HINSTANCE, HINSTANCE, LPSTR command_line, int) {
    static_assert(sizeof(void*) == 8, "The first desktop target is Windows x86_64");

    try {
        const auto smoke_test =
            std::string_view{command_line}.find("--smoke-test") != std::string_view::npos;
#if defined(_DEBUG)
        constexpr bool enable_devtools = true;
#else
        constexpr bool enable_devtools = false;
#endif

        const iotps::core::Engine engine;
        webview::webview window(enable_devtools, nullptr);
        window.set_title("IoT Protocol Studio");
        const auto window_handle = native_window(window);
        apply_application_icon(window_handle);
        enable_custom_titlebar(window_handle);
        window.set_size(1280, 800, WEBVIEW_HINT_NONE);
        window.set_size(960, 640, WEBVIEW_HINT_MIN);
        const auto smoke_test_frame_ready = !smoke_test || custom_resize_frame_ready(window_handle);
        std::optional<std::filesystem::path> current_project;
        std::map<std::string, std::unique_ptr<iotps::core::transport::TcpSession>> tcp_sessions;
        TcpWindows tcp_windows(window, [&tcp_sessions] { tcp_sessions.clear(); });
        window.bind("iotpsTcp", [&tcp_sessions, &current_project](const std::string& request) {
            auto args = string_arguments(request);
            if (!args || args->size() < 2 || args->size() > 7 || (*args)[0].empty() ||
                (*args)[0].size() > 64)
                return workspace_error_response("invalid_request", "invalid TCP command");
            const auto session_id = (*args)[0];
            args->erase(args->begin());
            if ((*args)[0] == "create" && args->size() == 1) {
                if (!tcp_sessions.contains(session_id)) {
                    if (tcp_sessions.size() >= 16)
                        return workspace_error_response("session_limit",
                                                        "At most 16 communication sessions");
                    tcp_sessions.emplace(session_id,
                                         std::make_unique<iotps::core::transport::TcpSession>());
                }
                return std::string{"{\"ok\":true}"};
            }
            if ((*args)[0] == "destroy" && args->size() == 1) {
                tcp_sessions.erase(session_id);
                return std::string{"{\"ok\":true}"};
            }
            const auto found = tcp_sessions.find(session_id);
            if (found == tcp_sessions.end())
                return workspace_error_response("session_not_found",
                                                "Communication session is closed");
            auto& tcp = *found->second;
            const auto number = [](const std::string& text) -> std::optional<std::uint64_t> {
                std::uint64_t value = 0;
                const auto [end, error] =
                    std::from_chars(text.data(), text.data() + text.size(), value);
                if (error != std::errc{} || end != text.data() + text.size())
                    return std::nullopt;
                return value;
            };
            iotps::core::transport::TransportResult result = std::monostate{};
            const auto& action = (*args)[0];
            if (action == "start" && (args->size() == 4 || args->size() == 6)) {
                const auto port = number((*args)[3]);
                const auto retries =
                    args->size() == 6 ? number((*args)[4]) : std::optional<std::uint64_t>{0};
                const auto interval =
                    args->size() == 6 ? number((*args)[5]) : std::optional<std::uint64_t>{2000};
                if (!port || *port == 0 || *port > 65535 || !retries || *retries > 10 ||
                    !interval || *interval < 1000 || *interval > 60000 ||
                    ((*args)[1] != "client" && (*args)[1] != "server"))
                    return workspace_error_response("invalid_configuration",
                                                    "invalid TCP mode or port");
                result = tcp.start(
                    (*args)[1] == "server", (*args)[2], static_cast<std::uint16_t>(*port),
                    static_cast<std::uint32_t>(*retries), static_cast<std::uint32_t>(*interval));
            } else if (action == "stop" && args->size() == 1)
                tcp.stop();
            else if (action == "clear" && args->size() == 1)
                tcp.clear_records();
            else if (action == "disconnect" && args->size() == 2) {
                const auto peer = number((*args)[1]);
                if (!peer)
                    return workspace_error_response("invalid_request", "invalid peer");
                result = tcp.disconnect(*peer);
            } else if (action == "send" && args->size() == 3) {
                const auto peer = number((*args)[1]);
                if (!peer || (*args)[2].size() > 262144)
                    return workspace_error_response("invalid_request",
                                                    "invalid peer or HEX exceeds limit");
                const auto parsed = iotps::core::parse_hex((*args)[2]);
                if (const auto* error = parsed.error_if())
                    return workspace_error_response("invalid_hex", error->detail);
                result = tcp.send(*peer, parsed.value());
            } else if (action == "frame") {
                iotps::core::transport::FrameRule rule;
                if (args->size() == 2 && (*args)[1] == "off") {
                    rule.mode = iotps::core::transport::FrameMode::off;
                } else if (args->size() == 3 && (*args)[1] == "fixed") {
                    const auto size = number((*args)[2]);
                    if (!size || *size > iotps::core::transport::max_frame_buffer)
                        return workspace_error_response("invalid_configuration",
                                                        "invalid fixed frame size");
                    rule.mode = iotps::core::transport::FrameMode::fixed;
                    rule.fixed_size = static_cast<std::size_t>(*size);
                } else if (args->size() == 6 && (*args)[1] == "length") {
                    const auto offset = number((*args)[2]);
                    const auto width = number((*args)[3]);
                    const auto adjustment = number((*args)[4]);
                    if (!offset || !width || !adjustment ||
                        *offset > iotps::core::transport::max_frame_buffer ||
                        *adjustment > iotps::core::transport::max_frame_buffer ||
                        ((*args)[5] != "big" && (*args)[5] != "little"))
                        return workspace_error_response("invalid_configuration",
                                                        "invalid length field framing");
                    rule.mode = iotps::core::transport::FrameMode::length_field;
                    rule.length_offset = static_cast<std::size_t>(*offset);
                    rule.length_size = static_cast<std::size_t>(*width);
                    rule.length_adjustment = static_cast<std::size_t>(*adjustment);
                    rule.little_endian = (*args)[5] == "little";
                } else if (args->size() == 3 && (*args)[1] == "delimiter") {
                    const auto delimiter = iotps::core::parse_hex((*args)[2]);
                    if (const auto* error = delimiter.error_if())
                        return workspace_error_response("invalid_hex", error->detail);
                    rule.mode = iotps::core::transport::FrameMode::delimiter;
                    rule.delimiter = delimiter.value();
                } else {
                    return workspace_error_response("invalid_request", "invalid framing command");
                }
                result = tcp.set_framing(std::move(rule));
            } else if (action == "bind" && args->size() == 2 && (*args)[1] == "off") {
                tcp.clear_binding();
            } else if (action == "bind" && args->size() == 3) {
                if (!current_project)
                    return workspace_error_response("project_not_open", "Open a project first");
                const auto loaded = iotps::core::workspace::load_project(*current_project);
                if (const auto* error = loaded.error_if())
                    return workspace_error_response(
                        std::string{iotps::core::workspace::to_string(error->code)}, error->detail);
                const auto& protocols = loaded.value().protocols;
                const auto protocol = std::ranges::find_if(protocols, [&](const auto& item) {
                    return item.relative_path.generic_string() == (*args)[1];
                });
                if (protocol == protocols.end())
                    return workspace_error_response("protocol_not_referenced",
                                                    "Protocol is not in the open project");
                result = tcp.bind_protocol(protocol->schema, (*args)[1], (*args)[2]);
            } else if ((action == "poll" && args->size() == 2) ||
                       (action == "export" && args->size() == 1)) {
                const auto cursor =
                    action == "export" ? std::optional<std::uint64_t>{0} : number((*args)[1]);
                if (!cursor)
                    return workspace_error_response("invalid_request", "invalid cursor");
                const auto state = action == "export" ? tcp.snapshot(0, 1000, 4 * 1024 * 1024)
                                                      : tcp.snapshot(*cursor);
                using iotps::core::transport::TransportState;
                const char* label = state.state == TransportState::open      ? "open"
                                    : state.state == TransportState::opening ? "opening"
                                    : state.state == TransportState::faulted ? "faulted"
                                                                             : "closed";
                std::ostringstream out;
                out << "{\"ok\":true,\"state\":" << json_string(label)
                    << ",\"server\":" << (state.server ? "true" : "false")
                    << ",\"host\":" << json_string(state.host) << ",\"port\":" << state.port
                    << ",\"error\":" << json_string(state.error)
                    << ",\"sent\":" << state.statistics.bytes_sent
                    << ",\"received\":" << state.statistics.bytes_received
                    << ",\"queued\":" << state.queued_bytes << ",\"dropped\":" << state.dropped
                    << ",\"retries\":" << state.retries << ",\"cursor\":" << state.cursor
                    << ",\"protocolPath\":" << json_string(state.protocol_path)
                    << ",\"messageName\":" << json_string(state.message_name)
                    << ",\"peers\":[";
                bool first = true;
                for (const auto& peer : state.peers) {
                    if (!first)
                        out << ',';
                    first = false;
                    out << "{\"id\":" << peer.id << ",\"address\":" << json_string(peer.address)
                        << '}';
                }
                out << "],\"records\":[";
                first = true;
                for (const auto& record : state.records) {
                    if (!first)
                        out << ',';
                    first = false;
                    out << "{\"id\":" << record.id << ",\"time\":" << record.time_ms
                        << ",\"direction\":" << json_string(record.direction)
                        << ",\"peer\":" << record.peer
                        << ",\"address\":" << json_string(record.address)
                        << ",\"hex\":" << json_string(iotps::core::format_hex(record.data))
                        << ",\"size\":" << record.data.size()
                        << ",\"detail\":" << json_string(record.detail);
                    if (record.parsed) {
                        const auto& parsed = *record.parsed;
                        out << ",\"parsed\":{\"protocolPath\":"
                            << json_string(parsed.protocol_path)
                            << ",\"messageName\":" << json_string(parsed.message_name)
                            << ",\"status\":" << json_string(parsed.status)
                            << ",\"checksum\":" << json_string(parsed.checksum)
                            << ",\"error\":" << json_string(parsed.error) << ",\"fields\":[";
                        bool first_field = true;
                        for (const auto& field : parsed.fields) {
                            if (!first_field)
                                out << ',';
                            first_field = false;
                            out << "{\"name\":" << json_string(field.name)
                                << ",\"displayName\":" << json_string(field.display_name)
                                << ",\"type\":" << json_string(field.type)
                                << ",\"value\":" << json_string(field.value)
                                << ",\"offset\":" << field.offset
                                << ",\"length\":" << field.length << '}';
                        }
                        out << "]}";
                    }
                    out << '}';
                }
                out << "]}";
                return out.str();
            } else
                return workspace_error_response("invalid_request", "unknown TCP command");
            if (const auto* error = result.error_if())
                return workspace_error_response(
                    std::string{iotps::core::transport::to_string(error->code)}, error->detail);
            return std::string{"{\"ok\":true}"};
        });

        window.bind("iotpsCoreInfo", [](const std::string&) { return core_info(); });
        window.bind("iotpsInspectHex",
                    [&engine](const std::string& request) { return inspect_hex(request, engine); });
        window.bind("iotpsDebugTool",
                    [](const std::string& request) { return debug_tool(request); });
        window.bind("iotpsDebugDecode", [&current_project](const std::string& request) {
            return decode_debug_message(request, current_project);
        });
        window.bind("iotpsDebugFile", [window_handle](const std::string& request) {
            return debug_file(window_handle, request);
        });
        window.bind("iotpsTrafficFile", [window_handle](const std::string& request) {
            return debug_file(window_handle, request, 1);
        });
        window.bind("iotpsLogFile", [window_handle](const std::string& request) {
            return debug_file(window_handle, request, 2);
        });
        window.bind("iotpsWorkspaceCurrent", [&current_project](const std::string&) {
            return current_workspace(current_project);
        });
        window.bind("iotpsWorkspaceOpen", [window_handle,
                                           &current_project](const std::string& request) {
            const auto arguments = string_arguments(request);
            if (!arguments || arguments->size() > 1)
                return workspace_error_response("invalid_request",
                                                "openProject expects an optional path");
            if (arguments->empty() || (*arguments)[0].empty())
                return open_workspace(window_handle, current_project);
            try {
                const auto& utf8 = (*arguments)[0];
                const auto path = std::filesystem::path{std::u8string{utf8.begin(), utf8.end()}};
                if (!path.is_absolute())
                    return workspace_error_response("invalid_request",
                                                    "an absolute project path is required");
                return load_workspace(path, current_project);
            } catch (const std::exception& error) {
                return workspace_error_response("workspace_operation_failed", error.what());
            }
        });
        window.bind("iotpsWorkspaceRename", [&current_project](const std::string& request) {
            const auto arguments = string_arguments(request);
            if (!arguments || arguments->size() != 1)
                return workspace_error_response("invalid_request", "renameProject expects a name");
            if (!current_project)
                return workspace_error_response("project_not_open", "Open a project first");
            return workspace_result_response(
                iotps::core::workspace::rename_project(*current_project, (*arguments)[0]));
        });
        window.bind("iotpsWorkspaceProtocols", [&current_project](const std::string& request) {
            const auto args = string_arguments(request);
            if (!args || args->size() < 2 || args->size() > 1001)
                return workspace_error_response("invalid_request",
                                                "protocol operation expects targets");
            if (!current_project)
                return workspace_error_response("project_not_open", "Open a project first");
            if ((*args)[0] == "rename" && args->size() == 3)
                return workspace_result_response(iotps::core::workspace::rename_protocol(
                    *current_project, (*args)[1], (*args)[2]));
            if ((*args)[0] == "delete")
                return workspace_result_response(iotps::core::workspace::delete_protocols(
                    *current_project, {args->begin() + 1, args->end()}));
            return workspace_error_response("invalid_request", "unknown protocol operation");
        });
        window.bind("iotpsWorkspaceCreate", [window_handle,
                                             &current_project](const std::string& request) {
            const auto arguments = string_arguments(request);
            if (!arguments || arguments->size() != 1) {
                return workspace_error_response("invalid_request", "createProject expects a name");
            }
            try {
                const auto parent = select_project_directory(
                    window_handle, L"Select parent directory for the new project");
                if (!parent)
                    return empty_workspace_response(true);
                auto result = iotps::core::workspace::create_project(*parent, (*arguments)[0]);
                if (result.has_value())
                    current_project = result.value().root_directory;
                return workspace_result_response(result);
            } catch (const std::exception& error) {
                return workspace_error_response("directory_picker_failed", error.what());
            }
        });
        window.bind("iotpsWorkspaceChangeFolder", [&current_project](const std::string& request) {
            const auto arguments = string_arguments(request);
            if (!arguments || arguments->size() != 4) {
                return workspace_error_response("invalid_request",
                                                "changeFolder expects four strings");
            }
            if (!current_project)
                return workspace_error_response("project_not_open", "Open a project first");
            return workspace_result_response(iotps::core::workspace::change_folder(
                *current_project, (*arguments)[0], (*arguments)[1], (*arguments)[2],
                (*arguments)[3]));
        });
        window.bind("iotpsWorkspaceCreateProtocol", [&current_project](const std::string& request) {
            return create_workspace_protocol(request, current_project);
        });
        window.bind("iotpsWorkspaceSaveProtocol", [&current_project](const std::string& request) {
            return save_workspace_protocol(request, current_project);
        });
        window.bind("iotpsWorkspaceUpdateFieldDisplayName",
                    [&current_project](const std::string& request) {
                        return update_workspace_field_display_name(request, current_project);
                    });
        window.bind("iotpsWorkspaceEditSchema", [&current_project](const std::string& request) {
            const auto arguments = string_arguments(request);
            if (!arguments || arguments->size() < 4 || arguments->size() > 22 ||
                arguments->size() % 2 != 0)
                return workspace_error_response(
                    "invalid_request", "editSchema expects a target followed by property pairs");
            if (!current_project)
                return workspace_error_response("project_not_open", "Open a project first");
            iotps::core::workspace::SchemaEditRequest edit{
                .relative_path = (*arguments)[0],
                .action = (*arguments)[1],
                .message_name = (*arguments)[2],
                .field_name = (*arguments)[3],
            };
            for (std::size_t i = 4; i < arguments->size(); i += 2)
                edit.properties.emplace_back((*arguments)[i], (*arguments)[i + 1]);
            return workspace_result_response(
                iotps::core::workspace::edit_schema(*current_project, edit));
        });
        window.bind("iotpsEncodeProtocolMessage", [&current_project](const std::string& request) {
            return encode_protocol_message(request, current_project);
        });
        window.bind("iotpsMessageTemplates", [&current_project](const std::string& request) {
            const auto args = string_arguments(request);
            if (!args || args->size() < 4 || args->size() > 2004 || args->size() % 2 != 0)
                return workspace_error_response(
                    "invalid_request",
                    "templates expect action, protocol, message, name and field pairs");
            if (!current_project)
                return workspace_error_response("project_not_open", "Open a project first");
            std::vector<std::pair<std::string, std::string>> values;
            for (std::size_t i = 4; i < args->size(); i += 2)
                values.emplace_back((*args)[i], (*args)[i + 1]);
            const auto result = iotps::core::workspace::message_templates(
                *current_project, (*args)[0], (*args)[1], (*args)[2], (*args)[3], values);
            if (const auto* error = result.error_if())
                return workspace_error_response(iotps::core::workspace::to_string(error->code),
                                                error->detail, error->path);
            std::ostringstream json;
            json << "{\"ok\":true,\"templates\":[";
            bool first = true;
            for (const auto& item : result.value()) {
                if (!first)
                    json << ',';
                first = false;
                json << "{\"name\":" << json_string(item.name)
                     << ",\"compatible\":" << (item.compatible ? "true" : "false")
                     << ",\"fields\":[";
                bool first_field = true;
                for (const auto& field : item.fields) {
                    if (!first_field)
                        json << ',';
                    first_field = false;
                    json << "{\"name\":" << json_string(field.name)
                         << ",\"value\":" << json_string(field.value) << '}';
                }
                json << "]}";
            }
            json << "]}";
            return json.str();
        });
        window.bind("iotpsWorkspaceClose", [&current_project](const std::string&) {
            current_project.reset();
            return empty_workspace_response();
        });
        window.bind("iotpsWindowAction", [window_handle](const std::string& request) {
            return handle_window_action(window_handle, request);
        });

        std::atomic_bool smoke_test_passed = false;
        std::optional<std::filesystem::path> smoke_schema_project;
        if (smoke_test) {
            window.bind("iotpsSmokeTcpWindows", [&tcp_windows](const std::string& request) {
                if (first_string_argument(request) == "close")
                    tcp_windows.close_first();
                return std::to_string(tcp_windows.count());
            });
            window.bind("iotpsSmokeSchemaFixture", [&smoke_schema_project](const std::string&) {
                auto project = iotps::core::workspace::create_project(
                    std::filesystem::temp_directory_path(),
                    "iotps-schema-smoke-" + std::to_string(GetCurrentProcessId()) + "-" +
                        std::to_string(GetTickCount64()));
                if (!project.has_value())
                    return workspace_result_response(project);
                smoke_schema_project = project.value().root_directory;
                return workspace_result_response(iotps::core::workspace::create_protocol(
                    *smoke_schema_project, {.relative_path = "protocols/editor.protocol.yaml",
                                            .protocol = {.name = "editor", .version = "1.0"}}));
            });
#if defined(IOTPS_TEST_PROJECT)
            window.bind("iotpsSmokeProjectPath", [](const std::string&) {
                return json_string(path_utf8(std::filesystem::path{IOTPS_TEST_PROJECT}));
            });
            window.bind("iotpsSmokeDecodeFixture", [](const std::string&) {
                return decode_debug_message(
                    R"(["protocols/smart-sensor.protocol.yaml","telemetry","34 12"])",
                    std::filesystem::path{IOTPS_TEST_PROJECT});
            });
#endif
            window.bind("iotpsSmokeResult", [&window, &smoke_test_passed,
                                             smoke_test_frame_ready](const std::string& request) {
                const auto result = first_string_argument(request);
                std::ofstream(executable_directory() / "smoke-result.txt")
                    << result.value_or("no result") << "; frame=" << smoke_test_frame_ready;
                smoke_test_passed.store(smoke_test_frame_ready && result.has_value() &&
                                            *result == "pass",
                                        std::memory_order_release);
                window.dispatch([&window] { window.terminate(); });
                return "null";
            });
            window.init(std::string_view{command_line}.find("--tcp-windows") !=
                                std::string_view::npos
                            ? tcp_smoke_script
                            : smoke_test_script);
        }

        if (const auto url = smoke_test ? std::nullopt : development_url(); url.has_value()) {
            window.navigate(*url);
        } else {
            const auto ui_directory = executable_directory() / "web-ui";
            const auto ui_path = ui_directory / "index.html";
            if (std::filesystem::exists(ui_path)) {
                navigate_to_packaged_ui(window, ui_directory);
            } else {
                window.set_html(missing_ui_html);
            }
        }

        window.run();
        if (smoke_schema_project) {
            std::error_code ignored;
            std::filesystem::remove_all(*smoke_schema_project, ignored);
        }
        return smoke_test && !smoke_test_passed.load(std::memory_order_acquire) ? 2 : 0;
    } catch (const std::exception& error) {
        MessageBoxA(nullptr, error.what(), "IoT Protocol Studio", MB_OK | MB_ICONERROR);
        return 1;
    }
}
