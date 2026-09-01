#include "iotps/core/engine.hpp"
#include "iotps/core/version.hpp"
#include "iotps/core/workspace/workspace.hpp"
#include "webview/webview.h"

#include <atomic>
#include <cctype>
#include <dwmapi.h>
#include <filesystem>
#include <fstream>
#include <optional>
#include <shobjidl.h>
#include <sstream>
#include <stdexcept>
#include <string>
#include <string_view>
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
        response << ",\"fields\":[";

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

[[nodiscard]] std::optional<std::filesystem::path> select_project_directory(const HWND owner) {
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
    dialog->SetTitle(L"Open IoT Protocol Studio project");
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

[[nodiscard]] std::string open_workspace(const HWND owner,
                                         std::optional<std::filesystem::path>& current_project) {
    try {
        const auto selected = select_project_directory(owner);
        if (!selected.has_value()) {
            return empty_workspace_response(true);
        }
        auto loaded = iotps::core::workspace::load_project(*selected);
        if (loaded.has_value()) {
            current_project = loaded.value().root_directory;
        }
        return workspace_result_response(loaded);
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
  const report = (result) => window.iotpsSmokeResult(result);
  const verify = () => {
    const shell = document.querySelector(".app-shell");
    const titlebar = document.querySelector(".titlebar");
    const schemaButton = document.querySelector(".schema-button.active");
    const settings = document.querySelector(".settings-button");
    const sidebar = document.querySelector(".schema-sidebar");
    const contentCard = document.querySelector(".content-card");
    const windowControls = document.querySelectorAll(".window-control");
    if (shell && titlebar && schemaButton && settings && sidebar && contentCard &&
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
      ])
        .then(([current, createResult, saveResult, fieldResult, closed, windowResult]) => {
          if (!windowResult?.ok) {
            report("window-controls-failed");
            return;
          }
          if (!current?.ok || current.project !== null || !closed?.ok ||
              closed.project !== null || createResult?.ok ||
              createResult?.error?.code !== "project_not_open" || saveResult?.ok ||
              saveResult?.error?.code !== "project_not_open" || fieldResult?.ok ||
              fieldResult?.error?.code !== "project_not_open") {
            report("workspace-bridge-failed");
            return;
          }
          settings.click();
          window.setTimeout(() => {
            if (!document.querySelector(".settings-page")) {
              report("settings-navigation-failed");
              return;
            }
            document.querySelector(".history-back")?.click();
            window.setTimeout(() => {
              if (!document.querySelector(".schema-page") ||
                  !document.querySelector(".schema-button.active")) {
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
        enable_custom_titlebar(window_handle);
        window.set_size(1280, 800, WEBVIEW_HINT_NONE);
        window.set_size(960, 640, WEBVIEW_HINT_MIN);
        const auto smoke_test_frame_ready = !smoke_test || custom_resize_frame_ready(window_handle);
        std::optional<std::filesystem::path> current_project;

        window.bind("iotpsCoreInfo", [](const std::string&) { return core_info(); });
        window.bind("iotpsInspectHex",
                    [&engine](const std::string& request) { return inspect_hex(request, engine); });
        window.bind("iotpsWorkspaceCurrent", [&current_project](const std::string&) {
            return current_workspace(current_project);
        });
        window.bind("iotpsWorkspaceOpen", [window_handle, &current_project](const std::string&) {
            return open_workspace(window_handle, current_project);
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
        window.bind("iotpsWorkspaceClose", [&current_project](const std::string&) {
            current_project.reset();
            return empty_workspace_response();
        });
        window.bind("iotpsWindowAction", [window_handle](const std::string& request) {
            return handle_window_action(window_handle, request);
        });

        std::atomic_bool smoke_test_passed = false;
        if (smoke_test) {
            window.bind("iotpsSmokeResult", [&window, &smoke_test_passed,
                                             smoke_test_frame_ready](const std::string& request) {
                const auto result = first_string_argument(request);
                smoke_test_passed.store(smoke_test_frame_ready && result.has_value() &&
                                            *result == "pass",
                                        std::memory_order_release);
                window.dispatch([&window] { window.terminate(); });
                return "null";
            });
            window.init(smoke_test_script);
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
        return smoke_test && !smoke_test_passed.load(std::memory_order_acquire) ? 2 : 0;
    } catch (const std::exception& error) {
        MessageBoxA(nullptr, error.what(), "IoT Protocol Studio", MB_OK | MB_ICONERROR);
        return 1;
    }
}
