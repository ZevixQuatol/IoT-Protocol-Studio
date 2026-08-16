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
  Play,
  RotateCcw,
  TerminalSquare,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getCoreInfo, inspectHex, type CoreInfo, type InspectionResult } from "./bridge";

const sampleHex = "AA 55 01 0A 78 56 34 12 03 02 01 A8 C3";

type LogEntry = {
  id: number;
  level: "info" | "success" | "error";
  message: string;
};

function toHex(value: number, width: number): string {
  return `0x${value.toString(16).toUpperCase().padStart(width, "0")}`;
}

export default function App() {
  const [input, setInput] = useState(sampleHex);
  const [result, setResult] = useState<InspectionResult | null>(null);
  const [coreInfo, setCoreInfo] = useState<CoreInfo | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([
    { id: 1, level: "info", message: "Workbench initialized" },
  ]);

  const appendLog = useCallback((level: LogEntry["level"], message: string) => {
    setLogs((current) => [...current.slice(-49), { id: Date.now(), level, message }]);
  }, []);

  useEffect(() => {
    getCoreInfo()
      .then((info) => {
        setCoreInfo(info);
        appendLog("success", `Core ${info.version} connected via ${info.source}`);
      })
      .catch((error: unknown) => {
        appendLog("error", error instanceof Error ? error.message : "Core connection failed");
      });
  }, [appendLog]);

  const runInspection = useCallback(async () => {
    const nextResult = await inspectHex(input);
    setResult(nextResult);
    appendLog(
      nextResult.ok ? "success" : "error",
      nextResult.ok
        ? `Inspected ${nextResult.byteCount} bytes with ${nextResult.source}`
        : `${nextResult.error.code} at offset ${nextResult.error.position}`,
    );
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
          <span className={`status-dot ${coreInfo?.source === "native-core" ? "native" : "preview"}`} />
          <span>{coreInfo?.platform ?? "Connecting"}</span>
          <span className="separator">/</span>
          <span>{coreInfo?.architecture ?? "..."}</span>
        </div>
      </header>

      <div className="toolbar">
        <button className="project-button" type="button">
          <FolderOpen size={16} />
          Smart Sensor
          <ChevronDown size={14} />
        </button>
        <div className="toolbar-divider" />
        <span className="connection-label">Core session</span>
        <span className="connection-state">Ready</span>
        <div className="toolbar-spacer" />
        <button className="secondary-action" type="button" onClick={() => setInput(sampleHex)}>
          <RotateCcw size={15} />
          Reset
        </button>
        <button className="primary-action" type="button" onClick={() => void runInspection()}>
          <Play size={15} fill="currentColor" />
          Inspect
        </button>
      </div>

      <main className="workbench">
        <aside className="explorer panel">
          <div className="panel-title">EXPLORER</div>
          <div className="tree-row tree-root">
            <ChevronDown size={14} />
            <FolderOpen size={15} />
            <span>SMART SENSOR</span>
          </div>
          <div className="tree-row tree-child active">
            <FileCode2 size={15} />
            <span>device.yaml</span>
          </div>
          <div className="tree-row tree-child">
            <ChevronRight size={14} />
            <span>Messages</span>
          </div>
          <div className="tree-row tree-child">
            <ChevronRight size={14} />
            <span>Connections</span>
          </div>
          <div className="tree-row tree-child">
            <ChevronRight size={14} />
            <span>Tests</span>
          </div>

          <div className="explorer-section">
            <div className="panel-title">CORE</div>
            <div className="core-line">
              <Cpu size={15} />
              <span>{coreInfo?.source === "native-core" ? "Native C++" : "Browser preview"}</span>
            </div>
            <div className="core-line">
              <Activity size={15} />
              <span>Connected</span>
            </div>
          </div>
        </aside>

        <section className="editor panel">
          <div className="editor-tabs">
            <div className="editor-tab active">
              <Braces size={15} />
              HEX Inspector
            </div>
          </div>
          <div className="editor-heading">
            <div>
              <span className="eyebrow">RAW FRAME</span>
              <h1>Telemetry sample</h1>
            </div>
            <span className="byte-count">{result?.ok ? `${result.byteCount} bytes` : "Unparsed"}</span>
          </div>
          <textarea
            aria-label="Hexadecimal frame input"
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
                    <th>OFFSET</th>
                    <th>HEX</th>
                    <th>DECIMAL</th>
                    <th>ASCII</th>
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
                <span>{result.error.message}</span>
              </div>
              <code>offset {result.error.position}</code>
            </div>
          )}
        </section>

        <aside className="inspector panel">
          <div className="panel-title">INSPECTOR</div>
          <div className="inspection-status">
            {result?.ok ? <CheckCircle2 size={18} /> : <Activity size={18} />}
            <div>
              <strong>{result?.ok ? "Frame valid" : "Awaiting inspection"}</strong>
              <span>{result?.ok ? result.source : "Core pipeline"}</span>
            </div>
          </div>

          <dl className="metrics">
            <div>
              <dt>Length</dt>
              <dd>{result?.ok ? `${result.byteCount} bytes` : "--"}</dd>
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
            <span className="panel-title">ASCII</span>
            <code>{result?.ok ? result.ascii : "--"}</code>
          </div>
        </aside>

        <section className="console panel">
          <div className="console-tabs">
            <span className="active"><TerminalSquare size={14} /> Console</span>
            <span>Timeline</span>
            <span>Problems</span>
          </div>
          <div className="log-lines">
            {logs.slice(-4).map((entry) => (
              <div className={`log-line ${entry.level}`} key={entry.id}>
                <span>{entry.level.toUpperCase()}</span>
                <code>{entry.message}</code>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

