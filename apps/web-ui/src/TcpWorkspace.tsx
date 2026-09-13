import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, PanelTop, Plus, X } from "lucide-react";
import DotsHorizontalIcon from "./icons/dots-horizontal-icon";
import TcpWorkbench from "./TcpWorkbench";
import { tcpCommand } from "./bridge";
import type { Locale } from "./i18n";

type Session = { id: string; name: string; detached: boolean };
type Draft = { id: number; hex: string } | null;

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
  draft,
  onDebug,
}: {
  visible: boolean;
  locale: Locale;
  draft: Draft;
  onDebug: (hex: string) => void;
}) {
  const t = (cn: string, en: string) => (locale === "zh-CN" ? cn : en);
  const next = useRef(2);
  const [sessions, setSessions] = useState<Session[]>([
    { id: "tcp-1", name: "TCP 1", detached: false },
  ]);
  const [active, setActive] = useState("tcp-1");
  const [targetDraft, setTargetDraft] = useState<{ session: string; value: Draft } | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
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
    if (
      !window.confirm(
        t(
          "关闭此会话将断开连接并丢弃发送队列、草稿和收发记录，是否继续？",
          "Close this session and discard its connection, queue, draft and records?",
        ),
      )
    )
      return;
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
      if (active === id) setActive(remaining[0]?.id ?? "");
      setMenu(null);
    } catch (failure) {
      setError(String(failure));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="tcp-workspace" hidden={!visible}>
      <div className="tcp-tabs" role="tablist" aria-label={t("通信会话", "Communication sessions")}>
        {sessions.map((session) => (
          <div className={`tcp-tab ${active === session.id ? "active" : ""}`} key={session.id}>
            <button
              type="button"
              role="tab"
              aria-selected={active === session.id}
              onClick={() => setActive(session.id)}
            >
              {session.detached && <ExternalLink size={12} />}
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
            <div className="tcp-popup-toolbar">
              <strong>{session.name}</strong>
              <button type="button" onClick={() => dock(session.id)}>
                <PanelTop size={14} />
                {t("合并回标签页", "Dock as tab")}
              </button>
            </div>
          )}
          <TcpWorkbench
            session={session.id}
            visible={session.detached || (visible && active === session.id)}
            locale={locale}
            draft={targetDraft?.session === session.id ? targetDraft.value : null}
            onDebug={(hex) => {
              window.focus();
              onDebug(hex);
            }}
          />
        </SessionWindow>
      ))}
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
              if (menu) void close(menu);
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
