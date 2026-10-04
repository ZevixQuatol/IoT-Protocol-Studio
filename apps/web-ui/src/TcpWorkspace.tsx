import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Circle, Radio, Search, Server, Terminal, Wifi } from "react-feather";
import { DotsHorizontalIcon, ExternalLink, Plus, X } from "./feather-icons";
import TcpWorkbench from "./TcpWorkbench";
import { tcpCommand, type TcpDraft, type TcpRecord, type WorkspaceProtocol } from "./bridge";
import type { Locale } from "./i18n";
import SessionToolbar from "./SessionToolbar";
import SessionCloseDialog from "./SessionCloseDialog";
import "./session-window.css";

type Session = { id: string; name: string; detached: boolean };
type Draft = TcpDraft | null;
type SessionSummary = { mode: string; state: string; endpoint: string };

// Keep one portal container per session. Adopting that DOM into a popup preserves React state.
function SessionWindow({
  session,
  visible,
  locale,
  onDock,
  onFailure,
  children,
}: {
  session: Session;
  visible: boolean;
  locale: Locale;
  onDock: () => void;
  onFailure: (message: string) => void;
  children: ReactNode;
}) {
  const [container] = useState(() => document.createElement("div"));
  const slot = useRef<HTMLDivElement>(null);
  const popup = useRef<Window | null>(null);
  const dock = useRef(onDock);
  dock.current = onDock;
  const failure = useRef(onFailure);
  failure.current = onFailure;
  useEffect(() => {
    container.className = "tcp-session-container";
    container.dataset.session = session.id;
    slot.current?.appendChild(container);
    return () => {
      container.remove();
    };
  }, [container]);
  useEffect(() => {
    if (!session.detached) return;
    const child = window.open(
      "about:blank",
      `iotps-tcp-${session.id}`,
      "popup,width=1060,height=800",
    );
    if (!child) {
      failure.current(
        locale === "zh-CN"
          ? "无法打开独立窗口，请允许弹出窗口后重试。"
          : "Could not open the window. Allow popups and retry.",
      );
      dock.current();
      return;
    }
    popup.current = child;
    let finished = false;
    let mounted = false;
    const deadline = Date.now() + 8000;
    const restore = () => {
      if (finished) return;
      slot.current?.appendChild(container);
      dock.current();
    };
    // WebView2 creates popup controllers asynchronously. Wait for its about:blank document.
    const timer = window.setInterval(() => {
      if (!mounted && Date.now() > deadline) {
        failure.current(
          locale === "zh-CN"
            ? "独立窗口初始化失败，已收回标签页。"
            : "Window initialization failed; session docked.",
        );
        restore();
        return;
      }
      if (child.closed) {
        restore();
        return;
      }
      try {
        if (mounted && container.ownerDocument === child.document) return;
        if (!child.document.body) return;
        const style = child.document.createElement("style");
        style.textContent = Array.from(document.styleSheets, (sheet) =>
          Array.from(sheet.cssRules, (rule) => rule.cssText).join("\n"),
        ).join("\n");
        child.document.head.replaceChildren(style);
        child.document.documentElement.dataset.theme = document.documentElement.dataset.theme;
        child.document.documentElement.lang = locale;
        child.document.title = `${session.name} · IoT Protocol Studio`;
        child.document.body.className = "tcp-popup";
        child.document.body.appendChild(container);
        child.addEventListener("beforeunload", restore);
        child.addEventListener("iotps-dock", restore);
        mounted = true;
      } catch {
        /* The native popup document may still be initializing. */
      }
    }, 100);
    const theme = new MutationObserver(() => {
      if (!child.closed)
        child.document.documentElement.dataset.theme = document.documentElement.dataset.theme;
    });
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      finished = true;
      clearInterval(timer);
      theme.disconnect();
      child.removeEventListener("beforeunload", restore);
      child.removeEventListener("iotps-dock", restore);
      slot.current?.appendChild(container);
      if (!child.closed) child.close();
      popup.current = null;
    };
  }, [session.detached, container]);
  useEffect(() => {
    if (popup.current && !popup.current.closed) {
      popup.current.document.title = `${session.name} · IoT Protocol Studio`;
      popup.current.document.documentElement.lang = locale;
    }
  }, [session.name, locale]);
  return (
    <>
      <div ref={slot} className="tcp-session-slot" hidden={!visible || session.detached} />
      {session.detached && visible && (
        <div className="tcp-detached-placeholder">
          <ExternalLink size={24} />
          <p>{session.name}</p>
          <p>
            {locale === "zh-CN"
              ? "会话正在独立窗口中运行"
              : "This session is running in its own window"}
          </p>
          <button type="button" onClick={() => popup.current?.focus()}>
            {locale === "zh-CN" ? "显示窗口" : "Show window"}
          </button>
          <button type="button" onClick={onDock}>
            {locale === "zh-CN" ? "合并回标签页" : "Dock as tab"}
          </button>
        </div>
      )}
      {createPortal(children, container)}
    </>
  );
}

