import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import TcpWorkbench from "../src/TcpWorkbench";
import SessionToolbar from "../src/SessionToolbar";
import SessionCloseDialog from "../src/SessionCloseDialog";
import { tcpCommand, getCurrentProject } from "../src/bridge";
import "../src/styles.css";
import "../src/communication-workbench.css";
import "../src/session-window.css";
import "./session-preview.css";
import "../src/ui-consistency.css";

const project = await getCurrentProject();
const parameters = new URLSearchParams(location.search);
const locale = parameters.get("locale") === "en-US" ? "en-US" : "zh-CN";
document.documentElement.dataset.theme = parameters.get("theme") || "dark";
const draft = { id: 1, hex: "55 AA 00 01 00 01 00 26 1A 04 00 00 00 00 4B 5C" };
const identity = (value: string) => value;
const noop = () => {};
function Preview() {
  const [closing, setClosing] = useState(parameters.get("view") === "close");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [closed, setClosed] = useState(false);
  useEffect(() => {
    // Select the fixture reply once so the preview opens in the supplied reference state.
    let attempts = 0;
    const timer = setInterval(() => {
      const row = document.querySelector<HTMLTableRowElement>(".tcp-log tbody tr:nth-child(3)");
      if (!document.querySelector(".tcp-popup-message")) row?.click();
      else {
        if (parameters.get("view") === "collapsed")
          document
            .querySelector<HTMLButtonElement>(
              ".tcp-detail-panel .tcp-panel-heading button:last-child",
            )
            ?.click();
        clearInterval(timer);
      }
      if (++attempts > 30) clearInterval(timer);
    }, 50);
    return () => clearInterval(timer);
  }, []);
  return closed ? (
    <p role="status">预览会话已关闭 · Preview session closed</p>
  ) : (
    <div className="tcp-session-container">
      <SessionToolbar
        name="Sensor TCP"
        locale={locale}
        onDock={() => setError("浏览器预览：原生合并操作由桌面测试验证。")}
        onClose={() => {
          setError("");
          setClosing(true);
        }}
      />
      <TcpWorkbench
        session="tcp-1"
        protocols={project.ok && project.project ? project.project.protocols : []}
        locale={locale}
        visible
        draft={draft}
        popup
        onDebug={noop}
        onDiagnostic={noop}
        onSummary={noop}
        redact={identity}
      />
      <SessionCloseDialog
        name="Sensor TCP"
        locale={locale}
        open={closing}
        busy={busy}
        error={error}
        onCancel={() => setClosing(false)}
        onConfirm={async () => {
          setBusy(true);
          try {
            const result = await tcpCommand("tcp-1", "destroy");
            if (!result.ok) throw new Error(result.error.message);
            setClosed(true);
          } catch (failure) {
            setError(String(failure));
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}
const root = createRoot(document.getElementById("root")!);
root.render(<Preview />);
import.meta.hot?.dispose(() => root.unmount());
