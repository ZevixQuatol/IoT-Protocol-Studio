#pragma once

#include "webview/webview.h"

#include <algorithm>
#include <functional>
#include <memory>
#include <stdexcept>
#include <string_view>
#include <vector>
#include <windows.h>
#include <wrl/client.h>
#include <wrl/event.h>

// Child WebViews share the opener's environment so window.open and DOM adoption work.
// All windows and bridge calls run on the existing UI thread, in one application process.
class TcpWindows {
    template <typename T> using ComPtr = Microsoft::WRL::ComPtr<T>;
    static constexpr UINT close_message = WM_APP + 72;
    struct Popup {
        HWND hwnd{};
        ComPtr<ICoreWebView2Controller> controller;
        ComPtr<ICoreWebView2> browser;
        bool closing{false};
        void resize() const {
            if (hwnd && controller) {
                RECT bounds{};
                GetClientRect(hwnd, &bounds);
                controller->put_Bounds(bounds);
            }
        }
        void close() {
            if (closing)
                return;
            closing = true;
            if (controller)
                controller->Close();
            browser.Reset();
            controller.Reset();
            if (hwnd)
                DestroyWindow(hwnd);
            hwnd = nullptr;
        }
        ~Popup() {
            close();
        }
    };
    struct State {
        bool stopped{false};
        std::vector<std::shared_ptr<Popup>> windows;
    };
    std::shared_ptr<State> state_{std::make_shared<State>()};
    ComPtr<ICoreWebView2> opener_;
    EventRegistrationToken token_{};
    EventRegistrationToken navigation_token_{};
    bool registered_{false};

    static LRESULT CALLBACK procedure(HWND hwnd, UINT message, WPARAM wparam, LPARAM lparam) {
        auto* popup = reinterpret_cast<Popup*>(GetWindowLongPtrW(hwnd, GWLP_USERDATA));
        if (message == WM_NCCREATE) {
            popup = static_cast<Popup*>(reinterpret_cast<CREATESTRUCTW*>(lparam)->lpCreateParams);
            popup->hwnd = hwnd;
            SetWindowLongPtrW(hwnd, GWLP_USERDATA, reinterpret_cast<LONG_PTR>(popup));
        }
        if (popup) {
            switch (message) {
            case WM_CLOSE:
                if (popup->browser)
                    popup->browser->ExecuteScript(
                        L"window.dispatchEvent(new Event('iotps-dock')); window.close();", nullptr);
                else
                    popup->close();
                return 0;
            case close_message:
                popup->close();
                return 0;
            case WM_SIZE:
                popup->resize();
                return 0;
            case WM_MOVE:
                if (popup->controller)
                    popup->controller->NotifyParentWindowPositionChanged();
                break;
            case WM_SETFOCUS:
                if (popup->controller)
                    popup->controller->MoveFocus(COREWEBVIEW2_MOVE_FOCUS_REASON_PROGRAMMATIC);
                break;
            case WM_DPICHANGED: {
                const auto* rect = reinterpret_cast<RECT*>(lparam);
                SetWindowPos(hwnd, nullptr, rect->left, rect->top, rect->right - rect->left,
                             rect->bottom - rect->top, SWP_NOZORDER | SWP_NOACTIVATE);
                popup->resize();
                return 0;
            }
            case WM_GETMINMAXINFO: {
                auto* limits = reinterpret_cast<MINMAXINFO*>(lparam);
                limits->ptMinTrackSize = {800, 600};
                return 0;
            }
            case WM_NCDESTROY:
                popup->hwnd = nullptr;
                SetWindowLongPtrW(hwnd, GWLP_USERDATA, 0);
                break;
            }
        }
        return DefWindowProcW(hwnd, message, wparam, lparam);
    }

