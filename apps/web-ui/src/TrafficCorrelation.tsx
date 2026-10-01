import { useEffect, useId, useRef, useState } from "react";
import {
  correlateTraffic,
  type CorrelationRow,
  type CorrelationRule,
  type TcpRecord,
  type WorkspaceProtocol,
} from "./bridge";
import type { Locale } from "./i18n";

const defaults: CorrelationRule = {
  protocol: "",
  requestMessage: "",
  responseMessage: "",
  requestField: "",
  responseField: "",
  requestFlow: "TX",
  scope: "connection",
  timeout: 5000,
};
export default function TrafficCorrelation({
  records,
  protocols,
  rule,
  onRule,
  onSelect,
  locale,
  savedAt,
  dropped,
  redact,
}: {
  records: TcpRecord[];
  protocols: WorkspaceProtocol[];
  rule: CorrelationRule | null;
  onRule: (rule: CorrelationRule | null) => void;
  onSelect: (record: TcpRecord) => void;
  locale: Locale;
  savedAt?: string;
  dropped: number;
  redact: (text: string) => string;
}) {
  const t = (cn: string, en: string) => (locale === "zh-CN" ? cn : en);
  const optionId = useId();
  const [draft, setDraft] = useState(rule ?? defaults);
  const [rows, setRows] = useState<CorrelationRow[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const applied = useRef(0);
  useEffect(() => {
    ++applied.current;
    setDraft(rule ?? defaults);
    setBusy(false);
    return () => {
      ++applied.current;
    };
  }, [rule, savedAt]);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    setRows([]);
    setError("");
    if (!rule) return;
    const analyze = async () => {
      try {
        const result = await correlateTraffic(
          rule,
          records,
          savedAt ? Date.parse(savedAt) : Date.now(),
        );
        if (!alive) return;
        if (result.ok) {
          setRows(result.rows);
          setError("");
        } else setError(result.error.message);
      } catch (failure) {
        if (alive) setError(String(failure));
      } finally {
        if (alive && !savedAt) timer = setTimeout(() => void analyze(), 1000);
      }
    };
    void analyze();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [rule, records, savedAt]);
  const paths = [
    ...new Set([
      ...protocols.map((item) => item.path),
      ...records.flatMap((item) => (item.parsed ? [item.parsed.protocolPath] : [])),
      ...(draft.protocol ? [draft.protocol] : []),
    ]),
  ];
  const names = [
    ...new Set([
      ...(protocols
        .find((item) => item.path === draft.protocol)
        ?.schema?.messages.map((item) => item.name) ?? []),
      ...records.flatMap((item) =>
        item.parsed?.protocolPath === draft.protocol && item.parsed.messageName
          ? [item.parsed.messageName]
          : [],
      ),
    ]),
  ];
  const fields = [
    ...new Set([
      ...(protocols
        .find((item) => item.path === draft.protocol)
        ?.schema?.messages.flatMap((item) => item.fields.map((field) => field.name)) ?? []),
      ...records.flatMap((item) =>
        item.parsed?.protocolPath === draft.protocol
          ? item.parsed.fields.map((field) => field.name)
          : [],
      ),
    ]),
  ];
  const labels: Record<CorrelationRow["state"], string> = {
    pending: t("等待响应", "Pending"),
    matched: t("正常响应", "Matched"),
    timeout: t("超时", "Timeout"),
    duplicate: t("重复响应", "Duplicate"),
    unmatched: t("无匹配响应", "Unmatched"),
    late: t("迟到响应", "Late"),
    ambiguous: t("关联歧义", "Ambiguous"),
    skipped: t("无法关联", "Skipped"),
  };
  const reasons: Record<string, string> = {
    "Waiting for response": "等待响应",
    "Matching field and scope within timeout": "字段与连接范围匹配，响应在超时前到达",
    "No unique response within timeout": "超时前未收到可唯一匹配的响应",
    "Request already has a response": "此请求已有响应",
    "Response arrived after timeout": "响应在超时后到达",
    "No matching request in retained records": "保留记录中没有匹配请求",
    "Multiple retained requests share the key": "多个保留请求使用相同关联值，无法唯一匹配",
    "Frame is invalid or correlation field is missing/truncated":
      "帧无效，或关联字段缺失、截断、脱敏",
  };
  const jump = (id: number, title: string) => {
    const record = records.find((item) => item.id === id);
    return record ? (
      <button type="button" onClick={() => onSelect(record)} aria-label={`${title} #${id}`}>
        #{id}
      </button>
    ) : (
      "—"
    );
  };
  return (
    <details className="traffic-filters traffic-correlation">
      <summary>{t("请求 / 响应关联", "Request / response correlation")}</summary>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const version = ++applied.current;
          setBusy(true);
          setError("");
          void correlateTraffic(draft, [], savedAt ? Date.parse(savedAt) : Date.now())
            .then((result) => {
              if (version !== applied.current) return;
              if (result.ok) onRule({ ...draft });
              else setError(result.error.message);
            })
            .catch((failure) => {
              if (version === applied.current) setError(String(failure));
            })
            .finally(() => {
              if (version === applied.current) setBusy(false);
            });
        }}
      >
        <label>
          {t("关联协议", "Correlation protocol")}
          <select
            aria-label={t("关联协议", "Correlation protocol")}
            required
            value={draft.protocol}
            onChange={(event) => setDraft({ ...draft, protocol: event.target.value })}
          >
            <option value="">{t("选择协议", "Select protocol")}</option>
            {paths.map((path) => (
              <option key={path} value={path}>
                {redact(path)}
              </option>
            ))}
          </select>
        </label>
        {(
          [
            ["requestMessage", "请求消息", "Request message"],
            ["responseMessage", "响应消息", "Response message"],
            ["requestField", "请求关联字段", "Request correlation field"],
            ["responseField", "响应关联字段", "Response correlation field"],
          ] as const
        ).map(([key, cn, en]) => (
          <label key={key}>
            {t(cn, en)}
            <input
              aria-label={t(cn, en)}
              required
              maxLength={256}
              list={`${optionId}-${key.endsWith("Message") ? "messages" : "fields"}`}
              value={draft[key]}
              onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
            />
          </label>
        ))}
        <datalist id={`${optionId}-messages`}>
          {names.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <datalist id={`${optionId}-fields`}>
          {fields.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <label>
          {t("请求方向", "Request direction")}
          <select
            aria-label={t("请求方向", "Request direction")}
            value={draft.requestFlow}
            onChange={(event) =>
              setDraft({ ...draft, requestFlow: event.target.value as "TX" | "RX" })
            }
          >
            <option>TX</option>
            <option>RX</option>
          </select>
        </label>
        <label>
          {t("关联范围", "Correlation scope")}
          <select
            aria-label={t("关联范围", "Correlation scope")}
            value={draft.scope}
            onChange={(event) =>
              setDraft({ ...draft, scope: event.target.value as "connection" | "session" })
            }
          >
            <option value="connection">{t("同一连接", "Same connection")}</option>
            <option value="session">
              {t("整个会话（允许跨连接）", "Entire session (cross connection)")}
            </option>
          </select>
        </label>
        <label>
          {t("关联超时（毫秒）", "Correlation timeout (ms)")}
          <input
            type="number"
            aria-label={t("关联超时（毫秒）", "Correlation timeout (ms)")}
            required
            min={1}
            max={3600000}
            step={1}
            value={draft.timeout}
            onChange={(event) => setDraft({ ...draft, timeout: Number(event.target.value) })}
          />
        </label>
        <button type="submit" disabled={busy}>
          {t("应用关联规则", "Apply correlation rule")}
        </button>
        <button
          type="button"
          onClick={() => {
            ++applied.current;
            setBusy(false);
            onRule(null);
          }}
        >
          {t("关闭关联", "Disable correlation")}
        </button>
        <small>
          {t(
            "分析完整 FRAME，响应方向与请求相反；字段类型和值须一致。TCP / 串口先配置分帧并绑定协议，不同消息使用自动识别。缺失、截断或已脱敏的字段不猜测。分析全部保留记录，不受筛选影响；此操作不会发包。",
            "Uses complete FRAME records in opposite directions and equal field types/values. Configure stream framing and protocol binding; use auto detection for different messages. Missing, truncated or redacted keys are skipped. Analyzes all retained records, regardless of filters; sends no packets.",
          )}
        </small>
      </form>
      {error && <p role="alert">{redact(error)}</p>}
      {rule && (
        <>
          <p role="status">
            {savedAt
              ? t("历史分析时刻", "History analysis time") +
                ": " +
                new Date(savedAt).toLocaleString()
              : t("实时分析", "Live analysis")}{" "}
            · {t("关联条目", "Correlation rows")}: {rows.length}
          </p>
          <p className="tcp-log-hint">
            {t(
              "仅依据保留记录；清空或淘汰后不保留匹配记忆。重连按连接编号隔离，广播 / 组播可选择整个会话范围。关联值应在保留窗口内唯一；同值请求标记歧义，避免迟到或重复响应误配。",
              "Based on retained records only; clearing/eviction resets evidence. Reconnects are isolated by peer ID; broadcast/multicast can use session scope. Keys must be unique within retained requests; reused keys are ambiguous to avoid misassigning late/duplicate responses.",
            )}
            {dropped > 0 && ` ${t("已淘汰记录", "Dropped records")}: ${dropped}`}
          </p>
          <div className="correlation-table">
            <table>
              <thead>
                <tr>
                  <th>{t("状态", "State")}</th>
                  <th>{t("请求", "Request")}</th>
                  <th>{t("响应", "Response")}</th>
                  <th>{t("耗时", "Elapsed")}</th>
                  <th>{t("说明", "Reason")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={index} data-correlation-state={row.state}>
                    <td>{labels[row.state]}</td>
                    <td>{jump(row.request, t("查看请求", "View request"))}</td>
                    <td>{jump(row.response, t("查看响应", "View response"))}</td>
                    <td>{row.response && row.request ? `${row.elapsed} ms` : "—"}</td>
                    <td>
                      {locale === "zh-CN"
                        ? (reasons[row.reason] ?? redact(row.reason))
                        : redact(row.reason)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </details>
  );
}
