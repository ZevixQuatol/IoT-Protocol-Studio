import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  DotsHorizontalIcon,
  Network,
  PlugZap,
  Send,
  Trash2,
  X,
} from "./feather-icons";
import {
  tcpCommand,
  trafficFile,
  pcapFile,
  encodeProtocolMessage,
  inspectHex,
  type MessageEncodeRequest,
  type TcpDraft,
  type TcpRecord,
  type TcpSnapshot,
  type CorrelationRule,
  type WorkspaceProtocol,
} from "./bridge";
import { readTrafficArchive } from "./trafficFile";
import TrafficReplay from "./TrafficReplay";
import TrafficFilters, { deviceValue, emptyFilters, matchesRecord } from "./TrafficFilters";
import TrafficCorrelation from "./TrafficCorrelation";
import { activeVariables, resolveValue, sendValues } from "./sendVariables";
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
type SendRun = { stopped: boolean; timer?: ReturnType<typeof setTimeout>; wake?: () => void };

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
  draft: TcpDraft | null;
  onDebug: (record: TcpRecord) => void;
  onDiagnostic: (session: string, message: string, problem: boolean) => void;
  redact: (value: string) => string;
}) {
  const zh = locale === "zh-CN";
  const t = (cn: string, en: string) => (zh ? cn : en);
  const [mode, setMode] = useState("client");
  const [host, setHost] = useState("127.0.0.1");
  const [port, setPort] = useState("9000");
  const [serialDevice, setSerialDevice] = useState("");
  const [baud, setBaud] = useState("115200");
  const [dataBits, setDataBits] = useState("8");
  const [parity, setParity] = useState("none");
  const [stopBits, setStopBits] = useState("1");
  const [flowControl, setFlowControl] = useState("none");
  const [localHost, setLocalHost] = useState("0.0.0.0");
  const [localPort, setLocalPort] = useState("0");
  const [udpMode, setUdpMode] = useState("unicast");
  const [interfaceAddress, setInterfaceAddress] = useState("0.0.0.0");
  const [devices, setDevices] = useState<string[]>([]);
  const [interfaces, setInterfaces] = useState<string[]>(["0.0.0.0"]);
  const [status, setStatus] = useState(empty);
  const [records, setRecords] = useState<TcpRecord[]>([]);
  const [history, setHistory] = useState<ReturnType<typeof readTrafficArchive> | null>(null);
  const [replayTime, setReplayTime] = useState<number | null>(null);
  const [captureIp, setCaptureIp] = useState("");
  const [importingCapture, setImportingCapture] = useState(false);
  const replayActive = useRef(false);
  const [replayReset, setReplayReset] = useState(0);
  const importVersion = useRef(0);
  const [correlation, setCorrelation] = useState<CorrelationRule | null>(null);
  const [autoRetry, setAutoRetry] = useState(false);
  const [retryLimit, setRetryLimit] = useState("3");
  const [retrySeconds, setRetrySeconds] = useState("2");
  const [peer, setPeer] = useState("");
  const [input, setInput] = useState("");
  const [encoding, setEncoding] = useState("hex");
  const [messageDraft, setMessageDraft] = useState<MessageEncodeRequest | null>(null);
  const [checked, setChecked] = useState<{
    hex: string;
    effective: string;
    sequence: number;
    environmentKey: string;
  } | null>(null);
  const [connectionPreview, setConnectionPreview] = useState("");
  const [intervalMs, setIntervalMs] = useState("1000");
  const [repeatCount, setRepeatCount] = useState("1");
  const [batch, setBatch] = useState("");
  const [runProgress, setRunProgress] = useState("");
  const [running, setRunning] = useState(false);
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
  const [filters, setFilters] = useState(emptyFilters);
  const [selected, setSelected] = useState<TcpRecord | null>(null);
  const [follow, setFollow] = useState(true);
  const [peerMenu, setPeerMenu] = useState<{ id: number; address: string } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const table = useRef<HTMLDivElement>(null);
  const cursor = useRef(0);
  const generation = useRef(0);
  const lastPollError = useRef("");
  const sequence = useRef(1);
  const run = useRef<SendRun | null>(null);
  const sending = useRef(false);
  const connected = status.state === "open";
  const active = connected || status.state === "opening";
  const redactRecord = (item: TcpRecord): TcpRecord => ({
    ...item,
    address: redact(item.address),
    detail: redact(item.detail),
    device: item.device === undefined ? undefined : redact(item.device),
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
        redacted: field.redacted || redact(field.value) !== field.value,
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
  const visibleRecords = useMemo(
    () =>
      history && replayTime !== null
        ? history.records.filter((item) => item.time <= replayTime)
        : (history?.records ?? records),
    [history?.records, records, replayTime],
  );
  const shownRecords = visibleRecords.map(redactRecord);
  const selectedRecord = selected && redactRecord(selected);
  const bindProtocol = protocols.find((item) => item.path === bindPath);
  useEffect(() => {
    setSelected(null);
  }, [filters, direction, search, history]);
  useEffect(() => {
    if (replayTime !== null && selected && selected.time > replayTime) setSelected(null);
  }, [replayTime, selected]);

  useEffect(() => {
    setConnectionPreview("");
  }, [
    mode,
    host,
    port,
    serialDevice,
    baud,
    dataBits,
    parity,
    stopBits,
    flowControl,
    localHost,
    localPort,
    udpMode,
    interfaceAddress,
  ]);

  useEffect(() => {
    if (draft) {
      setInput(draft.hex);
      setEncoding("hex");
      setMessageDraft(draft.message ?? null);
      setChecked(null);
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
        if (result.state !== "open") stopRun();
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
  useEffect(() => () => stopRun(), [session]);
  useEffect(
    () => () => {
      ++importVersion.current;
    },
    [session],
  );
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
      if (["start", "serial", "udp"].includes(action))
        setStatus((current) => ({ ...current, state: "opening", error: "" }));
      if (action === "stop") setStatus((current) => ({ ...current, state: "closed", peers: [] }));
      if (action === "stop") {
        stopRun();
      }
      return true;
    } catch (failure) {
      setError(String(failure));
      onDiagnostic(session, String(failure), true);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const stopRun = () => {
    if (!run.current) return;
    run.current.stopped = true;
    clearTimeout(run.current.timer);
    run.current.wake?.();
    run.current = null;
    setRunning(false);
  };
  const mask = (value: string, secrets: string[]) =>
    redact(secrets.reduce((text, secret) => text.replaceAll(secret, "••••"), value));
  const prepare = async (payload: string, format: string, message: MessageEncodeRequest | null) => {
    const templates = message ? message.fields.map((field) => field.value) : [payload];
    const environment = templates.some((value) => value.includes("{{"))
      ? await activeVariables()
      : { values: {}, secrets: [] };
    const values = sendValues(environment.values, sequence.current);
    if (message) {
      const fields = message.fields.map((field) => ({
        ...field,
        value: resolveValue(field.value, values),
      }));
      const encoded = await encodeProtocolMessage({ ...message, fields });
      if (!encoded.ok) throw new Error(encoded.error.message);
      return {
        hex: encoded.normalizedHex,
        effective: fields
          .map((field) => `${field.name}=${mask(field.value, environment.secrets)}`)
          .join("; "),
        sequence: sequence.current,
        environmentKey: JSON.stringify(environment.values),
      };
    }
    const effective = resolveValue(payload, values);
    const hex =
      format === "hex"
        ? effective
        : Array.from(new TextEncoder().encode(effective), (byte) =>
            byte.toString(16).padStart(2, "0"),
          ).join(" ");
    return {
      hex,
      effective: mask(effective, environment.secrets),
      sequence: sequence.current,
      environmentKey: JSON.stringify(environment.values),
    };
  };
  const checkPayload = async () => {
    setError("");
    try {
      const prepared = await prepare(input, encoding, messageDraft);
      if (!messageDraft) {
        const inspection = await inspectHex(prepared.hex);
        if (!inspection.ok) throw new Error(inspection.error.message);
      }
      setChecked(prepared);
    } catch (failure) {
      setChecked(null);
      setError(String(failure));
    }
  };
  const sendOne = async (
    payload: string,
    format: string,
    message: MessageEncodeRequest | null,
    cached?: typeof checked,
    control?: SendRun,
  ) => {
    const hasReferences = message
      ? message.fields.some((field) => field.value.includes("{{"))
      : payload.includes("{{");
    const environmentMatches =
      !hasReferences ||
      !cached ||
      JSON.stringify((await activeVariables()).values) === cached?.environmentKey;
    const prepared =
      cached && cached.sequence === sequence.current && environmentMatches
        ? cached
        : await prepare(payload, format, message);
    if (control?.stopped) return false;
    const result = await tcpCommand(session, "send", peer, prepared.hex);
    if (!result.ok) throw new Error(result.error.message);
    sequence.current++;
    setChecked(null);
    return true;
  };
  const send = async () => {
    if (busy || sending.current || run.current || replayActive.current) return;
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      await sendOne(input, encoding, messageDraft, checked);
      setNotice(
        t(
          "已加入发送队列，实际发送字节见 TX 记录。",
          "Queued. TX records show bytes actually sent.",
        ),
      );
    } catch (failure) {
      setError(String(failure));
      onDiagnostic(session, String(failure), true);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };
  const resolveConnection = async () => {
    if (mode === "serial") {
      const environment =
        serialDevice.includes("{{") || baud.includes("{{")
          ? await activeVariables()
          : { values: {}, secrets: [] };
      const device = resolveValue(serialDevice.trim(), environment.values);
      const speed = resolveValue(baud.trim(), environment.values);
      if (
        !/^COM[1-9][0-9]{0,2}$/.test(device) ||
        !/^[0-9]+$/.test(speed) ||
        Number(speed) < 50 ||
        Number(speed) > 4000000
      )
        throw new Error(t("串口设备或波特率无效。", "Invalid serial device or baud rate."));
      return {
        action: "serial",
        args: [device, speed, dataBits, parity, stopBits, flowControl],
        display: mask(
          `${device} · ${speed} / ${dataBits} / ${parity} / ${stopBits} / ${flowControl}`,
          environment.secrets,
        ),
      };
    }
    const environment = [host, port, localHost, localPort, interfaceAddress].some((value) =>
      value.includes("{{"),
    )
      ? await activeVariables()
      : { values: {}, secrets: [] };
    const effectiveHost = resolveValue(host.trim(), environment.values);
    const effectivePort = resolveValue(port.trim(), environment.values);
    if (
      !effectiveHost ||
      !/^[0-9]+$/.test(effectivePort) ||
      Number(effectivePort) < 1 ||
      Number(effectivePort) > 65535
    )
      throw new Error(t("连接地址或端口无效。", "Invalid connection address or port."));
    if (mode === "udp") {
      const bindHost = resolveValue(localHost.trim(), environment.values);
      const bindPort = resolveValue(localPort.trim(), environment.values);
      const adapter = resolveValue(interfaceAddress.trim(), environment.values);
      if (!bindHost || !/^[0-9]+$/.test(bindPort) || Number(bindPort) > 65535)
        throw new Error(t("UDP 本地地址或端口无效。", "Invalid UDP local address or port."));
      return {
        action: "udp",
        args: [bindHost, bindPort, effectiveHost, effectivePort, udpMode, adapter],
        display: mask(
          `${bindHost}:${bindPort} → ${effectiveHost}:${effectivePort} · ${udpMode} · ${adapter}`,
          environment.secrets,
        ),
      };
    }
    return {
      action: "start",
      args: [
        mode,
        effectiveHost,
        effectivePort,
        mode === "client" && autoRetry ? retryLimit : "0",
        String(Number(retrySeconds) * 1000),
      ],
      display: `${mask(effectiveHost, environment.secrets)}:${mask(effectivePort, environment.secrets)}`,
    };
  };
  const refreshDevices = async () => {
    try {
      const result = await tcpCommand(session, "devices");
      if (!result.ok) throw new Error(result.error.message);
      if ("serialDevices" in result) {
        setDevices(result.serialDevices ?? []);
        setSerialDevice((current) => current || result.serialDevices?.[0] || "");
        setInterfaces(result.interfaces ?? ["0.0.0.0"]);
      }
    } catch (failure) {
      setError(String(failure));
    }
  };
  const checkConnection = async () => {
    setError("");
    try {
      setConnectionPreview((await resolveConnection()).display);
    } catch (failure) {
      setConnectionPreview("");
      setError(String(failure));
    }
  };
  const startRun = async () => {
    if (run.current || sending.current || replayActive.current) return;
    const interval = Number(intervalMs);
    const repeats = Number(repeatCount);
    const items = batch.trim()
      ? batch
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
      : [input];
    if (
      !Number.isInteger(interval) ||
      interval < 50 ||
      interval > 60000 ||
      !Number.isInteger(repeats) ||
      repeats < 1 ||
      repeats * items.length > 1000 ||
      items.length === 0 ||
      !items.every(Boolean)
    ) {
      setError(
        t(
          "间隔需为 50–60000 毫秒，总发送数为 1–1000。",
          "Interval must be 50–60000 ms; total sends 1–1000.",
        ),
      );
      return;
    }
    setError("");
    setChecked(null);
    setRunning(true);
    const control: SendRun = { stopped: false };
    run.current = control;
    let sent = 0;
    try {
      for (let cycle = 0; cycle < repeats && !control.stopped; cycle++) {
        for (const item of items) {
          if (control.stopped) break;
          const snapshot = await tcpCommand(session, "poll", String(cursor.current));
          if (!snapshot.ok) throw new Error(snapshot.error.message);
          if (
            !("state" in snapshot) ||
            snapshot.state !== "open" ||
            !snapshot.peers.some((current) => String(current.id) === peer)
          )
            throw new Error(t("连接已关闭，已停止发送。", "Connection closed; send stopped."));
          if (snapshot.queued > 256 * 1024)
            throw new Error(t("发送队列过长，已停止发送。", "Send queue too large; send stopped."));
          if (control.stopped) break;
          if (
            !(await sendOne(item, encoding, batch.trim() ? null : messageDraft, undefined, control))
          )
            break;
          setRunProgress(`${++sent}/${repeats * items.length}`);
          if (sent < repeats * items.length && !control.stopped)
            await new Promise<void>((resolve) => {
              control.wake = resolve;
              control.timer = setTimeout(resolve, interval);
            });
        }
      }
    } catch (failure) {
      setError(String(failure));
      onDiagnostic(session, String(failure), true);
    } finally {
      if (run.current === control) stopRun();
    }
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
    ++importVersion.current;
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
    if (action === "open") {
      stopRun();
      setReplayReset((value) => value + 1);
    }
    const version = action === "open" ? ++importVersion.current : importVersion.current;
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
      const rule = history ? history.correlation : correlation;
      const content =
        action === "save"
          ? JSON.stringify({
              ...current,
              correlation: rule
                ? {
                    ...rule,
                    protocol: redact(rule.protocol),
                    requestMessage: redact(rule.requestMessage),
                    responseMessage: redact(rule.responseMessage),
                    requestField: redact(rule.requestField),
                    responseField: redact(rule.responseField),
                  }
                : undefined,
              records: current?.records.map(redactRecord),
            })
          : "";
      const result = await trafficFile(action, content);
      if (version !== importVersion.current) return;
      if (!result.ok) throw new Error(result.error.message);
      if (result.cancelled) return;
      if (action === "open") {
        const imported = readTrafficArchive(result.content);
        stopRun();
        setHistory(imported);
        setSelected(null);
      } else setNotice(t("记录已导出", "Traffic exported"));
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : String(failure);
      setError(message);
      onDiagnostic(session, message, true);
    }
  };
  const importCapture = async () => {
    if (importingCapture) return;
    stopRun();
    const version = ++importVersion.current;
    setReplayReset((value) => value + 1);
    setImportingCapture(true);
    setError("");
    try {
      const result = await pcapFile(session, captureIp.trim());
      if (version !== importVersion.current) return;
      if (!result.ok) throw new Error(result.error.message);
      if (result.cancelled) return;
      const capture = JSON.parse(result.content);
      const imported = readTrafficArchive(
        JSON.stringify({
          format: "iotps-traffic-v1",
          session: "PCAP",
          savedAt: new Date(capture.time).toISOString(),
          dropped: capture.dropped,
          records: capture.records,
        }),
      );
      stopRun();
      setHistory(imported);
      setSelected(null);
    } catch (failure) {
      if (version === importVersion.current) setError(String(failure));
    } finally {
      setImportingCapture(false);
    }
  };
  const replaySend = async (hex: string, target: string, current: () => boolean) => {
    const version = importVersion.current;
    const snapshot = await tcpCommand(session, "poll", String(cursor.current));
    if (!current() || version !== importVersion.current) return false;
    if (!snapshot.ok) throw new Error(snapshot.error.message);
    if (
      !("state" in snapshot) ||
      snapshot.state !== "open" ||
      !snapshot.peers.some((item) => String(item.id) === target)
    )
      throw new Error(t("回放目标已断开。", "Replay target disconnected."));
    if (snapshot.queued > 256 * 1024)
      throw new Error(t("发送队列过长，回放已停止。", "Send queue too large; replay stopped."));
    const result = await tcpCommand(session, "send", target, hex);
    if (!result.ok) throw new Error(result.error.message);
    return true;
  };
  const filtered = shownRecords.filter(
    (item) =>
      matchesRecord(item, filters) &&
      (direction === "all" || item.direction === direction) &&
      `${item.hex} ${item.address} ${item.detail} ${deviceValue(item, filters.deviceField)} ${item.parsed?.messageName ?? ""}`
        .toLowerCase()
        .includes(search.toLowerCase()),
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
          <p>
            {t(
              "TCP · 串口 · UDP 单播 / 广播 / 组播",
              "TCP · Serial · UDP unicast / broadcast / multicast",
            )}
          </p>
        </div>
        <span className={`tcp-state ${connected ? "connected" : ""}`} role="status">
          {stateLabel}
        </span>
      </header>
      <form
        className="tcp-connect"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!active) {
            try {
              const effective = await resolveConnection();
              setConnectionPreview(effective.display);
              await act(effective.action, ...effective.args);
            } catch (failure) {
              setError(String(failure));
            }
          }
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
              setConnectionPreview("");
              if (["serial", "udp"].includes(event.target.value)) void refreshDevices();
            }}
          >
            <option value="client">TCP {t("客户端", "client")}</option>
            <option value="server">TCP {t("服务端", "server")}</option>
            <option value="serial">{t("串口", "Serial")}</option>
            <option value="udp">UDP</option>
          </select>
        </label>
        {mode !== "serial" && (
          <>
            <label>
              {mode === "server" ? t("监听 IP", "Bind IP") : t("目标 IP", "Remote IP")}
              <input
                aria-label="IP"
                value={host}
                maxLength={64}
                required
                disabled={busy || active}
                onChange={(event) => {
                  setHost(event.target.value);
                  setConnectionPreview("");
                }}
              />
            </label>
            <label>
              {t("端口", "Port")}
              <input
                aria-label={t("端口", "Port")}
                inputMode="numeric"
                value={port}
                required
                disabled={busy || active}
                onChange={(event) => {
                  setPort(event.target.value);
                  setConnectionPreview("");
                }}
              />
            </label>
          </>
        )}
        {mode === "serial" && (
          <>
            <label>
              {t("串口设备", "Serial device")}
              <input
                aria-label={t("串口设备", "Serial device")}
                list={`ports-${session}`}
                value={serialDevice}
                required
                maxLength={64}
                disabled={busy || active}
                onChange={(event) => setSerialDevice(event.target.value)}
              />
            </label>
            <datalist id={`ports-${session}`}>
              {devices.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            <label>
              {t("波特率", "Baud rate")}
              <input
                aria-label={t("波特率", "Baud rate")}
                inputMode="numeric"
                value={baud}
                required
                disabled={busy || active}
                onChange={(event) => setBaud(event.target.value)}
              />
            </label>
            <label>
              {t("数据位", "Data bits")}
              <select
                aria-label={t("数据位", "Data bits")}
                value={dataBits}
                disabled={busy || active}
                onChange={(event) => setDataBits(event.target.value)}
              >
                {[5, 6, 7, 8].map((bits) => (
                  <option key={bits}>{bits}</option>
                ))}
              </select>
            </label>
            <label>
              {t("校验位", "Parity")}
              <select
                aria-label={t("校验位", "Parity")}
                value={parity}
                disabled={busy || active}
                onChange={(event) => setParity(event.target.value)}
              >
                <option value="none">{t("无", "None")}</option>
                <option value="odd">{t("奇", "Odd")}</option>
                <option value="even">{t("偶", "Even")}</option>
                <option value="mark">Mark (1)</option>
                <option value="space">Space (0)</option>
              </select>
            </label>
            <label>
              {t("停止位", "Stop bits")}
              <select
                aria-label={t("停止位", "Stop bits")}
                value={stopBits}
                disabled={busy || active}
                onChange={(event) => setStopBits(event.target.value)}
              >
                {["1", "1.5", "2"].map((bits) => (
                  <option key={bits}>{bits}</option>
                ))}
              </select>
            </label>
            <label>
              {t("流控", "Flow control")}
              <select
                aria-label={t("流控", "Flow control")}
                value={flowControl}
                disabled={busy || active}
                onChange={(event) => setFlowControl(event.target.value)}
              >
                <option value="none">{t("无", "None")}</option>
                <option value="hardware">RTS/CTS</option>
                <option value="software">XON/XOFF</option>
              </select>
            </label>
            <button type="button" disabled={busy || active} onClick={() => void refreshDevices()}>
              {t("刷新设备", "Refresh devices")}
            </button>
          </>
        )}
        {mode === "udp" && (
          <>
            <label>
              {t("本地 IP", "Local IP")}
              <input
                aria-label={t("本地 IP", "Local IP")}
                value={localHost}
                required
                maxLength={64}
                disabled={busy || active}
                onChange={(event) => setLocalHost(event.target.value)}
              />
            </label>
            <label>
              {t("本地端口（0 自动）", "Local port (0 auto)")}
              <input
                aria-label={t("本地端口", "Local port")}
                value={localPort}
                required
                disabled={busy || active}
                onChange={(event) => setLocalPort(event.target.value)}
              />
            </label>
            <label>
              {t("UDP 模式", "UDP mode")}
              <select
                aria-label={t("UDP 模式", "UDP mode")}
                value={udpMode}
                disabled={busy || active}
                onChange={(event) => {
                  setUdpMode(event.target.value);
                  setHost(
                    event.target.value === "broadcast"
                      ? "255.255.255.255"
                      : event.target.value === "multicast"
                        ? "239.255.0.1"
                        : "127.0.0.1",
                  );
                }}
              >
                <option value="unicast">{t("单播", "Unicast")}</option>
                <option value="broadcast">{t("广播", "Broadcast")}</option>
                <option value="multicast">{t("组播", "Multicast")}</option>
              </select>
            </label>
            {udpMode === "multicast" && (
              <label>
                {t("组播网卡 IP", "Multicast interface IP")}
                <select
                  aria-label={t("组播网卡 IP", "Multicast interface IP")}
                  value={interfaceAddress}
                  disabled={busy || active}
                  onChange={(event) => setInterfaceAddress(event.target.value)}
                >
                  {interfaces.map((address) => (
                    <option key={address} value={address}>
                      {address === "0.0.0.0" ? t("系统默认", "System default") : address}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button type="button" disabled={busy || active} onClick={() => void refreshDevices()}>
              {t("刷新网卡", "Refresh interfaces")}
            </button>
          </>
        )}
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
        <button type="button" disabled={busy || active} onClick={() => void checkConnection()}>
          {t("检查生效参数", "Check effective address")}
        </button>
        {connectionPreview && <small role="status">{connectionPreview}</small>}
      </form>
      {mode === "udp" && (
        <p className="tcp-log-hint">
          {t("本地端口", "Local port")}: {status.kind === "udp" ? status.port : localPort} ·{" "}
          {t(
            "目标 IP / 端口用于发送；接收记录显示实际来源。组播请将本地端口设为组播接收端口。",
            "Remote IP / port is the send target; received records show the actual sender. For multicast, bind the group receive port.",
          )}
          {connected && udpMode === "multicast" && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void act("membership", status.multicastJoined ? "leave" : "join")}
            >
              {status.multicastJoined
                ? t("退出组播", "Leave multicast")
                : t("加入组播", "Join multicast")}
            </button>
          )}
        </p>
      )}
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
        hidden={mode === "udp"}
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
            onChange={(event) => {
              setEncoding(event.target.value);
              setMessageDraft(null);
              setChecked(null);
            }}
          >
            <option value="hex">HEX</option>
            <option value="text">UTF-8</option>
          </select>
          <select
            aria-label={t("发送目标", "Send target")}
            value={peer}
            onChange={(event) => {
              setPeer(event.target.value);
              setChecked(null);
            }}
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
          onChange={(event) => {
            setInput(event.target.value);
            setMessageDraft(null);
            setChecked(null);
          }}
          rows={3}
          maxLength={262144}
          placeholder={encoding === "hex" ? "01 03 00 00 00 02" : "UTF-8"}
        />
        <small>
          {messageDraft
            ? `${t("报文源", "Message source")}: ${messageDraft.relativePath} / ${messageDraft.messageName}`
            : t(
                "支持 {{变量名}}；内置 random、sequence、timestamp。",
                "Use {{name}}; built-ins: random, sequence, timestamp.",
              )}
        </small>
        <div className="tcp-send-schedule">
          <label>
            {t("间隔 (毫秒)", "Interval (ms)")}
            <input
              aria-label={t("发送间隔", "Send interval")}
              type="number"
              min="50"
              max="60000"
              value={intervalMs}
              onChange={(event) => setIntervalMs(event.target.value)}
            />
          </label>
          <label>
            {t("重复次数", "Repeat count")}
            <input
              aria-label={t("重复次数", "Repeat count")}
              type="number"
              min="1"
              max="1000"
              value={repeatCount}
              onChange={(event) => setRepeatCount(event.target.value)}
            />
          </label>
          <label>
            {t(
              "批量内容（每行一条原始报文；空白时使用上方内容或报文源）",
              "Batch payloads (one raw payload per line; empty uses the payload or message source above)",
            )}
            <textarea
              aria-label={t("批量内容", "Batch payloads")}
              rows={2}
              maxLength={262144}
              value={batch}
              onChange={(event) => setBatch(event.target.value)}
              placeholder={encoding === "hex" ? "01 02\n03 04" : "first\nsecond"}
            />
          </label>
        </div>
        {checked && (
          <div className="tcp-send-preview" role="status">
            <span>
              {t("生效值", "Effective value")}: {checked.effective}
            </span>
            <code>HEX: {checked.hex}</code>
          </div>
        )}
        <div className="tcp-send-footer">
          <small role="status">
            {runProgress && running
              ? `${t("发送进度", "Progress")}: ${runProgress}`
              : notice ||
                (messageDraft
                  ? t(
                      "每次发送按协议重算长度与校验。",
                      "Length and checksum are recalculated for every message send.",
                    )
                  : t(
                      mode === "udp"
                        ? "单次最多 65507 字节；不自动添加换行或校验码。"
                        : "单次最多 64 KiB；不自动添加换行或校验码。",
                      mode === "udp"
                        ? "Up to 65507 bytes; no automatic newline or checksum."
                        : "Up to 64 KiB; no automatic newline or checksum.",
                    ))}
          </small>
          <button
            type="button"
            disabled={busy || running || (encoding === "hex" ? !input.trim() : !input.length)}
            onClick={() => void checkPayload()}
          >
            {t("检查生效值", "Check effective value")}
          </button>
          <button
            data-action="send"
            type="button"
            disabled={
              busy ||
              running ||
              !connected ||
              !peer ||
              (encoding === "hex" ? !input.trim() : !input.length)
            }
            onClick={() => void send()}
          >
            <Send size={14} />
            {t("发送", "Send")}
          </button>
          {running ? (
            <button type="button" onClick={stopRun}>
              {t("停止发送", "Stop sending")}
            </button>
          ) : (
            <button
              type="button"
              disabled={busy || !connected || !peer || (!batch.trim() && !input.trim())}
              onClick={() => void startRun()}
            >
              {t("定时 / 批量发送", "Timed / batch send")}
            </button>
          )}
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
              ++importVersion.current;
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
      <details className="traffic-filters traffic-capture">
        <summary>{t("PCAP 导入与分析", "PCAP import and analysis")}</summary>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void importCapture();
          }}
        >
          <label>
            {t("捕获本机 IPv4", "Captured local IPv4")}
            <input
              aria-label={t("捕获本机 IPv4", "Captured local IPv4")}
              required
              maxLength={15}
              value={captureIp}
              onChange={(event) => setCaptureIp(event.target.value)}
              placeholder="192.168.1.10"
            />
          </label>
          <button type="submit" disabled={importingCapture || busy}>
            {t("选择 PCAP（仅离线）", "Choose PCAP (offline only)")}
          </button>
          <small>
            {t(
              "支持经典 PCAP（大小端、微秒 / 纳秒）、Ethernet（含最多三层 VLAN）、未分片 IPv4、TCP / UDP；最多 16 MiB / 100000 包 / 128 连接。复用当前已应用的分帧和协议绑定；TCP 分帧关闭时仅显示原始段，UDP 按数据报解析。PCAPNG、IPv6、IP 分片及其他链路显式报告不支持；截断、缺包、冲突重叠及未完成帧见 SYS。TCP 每方向最多 1 MiB、总段缓存 4 MiB；网络校验和不验证。导入不会连接或发包，失败保留当前历史。",
              "Classic PCAP (both endian orders, micro/nanoseconds), Ethernet (up to three VLAN tags), unfragmented IPv4 TCP/UDP; 16 MiB / 100000 packets / 128 connections. Uses currently applied framing and protocol binding. TCP framing off keeps raw segments; UDP decodes datagrams. PCAPNG, IPv6, fragments and other links are explicitly unsupported. SYS reports truncation, gaps, overlaps and partial frames. TCP: 1 MiB per direction, 4 MiB segment cache; transport checksums are not verified. Import never connects or sends; failure preserves history.",
            )}
          </small>
        </form>
      </details>
      {history && visible && (
        <TrafficReplay
          records={history.records}
          savedAt={history.savedAt}
          reset={replayReset}
          peers={status.peers}
          enabled={connected && !busy && !running && !sending.current}
          locale={locale}
          onTime={setReplayTime}
          onSend={replaySend}
          onActive={(value) => {
            replayActive.current = value;
          }}
          redact={redact}
        />
      )}
      <TrafficFilters
        records={shownRecords}
        filters={filters}
        onChange={setFilters}
        locale={locale}
        session={history?.session ?? session}
        device={status.device ?? ""}
        sensitive={redact(status.device ?? "") !== (status.device ?? "")}
        disabled={busy || Boolean(history)}
        onDevice={(identifier) => act("device", identifier)}
      />
      <p className="tcp-log-hint" role="status">
        {t("筛选结果", "Filtered records")}: {filtered.length}/{shownRecords.length} ·
        {mode === "udp"
          ? t(
              "UDP：每条 RX / FRAME 保留一个完整数据报，不应用字节流分帧。",
              "UDP: each RX / FRAME preserves one datagram; stream framing is bypassed.",
            )
          : ""}
        {mode !== "udp" &&
          t(
            "TCP / 串口是字节流：RX 保留原始接收块，FRAME 表示完整帧。",
            "TCP / serial are byte streams: RX keeps raw chunks; FRAME contains completed frames.",
          )}{" "}
        {t(
          "会话最多保留 1000 条 / 4 MiB；保存导出尚未淘汰的记录。",
          "Sessions keep 1000 entries / 4 MiB; save exports retained records.",
        )}{" "}
        {(history?.dropped ?? status.dropped) > 0 &&
          `${t("已淘汰", "Evicted")}: ${history?.dropped ?? status.dropped}`}
      </p>
      <TrafficCorrelation
        records={visibleRecords}
        protocols={protocols}
        rule={history ? (history.correlation ?? null) : correlation}
        onRule={(rule) =>
          history
            ? setHistory({ ...history, correlation: rule ?? undefined })
            : setCorrelation(rule)
        }
        onSelect={setSelected}
        locale={locale}
        savedAt={
          history
            ? replayTime === null
              ? history.savedAt
              : new Date(replayTime).toISOString()
            : undefined
        }
        dropped={history?.dropped ?? status.dropped}
        redact={redact}
      />
      <div className="tcp-log" ref={table}>
        <table>
          <thead>
            <tr>
              <th>{t("时间", "Time")}</th>
              <th>{t("方向", "Dir")}</th>
              <th>{t("连接", "Peer")}</th>
              <th>{t("设备 / 消息", "Device / message")}</th>
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
                <td className={`tcp-dir-${item.direction}`}>
                  {item.direction === "FRAME" ? `FRAME ${item.flow ?? "RX"}` : item.direction}
                </td>
                <td>
                  {item.address} {item.peer > 0 && `#${item.peer}`}
                </td>
                <td
                  title={`${deviceValue(item, filters.deviceField) || "—"} / ${item.parsed?.messageName ?? "—"}`}
                >
                  {deviceValue(item, filters.deviceField) || "—"}
                  {item.parsed?.messageName && <small> / {item.parsed.messageName}</small>}
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