  public:
    std::size_t count() const {
        return static_cast<std::size_t>(
            std::count_if(state_->windows.begin(), state_->windows.end(),
                          [](const auto& popup) { return popup->hwnd != nullptr; }));
    }
    void close_first() {
        for (const auto& popup : state_->windows)
            if (popup->hwnd) {
                PostMessageW(popup->hwnd, WM_CLOSE, 0, 0);
                return;
            }
    }
    explicit TcpWindows(webview::webview& window, std::function<void()> reset_sessions) {
        auto handle = window.browser_controller();
        handle.ensure_ok();
        auto* controller = static_cast<ICoreWebView2Controller*>(handle.value());
        if (FAILED(controller->get_CoreWebView2(&opener_)))
            throw std::runtime_error("Cannot access popup opener");
        ComPtr<ICoreWebView2_2> browser2;
        ComPtr<ICoreWebView2Environment> environment;
        if (FAILED(opener_.As(&browser2)) || FAILED(browser2->get_Environment(&environment)))
            throw std::runtime_error("Cannot access popup environment");
        WNDCLASSW cls{};
        cls.lpfnWndProc = procedure;
        cls.hInstance = GetModuleHandleW(nullptr);
        cls.lpszClassName = L"IoTProtocolStudioTcpWindow";
        cls.hCursor = LoadCursorW(nullptr, IDC_ARROW);
        cls.hIcon = LoadIconW(cls.hInstance, MAKEINTRESOURCEW(101));
        RegisterClassW(&cls);
        const auto state = state_;
        const auto result = opener_->add_NewWindowRequested(
            Microsoft::WRL::Callback<ICoreWebView2NewWindowRequestedEventHandler>(
                [state, environment](ICoreWebView2*,
                                     ICoreWebView2NewWindowRequestedEventArgs* args) -> HRESULT {
                    args->put_Handled(TRUE);
                    LPWSTR uri = nullptr;
                    if (FAILED(args->get_Uri(&uri)))
                        return S_OK;
                    const bool allowed = uri && std::wstring_view{uri} == L"about:blank";
                    CoTaskMemFree(uri);
                    std::erase_if(state->windows, [](const auto& item) { return !item->hwnd; });
                    if (!allowed || state->stopped || state->windows.size() >= 16)
                        return S_OK;
                    ComPtr<ICoreWebView2Deferral> deferral;
                    if (FAILED(args->GetDeferral(&deferral)))
                        return S_OK;
                    auto popup = std::make_shared<Popup>();
                    CreateWindowExW(0, L"IoTProtocolStudioTcpWindow", L"TCP · IoT Protocol Studio",
                                    WS_OVERLAPPEDWINDOW, CW_USEDEFAULT, CW_USEDEFAULT, 1060, 800,
                                    nullptr, nullptr, GetModuleHandleW(nullptr), popup.get());
                    if (!popup->hwnd) {
                        deferral->Complete();
                        return S_OK;
                    }
                    state->windows.push_back(popup);
                    ComPtr<ICoreWebView2NewWindowRequestedEventArgs> request = args;
                    const auto created = environment->CreateCoreWebView2Controller(
                        popup->hwnd,
                        Microsoft::WRL::Callback<
                            ICoreWebView2CreateCoreWebView2ControllerCompletedHandler>(
                            [state, popup, request,
                             deferral](HRESULT error, ICoreWebView2Controller* child) -> HRESULT {
                                if (state->stopped || !popup->hwnd || FAILED(error) || !child) {
                                    if (child)
                                        child->Close();
                                    popup->close();
                                    deferral->Complete();
                                    return S_OK;
                                }
                                popup->controller = child;
                                if (FAILED(child->get_CoreWebView2(&popup->browser))) {
                                    popup->close();
                                    deferral->Complete();
                                    return S_OK;
                                }
                                std::weak_ptr<Popup> weak = popup;
                                EventRegistrationToken ignored{};
                                popup->browser->add_WindowCloseRequested(
                                    Microsoft::WRL::Callback<
                                        ICoreWebView2WindowCloseRequestedEventHandler>(
                                        [weak](ICoreWebView2*, IUnknown*) -> HRESULT {
                                            if (auto item = weak.lock(); item && item->hwnd)
                                                PostMessageW(item->hwnd, close_message, 0, 0);
                                            return S_OK;
                                        })
                                        .Get(),
                                    &ignored);
                                popup->browser->add_DocumentTitleChanged(
                                    Microsoft::WRL::Callback<
                                        ICoreWebView2DocumentTitleChangedEventHandler>(
                                        [weak](ICoreWebView2* browser, IUnknown*) -> HRESULT {
                                            LPWSTR title = nullptr;
                                            if (SUCCEEDED(browser->get_DocumentTitle(&title))) {
                                                if (auto item = weak.lock(); item && item->hwnd)
                                                    SetWindowTextW(item->hwnd, title);
                                                CoTaskMemFree(title);
                                            }
                                            return S_OK;
                                        })
                                        .Get(),
                                    &ignored);
                                const auto linked = request->put_NewWindow(popup->browser.Get());
                                if (SUCCEEDED(linked)) {
                                    popup->resize();
                                    child->put_IsVisible(TRUE);
                                    ShowWindow(popup->hwnd, SW_SHOWNORMAL);
                                } else
                                    popup->close();
                                deferral->Complete();
                                return S_OK;
                            })
                            .Get());
                    if (FAILED(created)) {
                        popup->close();
                        deferral->Complete();
                    }
                    return S_OK;
                })
                .Get(),
            &token_);
        registered_ = SUCCEEDED(result);
        if (!registered_)
            throw std::runtime_error("Cannot enable communication windows");
        opener_->add_NavigationStarting(
            Microsoft::WRL::Callback<ICoreWebView2NavigationStartingEventHandler>(
                [state, reset_sessions](ICoreWebView2*,
                                        ICoreWebView2NavigationStartingEventArgs*) -> HRESULT {
                    // A full main-page reload loses its React owners; never leave hidden live
                    // sessions.
                    for (const auto& popup : state->windows)
                        popup->close();
                    reset_sessions();
                    return S_OK;
                })
                .Get(),
            &navigation_token_);
    }
    ~TcpWindows() {
        state_->stopped = true;
        if (registered_)
            opener_->remove_NewWindowRequested(token_);
        opener_->remove_NavigationStarting(navigation_token_);
        for (const auto& popup : state_->windows)
            popup->close();
    }
};
