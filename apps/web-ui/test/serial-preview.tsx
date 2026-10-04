import { createRoot } from "react-dom/client";
import { Folder, Minus, Radio, Settings, Square, X } from "react-feather";
import { Bug } from "../src/feather-icons";
import TcpWorkspace from "../src/TcpWorkspace";
import type { WorkspaceProtocol } from "../src/bridge";
import "../src/styles.css";
import "../src/communication-workbench.css";
import "../src/ui-consistency.css";
import "./serial-fixture.js";

const query = new URLSearchParams(location.search);
document.documentElement.dataset.theme = query.get("theme") ?? "dark";
const locale = query.get("lang") === "en" ? "en-US" : "zh-CN";
const protocols: WorkspaceProtocol[] = [
  {
    name: "SensorLink",
    path: "protocols/sensorlink.yaml",
    content: "",
    schema: {
      version: "0.1",
      protocolVersion: "1.0",
      defaultByteOrder: "little",
      messageTypeField: "messageId",
      messages: [
        { name: "ReadStatus", displayName: "", typeId: "1", checksumTarget: null, fields: [] },
        { name: "StatusReply", displayName: "", typeId: "129", checksumTarget: "crc", fields: [] },
      ],
    },
  },
];
createRoot(document.getElementById("root")!).render(
  <div className="app-shell">
    <header className="titlebar">
      <div className="titlebar-brand">
        <img src="/icon-192.png" alt="" />
        IoT Protocol Studio
      </div>
      <div className="titlebar-drag-region" />
      <button
        className="tcp-fixture-action"
        onClick={() => (window as never as { p09Disconnect: () => void }).p09Disconnect()}
      >
        模拟拔出
      </button>
      <button
        className="tcp-fixture-action"
        onClick={() => (window as never as { p09AllowOpen: () => void }).p09AllowOpen()}
      >
        释放占用
      </button>
      <div className="window-controls">
        <button className="window-control" aria-label="Minimize">
          <Minus size={15} />
        </button>
        <button className="window-control" aria-label="Maximize">
          <Square size={14} />
        </button>
        <button className="window-control close" aria-label="Close">
          <X size={16} />
        </button>
      </div>
    </header>
    <div className="workspace-layout">
      <nav className="navigation-rail">
        {[Folder, Bug, Radio, Settings].map((Icon, index) => (
          <button
            key={index}
            className={"nav-button " + (index === 2 ? "active" : "")}
            title={["Projects", "Debug", "Communication", "Settings"][index]}
          >
            <Icon size={24} />
          </button>
        ))}
      </nav>
      <main className="tcp-page" style={{ flex: 1, minWidth: 0, display: "flex" }}>
        <TcpWorkspace
          visible
          locale={locale}
          protocols={protocols}
          draft={null}
          onDebug={() => {}}
          onDiagnostic={() => {}}
          redact={(value) => value}
        />
      </main>
    </div>
  </div>,
);
