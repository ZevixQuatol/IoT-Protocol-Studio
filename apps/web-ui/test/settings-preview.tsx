// Development fixture only. Production diagnostics are owned by App.tsx.
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ArrowLeft, ArrowRight, Minus, Settings, Square, X } from "react-feather";
import SettingsWorkspace from "../src/SettingsWorkspace";
import NavigationIcon from "../src/NavigationIcon";
import {
  applyDisplay,
  readDisplay,
  readThemeMode,
  resolveTheme,
  storeThemeMode,
  type ThemeMode,
} from "../src/displayPreferences";
import { detectInitialLocale, storeLocale, storeTheme, type Locale } from "../src/i18n";
import type { Diagnostic } from "../src/diagnostics";
import "../src/styles.css";
import "../src/settings-workspace.css";
import "../src/ui-consistency.css";

const time = new Date(2026, 9, 4, 14, 22, 11, 328).getTime();
const samples: Diagnostic[] = [
  {
    id: 1,
    time,
    page: "debug",
    context: "SensorLink",
    message: "字段 temperature 需要 2 字节，报文仅剩 1 字节。",
    problem: true,
    code: "field_out_of_range",
    path: "StatusReply.temperature",
    offset: 11,
    hex: "AA 55 01 10 00 2A 01 64 00 00 00 1C",
    hexOffset: 0,
  },
  {
    id: 2,
    time: time - 120000,
    page: "tcp",
    context: "Sensor TCP",
    message: "CRC 校验失败：期望 0x1A2B，实际 0x3F4C。",
    problem: true,
    session: "tcp-1",
  },
  {
    id: 3,
    time: time - 180000,
    page: "schema",
    context: "SensorLink",
    message: "字段类型不匹配：请检查 deviceId 字段定义。",
    problem: true,
    code: "field_type_mismatch",
    path: "ReadStatus.deviceId",
    protocol: "protocols/sensorlink.yaml",
    line: 18,
    column: 5,
  },
  {
    id: 4,
    time: time - 240000,
    page: "tcp",
    context: "Sensor TCP",
    message: "等待响应超时（2000ms）。",
    problem: true,
    level: "warn",
    session: "tcp-1",
  },
  {
    id: 5,
    time: time - 300000,
    page: "environments",
    context: "环境变量",
    message: "未定义变量 {{accessToken}}。",
    problem: true,
    code: "variable_not_defined",
    path: "accessToken",
  },
  {
    id: 6,
    time: time - 360000,
    page: "tcp",
    context: "Sensor TCP",
    message: "连接已关闭。",
    problem: false,
    session: "tcp-1",
  },
  {
    id: 7,
    time: time - 420000,
    page: "debug",
    context: "SensorLink",
    message: "协议已加载，准备解析 HEX。",
    problem: false,
    level: "debug",
  },
];

function Preview() {
  const [locale, setLocale] = useState<Locale>(detectInitialLocale);
  const [mode, setMode] = useState<ThemeMode>(readThemeMode);
  const [theme, setTheme] = useState(() => resolveTheme(mode));
  const [display, setDisplay] = useState(readDisplay);
  const [items, setItems] = useState(() =>
    new URLSearchParams(location.search).has("many")
      ? Array.from({ length: 105 }, (_, i) => ({
          ...samples[i % samples.length],
          id: i + 1,
          time: time + i * 1000,
        }))
      : samples,
  );
  const [notice, setNotice] = useState("");
  useEffect(() => {
    storeThemeMode(mode);
    const media = matchMedia("(prefers-color-scheme: dark)");
    const update = () => setTheme(resolveTheme(mode));
    update();
    if (mode === "system") {
      media.addEventListener("change", update);
      return () => media.removeEventListener("change", update);
    }
  }, [mode]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    storeTheme(theme);
  }, [theme]);
  useEffect(() => {
    document.documentElement.lang = locale;
    storeLocale(locale);
  }, [locale]);
  useEffect(() => applyDisplay(display), [display]);
  return (
    <div className="app-shell settings-home">
      <header className="titlebar">
        <div className="titlebar-brand">
          <img src="/iot-protocol-studio.svg" alt="" />
          IoT Protocol Studio
        </div>
        <nav className="titlebar-nav">
          <button className="nav-button" disabled aria-label="后退">
            <ArrowLeft size={16} />
          </button>
          <button className="nav-button" disabled aria-label="前进">
            <ArrowRight size={16} />
          </button>
        </nav>
        <div className="titlebar-drag-region" />
        <div className="window-controls">
          <button className="window-control" disabled aria-label="设置">
            <Settings size={18} />
          </button>
          <button className="window-control" disabled aria-label="最小化">
            <Minus size={14} />
          </button>
          <button className="window-control" disabled aria-label="最大化">
            <Square size={12} />
          </button>
          <button className="window-control" disabled aria-label="关闭">
            <X size={16} />
          </button>
        </div>
      </header>
      <div className="workspace-layout">
        <aside className="navigation-rail" aria-label="主导航">
          {(["schema", "debug", "tcp", "environments", "settings"] as const).map((name, index) => (
            <button
              key={name}
              className={`nav-button ${name === "settings" ? "active" : ""}`}
              disabled
              aria-label={name}
            >
              <NavigationIcon name={name} selected={name === "settings"} size={25} />
              <span className="p14-nav-label">
                {locale === "zh-CN"
                  ? ["协议工作区", "调试", "通信", "环境与变量", "设置"][index]
                  : ["Workspace", "Debug", "Transport", "Variables", "Settings"][index]}
              </span>
            </button>
          ))}
        </aside>
        <section className="content-stage">
          <main className="content-card settings-page">
            <SettingsWorkspace
              locale={locale}
              theme={theme}
              themeMode={mode}
              display={display}
              coreInfo={{
                product: "IoT Protocol Studio",
                version: "0.1.0",
                platform: "browser",
                architecture: "preview",
                source: "browser-preview",
              }}
              diagnostics={items}
              onTheme={setMode}
              onLocale={setLocale}
              onDisplay={setDisplay}
              onClear={() => setItems([])}
              onLocate={(item) => setNotice(`Located: ${item.page} / ${item.path ?? item.context}`)}
              onExport={async (entries) => {
                const action = new URLSearchParams(location.search).get("export");
                if (action === "fail") throw new Error("Preview export failed");
                if (action === "cancel") return "cancelled";
                setNotice(`Exported ${entries.length} entries`);
                return "saved";
              }}
            />
            {notice && (
              <p
                role="status"
                style={{ position: "absolute", right: 20, bottom: 4, margin: 0, fontSize: 11 }}
              >
                {notice}
              </p>
            )}
          </main>
        </section>
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<Preview />);
