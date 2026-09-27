import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Network, PlugZap, Send, Trash2, X } from "lucide-react";
import DotsHorizontalIcon from "./icons/dots-horizontal-icon";
import {
  tcpCommand,
  trafficFile,
  type TcpRecord,
  type TcpSnapshot,
  type WorkspaceProtocol,
} from "./bridge";
import { readTrafficArchive } from "./trafficFile";
import type { Locale } from "./i18n";

const empty: TcpSnapshot = {
  ok: true,
  state: "closed",
  server: false,
  host: "",
  port: 0,
  error: "",
  sent: 0,
  received: 0,
  queued: 0,
  dropped: 0,
  retries: 0,
  protocolPath: "",
  messageName: "",
  cursor: 0,
  peers: [],
  records: [],
};

export default function TcpWorkbench({
  session,
  protocols,
  visible,
  locale,
  draft,
  onDebug,
  onDiagnostic,
  redact,
}: {
  session: string;
  protocols: WorkspaceProtocol[];
  visible: boolean;
  locale: Locale;
  draft: { id: number; hex: string } | null;
  onDebug: (record: TcpRecord) => void;
  onDiagnostic: (session: string, message: string, problem: boolean) => void;
  redact: (value: string) => string;
}) {
  const zh = locale === "zh-CN";
  const t = (cn: string, en: string) => (zh ? cn : en);
  const [mode, setMode] = useState("client");
  const [host, setHost] = useState("127.0.0.1");
  const [port, setPort] = useState("9000");
  const [status, setStatus] = useState(empty);
  const [records, setRecords] = useState<TcpRecord[]>([]);
  const [history, setHistory] = useState<ReturnType<typeof readTrafficArchive> | null>(null);
  const [autoRetry, setAutoRetry] = useState(false);
  const [retryLimit, setRetryLimit] = useState("3");
  const [retrySeconds, setRetrySeconds] = useState("2");
  const [peer, setPeer] = useState("");
  const [input, setInput] = useState("");
  const [encoding, setEncoding] = useState("hex");
  const [frameMode, setFrameMode] = useState("off");
  const [frameSize, setFrameSize] = useState("8");
  const [lengthOffset, setLengthOffset] = useState("0");
  const [lengthWidth, setLengthWidth] = useState("1");
  const [lengthAdjustment, setLengthAdjustment] = useState("1");
  const [lengthEndian, setLengthEndian] = useState("big");
  const [delimiter, setDelimiter] = useState("0A");
  const [frameStatus, setFrameStatus] = useState("");
  const [bindPath, setBindPath] = useState("");
  const [bindMessage, setBindMessage] = useState("");
  const [bindStatus, setBindStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [direction, setDirection] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<TcpRecord | null>(null);
  const [follow, setFollow] = useState(true);
  const [peerMenu, setPeerMenu] = useState<{ id: number; address: string } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const table = useRef<HTMLDivElement>(null);
  const cursor = useRef(0);
  const generation = useRef(0);
  const lastPollError = useRef("");
  const connected = status.state === "open";
  const active = connected || status.state === "opening";
  const redactRecord = (item: TcpRecord): TcpRecord => ({
    ...item,
    address: redact(item.address),
    detail: redact(item.detail),
    parsed: item.parsed && {
      ...item.parsed,
      protocolPath: redact(item.parsed.protocolPath),
      messageName: redact(item.parsed.messageName),
      error: redact(item.parsed.error),
      fields: item.parsed.fields.map((field) => ({
        ...field,
        name: redact(field.name),
        displayName: redact(field.displayName),
        value: redact(field.value),
        enumName: field.enumName === undefined ? undefined : redact(field.enumName),
        bits: field.bits?.map((bit) => ({
          ...bit,
          name: redact(bit.name),
          displayName: redact(bit.displayName),
          value: redact(bit.value),
        })),
      })),
    },
  });
  const shownRecords = (history?.records ?? records).map(redactRecord);
  const selectedRecord = selected && redactRecord(selected);
  const bindProtocol = protocols.find((item) => item.path === bindPath);

  useEffect(() => {
    if (draft) {
      setInput(draft.hex);
      setEncoding("hex");
    }
  }, [draft]);
  useEffect(() => {
    if (peerMenu) dialog.current?.showModal();
    else dialog.current?.close();
  }, [peerMenu]);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const version = generation.current;
      try {
        const result = await tcpCommand(session, "poll", String(cursor.current));
        if (!alive) return;
        if (!result.ok) {
          setError(result.error.message);
          if (lastPollError.current !== result.error.message)
            onDiagnostic(session, result.error.message, true);
          lastPollError.current = result.error.message;
          return;
        }
        lastPollError.current = "";
        if (!("state" in result) || generation.current !== version) return;
        cursor.current = result.cursor;
        setStatus(result);
        setPeer((current) =>
          result.peers.some((item) => String(item.id) === current)
            ? current
            : String(result.peers[0]?.id ?? ""),
        );
        if (result.records.length)
          for (const item of result.records)
            if (item.direction === "SYS" && item.detail)
              onDiagnostic(
                session,
                item.detail,
                /fail|error|invalid|discard|limit|timeout|refused/i.test(item.detail),
              );
        if (result.records.length)
          setRecords((current) => {
            const combined = [...current, ...result.records];
            let size = 0;
            let start = combined.length;
            while (
              start > 0 &&
              combined.length - start < 1000 &&
              size + combined[start - 1].size <= 4 * 1024 * 1024
            )
              size += combined[--start].size;
            return combined.slice(start);
          });
      } catch (failure) {
        if (alive) {
          setError(String(failure));
          onDiagnostic(session, String(failure), true);
        }
      } finally {
        if (alive) timer = setTimeout(() => void poll(), visible ? 250 : 1000);
      }
    };
    void tcpCommand(session, "create")
      .then((result) => {
        if (!alive) return;
        if (result.ok) void poll();
        else {
          setError(result.error.message);
          onDiagnostic(session, result.error.message, true);
        }
      })
      .catch((failure) => {
        if (alive) setError(String(failure));
      });
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [visible, session]);
  useEffect(() => {
    if (visible && follow && table.current) table.current.scrollTop = table.current.scrollHeight;
  }, [records, visible, follow]);

  const act = async (action: string, ...args: string[]) => {
    if (busy) return false;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await tcpCommand(session, action, ...args);
      if (!result.ok) {
        setError(result.error.message);
        onDiagnostic(session, result.error.message, true);
        return false;
      }
      if (action === "start") setStatus((current) => ({ ...current, state: "opening", error: "" }));
      if (action === "stop") setStatus((current) => ({ ...current, state: "closed", peers: [] }));
      return true;
    } catch (failure) {
      setError(String(failure));
      onDiagnostic(session, String(failure), true);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const send = async () => {
    const hex =
      encoding === "hex"
        ? input
        : Array.from(new TextEncoder().encode(input), (byte) =>
            byte.toString(16).padStart(2, "0"),
          ).join(" ");
    if (await act("send", peer, hex))
      setNotice(
        t(
          "已加入发送队列，实际发送字节见 TX 记录。",
          "Queued. TX records show bytes actually sent.",
        ),
      );
  };
  const configureFrames = async () => {
    const args =
      frameMode === "fixed"
        ? [frameMode, frameSize]
        : frameMode === "length"
          ? [frameMode, lengthOffset, lengthWidth, lengthAdjustment, lengthEndian]
          : frameMode === "delimiter"
            ? [frameMode, delimiter]
            : ["off"];
    if (await act("frame", ...args))
      setFrameStatus(
        frameMode === "off"
          ? t("分帧已关闭", "Framing off")
          : t("分帧规则已应用；未完成的旧帧已清除", "Framing applied; old partial frame cleared"),
      );
  };
  const clear = async () => {
    if (history) {
      setHistory(null);
      setSelected(null);
      return;
    }
    const owner = dialog.current?.ownerDocument.defaultView ?? window;
    if (!owner.confirm(t("清空当前收发记录？", "Clear traffic records?"))) return;
    ++generation.current;
    if (await act("clear")) {
      ++generation.current;
      setRecords([]);
      setSelected(null);
    }
  };
  const archive = async (action: "open" | "save") => {
    setError("");
    try {
      let current = history;
      if (action === "save" && !current) {
        const snapshot = await tcpCommand(session, "export");
        if (!snapshot.ok) throw new Error(snapshot.error.message);
        if (!("records" in snapshot)) throw new Error("Cannot read traffic records");
        current = {
          format: "iotps-traffic-v1",
          session,
          savedAt: new Date().toISOString(),
          dropped: snapshot.dropped,
          records: snapshot.records,
        };
      }
      const content =
        action === "save"
          ? JSON.stringify({ ...current, records: current?.records.map(redactRecord) })
          : "";
      const result = await trafficFile(action, content);
      if (!result.ok) throw new Error(result.error.message);
      if (result.cancelled) return;
      if (action === "open") {
        setHistory(readTrafficArchive(result.content));
        setSelected(null);
      } else setNotice(t("记录已导出", "Traffic exported"));
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : String(failure);
      setError(message);
      onDiagnostic(session, message, true);
    }
  };
  const filtered = shownRecords.filter(
    (item) =>
      (direction === "all" || item.direction === direction) &&
      `${item.hex} ${item.address} ${item.detail}`.toLowerCase().includes(search.toLowerCase()),
  );
  const stateLabel =
    status.state === "open"
      ? status.server
        ? t("监听中", "Listening")
        : t("已连接", "Connected")
      : status.state === "opening"
        ? status.retries > 0
          ? `${t("重连中", "Reconnecting")} ${status.retries}/${retryLimit}`
          : t("连接中", "Opening")
        : status.state === "faulted"
          ? t("连接错误", "Faulted")
          : t("未连接", "Disconnected");
  return (
    <div className="tcp-workbench" hidden={!visible}>
      <header className="content-header">
        <div className="content-heading-icon">
          <Network size={20} />
        </div>
        <div>
          <h1>{t("通信连接", "Connections")}</h1>
          <p>{t("TCP 客户端 / 服务端 · 实时收发记录", "TCP client / server · live traffic")}</p>
        </div>
        <span className={`tcp-state ${connected ? "connected" : ""}`} role="status">
          {stateLabel}
        </span>
      </header>
      <form
        className="tcp-connect"
        onSubmit={(event) => {
          event.preventDefault();
          if (!active)
            void act(
              "start",
              mode,
              host.trim(),
              port,
              mode === "client" && autoRetry ? retryLimit : "0",
              String(Number(retrySeconds) * 1000),
            );
        }}
      >
        <label>
          {t("模式", "Mode")}
          <select
            aria-label={t("TCP 模式", "TCP mode")}
            value={mode}
            disabled={busy || active}
            onChange={(event) => {
              setMode(event.target.value);
              setHost(event.target.value === "server" ? "0.0.0.0" : "127.0.0.1");
            }}
          >
            <option value="client">TCP {t("客户端", "client")}</option>
            <option value="server">TCP {t("服务端", "server")}</option>
          </select>
        </label>
        <label>
          {mode === "server" ? t("监听 IP", "Bind IP") : t("目标 IP", "Remote IP")}
          <input
            aria-label="IP"
            value={host}
            maxLength={64}
            required
            disabled={busy || active}
            onChange={(event) => setHost(event.target.value)}
          />
        </label>
        <label>
          {t("端口", "Port")}
          <input
            aria-label={t("端口", "Port")}
            type="number"
            min={1}
            max={65535}
            value={port}
            required
            disabled={busy || active}
            onChange={(event) => setPort(event.target.value)}
          />
        </label>
        {mode === "client" && (
          <label>
            <input
              type="checkbox"
              checked={autoRetry}
              disabled={busy || active}
              onChange={(event) => setAutoRetry(event.target.checked)}
            />
            {t("自动重连", "Auto reconnect")}
          </label>
        )}
        {mode === "client" && autoRetry && (
          <>
            <label>
              {t("重试次数", "Retries")}
              <input
                type="number"
                min={1}
                max={10}
                required
                value={retryLimit}
                disabled={busy || active}
                onChange={(event) => setRetryLimit(event.target.value)}
              />
            </label>
            <label>
              {t("间隔（秒）", "Interval (s)")}
              <input
                type="number"
                min={1}
                max={60}
                required
                value={retrySeconds}
                disabled={busy || active}
                onChange={(event) => setRetrySeconds(event.target.value)}
              />
            </label>
          </>
        )}
        {active ? (
          <button
            type="button"
            disabled={busy}
            onClick={(event) => {
              event.preventDefault();
              void act("stop");
            }}
          >
            <X size={14} />
            {status.server ? t("停止监听", "Stop") : t("断开", "Disconnect")}
          </button>
        ) : (
          <button type="submit" disabled={busy}>
            <PlugZap size={14} />
            {mode === "server" ? t("开始监听", "Listen") : t("连接", "Connect")}
          </button>
        )}
      </form>
      {(error || status.error) && (
        <p className="tcp-error" role="alert">
          {redact(error || status.error)}
        </p>
      )}
      <div className="tcp-peers">
        <span>
          {t("连接", "Peers")} ({status.peers.length})
        </span>
        {status.peers.map((item) => (
          <div className={`tcp-peer ${String(item.id) === peer ? "active" : ""}`} key={item.id}>
            <button
              type="button"
              onClick={() => setPeer(String(item.id))}
              aria-pressed={String(item.id) === peer}
            >
              {redact(item.address)} <small>#{item.id}</small>
            </button>
            <button
              type="button"
              aria-label={`${t("更多操作", "More actions")}: ${redact(item.address)}`}
              onClick={() => setPeerMenu(item)}
            >
              <DotsHorizontalIcon size={14} />
            </button>
          </div>
        ))}
        {status.peers.length === 0 && (
          <small>
            {connected && status.server
              ? t("等待客户端连接", "Waiting for clients")
              : t("暂无连接", "No connected peer")}
          </small>
        )}
      </div>
      <form
        className="tcp-framing"
        onChange={() => setFrameStatus("")}
        onSubmit={(event) => {
          event.preventDefault();
          void configureFrames();
        }}
      >
        <strong>{t("接收分帧", "Receive framing")}</strong>
        <label>
          {t("规则", "Rule")}
          <select value={frameMode} onChange={(event) => setFrameMode(event.target.value)}>
            <option value="off">{t("关闭", "Off")}</option>
            <option value="fixed">{t("固定长度", "Fixed length")}</option>
            <option value="length">{t("长度字段", "Length field")}</option>
            <option value="delimiter">{t("分隔符", "Delimiter")}</option>
          </select>
        </label>
        {frameMode === "fixed" && (
          <label>
            {t("帧字节数", "Frame bytes")}
            <input
              type="number"
              min="1"
              max="1048576"
              required
              value={frameSize}
              onChange={(event) => setFrameSize(event.target.value)}
            />
          </label>
        )}
        {frameMode === "length" && (
          <>
            <label>
              {t("字段偏移", "Field offset")}
              <input
                type="number"
                min="0"
                max="1048575"
                required
                value={lengthOffset}
                onChange={(event) => setLengthOffset(event.target.value)}
              />
            </label>
            <label>
              {t("字段宽度", "Field width")}
              <select value={lengthWidth} onChange={(event) => setLengthWidth(event.target.value)}>
                <option value="1">1 B</option>
                <option value="2">2 B</option>
                <option value="4">4 B</option>
              </select>
            </label>
            <label>
              {t("附加字节数", "Extra bytes")}
              <input
                type="number"
                min="0"
                max="1048576"
                required
                value={lengthAdjustment}
                onChange={(event) => setLengthAdjustment(event.target.value)}
              />
            </label>
            <label>
              {t("字节序", "Byte order")}
              <select
                value={lengthEndian}
                onChange={(event) => setLengthEndian(event.target.value)}
              >
                <option value="big">Big</option>
                <option value="little">Little</option>
              </select>
            </label>
          </>
        )}
        {frameMode === "delimiter" && (
          <label>
            {t("分隔符 HEX", "Delimiter HEX")}
            <input
              value={delimiter}
              required
              placeholder="0D 0A"
              onChange={(event) => setDelimiter(event.target.value)}
            />
          </label>
        )}
        <button type="submit" disabled={busy}>
          {t("应用", "Apply")}
        </button>
        <small role="status">
          {frameStatus ||
            t(
              "帧长 = 长度字段值 + 附加字节数；上限 1 MiB，残帧空闲 5 秒后丢弃",
              "Frame size = length value + extra bytes; 1 MiB limit, 5s partial-frame timeout",
            )}
        </small>
      </form>
      <form
        className="tcp-framing"
        onSubmit={(event) => {
          event.preventDefault();
          void act("bind", ...(bindPath ? [bindPath, bindMessage] : ["off"])).then((ok) => {
            if (ok)
              setBindStatus(
                bindPath
                  ? t("协议与消息绑定已应用", "Protocol and message binding applied")
                  : t("协议绑定已清除", "Protocol binding cleared"),
              );
          });
        }}
      >
        <strong>{t("协议 / 消息绑定", "Protocol / message binding")}</strong>
        <label>
          {t("协议", "Protocol")}
          <select
            aria-label={t("绑定协议", "Bound protocol")}
            value={bindPath}
            onChange={(event) => {
              setBindPath(event.target.value);
              setBindMessage("");
              setBindStatus("");
            }}
          >
            <option value="">{t("不绑定", "Unbound")}</option>
            {protocols.map((item) => (
              <option key={item.path} value={item.path}>
                {item.name} ({item.path})
              </option>
            ))}
          </select>
        </label>
        {bindProtocol && (
          <label>
            {t("消息", "Message")}
            <select
              aria-label={t("绑定消息", "Bound message")}
              value={bindMessage}
              onChange={(event) => {
                setBindMessage(event.target.value);
                setBindStatus("");
              }}
            >
              <option value="">{t("自动识别", "Auto identify")}</option>
              {bindProtocol.schema.messages.map((item) => (
                <option key={item.name} value={item.name}>
                  {item.displayName || item.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <button type="submit" disabled={busy}>
          {t("应用", "Apply")}
        </button>
        <small role="status">
          {bindStatus ||
            (status.protocolPath
              ? `${t("当前", "Current")}: ${status.protocolPath} / ${status.messageName || t("自动", "auto")}`
              : t("当前未绑定协议", "No protocol bound"))}
          {bindProtocol &&
            !bindMessage &&
            !bindProtocol.schema.messageTypeField &&
            ` · ${t("自动识别需在协议 YAML 设置 protocol.messageTypeField", "Auto identify requires protocol.messageTypeField in YAML")}`}
        </small>
      </form>
      <div className="tcp-send">
        <div className="tcp-send-heading">
          <strong>{t("发送数据", "Send data")}</strong>
          <select
            aria-label={t("数据格式", "Data format")}
            value={encoding}
            onChange={(event) => setEncoding(event.target.value)}
          >
            <option value="hex">HEX</option>
            <option value="text">UTF-8</option>
          </select>
          <select
            aria-label={t("发送目标", "Send target")}
            value={peer}
            onChange={(event) => setPeer(event.target.value)}
          >
            <option value="">{t("选择连接", "Select peer")}</option>
            {status.peers.map((item) => (
              <option key={item.id} value={item.id}>
                {item.address} #{item.id}
              </option>
            ))}
          </select>
        </div>
        <textarea
          aria-label={t("发送内容", "Payload")}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          rows={3}
          maxLength={262144}
          placeholder={encoding === "hex" ? "01 03 00 00 00 02" : "UTF-8"}
        />
        <div className="tcp-send-footer">
          <small role="status">
            {notice ||
              t(
                "单次最多 64 KiB；不自动添加换行或校验码。",
                "Up to 64 KiB; no automatic newline or checksum.",
              )}
          </small>
          <button
            type="button"
            disabled={
              busy || !connected || !peer || (encoding === "hex" ? !input.trim() : !input.length)
            }
            onClick={() => void send()}
          >
            <Send size={14} />
            {t("发送", "Send")}
          </button>
        </div>
      </div>
      <div className="tcp-log-toolbar">
        {history && (
          <span>
            {t("历史记录（只读）", "History (read only)")} · {history.session}
          </span>
        )}
        <strong>{t("收发记录", "Traffic")}</strong>
        {history ? (
          <span>
            {history.records.length} {t("条记录", "records")}
          </span>
        ) : (
          <span>
            <ArrowUp size={12} /> {status.sent} B <ArrowDown size={12} /> {status.received} B ·{" "}
            {t("排队", "Queued")} {status.queued} B
          </span>
        )}
        <select
          aria-label={t("记录方向", "Direction")}
          value={direction}
          onChange={(event) => setDirection(event.target.value)}
        >
          <option value="all">{t("全部", "All")}</option>
          <option>TX</option>
          <option>RX</option>
          <option>FRAME</option>
          <option>SYS</option>
        </select>
        <input
          aria-label={t("筛选记录", "Filter records")}
          placeholder={t("搜索 HEX / 地址 / 事件", "Search HEX / address / event")}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <label>
          <input
            type="checkbox"
            checked={follow}
            onChange={(event) => setFollow(event.target.checked)}
          />
          {t("跟随", "Follow")}
        </label>
        <button type="button" onClick={() => void archive("open")}>
          {t("导入", "Import")}
        </button>
        <button type="button" onClick={() => void archive("save")}>
          {t("保存 / 导出", "Save / export")}
        </button>
        {history && (
          <button
            type="button"
            onClick={() => {
              setHistory(null);
              setSelected(null);
            }}
          >
            {t("返回实时", "Back to live")}
          </button>
        )}
        <button
          type="button"
          disabled={busy || shownRecords.length === 0}
          title={t("清空记录", "Clear records")}
          aria-label={t("清空记录", "Clear records")}
          onClick={() => void clear()}
        >
          <Trash2 size={14} />
        </button>
      </div>
      <p className="tcp-log-hint">
        {t(
          "TCP 是字节流：RX 保留原始接收块，FRAME 只表示规则确认的完整帧。当前会话最多保留 1000 条 / 4 MiB；保存导出当前尚未淘汰的记录。",
          "TCP is a byte stream: RX keeps raw chunks; FRAME contains only completed frames. Current session keeps up to 1000 entries / 4 MiB; save exports retained records.",
        )}{" "}
        {(history?.dropped ?? status.dropped) > 0 &&
          `${t("已淘汰", "Evicted")}: ${history?.dropped ?? status.dropped}`}
      </p>
      <div className="tcp-log" ref={table}>
        <table>
          <thead>
            <tr>
              <th>{t("时间", "Time")}</th>
              <th>{t("方向", "Dir")}</th>
              <th>{t("连接", "Peer")}</th>
              <th>{t("字节", "Bytes")}</th>
              <th>{t("数据 / 事件", "Data / event")}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
              <tr key={item.id} className={selected?.id === item.id ? "selected" : ""}>
                <td>
                  {new Date(item.time).toLocaleTimeString(locale, { hour12: false })}.
                  {String(item.time % 1000).padStart(3, "0")}
                </td>
                <td className={`tcp-dir-${item.direction}`}>{item.direction}</td>
                <td>
                  {item.address} {item.peer > 0 && `#${item.peer}`}
                </td>
                <td>{item.size}</td>
                <td>
                  <button
                    type="button"
                    onClick={() => setSelected(item)}
                    title={item.detail || item.hex.slice(0, 200)}
                  >
                    {item.direction === "FRAME"
                      ? `${item.detail} · ${item.hex.slice(0, 150)}`
                      : item.detail || item.hex.slice(0, 150)}
                    {item.hex.length > 150 ? "…" : ""}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="tcp-empty">{t("暂无收发记录", "No traffic records")}</p>
        )}
      </div>
      {selectedRecord && (
        <div className="tcp-record-detail">
          <div>
            <strong>
              {selectedRecord.direction} · {selectedRecord.address} · {selectedRecord.size} B
            </strong>
            <button
              type="button"
              disabled={!selectedRecord.hex}
              onClick={(event) => {
                const owner = event.currentTarget.ownerDocument.defaultView ?? window;
                void owner.navigator.clipboard
                  .writeText(selectedRecord.hex)
                  .then(() => setNotice(t("HEX 已复制", "HEX copied")))
                  .catch(() => setError(t("复制失败", "Copy failed")));
              }}
            >
              {t("复制 HEX", "Copy HEX")}
            </button>
            <button
              type="button"
              disabled={!selectedRecord.hex}
              onClick={() => onDebug(selectedRecord)}
            >
              {t("送入调试", "Open in Debug")}
            </button>
            <button
              type="button"
              aria-label={t("关闭详情", "Close details")}
              onClick={() => setSelected(null)}
            >
              <X size={14} />
            </button>
          </div>
          {selectedRecord.detail && <p>{selectedRecord.detail}</p>}
          {selectedRecord.parsed && (
            <div
              className="debug-field-list"
              aria-label={t("协议解析结果", "Protocol parse result")}
            >
              <p role={selectedRecord.parsed.status === "ok" ? "status" : "alert"}>
                {selectedRecord.parsed.status === "ok"
                  ? t("解析成功", "Decoded")
                  : selectedRecord.parsed.status === "unmatched"
                    ? t("未匹配消息", "Message not matched")
                    : t("解析失败", "Decode failed")}
                {selectedRecord.parsed.messageName && ` · ${selectedRecord.parsed.messageName}`}
                {selectedRecord.parsed.checksum === "pass" &&
                  ` · ${t("校验通过", "Checksum passed")}`}
                {selectedRecord.parsed.checksum === "fail" &&
                  ` · ${t("校验失败", "Checksum failed")}`}
                {selectedRecord.parsed.error && ` · ${selectedRecord.parsed.error}`}
              </p>
              {selectedRecord.parsed.fields.map((field) => (
                <div key={field.name} className="debug-field-preview">
                  <strong>{field.displayName || field.name}</strong>
                  <small>
                    {field.name} · {field.type} · {field.offset}–{field.offset + field.length - 1}
                  </small>
                  <code>
                    {field.enumName === undefined
                      ? field.value
                      : field.enumName
                        ? `${field.enumName} (${field.value})`
                        : `${t("未知枚举值", "Unknown enum")} (${field.value})`}
                  </code>
                  {field.bits?.map((bit) => (
                    <small key={bit.name}>
                      {bit.displayName || bit.name}: {bit.value} · bit {bit.bitOffset}–
                      {bit.bitOffset + bit.width - 1} · byte {bit.offset}–
                      {bit.offset + bit.length - 1}
                    </small>
                  ))}
                </div>
              ))}
            </div>
          )}
          <pre>{selected.hex || selected.detail}</pre>
        </div>
      )}
      <dialog
        ref={dialog}
        className="protocol-dialog tree-dialog tree-actions-dialog"
        onCancel={() => setPeerMenu(null)}
      >
        <h2>{peerMenu?.address && redact(peerMenu.address)}</h2>
        {error && (
          <p className="tcp-error" role="alert">
            {redact(error)}
          </p>
        )}
        <div className="tree-dialog-actions">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (peerMenu)
                void act("disconnect", String(peerMenu.id)).then((ok) => {
                  if (ok) setPeerMenu(null);
                });
            }}
          >
            <X size={15} />
            {t("断开连接", "Disconnect peer")}
          </button>
          <button type="button" onClick={() => setPeerMenu(null)}>
            {t("取消", "Cancel")}
          </button>
        </div>
      </dialog>
    </div>
  );
}