export default function TcpWorkspace({
  visible,
  locale,
  protocols,
  draft,
  onDebug,
  onDiagnostic,
  redact,
  focusSession,
}: {
  visible: boolean;
  locale: Locale;
  protocols: WorkspaceProtocol[];
  draft: Draft;
  onDebug: (record: TcpRecord) => void;
  onDiagnostic: (session: string, message: string, problem: boolean) => void;
  redact: (value: string) => string;
  focusSession?: { id: string; seq: number };
}) {
  const t = (cn: string, en: string) => (locale === "zh-CN" ? cn : en);
  const next = useRef(2);
  const [sessions, setSessions] = useState<Session[]>([
    { id: "tcp-1", name: "TCP 1", detached: false },
  ]);
  const [active, setActive] = useState("tcp-1");
  const [summaries, setSummaries] = useState<Record<string, SessionSummary>>({});
  const [sessionSearch, setSessionSearch] = useState("");
  const summary = (id: string, mode: string, state: string, endpoint: string) =>
    setSummaries((current) => {
      const previous = current[id];
      if (previous?.mode === mode && previous.state === state && previous.endpoint === endpoint)
        return current;
      return { ...current, [id]: { mode, state, endpoint } };
    });
  useEffect(() => {
    if (focusSession && sessions.some((item) => item.id === focusSession.id))
      setActive(focusSession.id);
  }, [focusSession]);
  const [targetDraft, setTargetDraft] = useState<{ session: string; value: Draft } | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [closing, setClosing] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (menu) dialog.current?.showModal();
    else dialog.current?.close();
  }, [menu]);
  const add = () => {
    const id = next.current++;
    const session = { id: `tcp-${id}`, name: `TCP ${id}`, detached: false };
    setSessions((current) => [...current, session]);
    setActive(session.id);
    return session.id;
  };
  useEffect(() => {
    if (!draft) return;
    const target = sessions.some((s) => s.id === active) ? active : add();
    setTargetDraft({ session: target, value: draft });
  }, [draft]);
  const dock = (id: string) =>
    setSessions((current) => current.map((s) => (s.id === id ? { ...s, detached: false } : s)));
  const close = async (id: string) => {
    setBusy(true);
    setError("");
    try {
      const result = await tcpCommand(id, "destroy");
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      const remaining = sessions.filter((s) => s.id !== id);
      setSessions(remaining);
      setSummaries((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      if (active === id) setActive(remaining[0]?.id ?? "");
      setMenu(null);
      setClosing(null);
    } catch (failure) {
      setError(String(failure));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="tcp-workspace" hidden={!visible}>
      <aside className="tcp-session-sidebar" aria-label={t("会话管理", "Session manager")}>
        <h1>{t("通信", "Communication")}</h1>
        <div className="tcp-session-heading">
          <strong>{t("会话管理", "Sessions")}</strong>
          <button
            type="button"
            disabled={sessions.length >= 16}
            onClick={add}
            aria-label={t("添加会话", "Add session")}
            title={t("添加会话", "Add session")}
          >
            <Plus size={16} />
          </button>
        </div>
        <label className="tcp-session-search">
          <Search size={14} />
          <input
            aria-label={t("搜索会话", "Search sessions")}
            placeholder={t("搜索会话…", "Search sessions…")}
            value={sessionSearch}
            onChange={(event) => setSessionSearch(event.target.value)}
          />
        </label>
        <div className="tcp-session-list">
          {sessions
            .filter((session) =>
              `${session.name} ${summaries[session.id]?.endpoint ?? ""}`
                .toLowerCase()
                .includes(sessionSearch.toLowerCase()),
            )
            .map((session) => {
              const info = summaries[session.id];
              const Icon =
                info?.mode === "server"
                  ? Server
                  : info?.mode === "serial"
                    ? Terminal
                    : info?.mode === "udp"
                      ? Wifi
                      : Radio;
              return (
                <button
                  className={`tcp-session-card ${active === session.id ? "active" : ""}`}
                  type="button"
                  key={session.id}
                  onClick={() => setActive(session.id)}
                  aria-pressed={active === session.id}
                >
                  <Icon size={20} />
                  <span>
                    <strong>{session.name}</strong>
                    <small>{info?.endpoint || t("未连接", "Disconnected")}</small>
                  </span>
                  <Circle className={`tcp-session-state ${info?.state ?? "closed"}`} size={7} />
                </button>
              );
            })}
          {sessionSearch &&
            !sessions.some((session) =>
              `${session.name} ${summaries[session.id]?.endpoint ?? ""}`
                .toLowerCase()
                .includes(sessionSearch.toLowerCase()),
            ) && <p className="tcp-muted">{t("没有匹配的会话", "No matching sessions")}</p>}
        </div>
        <small className="tcp-session-count">
          {sessions.length} / 16 {t("个会话", "sessions")}
        </small>
      </aside>
      <div className="tcp-session-main">
        <div
          className="tcp-tabs"
          role="tablist"
          aria-label={t("通信会话", "Communication sessions")}
        >
          {sessions.map((session) => (
            <div className={`tcp-tab ${active === session.id ? "active" : ""}`} key={session.id}>
              <button
                type="button"
                role="tab"
                aria-selected={active === session.id}
                onClick={() => setActive(session.id)}
              >
                {session.detached && <ExternalLink size={12} />}
                <Circle
                  className={`tcp-session-state ${summaries[session.id]?.state ?? "closed"}`}
                  size={8}
                />
                {session.name}
              </button>
              <button
                type="button"
                aria-label={`${t("会话操作", "Session actions")}: ${session.name}`}
                onClick={() => {
                  setMenu(session.id);
                  setName(session.name);
                  setError("");
                }}
              >
                <DotsHorizontalIcon size={14} />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="tcp-add"
            disabled={sessions.length >= 16}
            aria-label={t("新建通信会话", "New communication session")}
            title={t("新建通信会话", "New communication session")}
            onClick={add}
          >
            <Plus size={16} />
          </button>
          {active && (
            <button
              className="tcp-window-action"
              type="button"
              onClick={() =>
                setSessions((current) =>
                  current.map((item) =>
                    item.id === active ? { ...item, detached: !item.detached } : item,
                  ),
                )
              }
            >
              <ExternalLink size={14} />
              {sessions.find((item) => item.id === active)?.detached
                ? t("合并窗口", "Dock window")
                : t("分离窗口", "Detach window")}
            </button>
          )}
        </div>
        {error && !menu && (
          <p role="alert" className="tcp-error">
            {error}
          </p>
        )}
        {sessions.length === 0 && (
          <div className="tcp-detached-placeholder">
            <p>
              {t(
                "新建两个会话，即可同时测试客户端与服务端。",
                "Create two sessions to test a client and server together.",
              )}
            </p>
            <button type="button" onClick={add}>
              {t("新建通信会话", "New communication session")}
            </button>
          </div>
        )}
        {sessions.map((session) => (
          <SessionWindow
            key={session.id}
            session={session}
            visible={visible && active === session.id}
            locale={locale}
            onDock={() => dock(session.id)}
            onFailure={setError}
          >
            {session.detached && (
              <SessionToolbar
                name={session.name}
                locale={locale}
                onDock={() => dock(session.id)}
                onClose={() => {
                  setError("");
                  setClosing(session.id);
                }}
              />
            )}
            <TcpWorkbench
              popup={session.detached}
              session={session.id}
              protocols={protocols}
              visible={session.detached || (visible && active === session.id)}
              locale={locale}
              draft={targetDraft?.session === session.id ? targetDraft.value : null}
              onDebug={(record) => {
                window.focus();
                onDebug(record);
              }}
              onDiagnostic={onDiagnostic}
              redact={redact}
              onSummary={summary}
            />
            <SessionCloseDialog
              name={session.name}
              locale={locale}
              open={closing === session.id}
              busy={busy}
              error={error}
              onCancel={() => setClosing(null)}
              onConfirm={() => void close(session.id)}
            />
          </SessionWindow>
        ))}
      </div>
      <dialog
        ref={dialog}
        className="protocol-dialog tree-dialog tree-actions-dialog"
        onCancel={() => setMenu(null)}
        aria-label={t("会话操作", "Session actions")}
      >
        <h2>{t("会话操作", "Session actions")}</h2>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim()) return;
            setSessions((current) =>
              current.map((s) => (s.id === menu ? { ...s, name: name.trim() } : s)),
            );
            setMenu(null);
          }}
        >
          <label>
            {t("名称", "Name")}
            <input
              aria-label={t("会话名称", "Session name")}
              value={name}
              required
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <button type="submit" disabled={busy}>
            {t("重命名", "Rename")}
          </button>
        </form>
        {error && <p role="alert">{error}</p>}
        <div className="tree-dialog-actions">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setSessions((current) =>
                current.map((s) => (s.id === menu ? { ...s, detached: !s.detached } : s)),
              );
              setMenu(null);
            }}
          >
            <ExternalLink size={15} />
            {sessions.find((s) => s.id === menu)?.detached
              ? t("合并回标签页", "Dock as tab")
              : t("在独立窗口打开", "Open in separate window")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (menu) {
                setClosing(menu);
                setMenu(null);
              }
            }}
          >
            <X size={15} />
            {t("关闭会话", "Close session")}
          </button>
          <button type="button" onClick={() => setMenu(null)}>
            {t("取消", "Cancel")}
          </button>
        </div>
      </dialog>
    </div>
  );
}
