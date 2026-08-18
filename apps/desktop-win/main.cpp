#include "iotps/core/engine.hpp"
#include "iotps/core/version.hpp"

#include "webview/webview.h"

#include <windows.h>
#include <wrl/client.h>

#include <atomic>
#include <filesystem>
#include <optional>
#include <sstream>
#include <stdexcept>
#include <string>
#include <string_view>
#include <variant>

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

[[nodiscard]] std::optional<std::string> first_string_argument(const std::string_view request) {
    std::size_t position = 0;
    while (position < request.size() && request[position] == ' ') {
        ++position;
    }
    if (position >= request.size() || request[position] != '[') {
        return std::nullopt;
    }
    ++position;
    while (position < request.size() && request[position] == ' ') {
        ++position;
    }
    if (position >= request.size() || request[position] != '"') {
        return std::nullopt;
    }
    ++position;

    std::string value;
    while (position < request.size()) {
        const auto character = request[position++];
        if (character == '"') {
            return value;
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
    return std::nullopt;
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

[[nodiscard]] std::string inspect_hex(const std::string& request,
                                      const iotps::core::Engine& engine) {
    try {
        const auto input = first_string_argument(request);
        if (!input.has_value()) {
            return error_response("invalid_request", "inspectHex expects one string argument", 0);
        }

        const auto result = engine.inspect_hex(*input);
        if (const auto* error = std::get_if<iotps::core::HexError>(&result)) {
            return error_response(iotps::core::to_string(error->code), error->message,
                                  error->position);
        }

        const auto& inspection = std::get<iotps::core::HexInspection>(result);
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
    if (document.querySelector(".app-shell")) {
      Promise.resolve(window.iotpsCoreInfo())
        .then((info) => report(info?.source === "native-core" ? "pass" : "core-bridge-failed"))
        .catch(() => report("core-bridge-failed"));
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

void throw_if_failed(const HRESULT result, const std::string_view operation) {
    if (SUCCEEDED(result)) {
        return;
    }

    std::ostringstream message;
    message << operation << " failed with HRESULT 0x" << std::hex << std::uppercase
            << static_cast<unsigned long>(result);
    throw std::runtime_error(message.str());
}

void navigate_to_packaged_ui(webview::webview& window,
                             const std::filesystem::path& ui_directory) {
    auto controller_result = window.browser_controller();
    controller_result.ensure_ok();
    auto* controller = static_cast<ICoreWebView2Controller*>(controller_result.value());

    Microsoft::WRL::ComPtr<ICoreWebView2> browser;
    throw_if_failed(controller->get_CoreWebView2(browser.GetAddressOf()),
                    "Getting the WebView2 browser");

    Microsoft::WRL::ComPtr<ICoreWebView2_3> browser_v3;
    throw_if_failed(browser.As(&browser_v3), "Getting the WebView2 virtual host API");

    const auto absolute_directory = std::filesystem::absolute(ui_directory).wstring();
    throw_if_failed(browser_v3->SetVirtualHostNameToFolderMapping(
                        packaged_ui_host, absolute_directory.c_str(),
                        COREWEBVIEW2_HOST_RESOURCE_ACCESS_KIND_DENY),
                    "Mapping the packaged Web UI directory");
    window.navigate(packaged_ui_url).ensure_ok();
}

} // namespace

int WINAPI WinMain(HINSTANCE, HINSTANCE, LPSTR command_line, int) {
    static_assert(sizeof(void*) == 8, "The first desktop target is Windows x86_64");

    try {
        const auto smoke_test = std::string_view{command_line}.find("--smoke-test") !=
                                std::string_view::npos;
#if defined(_DEBUG)
        constexpr bool enable_devtools = true;
#else
        constexpr bool enable_devtools = false;
#endif

        const iotps::core::Engine engine;
        webview::webview window(enable_devtools, nullptr);
        window.set_title("IoT Protocol Studio");
        window.set_size(1280, 800, WEBVIEW_HINT_NONE);
        window.set_size(960, 640, WEBVIEW_HINT_MIN);

        window.bind("iotpsCoreInfo", [](const std::string&) { return core_info(); });
        window.bind("iotpsInspectHex",
                    [&engine](const std::string& request) { return inspect_hex(request, engine); });

        std::atomic_bool smoke_test_passed = false;
        if (smoke_test) {
            window.bind("iotpsSmokeResult",
                        [&window, &smoke_test_passed](const std::string& request) {
                            const auto result = first_string_argument(request);
                            smoke_test_passed.store(result.has_value() && *result == "pass",
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
