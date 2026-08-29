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

[[nodiscard]] std::filesystem::path schema_cache_root() {
    PWSTR local_app_data = nullptr;
    if (FAILED(SHGetKnownFolderPath(FOLDERID_LocalAppData, KF_FLAG_DEFAULT, nullptr,
                                    &local_app_data))) {
        throw std::runtime_error("Resolving the local application data directory failed");
    }
    const auto root = std::filesystem::path{local_app_data} / L"IoT Protocol Studio" / L"schemas";
    CoTaskMemFree(local_app_data);
    return root;
}

void write_file_if_missing(const std::filesystem::path& path, const std::string_view contents) {
    if (std::filesystem::exists(path)) {
        return;
    }
    std::filesystem::create_directories(path.parent_path());
    std::ofstream output{path, std::ios::binary};
    if (!output.is_open()) {
        throw std::runtime_error("Creating workspace file failed: " + path_utf8(path));
    }
    output.write(contents.data(), static_cast<std::streamsize>(contents.size()));
    if (!output) {
        throw std::runtime_error("Writing workspace file failed: " + path_utf8(path));
    }
}

void seed_default_schema(const std::filesystem::path& root) {
    const auto schema_directory = root / L"smart-sensor";
    write_file_if_missing(schema_directory / L"project.yaml", R"yaml(schemaVersion: "0.1"
project:
  name: smart-sensor
  displayName: 智能传感器
  version: "1.0"
  description: 环境传感器与 Modbus 网关协议
protocols:
  - protocols/sensors/environment/environment-sensor.protocol.yaml
  - protocols/gateways/modbus/modbus-gateway.protocol.yaml
)yaml");
    write_file_if_missing(schema_directory / L"protocols" / L"sensors" / L"environment" /
                              L"environment-sensor.protocol.yaml",
                          R"yaml(schemaVersion: "0.1"
protocol:
  name: environment-sensor
  displayName: 环境传感器
  version: "1.0"
  defaultByteOrder: little
messages:
  telemetry:
    typeId: 1
    fields:
      - name: temperature
        type: int16
      - name: humidity
        type: uint16
)yaml");
    write_file_if_missing(schema_directory / L"protocols" / L"gateways" / L"modbus" /
                              L"modbus-gateway.protocol.yaml",
                          R"yaml(schemaVersion: "0.1"
protocol:
  name: modbus-gateway
  displayName: Modbus 网关
  version: "1.0"
  defaultByteOrder: big
messages:
  status:
    typeId: 2
    fields:
      - name: address
        type: uint8
      - name: online
        type: bool
)yaml");
}

[[nodiscard]] std::vector<std::filesystem::path>
find_schema_directories(const std::filesystem::path& root) {
    std::filesystem::create_directories(root);
    std::vector<std::filesystem::path> directories;
    for (const auto& entry : std::filesystem::directory_iterator{root}) {
        if (entry.is_directory() &&
            std::filesystem::is_regular_file(entry.path() / L"project.yaml")) {
            directories.push_back(entry.path());
        }
    }
    std::ranges::sort(directories, [](const auto& left, const auto& right) {
        return path_utf8(left.filename()) < path_utf8(right.filename());
    });
    return directories;
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

[[nodiscard]] std::string workspace_catalog() {
    try {
        const auto root = schema_cache_root();
        auto schema_directories = find_schema_directories(root);
        if (schema_directories.empty()) {
            seed_default_schema(root);
            schema_directories = find_schema_directories(root);
        }

        std::ostringstream response;
        response << "{\"ok\":true,\"source\":\"native-workspace\",\"cacheRoot\":"
                 << json_string(path_utf8(root)) << ",\"schemas\":[";
        bool first_schema = true;
        for (const auto& directory : schema_directories) {
            const auto loaded = iotps::core::workspace::load_project(directory);
            if (const auto* error = loaded.error_if()) {
                throw std::runtime_error(
                    "Workspace error[" +
                    std::string{iotps::core::workspace::to_string(error->code)} + "] " +
                    error->path + ": " + error->detail);
            }
            const auto& project = loaded.value();
            if (!first_schema) {
                response << ',';
            }
            first_schema = false;
            const auto& metadata = project.manifest.metadata;
            const auto schema_name =
                metadata.display_name.empty() ? metadata.name : metadata.display_name;
            response << "{\"id\":" << json_string(path_utf8(directory.filename()))
                     << ",\"name\":" << json_string(schema_name)
                     << ",\"description\":" << json_string(metadata.description)
                     << ",\"protocols\":[";

            bool first_protocol = true;
            for (const auto& protocol : project.protocols) {
                if (!first_protocol) {
                    response << ',';
                }
                first_protocol = false;
                const auto& protocol_metadata = protocol.schema.protocol;
                const auto protocol_name = protocol_metadata.display_name.empty()
                                               ? protocol_metadata.name
                                               : protocol_metadata.display_name;
                response << "{\"name\":" << json_string(protocol_name)
                         << ",\"path\":" << json_string(path_utf8(protocol.relative_path))
                         << ",\"content\":"
                         << json_string(
                                read_text_file(project.root_directory / protocol.relative_path))
                         << '}';
            }
            response << "]}";
        }
        response << "]}";
        return response.str();
    } catch (const std::exception& error) {
        return "{\"ok\":false,\"source\":\"native-workspace\",\"error\":{\"message\":" +
               json_string(error.what()) + "}}";
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
        window.iotpsWorkspaceCatalog(),
        Promise.resolve(window.iotpsWindowAction("maximize"))
          .then((result) => result?.ok && window.iotpsWindowAction("maximize")),
      ])
        .then(([catalog, windowResult]) => {
          if (!windowResult?.ok) {
            report("window-controls-failed");
            return;
          }
          if (!catalog?.ok || catalog.schemas.length === 0 ||
              catalog.schemas[0].protocols.length === 0) {
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

        window.bind("iotpsCoreInfo", [](const std::string&) { return core_info(); });
        window.bind("iotpsInspectHex",
                    [&engine](const std::string& request) { return inspect_hex(request, engine); });
        window.bind("iotpsWorkspaceCatalog",
                    [](const std::string&) { return workspace_catalog(); });
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
