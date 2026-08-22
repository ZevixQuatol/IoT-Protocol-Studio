import {
  Activity,
  Braces,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Cpu,
  FileCode2,
  FolderOpen,
  Hexagon,
  Languages,
  Play,
  RotateCcw,
  TerminalSquare,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getCoreInfo, inspectHex, type CoreInfo, type InspectionResult } from "./bridge";
import {
  detectInitialLocale,
  messages,
  storeLocale,
  translateError,
  type Locale,
  type TranslationMessages,
} from "./i18n";

const sampleHex = "AA 55 01 0A 78 56 34 12 03 02 01 A8 C3";

type LogEntryData = {
  level: "info" | "success" | "error";
} & (
  | { key: "workbenchInitialized" }
  | { key: "coreConnected"; version: string; source: CoreInfo["source"] }
  | { key: "coreConnectionFailed"; detail?: string }
  | { key: "inspectionSucceeded"; byteCount: number; source: InspectionResult["source"] }
  | { key: "inspectionFailed"; code: string; fallback?: string; position: number }
);

type LogEntry = LogEntryData & {
  id: number;
};

function toHex(value: number, width: number): string {
  return `0x${value.toString(16).toUpperCase().padStart(width, "0")}`;
}

function sourceLabel(translation: TranslationMessages, source: InspectionResult["source"]): string {
  return source === "native-core"
    ? translation.status.nativeCpp
    : translation.status.browserPreview;
}

function platformLabel(translation: TranslationMessages, platform?: string): string {
  if (!platform) {
    return translation.status.connecting;
  }
  if (platform === "Windows") {
    return translation.status.windows;
  }
  if (platform === "Web preview") {
    return translation.status.browserPreview;
  }
  return platform;
}

function architectureLabel(translation: TranslationMessages, architecture?: string): string {
  return architecture === "browser" ? translation.status.browser : (architecture ?? "...");
}

function logMessage(translation: TranslationMessages, entry: LogEntry): string {
  switch (entry.key) {
    case "workbenchInitialized":
      return translation.logs.workbenchInitialized;
    case "coreConnected":
      return translation.logs.coreConnected(entry.version, sourceLabel(translation, entry.source));
    case "coreConnectionFailed":
      return translation.logs.coreConnectionFailed(entry.detail);
    case "inspectionSucceeded":
      return translation.logs.inspectionSucceeded(
        entry.byteCount,
        sourceLabel(translation, entry.source),
      );
    case "inspectionFailed":
      return translation.logs.inspectionFailed(
        translateError(translation, entry.code, entry.fallback),
        entry.code,
        entry.position,
      );
  }
}

