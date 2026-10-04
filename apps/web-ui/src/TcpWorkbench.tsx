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
import {
  AlertTriangle,
  CheckCircle,
  Circle,
  Filter,
  Inbox,
  Pause,
  Play,
  RefreshCw,
  Search,
  Square,
  XCircle,
} from "react-feather";
import TcpRecordDetail from "./TcpRecordDetail";
import ServerPeers, { clientLabel } from "./ServerPeers";
import ServerRecordDetail from "./ServerRecordDetail";
import UdpConnection from "./UdpConnection";
import UdpRecordDetail from "./UdpRecordDetail";
import UdpTemplates from "./UdpTemplates";
import { udpEndpoint, udpEndpoints } from "./udpView";
import "./server-workbench.css";
import "./udp-workbench.css";
import "./serial-workbench.css";
import TrafficReplay from "./TrafficReplay";
import TrafficHistory, { type TrafficSource } from "./TrafficHistory";
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
  onSummary,
  popup = false,
}: {
  session: string;
  protocols: WorkspaceProtocol[];
  visible: boolean;
  locale: Locale;
  draft: TcpDraft | null;
  onDebug: (record: TcpRecord) => void;
  onDiagnostic: (session: string, message: string, problem: boolean) => void;
  redact: (value: string) => string;
  onSummary: (id: string, mode: string, state: string, endpoint: string) => void;
  popup?: boolean;
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
  const udpBindings = useRef(new Map<number, string>());
  const [devices, setDevices] = useState<string[]>([]);
  const [interfaces, setInterfaces] = useState<string[]>(["0.0.0.0"]);
  const [status, setStatus] = useState(empty);
  const [records, setRecords] = useState<TcpRecord[]>([]);
  const [pausedRecords, setPausedRecords] = useState<TcpRecord[] | null>(null);
  const serialOpened = useRef(false);
  const [history, setHistory] = useState<ReturnType<typeof readTrafficArchive> | null>(null);
  const [historySource, setHistorySource] = useState<TrafficSource | null>(null);
  const [captureOpen, setCaptureOpen] = useState(false);
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
  const [detailsCollapsed, setDetailsCollapsed] = useState(false);
  useEffect(() => setDetailsCollapsed(false), [selected?.id]);
  const pendingLocation = useRef<TcpRecord | null>(null);
  const [follow, setFollow] = useState(true);
  const [trafficView, setTrafficView] = useState("records");
  const [sendView, setSendView] = useState("single");
  const [parseFilter, setParseFilter] = useState("all");
  const [udpMessage, setUdpMessage] = useState("");
  const [clientFilter, setClientFilter] = useState("");
  const [recordType, setRecordType] = useState("all");
  const [clearAfterSend, setClearAfterSend] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
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
  const serialInterrupted = mode === "serial" && status.state === "faulted" && serialOpened.current;
  const serialFailure =
    mode === "serial" && !active && (status.state === "faulted" || Boolean(error));
  const serialError = redact(error || status.error);
  const serialOccupied =
    /(?:serial open failed.*:\s*5\b|access.*denied|port (?:is )?(?:busy|occupied)|端口.*占用|拒绝访问)/i.test(
      serialError,
    );
  useEffect(() => {
    if (mode === "serial" && connected) serialOpened.current = true;
  }, [mode, connected]);
  useEffect(() => {
    onSummary(
      session,
      mode,
      status.state,
      redact(
        mode === "serial"
          ? `${serialDevice || t("未选择串口", "Select port")} · ${baud}`
          : `${active ? status.host : host}:${active ? status.port : port}`,
      ),
    );
  }, [mode, status.state, status.host, status.port, host, port, serialDevice, baud, redact]);
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
  const shownRecords = (mode === "serial" && pausedRecords ? pausedRecords : visibleRecords).map(
    redactRecord,
  );
  const selectedRecord = selected && redactRecord(selected);
  useEffect(() => setPausedRecords(null), [history]);
  const bindProtocol = protocols.find((item) => item.path === bindPath);
  useEffect(() => {
    setSelected(pendingLocation.current);
    pendingLocation.current = null;
  }, [filters, direction, search, history]);
  useEffect(() => {
    if (trafficView !== "replay" && replayTime !== null && selected && selected.time > replayTime)
      setSelected(null);
  }, [replayTime, selected, trafficView]);

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
        if (result.kind === "udp")
          for (const record of result.records)
            udpBindings.current.set(record.id, udpEndpoint(result.host, result.port));
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
            const retained = combined.slice(start);
            const ids = new Set(retained.map((record) => record.id));
            for (const id of udpBindings.current.keys())
              if (!ids.has(id)) udpBindings.current.delete(id);
            return retained;
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
    if (visible && follow && !pausedRecords && table.current)
      table.current.scrollTop = table.current.scrollHeight;
  }, [records, visible, follow, pausedRecords]);

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
      if (clearAfterSend) {
        setInput((current) => (current === input ? "" : current));
        setMessageDraft((current) => (current === messageDraft ? null : current));
      }
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
    const useBatch = sendView === "batch" && Boolean(batch.trim());
    const items = useBatch
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
          if (!(await sendOne(item, encoding, useBatch ? null : messageDraft, undefined, control)))
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
      setPausedRecords(null);
      return;
    }
    const owner = dialog.current?.ownerDocument.defaultView ?? window;
    if (!owner.confirm(t("清空当前收发记录？", "Clear traffic records?"))) return;
    ++generation.current;
    if (await act("clear")) {
      ++generation.current;
      setRecords([]);
      setSelected(null);
      setPausedRecords(null);
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
        setHistorySource({
          kind: "archive",
          name: result.path?.split(/[\\/]/).pop() || imported.session,
          bytes: result.size ?? new TextEncoder().encode(result.content).length,
        });
        setCaptureOpen(false);
        setReplayTime(null);
        setTrafficView("records");
        setSelected(null);
        setFilters(emptyFilters);
        setDirection("all");
        setSearch("");
        setParseFilter("all");
        setClientFilter("");
        setNotice("");
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
      setHistorySource({
        kind: "pcap",
        name: result.path?.split(/[\\/]/).pop() || "PCAP",
        bytes: result.size,
      });
      setCaptureOpen(true);
      setReplayTime(null);
      setTrafficView("records");
      setSelected(null);
      setFilters(emptyFilters);
      setDirection("all");
      setSearch("");
      setParseFilter("all");
      setClientFilter("");
      setNotice("");
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
  const detachedClient = popup && mode === "client";
  const filtered = shownRecords.filter(
    (item) =>
      (mode !== "server" || !clientFilter || String(item.peer) === clientFilter) &&
      ((mode !== "server" && !detachedClient) ||
        recordType === "all" ||
        (recordType === "SYS"
          ? item.direction === "SYS"
          : recordType === "FRAME"
            ? item.direction === "FRAME"
            : item.direction !== "SYS" && item.direction !== "FRAME")) &&
      (mode !== "udp" || !udpMessage || item.parsed?.messageName === udpMessage) &&
      (parseFilter === "all" || (item.parsed?.status ?? "unparsed") === parseFilter) &&
      matchesRecord(item, filters) &&
      (direction === "all" ||
        item.direction === direction ||
        (item.direction === "FRAME" && (item.flow ?? "RX") === direction)) &&
      `${item.hex} ${item.address} ${item.detail} ${deviceValue(item, filters.deviceField)} ${item.parsed?.messageName ?? ""}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const stateLabel =
    mode === "udp"
      ? connected
        ? t("已打开", "Open")
        : status.state === "opening"
          ? t("打开中", "Opening")
          : status.state === "faulted"
            ? t("打开失败", "Open failed")
            : t("已关闭", "Closed")
      : mode === "serial"
        ? connected
          ? t("串口已打开", "Serial port open")
          : status.state === "opening"
            ? t("正在打开", "Opening port")
            : serialInterrupted
              ? t("通信中断", "Connection interrupted")
              : serialFailure
                ? t("打开失败", "Open failed")
                : t("串口未打开", "Serial port closed")
        : status.state === "open"
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
  const backToLive = () => {
    ++importVersion.current;
    setReplayReset((value) => value + 1);
    setHistory(null);
    setHistorySource(null);
    setCaptureOpen(false);
    setReplayTime(null);
    setSelected(null);
    setFilters(emptyFilters);
    setDirection("all");
    setSearch("");
    setParseFilter("all");
    setTrafficView("records");
  };
  const locateCorrelationRecord = (record: TcpRecord) => {
    pendingLocation.current = record;
    setFilters({ ...emptyFilters });
    setDirection("all");
    setSearch("");
    setParseFilter("all");
    setClientFilter("");
    setTrafficView("records");
  };
  const currentHistory = async () => {
    stopRun();
    const version = ++importVersion.current;
    setError("");
    try {
      const snapshot = await tcpCommand(session, "export");
      if (version !== importVersion.current) return;
      if (!snapshot.ok) throw new Error(snapshot.error.message);
      if (!("records" in snapshot)) throw new Error("Cannot read traffic records");
      const current = {
        format: "iotps-traffic-v1" as const,
        session,
        savedAt: new Date().toISOString(),
        dropped: snapshot.dropped,
        records: snapshot.records,
        correlation: correlation ?? undefined,
      };
      setHistory(current);
      setHistorySource({
        kind: "current",
        name: t("当前会话记录快照", "Current session snapshot"),
        bytes: new TextEncoder().encode(JSON.stringify(current)).length,
      });
      setSelected(null);
      setReplayTime(null);
      setReplayReset((value) => value + 1);
    } catch (failure) {
      setError(String(failure));
    }
  };
  if (Boolean(history) || captureOpen || trafficView === "replay") {
    return (
      <div className="tcp-workbench p12-workbench" hidden={!visible}>
        <TrafficHistory
          archive={history ? { ...history, records: history.records.map(redactRecord) } : null}
          source={historySource}
          view={trafficView}
          captureOpen={captureOpen}
          captureIp={captureIp}
          importing={importingCapture}
          locale={locale}
          records={filtered.map(redactRecord)}
          selected={selectedRecord}
          filters={filters}
          direction={direction}
          search={search}
          parseFilter={parseFilter}
          error={redact(error)}
          notice={notice}
          onView={(view) => {
            setTrafficView(view);
            if (view !== "replay") setReplayTime(null);
          }}
          onCaptureOpen={setCaptureOpen}
          onCaptureIp={setCaptureIp}
          onCapture={() => void importCapture()}
          onImport={() => void archive("open")}
          onSave={() => void archive("save")}
          onLive={backToLive}
          onCurrent={() => void currentHistory()}
          onSelect={setSelected}
          onFilters={setFilters}
          onDirection={setDirection}
          onSearch={setSearch}
          onParseFilter={setParseFilter}
          onDebug={onDebug}
          onCopy={(record) => {
            const owner = window;
            void owner.navigator.clipboard
              .writeText(record.hex)
              .then(() => setNotice(t("HEX 已复制", "HEX copied")))
              .catch(() => setError(t("复制失败", "Copy failed")));
          }}
          replay={
            history && visible && trafficView === "replay" ? (
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
                onRecord={setSelected}
                selectedId={selected?.id}
                sourceName={historySource?.name || history.session}
                onImport={() => void archive("open")}
              />
            ) : null
          }
          analysis={
            <TrafficCorrelation
              view={trafficView === "timeline" ? "timeline" : "correlation"}
              records={visibleRecords}
              protocols={protocols}
              rule={history ? (history.correlation ?? null) : correlation}
              onRule={(rule) =>
                history
                  ? setHistory({ ...history, correlation: rule ?? undefined })
                  : setCorrelation(rule)
              }
              onSelect={locateCorrelationRecord}
              locale={locale}
              savedAt={history?.savedAt}
              dropped={history?.dropped ?? status.dropped}
              redact={redact}
            />
          }
        />
      </div>
    );
  }
  return (
    <div
      className={`tcp-workbench ${detachedClient ? "tcp-popup-workbench" : ""} ${detachedClient && detailsCollapsed ? "details-collapsed" : ""} ${mode === "server" ? "tcp-server-workbench" : mode === "serial" ? "tcp-serial-workbench" : mode === "udp" ? "udp-workbench" : ""}`}
      hidden={!visible}
    >
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
          {mode === "udp"
            ? t("UDP 配置", "UDP configuration")
            : mode === "server"
              ? t("服务端配置", "Server configuration")
              : t("连接类型", "Connection type")}
          <select
            aria-label={t("TCP 模式", "TCP mode")}
            value={mode}
            disabled={busy || active}
            onChange={(event) => {
              setMode(event.target.value);
              serialOpened.current = false;
              setPausedRecords(null);
              setError("");
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
        {mode !== "serial" && mode !== "udp" && (
          <>
            <label>
              {mode === "server" ? t("监听地址", "Bind address") : t("目标地址", "Remote address")}
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
            <strong className="serial-config-title">{t("串口配置", "Serial configuration")}</strong>
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
                list={`baud-${session}`}
                value={baud}
                required
                disabled={busy || active}
                onChange={(event) => setBaud(event.target.value)}
              />
            </label>
            <datalist id={`baud-${session}`}>
              {[1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600].map(
                (rate) => (
                  <option key={rate} value={rate} />
                ),
              )}
            </datalist>
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
              <RefreshCw size={14} /> {t("刷新端口", "Refresh ports")}
            </button>
          </>
        )}
        {mode === "udp" && (
          <UdpConnection
            locale={locale}
            session={session}
            mode={udpMode}
            localHost={localHost}
            localPort={connected ? String(status.port) : localPort}
            host={host}
            port={port}
            adapter={interfaceAddress}
            interfaces={interfaces}
            disabled={busy || active}
            connected={connected}
            joined={Boolean(status.multicastJoined)}
            busy={busy}
            onMode={(value) => {
              setUdpMode(value);
              setHost(
                value === "broadcast"
                  ? "255.255.255.255"
                  : value === "multicast"
                    ? "239.255.0.1"
                    : "127.0.0.1",
              );
            }}
            onLocalHost={setLocalHost}
            onLocalPort={setLocalPort}
            onHost={setHost}
            onPort={setPort}
            onAdapter={setInterfaceAddress}
            onRefresh={() => void refreshDevices()}
            onMembership={() => void act("membership", status.multicastJoined ? "leave" : "join")}
          />
        )}
        {active ? (
          <button
            className="tcp-connect-action"
            type="button"
            disabled={busy}
            onClick={(event) => {
              event.preventDefault();
              void act("stop");
            }}
          >
            <Square size={14} />
            {mode === "serial"
              ? t("关闭串口", "Close port")
              : status.server
                ? t("停止监听", "Stop")
                : mode === "udp"
                  ? t("关闭 UDP", "Close UDP")
                  : t("断开", "Disconnect")}
          </button>
        ) : (
          <button className="tcp-connect-action" type="submit" disabled={busy}>
            <PlugZap size={14} />
            {mode === "serial"
              ? serialInterrupted
                ? t("重新打开", "Reopen port")
                : serialFailure
                  ? t("重试", "Retry")
                  : t("打开串口", "Open port")
              : mode === "server"
                ? t("开始监听", "Listen")
                : mode === "udp"
                  ? t("打开 UDP", "Open UDP")
                  : t("连接", "Connect")}
          </button>
        )}
        <div className={`tcp-connection-state ${status.state}`} role="status">
          {connected ? (
            <CheckCircle size={19} />
          ) : serialInterrupted ? (
            <AlertTriangle size={19} />
          ) : serialFailure ? (
            <XCircle size={19} />
          ) : (
            <Circle size={17} />
          )}
          <span>
            <strong>
              {mode === "udp"
                ? connected
                  ? t("已打开", "Open")
                  : status.state === "opening"
                    ? t("打开中", "Opening")
                    : status.state === "faulted"
                      ? t("打开失败", "Faulted")
                      : t("已关闭", "Closed")
                : stateLabel}
            </strong>
            <small>
              {mode === "serial"
                ? redact(`${serialDevice || "—"} · ${baud}, ${dataBits}, ${parity}, ${stopBits}`)
                : mode === "server" && connected
                  ? `${t("已连接", "Connected")} ${status.peers.length} ${t("个客户端", "clients")}`
                  : active
                    ? `${status.host}:${status.port}`
                    : t("等待建立连接", "Ready to connect")}
            </small>
          </span>
        </div>
        {mode === "client" && (
          <label className="tcp-reconnect-toggle">
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
        <button
          className="tcp-effective-address"
          type="button"
          disabled={busy || active}
          onClick={() => void checkConnection()}
        >
          {t("检查生效参数", "Check effective address")}
        </button>
        {connectionPreview && <small role="status">{connectionPreview}</small>}
      </form>
      {mode === "serial" && (error || status.error) && (
        <div
          className={`serial-alert ${serialInterrupted ? "interrupted" : "failed"}`}
          role="alert"
        >
          {serialInterrupted ? <AlertTriangle size={20} /> : <XCircle size={20} />}
          <div>
            <strong>
              {connected
                ? t("操作失败", "Operation failed")
                : serialInterrupted
                  ? t("串口连接已中断", "Serial connection interrupted")
                  : serialOccupied
                    ? t(
                        "无法打开串口：端口占用或访问被拒绝",
                        "Cannot open port: in use or access denied",
                      )
                    : t("无法打开串口", "Cannot open serial port")}
            </strong>
            <p>{serialError}</p>
            {!connected && (
              <small>
                {serialInterrupted
                  ? t(
                      "已有收发记录已保留，当前无法发送。请检查设备连接后重新打开串口。",
                      "Traffic records are preserved. Sending is unavailable. Check the device and reopen the port.",
                    )
                  : serialOccupied
                    ? t(
                        "请关闭使用该端口的串口调试工具、设备管理软件等程序；确认访问权限后重试。",
                        "Close serial terminals or device tools using this port, check access permissions, and retry.",
                      )
                    : t(
                        "请检查端口是否存在、设备连接及串口参数，然后重试。",
                        "Check the port, device connection and serial parameters, then retry.",
                      )}
              </small>
            )}
          </div>
        </div>
      )}
      {mode !== "serial" && (error || status.error) && (
        <p className="tcp-error" role="alert">
          {redact(error || status.error)}
        </p>
      )}
      <div className="tcp-peers" hidden={mode === "server" || status.peers.length < 2}>
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
      <section
        className={`tcp-configuration ${configOpen ? "expanded" : ""}`}
        aria-label={t("协议与分帧配置", "Protocol and framing configuration")}
      >
        <form
          className="tcp-framing tcp-bind-config"
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
          <strong>{t("协议绑定", "Protocol binding")}</strong>
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
                  {item.name}
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
          <small className="tcp-config-note" role="status">
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
        <form
          className="tcp-framing tcp-frame-config"
          hidden={mode === "udp"}
          onChange={() => setFrameStatus("")}
          onSubmit={(event) => {
            event.preventDefault();
            void configureFrames();
          }}
        >
          <strong>{t("分帧设置", "Framing")}</strong>
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
                <select
                  value={lengthWidth}
                  onChange={(event) => setLengthWidth(event.target.value)}
                >
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
          {mode === "serial" && (
            <button
              className="serial-frame-more"
              type="button"
              aria-expanded={configOpen}
              onClick={() => setConfigOpen(!configOpen)}
            >
              {t("参数", "Options")}
            </button>
          )}
          <small className="tcp-config-note" role="status">
            {frameStatus ||
              t(
                "帧长 = 长度字段值 + 附加字节数；上限 1 MiB，残帧空闲 5 秒后丢弃",
                "Frame size = length value + extra bytes; 1 MiB limit, 5s partial-frame timeout",
              )}
          </small>
        </form>
        <button
          className="tcp-config-more"
          hidden={mode === "serial"}
          type="button"
          aria-expanded={configOpen}
          onClick={() => setConfigOpen(!configOpen)}
        >
          {t("更多设置", "More settings")}
        </button>
        {mode === "udp" && (
          <div className="udp-datagram-rule">
            {t("分帧", "Framing")}
            <span
              title={t(
                "每个 UDP 数据报独立解析，不使用 TCP 字节流分帧",
                "Each UDP datagram is decoded independently; stream framing is bypassed",
              )}
            >
              {t("完整 UDP 数据报", "Complete UDP datagram")}
            </span>
          </div>
        )}
      </section>
      <div className="tcp-body">
        {mode === "server" && (
          <ServerPeers
            peers={status.peers}
            records={records.map(redactRecord)}
            selected={peer}
            listening={connected}
            locale={locale}
            redact={redact}
            onSelect={(id) => {
              setPeer(id);
              setChecked(null);
            }}
            onMenu={setPeerMenu}
          />
        )}
        <section
          className="tcp-traffic-panel"
          data-view={trafficView}
          aria-label={t("收发记录面板", "Traffic panel")}
        >
          <div className="tcp-traffic-heading">
            <div
              className="tcp-section-tabs"
              role="tablist"
              aria-label={t("记录视图", "Traffic views")}
            >
              {[
                ["records", t("收发记录", "Traffic")],
                ["timeline", t("时间线", "Timeline")],
                ...(mode === "serial" || mode === "udp"
                  ? [["statistics", t("统计", "Statistics")]]
                  : []),
                ["correlation", t("关联分析", "Correlation")],
                ["replay", t("回放", "Replay")],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={trafficView === id}
                  onClick={() => setTrafficView(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="tcp-log-toolbar">
            {(mode === "server" || detachedClient) && (
              <>
                <select
                  hidden={mode !== "server"}
                  aria-label={t("客户端筛选", "Client filter")}
                  value={clientFilter}
                  onChange={(event) => {
                    setClientFilter(event.target.value);
                    setSelected(null);
                  }}
                >
                  <option value="">{t("全部客户端", "All clients")}</option>
                  {[
                    ...new Map(
                      shownRecords.filter((item) => item.peer > 0).map((item) => [item.peer, item]),
                    ).values(),
                  ].map((item) => (
                    <option key={item.peer} value={item.peer}>
                      {clientLabel(item.peer)} · {item.address}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={t("记录类型", "Record type")}
                  value={recordType}
                  onChange={(event) => {
                    setRecordType(event.target.value);
                    setSelected(null);
                  }}
                >
                  <option value="all">{t("全部类型", "All types")}</option>
                  <option value="FRAME">FRAME</option>
                  <option value="raw">{t("原始块", "Raw chunks")}</option>
                  <option value="SYS">SYS</option>
                </select>
              </>
            )}
            {history && (
              <span>
                {t("历史记录（只读）", "History (read only)")} · {history.session}
              </span>
            )}

            {mode === "serial" ? (
              <div
                className="serial-direction-tabs"
                role="group"
                aria-label={t("记录方向", "Direction")}
              >
                {["all", "TX", "RX", "FRAME", "SYS"].map((value) => (
                  <button
                    type="button"
                    key={value}
                    aria-pressed={direction === value}
                    onClick={() => setDirection(value)}
                  >
                    {value === "all" ? t("全部", "All") : value}
                  </button>
                ))}
              </div>
            ) : (
              <select
                aria-label={t("记录方向", "Direction")}
                value={direction}
                onChange={(event) => setDirection(event.target.value)}
              >
                <option value="all">{t("全部方向", "All directions")}</option>
                <option>TX</option>
                <option>RX</option>
                <option>FRAME</option>
                <option>SYS</option>
              </select>
            )}
            <label className="tcp-search">
              <Search size={14} />
              <input
                aria-label={t("筛选记录", "Filter records")}
                placeholder={t("搜索消息、HEX、地址…", "Search message, HEX, address…")}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            {mode === "udp" && (
              <select
                aria-label={t("消息筛选", "Message filter")}
                value={udpMessage}
                onChange={(event) => {
                  setUdpMessage(event.target.value);
                  setSelected(null);
                }}
              >
                <option value="">{t("全部消息", "All messages")}</option>
                {[
                  ...new Set(
                    shownRecords
                      .map((item) => item.parsed?.messageName)
                      .filter((name): name is string => Boolean(name)),
                  ),
                ].map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            )}
            <select
              className="tcp-parse-filter"
              aria-label={t("解析状态筛选", "Parse status filter")}
              value={parseFilter}
              onChange={(event) => {
                setParseFilter(event.target.value);
                setSelected(null);
              }}
            >
              <option value="all">{t("全部状态", "All states")}</option>
              <option value="ok">{t("解析成功", "Decoded")}</option>
              <option value="error">{t("解析失败", "Decode failed")}</option>
              <option value="unmatched">{t("未匹配", "Unmatched")}</option>
              <option value="unparsed">{t("未解析", "Not decoded")}</option>
            </select>
            <label>
              <input
                type="checkbox"
                checked={follow}
                onChange={(event) => setFollow(event.target.checked)}
              />
              {t("自动滚动", "Auto scroll")}
            </label>
            {mode === "serial" && (
              <>
                <small className="serial-record-count">
                  {filtered.length} / {shownRecords.length}
                </small>
                <button
                  type="button"
                  aria-pressed={Boolean(pausedRecords)}
                  onClick={() => setPausedRecords(pausedRecords ? null : [...visibleRecords])}
                >
                  {pausedRecords ? <Play size={13} /> : <Pause size={13} />}
                  {pausedRecords ? t("继续显示", "Resume") : t("暂停显示", "Pause")}
                </button>
              </>
            )}
            <button
              className="tcp-archive-action"
              hidden={mode === "server"}
              type="button"
              onClick={() => void archive("open")}
            >
              {t("导入", "Import")}
            </button>
            <button
              className="tcp-archive-action"
              hidden={mode === "server"}
              type="button"
              onClick={() => void archive("save")}
            >
              {t("保存 / 导出", "Save / export")}
            </button>
            <button
              className="tcp-archive-action"
              type="button"
              onClick={() => {
                setCaptureOpen(true);
                setTrafficView("records");
              }}
            >
              {t("导入 PCAP", "Import PCAP")}
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
          <details
            className="tcp-advanced-tools"
            open={filterOpen}
            onToggle={(event) => setFilterOpen(event.currentTarget.open)}
          >
            <summary>
              <Filter size={13} />
              {t("筛选与文件工具", "Filters and files")}
            </summary>
            {(mode === "server" || mode === "udp" || detachedClient) && (
              <div className="tcp-server-file-tools">
                <button type="button" onClick={() => void archive("open")}>
                  {t("导入记录", "Import archive")}
                </button>
                <button type="button" onClick={() => void archive("save")}>
                  {t("保存 / 导出", "Save / export")}
                </button>
              </div>
            )}
            {detachedClient && (
              <label>
                <input
                  type="checkbox"
                  checked={follow}
                  onChange={(event) => setFollow(event.target.checked)}
                />
                {t("自动滚动", "Auto scroll")}
              </label>
            )}
            <button
              type="button"
              className="tcp-archive-action"
              onClick={() => {
                setCaptureOpen(true);
                setTrafficView("records");
              }}
            >
              {t("导入 PCAP", "Import PCAP")}
            </button>
            <details className="traffic-filters traffic-capture" hidden>
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
          </details>
          <div
            className="tcp-analysis-view"
            hidden={trafficView !== "correlation" && trafficView !== "timeline"}
          >
            <TrafficCorrelation
              view={trafficView === "timeline" ? "timeline" : "correlation"}
              records={visibleRecords}
              protocols={protocols}
              rule={history ? (history.correlation ?? null) : correlation}
              onRule={(rule) =>
                history
                  ? setHistory({ ...history, correlation: rule ?? undefined })
                  : setCorrelation(rule)
              }
              onSelect={locateCorrelationRecord}
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
          </div>
          <div className="tcp-replay-view" hidden={trafficView !== "replay"}>
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
            {!history && (
              <div className="tcp-detail-empty">
                <strong>{t("导入历史记录以开始回放", "Import a traffic archive to replay")}</strong>
                <p>{t("导入不会连接或发送报文", "Importing never connects or sends packets")}</p>
                <button type="button" onClick={() => void archive("open")}>
                  {t("导入记录", "Import archive")}
                </button>
              </div>
            )}
          </div>
          {(mode === "serial" || mode === "udp") && trafficView === "statistics" && (
            <div className="serial-statistics udp-statistics">
              <h3>{t("当前收发记录统计", "Current traffic statistics")}</h3>
              <p>
                {t(
                  "基于当前保留的记录；FRAME 单独计数，不重复累计到原始收发字节。",
                  "Based on retained records. Frames are counted separately from raw TX/RX bytes.",
                )}
              </p>
              <table>
                <thead>
                  <tr>
                    <th>{t("方向 / 类型", "Direction / type")}</th>
                    <th>{t("记录数", "Records")}</th>
                    <th>{t("字节数", "Bytes")}</th>
                  </tr>
                </thead>
                <tbody>
                  {["TX", "RX", "FRAME", "SYS"].map((value) => {
                    const items = shownRecords.filter((item) => item.direction === value);
                    return (
                      <tr key={value}>
                        <td>{value}</td>
                        <td>{items.length}</td>
                        <td>{items.reduce((sum, item) => sum + item.size, 0)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="tcp-log" ref={table} hidden={trafficView !== "records"}>
            <table>
              <thead>
                <tr>
                  {(mode === "server" || mode === "udp") && <th>#</th>}
                  <th>{t("时间", "Time")}</th>
                  <th>{t("方向", "Direction")}</th>
                  {mode === "server" && <th>{t("客户端", "Client")}</th>}
                  {mode === "udp" ? (
                    <>
                      <th>{t("来源地址:端口", "Source endpoint")}</th>
                      <th>{t("目标 / 本地绑定", "Target / local bind")}</th>
                    </>
                  ) : (
                    <th>{t("类型", "Type")}</th>
                  )}
                  <th>{t("消息", "Message")}</th>
                  <th>{t("长度", "Bytes")}</th>
                  <th>{t("HEX 数据摘要", "HEX preview")}</th>
                  <th>{t("解析状态", "Parse state")}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item, index) => (
                  <tr
                    key={item.id}
                    className={selected?.id === item.id ? "selected" : ""}
                    onClick={() => setSelected(item)}
                    aria-selected={selected?.id === item.id}
                  >
                    {mode === "server" && <td>{index + 1}</td>}
                    {mode === "udp" && <td>{item.id}</td>}
                    <td>
                      {new Date(item.time).toLocaleTimeString(locale, { hour12: false })}.
                      {String(item.time % 1000).padStart(3, "0")}
                    </td>
                    <td
                      className={`tcp-dir-${(mode === "serial" || detachedClient) && item.direction === "FRAME" ? (item.flow ?? "RX") : item.direction}`}
                    >
                      <span>
                        {item.direction === "TX" ||
                        ((mode === "serial" || detachedClient) &&
                          item.direction === "FRAME" &&
                          item.flow === "TX") ? (
                          <ArrowUp size={12} />
                        ) : item.direction === "RX" ||
                          ((mode === "serial" || detachedClient) &&
                            item.direction === "FRAME" &&
                            (item.flow ?? "RX") === "RX") ? (
                          <ArrowDown size={12} />
                        ) : (
                          <Circle size={10} />
                        )}
                        {item.direction === "FRAME"
                          ? mode === "server" ||
                            mode === "udp" ||
                            mode === "serial" ||
                            detachedClient
                            ? (item.flow ?? "RX")
                            : `FRAME ${item.flow ?? "RX"}`
                          : item.direction}
                      </span>
                    </td>
                    {mode === "server" && (
                      <td title={item.address}>{item.peer > 0 ? clientLabel(item.peer) : "—"}</td>
                    )}
                    {mode === "udp" ? (
                      <>
                        <td>
                          {
                            udpEndpoints(
                              item,
                              history ? "" : redact(udpBindings.current.get(item.id) ?? ""),
                            ).source
                          }
                        </td>
                        <td
                          title={t(
                            "接收时显示本地绑定端点",
                            "Received packets show the local bind endpoint",
                          )}
                        >
                          {
                            udpEndpoints(
                              item,
                              history ? "" : redact(udpBindings.current.get(item.id) ?? ""),
                            ).target
                          }
                        </td>
                      </>
                    ) : (
                      <td>
                        {item.direction === "SYS"
                          ? detachedClient
                            ? t("系统", "System")
                            : t("事件", "Event")
                          : item.direction === "FRAME"
                            ? detachedClient
                              ? "FRAME"
                              : t("完整帧", "Frame")
                            : t("原始块", "Raw")}
                      </td>
                    )}
                    <td
                      title={`${item.address} #${item.peer} · ${deviceValue(item, filters.deviceField) || "—"}`}
                    >
                      {item.parsed?.messageName || item.detail || "—"}
                    </td>
                    <td>{item.hex ? item.size : "—"}</td>
                    <td>
                      <button
                        type="button"
                        onClick={() => setSelected(item)}
                        title={item.detail || item.hex.slice(0, 200)}
                      >
                        {item.hex.slice(0, 150) || item.detail || "—"}
                        {item.hex.length > 150 ? "…" : ""}
                      </button>
                    </td>
                    <td>
                      <span className={`tcp-parse-state ${item.parsed?.status ?? "unparsed"}`}>
                        {item.parsed?.status === "ok" ? (
                          <CheckCircle size={13} />
                        ) : item.parsed?.status === "error" ? (
                          <XCircle size={13} />
                        ) : null}
                        {item.parsed?.status === "ok"
                          ? t("解析成功", "Decoded")
                          : item.parsed?.status === "error"
                            ? t("解析失败", "Failed")
                            : item.parsed?.status === "unmatched"
                              ? t("未匹配", "Unmatched")
                              : item.direction === "SYS"
                                ? "—"
                                : t("未解析", "Not decoded")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 &&
              (mode === "serial" ? (
                <div className="tcp-detail-empty serial-empty">
                  <Inbox size={32} />
                  <strong>
                    {shownRecords.length
                      ? t("没有匹配的记录", "No matching records")
                      : connected
                        ? t("暂无收发记录", "No traffic records")
                        : t("串口尚未打开", "Serial port closed")}
                  </strong>
                  <p>
                    {shownRecords.length
                      ? t("调整筛选条件以查看记录", "Adjust filters to view records")
                      : connected
                        ? t("发送报文或等待设备数据", "Send a packet or wait for device data")
                        : t(
                            "请检查串口配置并打开串口以开始通信",
                            "Check the configuration and open the port to start",
                          )}
                  </p>
                </div>
              ) : (
                <p className="tcp-empty">{t("暂无收发记录", "No traffic records")}</p>
              ))}
          </div>
        </section>
        <section className="tcp-send" aria-label={t("发送报文", "Send packet")}>
          {mode === "serial" && !connected && (
            <p className="serial-send-unavailable" role="status">
              <AlertTriangle size={14} />
              {t("串口未打开，无法发送数据", "Serial port closed; sending unavailable")}
            </p>
          )}
          <div className="tcp-section-tabs" role="tablist" aria-label={t("发送方式", "Send modes")}>
            {[
              ["single", t("发送报文", "Send packet")],
              ["timed", t("定时发送", "Timed send")],
              ["batch", t("批量发送", "Batch send")],
              ["variables", t("变量引用", "Variables")],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={sendView === id}
                onClick={() => setSendView(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="tcp-send-content">
            {(mode === "udp" || detachedClient) && (
              <UdpTemplates
                protocol={bindProtocol}
                locale={locale}
                input={input}
                onError={setError}
                onLoad={(message, hex) => {
                  setInput(hex);
                  setMessageDraft(message);
                  setEncoding("hex");
                  setChecked(null);
                }}
              />
            )}
            <div className="tcp-send-heading">
              <strong>
                {mode === "server" ? t("发送目标", "Send target") : t("发送内容", "Payload")}
              </strong>
              {mode === "serial" || detachedClient ? (
                <div
                  className="serial-format-tabs"
                  role="group"
                  aria-label={t("数据格式", "Data format")}
                >
                  {[
                    ["hex", "HEX"],
                    ["text", "UTF-8"],
                  ].map(([value, label]) => (
                    <button
                      type="button"
                      key={value}
                      aria-pressed={encoding === value}
                      onClick={() => {
                        setEncoding(value);
                        setMessageDraft(null);
                        setChecked(null);
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              ) : (
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
              )}
              <select
                hidden={mode === "serial"}
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
                    {mode === "server"
                      ? `${clientLabel(item.id)} (${item.address})`
                      : `${item.address} #${item.id}`}
                  </option>
                ))}
              </select>
            </div>
            <textarea
              onKeyDown={(event) => {
                if (event.key === "Enter" && event.ctrlKey && connected && peer && input.trim()) {
                  event.preventDefault();
                  void send();
                }
              }}
              aria-label={t("发送内容", "Payload")}
              value={input}
              onChange={(event) => {
                setInput(event.target.value);
                setMessageDraft(null);
                setChecked(null);
              }}
              rows={mode === "serial" ? 1 : 3}
              maxLength={262144}
              placeholder={encoding === "hex" ? "01 03 00 00 00 02" : "UTF-8"}
            />
            {(mode === "serial" || mode === "udp" || detachedClient) && (
              <small className={mode === "udp" ? "udp-byte-count" : "serial-byte-count"}>
                {encoding === "text"
                  ? new TextEncoder().encode(input).length + " bytes"
                  : /^(?:[0-9a-f]{2}\s*)*$/i.test(input.trim())
                    ? input.replace(/\s/g, "").length / 2 + " bytes"
                    : mode === "udp"
                      ? t("发送时解析", "On send")
                      : t("变量与字节数在发送时解析", "Variables and byte count resolve on send")}
              </small>
            )}
            <small>
              {messageDraft
                ? `${t("报文源", "Message source")}: ${messageDraft.relativePath} / ${messageDraft.messageName}`
                : t(
                    "支持 {{变量名}}；内置 random、sequence、timestamp。",
                    "Use {{name}}; built-ins: random, sequence, timestamp.",
                  )}
            </small>
            <div
              className="tcp-send-schedule"
              hidden={sendView !== "timed" && sendView !== "batch"}
            >
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
              <label hidden={sendView !== "batch"}>
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
            <div className="tcp-variable-tools" hidden={sendView !== "variables"}>
              {["sequence", "random", "timestamp"].map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => {
                    setInput((value) => `${value}{{${name}}}`);
                    setMessageDraft(null);
                    setChecked(null);
                  }}
                >{`{{${name}}}`}</button>
              ))}
              <small>
                {t(
                  "项目环境变量使用 {{变量名}}；发送时读取当前环境。",
                  "Use {{name}} for environment variables; resolved when sending.",
                )}
              </small>
            </div>
            <label className="tcp-clear-after-send">
              <input
                type="checkbox"
                checked={clearAfterSend}
                onChange={(event) => setClearAfterSend(event.target.checked)}
              />
              {t("发送成功后清空", "Clear after successful send")}
            </label>
            {checked && (
              <div className="tcp-send-preview" role="status">
                <span>
                  {t("生效值", "Effective value")}: {checked.effective}
                </span>
                <code>HEX: {checked.hex}</code>
              </div>
            )}
            <div className="tcp-send-footer">
              <small
                role="status"
                className={
                  mode === "udp" && !notice && !(runProgress && running) ? "udp-send-hint" : ""
                }
              >
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
              {mode === "serial" && (
                <button
                  type="button"
                  disabled={busy || running || !input}
                  onClick={() => {
                    setInput("");
                    setMessageDraft(null);
                    setChecked(null);
                  }}
                >
                  {t("清空", "Clear")}
                </button>
              )}
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
                {mode === "serial" || mode === "udp" || detachedClient
                  ? t("发送 (Ctrl+Enter)", "Send (Ctrl+Enter)")
                  : t("发送", "Send")}
              </button>
              {running ? (
                <button type="button" onClick={stopRun}>
                  {t("停止发送", "Stop sending")}
                </button>
              ) : sendView === "timed" || sendView === "batch" ? (
                <button
                  type="button"
                  disabled={busy || !connected || !peer || (!batch.trim() && !input.trim())}
                  onClick={() => void startRun()}
                >
                  {sendView === "batch"
                    ? t("开始批量发送", "Start batch send")
                    : t("开始定时发送", "Start timed send")}
                </button>
              ) : null}
            </div>
          </div>
          {mode === "server" && (
            <aside className="tcp-server-queue" aria-label={t("发送队列", "Send queue")}>
              <h3>
                {t("发送队列", "Send queue")} <small>({status.queued} B)</small>
              </h3>
              {running || status.queued > 0 ? (
                <div className="tcp-queue-active">
                  <Inbox size={28} />
                  <strong>
                    {running
                      ? t("发送任务运行中", "Send task running")
                      : t("等待写入连接", "Waiting for socket write")}
                  </strong>
                  <p>{running ? runProgress : `${status.queued} bytes`}</p>
                  <small>
                    {t("目标", "Target")}: {peer ? clientLabel(Number(peer)) : "—"}
                  </small>
                  {running && (
                    <button type="button" onClick={stopRun}>
                      {t("停止发送", "Stop sending")}
                    </button>
                  )}
                </div>
              ) : (
                <div className="tcp-detail-empty">
                  <Inbox size={30} />
                  <p>{t("暂无发送任务", "No pending sends")}</p>
                </div>
              )}
            </aside>
          )}
        </section>
        {mode === "udp" ? (
          <UdpRecordDetail
            record={selectedRecord}
            endpoints={udpEndpoints(
              selectedRecord,
              history || !selectedRecord
                ? ""
                : redact(udpBindings.current.get(selectedRecord.id) ?? ""),
            )}
            locale={locale}
            onDebug={onDebug}
            onCopy={(record) => {
              const owner = table.current?.ownerDocument.defaultView ?? window;
              void owner.navigator.clipboard
                .writeText(record.hex)
                .then(() => setNotice(t("HEX 已复制", "HEX copied")))
                .catch(() => setError(t("复制失败", "Copy failed")));
            }}
          />
        ) : mode === "server" ? (
          <ServerRecordDetail
            record={selectedRecord}
            locale={locale}
            index={filtered.findIndex((item) => item.id === selected?.id)}
            total={filtered.length}
            onStep={(step) => {
              const index = filtered.findIndex((item) => item.id === selected?.id);
              if (index >= 0 && filtered[index + step]) setSelected(filtered[index + step]);
            }}
            onDebug={onDebug}
            onCopy={(record) => {
              const owner = table.current?.ownerDocument.defaultView ?? window;
              void owner.navigator.clipboard
                .writeText(record.hex)
                .then(() => setNotice(t("HEX 已复制", "HEX copied")))
                .catch(() => setError(t("复制失败", "Copy failed")));
            }}
          />
        ) : (
          <TcpRecordDetail
            compact={detachedClient}
            collapsed={detachedClient && detailsCollapsed}
            onLocate={() => {
              setTrafficView("records");
              table.current?.querySelector("tr.selected")?.scrollIntoView({ block: "nearest" });
            }}
            serial={mode === "serial"}
            record={selectedRecord}
            locale={locale}
            onClose={() => (detachedClient ? setDetailsCollapsed(true) : setSelected(null))}
            onDebug={onDebug}
            onCopy={(record) => {
              const owner = table.current?.ownerDocument.defaultView ?? window;
              void owner.navigator.clipboard
                .writeText(record.hex)
                .then(() => setNotice(t("HEX 已复制", "HEX copied")))
                .catch(() => setError(t("复制失败", "Copy failed")));
            }}
            previous={Boolean(
              selected && filtered.findIndex((item) => item.id === selected.id) > 0,
            )}
            next={Boolean(
              selected &&
              filtered.findIndex((item) => item.id === selected.id) >= 0 &&
              filtered.findIndex((item) => item.id === selected.id) < filtered.length - 1,
            )}
            onStep={(step) => {
              const index = filtered.findIndex((item) => item.id === selected?.id);
              if (index >= 0 && filtered[index + step]) setSelected(filtered[index + step]);
            }}
          />
        )}
        {detachedClient && detailsCollapsed && (
          <button
            className="tcp-detail-rail"
            type="button"
            onClick={() => setDetailsCollapsed(false)}
            aria-label={t("展开详情", "Expand details")}
          >
            {t("详情已收起", "Details collapsed")}
          </button>
        )}
      </div>
      <footer className="tcp-statusbar">
        <span className={`tcp-parse-state ${connected ? "ok" : "unparsed"}`}>
          <Circle size={9} />
          {stateLabel}
        </span>
        {mode === "server" && (
          <>
            <span>
              {t("监听", "Bind")}: {active ? `${status.host}:${status.port}` : `${host}:${port}`}
            </span>
            <span>
              {t("客户端", "Clients")}: {status.peers.length}
            </span>
          </>
        )}
        <span>
          {t("发送", "TX")}: {status.sent} B
        </span>
        <span>
          {t("接收", "RX")}: {status.received} B
        </span>
        <span>
          {t("发送队列", "Queued")}: {status.queued} B
        </span>
        <span>
          {t("记录", "Records")}: {filtered.length}/{shownRecords.length}
        </span>
        {running && (
          <span>
            {t("发送进度", "Progress")}: {runProgress}
          </span>
        )}
        {history && <span>{t("历史记录（只读）", "History (read only)")}</span>}
        {mode === "server" && (
          <label className="tcp-server-follow">
            <input
              type="checkbox"
              checked={follow}
              onChange={(event) => setFollow(event.target.checked)}
            />
            {t("自动滚动", "Auto scroll")}
          </label>
        )}
      </footer>
      <dialog
        ref={dialog}
        className="protocol-dialog tree-dialog tree-actions-dialog"
        onCancel={() => setPeerMenu(null)}
      >
        <h2>
          {peerMenu && mode === "server" && `${clientLabel(peerMenu.id)} · `}
          {peerMenu?.address && redact(peerMenu.address)}
        </h2>
        {mode === "server" && <p>{t("确认断开此客户端连接？", "Disconnect this client?")}</p>}
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
