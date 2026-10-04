import { useEffect, useMemo, useRef, useState } from "react";
import type { TcpRecord } from "./bridge";
import type { Locale } from "./i18n";
import { FileText, Pause, Play, RotateCcw, Square, Upload } from "react-feather";
import { ParseState, trafficTime } from "./TrafficHistory";

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
  onRecord,
  selectedId,
  sourceName = "",
  onImport,
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
  onRecord?: (record: TcpRecord) => void;
  selectedId?: number;
  sourceName?: string;
  onImport?: () => void;
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
  const [choice, setChoice] = useState<"offline" | "send">("offline");
  const [loop, setLoop] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const activeRow = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    if (progress > 0) activeRow.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [progress, selectedId]);
  const ranged = useMemo(
    () =>
      ordered.filter(
        (item) =>
          (!rangeStart || item.time >= Date.parse(rangeStart)) &&
          (!rangeEnd || item.time <= Date.parse(rangeEnd)),
      ),
    [ordered, rangeStart, rangeEnd],
  );
  const invalidRange = Boolean(
    (rangeStart && !Number.isFinite(Date.parse(rangeStart))) ||
    (rangeEnd && !Number.isFinite(Date.parse(rangeEnd))) ||
    (rangeStart && rangeEnd && Date.parse(rangeStart) > Date.parse(rangeEnd)),
  );
  const control = useRef({ generation: 0, paused: false, speed: 1, loop: false });
  const clock = useRef(0);
  const callbacks = useRef({ onTime, onSend, onActive, onRecord });
  callbacks.current = { onTime, onSend, onActive, onRecord };
  control.current.speed = speed;
  control.current.loop = loop;
  // Use raw written/read chunks when available; never replay FRAME copies a second time.
  const payloads = useMemo(() => {
    const raw =
      source === "raw" ? ranged.filter((item) => item.direction === flow && item.size > 0) : [];
    return raw.length
      ? raw
      : ranged.filter(
          (item) => item.direction === "FRAME" && (item.flow ?? "RX") === flow && item.size > 0,
        );
  }, [ranged, flow, source]);
  const stop = () => {
    ++control.current.generation;
    control.current.paused = false;
    setState("idle");
    setMode("offline");
    setProgress(0);
    setElapsed(0);
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
    const items = actual ? payloads : ranged;
    if (invalidRange || !items.length || (actual && (!enabled || !target))) return;
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
    const from =
      !actual && state !== "done" ? Math.max(0, Math.min(progress - 1, items.length - 1)) : 0;
    setProgress(from);
    setError("");
    callbacks.current.onActive(actual);
    clock.current = items[from].time;
    callbacks.current.onTime(actual ? null : clock.current);
    let wall = performance.now();
    try {
      let first = true;
      do {
        if (!first) {
          clock.current = items[0].time;
          wall = performance.now();
          setProgress(0);
        }
        for (
          let index = first ? from : 0;
          index < items.length + (actual ? 0 : 1) && current();
          index++
        ) {
          const time =
            items[index]?.time ??
            (rangeEnd
              ? Math.min(Math.max(items.at(-1)!.time, Date.parse(savedAt)), Date.parse(rangeEnd))
              : Math.max(items.at(-1)!.time, Date.parse(savedAt)));
          while (current() && (control.current.paused || clock.current < time)) {
            await new Promise((resolve) => setTimeout(resolve, 25));
            if (!current()) return;
            const now = performance.now();
            if (!control.current.paused) {
              clock.current = Math.min(time, clock.current + (now - wall) * control.current.speed);
              if (!actual) callbacks.current.onTime(clock.current);
              setElapsed(Math.max(0, clock.current - items[0].time));
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
          setElapsed(Math.max(0, time - items[0].time));
          if (!actual) callbacks.current.onTime(time);
          if (!actual && items[index]) callbacks.current.onRecord?.(items[index]);
        }
        first = false;
        if (!actual && control.current.loop && current())
          await new Promise((resolve) => setTimeout(resolve, 25));
      } while (!actual && control.current.loop && current());
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
  const items = choice === "send" ? payloads : ranged;
  const currentRecord = items[Math.max(0, Math.min(progress - 1, items.length - 1))];
  const duration = ranged.length
    ? Math.max(
        ranged.at(-1)!.time,
        rangeEnd ? Math.min(Date.parse(savedAt), Date.parse(rangeEnd)) : Date.parse(savedAt),
      ) - ranged[0].time
    : 0;
  const durationLabel = (ms: number) => {
    const seconds = Math.max(0, Math.floor(ms / 1000));
    return `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  };
  return (
    <div className="p12-replay">
      <aside className="p12-card p12-replay-settings">
        <h3>{t("回放设置", "Replay settings")}</h3>
        <div className="p12-replay-modes">
          <button
            type="button"
            aria-pressed={choice === "offline"}
            onClick={() => {
              stop();
              setChoice("offline");
            }}
          >
            <Play size={18} />
            <span>
              {t("离线回放", "Offline replay")}
              <small>
                {t("按时间查看记录，不发送到设备", "Inspect capture timing without sending")}
              </small>
            </span>
          </button>
          <button
            type="button"
            aria-pressed={choice === "send"}
            onClick={() => {
              stop();
              setChoice("send");
            }}
          >
            <Upload size={18} />
            <span>
              {t("实际发送回放", "Send replay")}
              <small>
                {t("向明确选择的现有连接发送", "Send to an explicitly selected connection")}
              </small>
            </span>
          </button>
        </div>
        <h3>{t("回放数据源", "Replay source")}</h3>
        <p>
          <FileText size={13} /> {sourceName || t("历史记录", "History")} ·{" "}
          {records.length.toLocaleString(locale)} {t("条记录", "records")}
        </p>
        {onImport && (
          <button type="button" onClick={onImport}>
            {t("选择历史文件…", "Choose archive…")}
          </button>
        )}
        <label>
          {t("开始时间", "Start time")}
          <input
            type="datetime-local"
            step="0.001"
            aria-label={t("回放开始时间", "Replay start time")}
            value={rangeStart}
            onChange={(event) => {
              const value = event.currentTarget.value;
              stop();
              setRangeStart(value);
            }}
          />
        </label>
        <label>
          {t("结束时间", "End time")}
          <input
            type="datetime-local"
            step="0.001"
            aria-label={t("回放结束时间", "Replay end time")}
            value={rangeEnd}
            onChange={(event) => {
              const value = event.currentTarget.value;
              stop();
              setRangeEnd(value);
            }}
          />
        </label>
        <label>
          {t("播放速度", "Playback speed")}
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
        {choice === "offline" ? (
          <label className="p12-loop">
            <input
              type="checkbox"
              checked={loop}
              onChange={(event) => setLoop(event.target.checked)}
            />
            {t("循环回放", "Loop replay")}
          </label>
        ) : (
          <>
            <label>
              {t("回放目标连接", "Replay target connection")}
              <select
                disabled={running}
                aria-label={t("回放目标连接", "Replay target connection")}
                value={target}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  stop();
                  setTarget(value);
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
                disabled={running}
                aria-label={t("回放原始方向", "Replay source direction")}
                value={flow}
                onChange={(event) => {
                  const value = event.currentTarget.value as "TX" | "RX";
                  stop();
                  setFlow(value);
                }}
              >
                <option>TX</option>
                <option>RX</option>
              </select>
            </label>
            <label>
              {t("回放数据", "Replay data")}
              <select
                disabled={running}
                aria-label={t("回放数据", "Replay data")}
                value={source}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  stop();
                  setSource(value);
                }}
              >
                <option value="raw">
                  {t("原始块（缺失时使用帧）", "Raw chunks (frames if absent)")}
                </option>
                <option value="frame">{t("完整帧", "Complete frames")}</option>
              </select>
            </label>
            <p>
              {t(
                "按捕获间隔发送原始字节；原始块和完整帧不重复发送。断线或停止后取消后续排队，已排队字节可能已发出。",
                "Sends original bytes at captured intervals without duplicating chunks and frames. Disconnect or stop cancels further queuing; queued bytes may already have been sent.",
              )}
            </p>
          </>
        )}
        {invalidRange && (
          <p className="p12-alert" role="alert">
            {t("结束时间不得早于开始时间。", "The end must not precede the start.")}
          </p>
        )}
      </aside>
      <section className="p12-replay-stage">
        <div className="p12-card p12-replay-controls">
          <h3>{t("回放控制", "Playback controls")}</h3>
          <div className="p12-playbar">
            <button
              className="p12-primary p12-play"
              type="button"
              aria-label={
                state === "playing"
                  ? t("暂停回放", "Pause replay")
                  : state === "paused"
                    ? t("继续回放", "Resume replay")
                    : choice === "send"
                      ? t("开始向所选连接发包", "Start sending to selected connection")
                      : t("离线回放（不发包）", "Offline replay (no packets)")
              }
              disabled={
                invalidRange || !items.length || (choice === "send" && (!enabled || !target))
              }
              onClick={() => {
                if (running) {
                  control.current.paused = !control.current.paused;
                  setState(control.current.paused ? "paused" : "playing");
                } else void start(choice === "send");
              }}
            >
              {state === "playing" ? <Pause size={19} /> : <Play size={19} />}
            </button>
            <button type="button" aria-label={t("停止回放", "Stop replay")} onClick={stop}>
              <Square size={15} />
            </button>
            <output role="status">
              {durationLabel(elapsed)} / {durationLabel(duration)}
            </output>
            <input
              className="p12-progress"
              type="range"
              aria-label={t("回放进度", "Replay position")}
              min="1"
              max={Math.max(1, items.length)}
              value={Math.max(1, progress)}
              disabled={choice === "send" || !items.length}
              onChange={(event) => {
                const index = Math.min(
                  Math.max(0, Number(event.currentTarget.value) - 1),
                  items.length - 1,
                );
                ++control.current.generation;
                control.current.paused = false;
                callbacks.current.onActive(false);
                setState("idle");
                setProgress(index + 1);
                const record = items[index];
                setElapsed(record.time - items[0].time);
                callbacks.current.onTime(record.time);
                callbacks.current.onRecord?.(record);
              }}
            />
            <button
              type="button"
              aria-label={t("从头回放", "Rewind replay")}
              disabled={choice === "send" && running}
              onClick={stop}
            >
              <RotateCcw size={15} />
            </button>
          </div>
          <div className="p12-current-record">
            <span>
              {choice === "send"
                ? t("实际发包", "Sending packets")
                : t("离线查看", "Offline viewing")}{" "}
              ·{" "}
              {state === "playing"
                ? t("播放中", "Playing")
                : state === "paused"
                  ? t("已暂停", "Paused")
                  : state === "done"
                    ? t("已完成", "Complete")
                    : t("就绪", "Ready")}
            </span>
            <span>
              {t("当前记录", "Current record")}:{" "}
              <strong>
                {progress} / {items.length}
              </strong>
            </span>
            {currentRecord && (
              <>
                <span>{trafficTime(currentRecord.time, locale)}</span>
                <strong>
                  {redact(
                    currentRecord.parsed?.messageName ||
                      currentRecord.detail ||
                      currentRecord.direction,
                  )}
                </strong>
              </>
            )}
          </div>
        </div>
        <div className="p12-card p12-replay-list">
          <table className="p12-record-table">
            <thead>
              <tr>
                {[
                  "#",
                  t("时间", "Time"),
                  t("方向", "Direction"),
                  t("消息", "Message"),
                  t("长度", "Length"),
                  t("HEX 摘要", "HEX preview"),
                  t("解析状态", "Parse state"),
                ].map((label) => (
                  <th key={label}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ranged.map((record) => (
                <tr
                  key={record.id}
                  ref={(selectedId ?? currentRecord?.id) === record.id ? activeRow : undefined}
                  className={(selectedId ?? currentRecord?.id) === record.id ? "selected" : ""}
                  aria-selected={(selectedId ?? currentRecord?.id) === record.id}
                  onClick={() => callbacks.current.onRecord?.(record)}
                >
                  <td>
                    <button
                      type="button"
                      onClick={() => callbacks.current.onRecord?.(record)}
                      aria-label={`${t("查看记录", "View record")} #${record.id}`}
                    >
                      {record.id}
                    </button>
                  </td>
                  <td>{trafficTime(record.time, locale, false)}</td>
                  <td>
                    <span
                      className={`p12-direction ${record.direction === "FRAME" ? (record.flow ?? "RX") : record.direction}`}
                    >
                      {record.direction === "FRAME" ? (record.flow ?? "RX") : record.direction}
                    </span>
                  </td>
                  <td title={redact(record.detail)}>
                    {redact(record.parsed?.messageName || record.detail || "—")}
                  </td>
                  <td>{record.size}</td>
                  <td title={redact(record.hex)}>{redact(record.hex) || "—"}</td>
                  <td>
                    <ParseState record={record} locale={locale} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!ranged.length && (
            <div className="p12-empty">{t("此范围内没有记录", "No records in this range")}</div>
          )}
        </div>
        {error && (
          <p className="p12-alert" role="alert">
            {redact(error)}
          </p>
        )}
      </section>
    </div>
  );
}