export default function App() {
  const [locale, setLocale] = useState<Locale>(detectInitialLocale);
  const [input, setInput] = useState(sampleHex);
  const [result, setResult] = useState<InspectionResult | null>(null);
  const [coreInfo, setCoreInfo] = useState<CoreInfo | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([
    { id: 1, level: "info", key: "workbenchInitialized" },
  ]);
  const translation = messages[locale];

  const appendLog = useCallback((entry: LogEntryData) => {
    setLogs((current) => [...current.slice(-49), { ...entry, id: Date.now() }]);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    storeLocale(locale);
  }, [locale]);

  useEffect(() => {
    getCoreInfo()
      .then((info) => {
        setCoreInfo(info);
        appendLog({
          level: "success",
          key: "coreConnected",
          version: info.version,
          source: info.source,
        });
      })
      .catch((error: unknown) => {
        appendLog({
          level: "error",
          key: "coreConnectionFailed",
          detail: error instanceof Error ? error.message : undefined,
        });
      });
  }, [appendLog]);

  const runInspection = useCallback(async () => {
    const nextResult = await inspectHex(input);
    setResult(nextResult);
    if (nextResult.ok) {
      appendLog({
        level: "success",
        key: "inspectionSucceeded",
        byteCount: nextResult.byteCount,
        source: nextResult.source,
      });
      return;
    }
    appendLog({
      level: "error",
      key: "inspectionFailed",
      code: nextResult.error.code,
      fallback: nextResult.error.message,
      position: nextResult.error.position,
    });
  }, [appendLog, input]);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        void runInspection();
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [runInspection]);

  const byteRows = useMemo(() => {
    if (!result?.ok) {
      return [];
    }
    return result.bytes.map((byte, offset) => ({
      offset,
      hex: byte.toString(16).toUpperCase().padStart(2, "0"),
      decimal: byte,
      ascii: byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : ".",
    }));
  }, [result]);

  return (
    <div className="app-shell">
      <header className="titlebar">
        <div className="brand">
          <Hexagon size={18} strokeWidth={2.2} />
          <strong>IoT Protocol Studio</strong>
          <span className="version">v{coreInfo?.version ?? "..."}</span>
        </div>
        <div className="runtime-status">
          <div className="language-switch" aria-label={translation.language.selector} role="group">
            <Languages aria-hidden="true" size={14} />
            <button
              aria-label={translation.language.switchToChinese}
              aria-pressed={locale === "zh-CN"}
              className={locale === "zh-CN" ? "active" : ""}
              onClick={() => setLocale("zh-CN")}
              type="button"
            >
              {translation.language.chinese}
            </button>
            <button
              aria-label={translation.language.switchToEnglish}
              aria-pressed={locale === "en-US"}
              className={locale === "en-US" ? "active" : ""}
              onClick={() => setLocale("en-US")}
              type="button"
            >
              {translation.language.english}
            </button>
          </div>
          <span
            className={`status-dot ${coreInfo?.source === "native-core" ? "native" : "preview"}`}
          />
          <span>{platformLabel(translation, coreInfo?.platform)}</span>
          <span className="separator">/</span>
          <span>{architectureLabel(translation, coreInfo?.architecture)}</span>
        </div>
      </header>

      <div className="toolbar">
        <button className="project-button" type="button">
          <FolderOpen size={16} />
          {translation.explorer.project}
          <ChevronDown size={14} />
        </button>
        <div className="toolbar-divider" />
        <span className="connection-label">{translation.status.coreSession}</span>
        <span className="connection-state">{translation.status.ready}</span>
        <div className="toolbar-spacer" />
        <button className="secondary-action" type="button" onClick={() => setInput(sampleHex)}>
          <RotateCcw size={15} />
          {translation.actions.reset}
        </button>
        <button className="primary-action" type="button" onClick={() => void runInspection()}>
          <Play size={15} fill="currentColor" />
          {translation.actions.inspect}
        </button>
      </div>

      <main className="workbench">
        <aside className="explorer panel">
          <div className="panel-title">{translation.explorer.title}</div>
          <div className="tree-row tree-root">
            <ChevronDown size={14} />
            <FolderOpen size={15} />
            <span>{translation.explorer.project}</span>
          </div>
          <div className="tree-row tree-child active">
            <FileCode2 size={15} />
            <span>device.yaml</span>
          </div>
          <div className="tree-row tree-child">
            <ChevronRight size={14} />
            <span>{translation.explorer.messages}</span>
          </div>
          <div className="tree-row tree-child">
            <ChevronRight size={14} />
            <span>{translation.explorer.connections}</span>
          </div>
          <div className="tree-row tree-child">
            <ChevronRight size={14} />
            <span>{translation.explorer.tests}</span>
          </div>

          <div className="explorer-section">
            <div className="panel-title">{translation.explorer.core}</div>
            <div className="core-line">
              <Cpu size={15} />
              <span>
                {coreInfo?.source === "native-core"
                  ? translation.status.nativeCpp
                  : translation.status.browserPreview}
              </span>
            </div>
            <div className="core-line">
              <Activity size={15} />
              <span>{translation.status.connected}</span>
            </div>
          </div>
        </aside>

        <section className="editor panel">
          <div className="editor-tabs">
            <div className="editor-tab active">
              <Braces size={15} />
              {translation.editor.hexInspector}
            </div>
          </div>
          <div className="editor-heading">
            <div>
              <span className="eyebrow">{translation.editor.rawFrame}</span>
              <h1>{translation.editor.telemetrySample}</h1>
            </div>
            <span className="byte-count">
              {result?.ok
                ? translation.editor.bytes(result.byteCount)
                : translation.editor.unparsed}
            </span>
          </div>
          <textarea
            aria-label={translation.editor.inputLabel}
            className="hex-input"
            spellCheck={false}
            value={input}
            onChange={(event) => setInput(event.target.value)}
          />

          {result?.ok && (
            <div className="byte-table-wrap">
              <table className="byte-table">
                <thead>
                  <tr>
                    <th>{translation.editor.offset}</th>
                    <th>{translation.editor.hex}</th>
                    <th>{translation.editor.decimal}</th>
                    <th>{translation.editor.ascii}</th>
                  </tr>
                </thead>
                <tbody>
                  {byteRows.map((row) => (
                    <tr key={row.offset}>
                      <td>{toHex(row.offset, 4)}</td>
                      <td className="hex-value">{row.hex}</td>
                      <td>{row.decimal}</td>
                      <td>{row.ascii}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {result && !result.ok && (
            <div className="error-banner">
              <CircleAlert size={18} />
              <div>
                <strong>{result.error.code}</strong>
                <span>{translateError(translation, result.error.code, result.error.message)}</span>
              </div>
              <code>{translation.errors.offset(result.error.position)}</code>
            </div>
          )}
        </section>

        <aside className="inspector panel">
          <div className="panel-title">{translation.inspector.title}</div>
          <div className="inspection-status">
            {result?.ok ? <CheckCircle2 size={18} /> : <Activity size={18} />}
            <div>
              <strong>
                {result?.ok
                  ? translation.inspector.frameValid
                  : translation.inspector.awaitingInspection}
              </strong>
              <span>
                {result?.ok
                  ? sourceLabel(translation, result.source)
                  : translation.inspector.corePipeline}
              </span>
            </div>
          </div>

          <dl className="metrics">
            <div>
              <dt>{translation.inspector.length}</dt>
              <dd>{result?.ok ? translation.editor.bytes(result.byteCount) : "--"}</dd>
            </div>
            <div>
              <dt>SUM8</dt>
              <dd>{result?.ok ? toHex(result.sum8, 2) : "--"}</dd>
            </div>
            <div>
              <dt>XOR8</dt>
              <dd>{result?.ok ? toHex(result.xor8, 2) : "--"}</dd>
            </div>
            <div>
              <dt>CRC16/MODBUS</dt>
              <dd>{result?.ok ? toHex(result.crc16Modbus, 4) : "--"}</dd>
            </div>
          </dl>

          <div className="ascii-section">
            <span className="panel-title">{translation.editor.ascii}</span>
            <code>{result?.ok ? result.ascii : "--"}</code>
          </div>
        </aside>

        <section className="console panel">
          <div className="console-tabs">
            <span className="active">
              <TerminalSquare size={14} /> {translation.console.console}
            </span>
            <span>{translation.console.timeline}</span>
            <span>{translation.console.problems}</span>
          </div>
          <div className="log-lines">
            {logs.slice(-4).map((entry) => (
              <div className={`log-line ${entry.level}`} key={entry.id}>
                <span>{translation.console.levels[entry.level]}</span>
                <code>{logMessage(translation, entry)}</code>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
