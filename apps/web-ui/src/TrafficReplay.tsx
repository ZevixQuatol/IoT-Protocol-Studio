import { useEffect, useMemo, useRef, useState } from "react";
import type { TcpRecord } from "./bridge";
import type { Locale } from "./i18n";

export default function TrafficReplay({
  records,
  savedAt,
  peers,
  enabled,
  reset,
  locale,
  onTime,
  onSend,
  onActive,
  redact,
}: {
  records: TcpRecord[];
  savedAt: string;
  peers: { id: number; address: string }[];
  enabled: boolean;
  reset: number;
  locale: Locale;
  onTime: (time: number | null) => void;
  onSend: (hex: string, peer: string, current: () => boolean) => Promise<boolean>;
  onActive: (active: boolean) => void;
  redact: (text: string) => string;
}) {
  const t = (cn: string, en: string) => (locale === "zh-CN" ? cn : en);
  const ordered = useMemo(
    () => [...records].sort((a, b) => a.time - b.time || a.id - b.id),
    [records],
  );
  const [speed, setSpeed] = useState(1);
  const [target, setTarget] = useState("");
  const [flow, setFlow] = useState<"TX" | "RX">("TX");
  const [source, setSource] = useState("raw");
  const [state, setState] = useState<"idle" | "playing" | "paused" | "done">("idle");
  const [mode, setMode] = useState<"offline" | "send">("offline");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const control = useRef({ generation: 0, paused: false, speed: 1 });
  const clock = useRef(0);
  const callbacks = useRef({ onTime, onSend, onActive });
  callbacks.current = { onTime, onSend, onActive };
  control.current.speed = speed;
  // Use raw written/read chunks when available; never replay FRAME copies a second time.
  const payloads = useMemo(() => {
    const raw =
      source === "raw" ? ordered.filter((item) => item.direction === flow && item.size > 0) : [];
    return raw.length
      ? raw
      : ordered.filter(
          (item) => item.direction === "FRAME" && (item.flow ?? "RX") === flow && item.size > 0,
        );
  }, [ordered, flow, source]);
  const stop = () => {
    ++control.current.generation;
    control.current.paused = false;
    setState("idle");
    setMode("offline");
    setProgress(0);
    callbacks.current.onActive(false);
    callbacks.current.onTime(null);
  };
  useEffect(() => {
    stop();
    setError("");
    setTarget("");
    return () => {
      ++control.current.generation;
      callbacks.current.onTime(null);
      callbacks.current.onActive(false);
    };
  }, [records]);
  useEffect(() => {
    stop();
  }, [reset]);
  useEffect(() => {
    if (mode === "send" && (!enabled || !peers.some((peer) => String(peer.id) === target))) stop();
  }, [enabled, peers, target, mode]);
  const start = async (actual: boolean) => {
    if (state === "playing" || state === "paused") return;
    const items = actual ? payloads : ordered;
    if (!items.length || (actual && (!enabled || !target))) return;
    if (actual && items.some((item) => item.hex.length > 262144 || !item.hex.trim())) {
      setError(
        t(
          "报文超过发送入口限制，不能回放。",
          "A payload exceeds the send limit; replay cannot start.",
        ),
      );
      return;
    }
    const generation = ++control.current.generation;
    const current = () => generation === control.current.generation;
    control.current.paused = false;
    setMode(actual ? "send" : "offline");
    setState("playing");
    setProgress(0);
    setError("");
    callbacks.current.onActive(actual);
    clock.current = items[0].time;
    callbacks.current.onTime(actual ? null : clock.current);
    let wall = performance.now();
    try {
      for (let index = 0; index < items.length + (actual ? 0 : 1) && current(); index++) {
        const time = items[index]?.time ?? Math.max(items.at(-1)!.time, Date.parse(savedAt));
        while (current() && (control.current.paused || clock.current < time)) {
          await new Promise((resolve) => setTimeout(resolve, 25));
          const now = performance.now();
          if (!control.current.paused) {
            clock.current = Math.min(time, clock.current + (now - wall) * control.current.speed);
            if (!actual) callbacks.current.onTime(clock.current);
          }
          wall = now;
        }
        if (!current()) return;
        if (
          actual &&
          !(await callbacks.current.onSend(
            items[index].hex,
            target,
            () => current() && !control.current.paused,
          ))
        ) {
          index--;
          continue;
        }
        if (!current()) return;
        setProgress(Math.min(index + 1, items.length));
        if (!actual) callbacks.current.onTime(time);
      }
      if (current()) {
        setState("done");
        callbacks.current.onActive(false);
      }
    } catch (failure) {
      if (current()) {
        setError(String(failure));
        setState("idle");
        callbacks.current.onActive(false);
      }
    }
  };
  const running = state === "playing" || state === "paused";
  return (
    <details className="traffic-filters traffic-replay" open>
      <summary>{t("历史回放", "History replay")}</summary>
      <div className="tcp-send-controls">
        <label>
          {t("回放速度", "Replay speed")}
          <select
            aria-label={t("回放速度", "Replay speed")}
            value={speed}
            onChange={(event) => setSpeed(Number(event.target.value))}
          >
            {[0.25, 0.5, 1, 2, 4, 8, 16].map((value) => (
              <option key={value} value={value}>
                {value}×
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("回放数据", "Replay data")}
          <select
            aria-label={t("回放数据", "Replay data")}
            value={source}
            onChange={(event) => {
              stop();
              setSource(event.target.value);
            }}
          >
            <option value="raw">
              {t("原始块（缺失时使用帧）", "Raw chunks (frames if absent)")}
            </option>
            <option value="frame">{t("完整帧", "Complete frames")}</option>
          </select>
        </label>
        <button
          type="button"
          disabled={running || !ordered.length}
          onClick={() => void start(false)}
        >
          {t("离线回放（不发包）", "Offline replay (no packets)")}
        </button>
        <button
          type="button"
          disabled={!running}
          onClick={() => {
            control.current.paused = !control.current.paused;
            setState(control.current.paused ? "paused" : "playing");
          }}
        >
          {state === "paused" ? t("继续回放", "Resume replay") : t("暂停回放", "Pause replay")}
        </button>
        <button type="button" onClick={stop}>
          {t("停止回放", "Stop replay")}
        </button>
        <output role="status">
          {mode === "send" ? t("实际发包", "Sending packets") : t("离线查看", "Offline viewing")} ·{" "}
          {state} · {progress}/{mode === "send" ? payloads.length : ordered.length}
        </output>
      </div>
      <fieldset disabled={running}>
        <legend>
          {t("发送回放：使用原始字节实际发包", "Send replay: transmit original bytes")}
        </legend>
        <label>
          {t("回放目标连接", "Replay target connection")}
          <select
            aria-label={t("回放目标连接", "Replay target connection")}
            value={target}
            onChange={(event) => {
              stop();
              setTarget(event.target.value);
            }}
          >
            <option value="">{t("明确选择已连接目标", "Select a connected target")}</option>
            {peers.map((peer) => (
              <option key={peer.id} value={peer.id}>
                {redact(peer.address)} #{peer.id}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("回放原始方向", "Replay source direction")}
          <select
            aria-label={t("回放原始方向", "Replay source direction")}
            value={flow}
            onChange={(event) => {
              stop();
              setFlow(event.target.value as "TX" | "RX");
            }}
          >
            <option>TX</option>
            <option>RX</option>
          </select>
        </label>
        <button
          type="button"
          disabled={!enabled || !target || !payloads.length}
          onClick={() => void start(true)}
        >
          {t("开始向所选连接发包", "Start sending to selected connection")}
        </button>
        <p>
          {t(
            "按捕获顺序及间隔发送所选方向的数据。原始块与完整帧不会重复发送；PCAP 的 TCP 原始块保留重传及乱序，完整帧按重组结果发送。不会自动连接；断线、关闭或停止后不再排队，已进入发送队列的字节可能已发出。",
            "Sends selected direction at captured intervals; raw chunks and frames are never sent twice. PCAP TCP raw chunks include retransmissions/out of order segments; complete frames use the reassembled stream. No automatic connections; disconnect, close or stop prevents further queuing. Already queued bytes may have been sent.",
          )}
        </p>
      </fieldset>
      {error && <p role="alert">{redact(error)}</p>}
    </details>
  );
}
