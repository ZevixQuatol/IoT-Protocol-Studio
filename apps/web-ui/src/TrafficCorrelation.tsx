import { useEffect, useId, useRef, useState } from "react";
import { Edit2, Search, X } from "react-feather";
import {
  correlateTraffic,
  type CorrelationRow,
  type CorrelationRule,
  type TcpRecord,
  type WorkspaceProtocol,
} from "./bridge";
import CorrelationDetail from "./CorrelationDetail";
import TrafficTimeline from "./TrafficTimeline";
import { CorrelationState, deviceValue, recordField, rowKey, timeLabel } from "./correlationView";
import type { Locale } from "./i18n";
import "./traffic-analysis.css";

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
  view = "correlation",
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
  view?: "timeline" | "correlation";
}) {
  const t = (cn: string, en: string) => (locale === "zh-CN" ? cn : en);
  const optionId = useId();
  const [draft, setDraft] = useState(rule ?? defaults);
  const [rows, setRows] = useState<CorrelationRow[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState("");
  const [search, setSearch] = useState("");
  const [state, setState] = useState("");
  const [connection, setConnection] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const editor = useRef<HTMLDialogElement>(null);
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
  const schema = protocols.find((item) => item.path === draft.protocol)?.schema;
  const names = [
    ...new Set([
      ...(schema?.messages.map((item) => item.name) ?? []),
      ...records.flatMap((item) =>
        item.parsed?.protocolPath === draft.protocol && item.parsed.messageName
          ? [item.parsed.messageName]
          : [],
      ),
    ]),
  ];
  const fields = [
    ...new Set([
      ...(schema?.messages.flatMap((item) => item.fields.map((field) => field.name)) ?? []),
      ...records.flatMap((item) =>
        item.parsed?.protocolPath === draft.protocol
          ? item.parsed.fields.map((field) => field.name)
          : [],
      ),
    ]),
  ];
  const labels: Record<CorrelationRow["state"], string> = {
    pending: t("等待响应", "Pending"),
    matched: t("正常匹配", "Matched"),
    timeout: t("超时", "Timeout"),
    duplicate: t("重复响应", "Duplicate"),
    unmatched: t("无匹配", "Unmatched"),
    late: t("迟到", "Late"),
    ambiguous: t("歧义", "Ambiguous"),
    skipped: t("无法分析", "Skipped"),
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
  const reason = (row: CorrelationRow) =>
    redact(locale === "zh-CN" ? (reasons[row.reason] ?? row.reason) : row.reason);
  const byId = new Map(records.map((record) => [record.id, record]));
  const filtered = rows.filter((row) => {
    const request = byId.get(row.request),
      response = byId.get(row.response),
      record = request ?? response;
    const key = rule ? recordField(record, request ? rule.requestField : rule.responseField) : "";
    return (
      (!state || row.state === state) &&
      (!connection || `${record?.address} #${record?.peer}` === connection) &&
      (!start || (record?.time ?? 0) >= new Date(start).getTime()) &&
      (!end || (record?.time ?? 0) <= new Date(end).getTime()) &&
      (!search ||
        redact(
          [
            key,
            deviceValue(record),
            record?.address,
            request?.parsed?.messageName,
            response?.parsed?.messageName,
            reason(row),
            record?.hex,
          ].join(" "),
        )
          .toLowerCase()
          .includes(search.toLowerCase()))
    );
  });
  const current = filtered.find((row) => rowKey(row) === selected) ?? filtered[0];
  const currentIndex = current ? filtered.indexOf(current) : -1;
  const timelineRecords = rule
    ? records
    : records.filter(
        (record) =>
          !state &&
          (!connection || `${record.address} #${record.peer}` === connection) &&
          (!start || record.time >= new Date(start).getTime()) &&
          (!end || record.time <= new Date(end).getTime()) &&
          (!search ||
            redact(
              [
                deviceValue(record),
                record.address,
                record.parsed?.messageName,
                record.hex,
                record.detail,
              ].join(" "),
            )
              .toLowerCase()
              .includes(search.toLowerCase())),
      );
  const connections = [
    ...new Set(
      rows.flatMap((row) => {
        const record = byId.get(row.request) ?? byId.get(row.response);
        return record ? [`${record.address} #${record.peer}`] : [];
      }),
    ),
  ];
  const editRule = () => {
    setDraft(rule ?? defaults);
    setError("");
    editor.current?.showModal();
  };
  const cancelEdit = () => {
    ++applied.current;
    setBusy(false);
    editor.current?.close();
  };
  const selectRow = (row: CorrelationRow) => setSelected(rowKey(row));
  const counts = Object.keys(labels).map((key) => ({
    state: key as CorrelationRow["state"],
    count: rows.filter((row) => row.state === key).length,
  }));
  return (
    <div className="p11-workbench" data-view={view}>
      <div className="p11-main">
        {view === "correlation" && (
          <section className="p11-rule-summary" aria-label={t("关联规则", "Correlation rule")}>
            <header>
              <strong>{t("关联规则", "Correlation rule")}</strong>
              <span className="p11-rule-name">
                {redact(
                  protocols.find((item) => item.path === rule?.protocol)?.name ??
                    rule?.protocol ??
                    "",
                )}
              </span>
              <span className="p11-enabled" data-enabled={!!rule}>
                <i />
                {rule ? t("已启用", "Enabled") : t("未配置", "Not configured")}
              </span>
              <button type="button" onClick={editRule}>
                <Edit2 size={13} />
                {t("编辑规则", "Edit rule")}
              </button>
            </header>
            <div className="p11-rule-values">
              <div>
                <small>{t("请求消息", "Request message")}</small>
                <strong>{redact(rule?.requestMessage ?? "—")}</strong>
              </div>
              <span className="p11-rule-arrow">→</span>
              <div>
                <small>{t("响应消息", "Response message")}</small>
                <strong>{redact(rule?.responseMessage ?? "—")}</strong>
              </div>
              <div>
                <small>{t("关联字段", "Matching fields")}</small>
                <span className="p11-key">
                  <code>{redact(rule?.requestField || "—")}</code>
                  <span>→</span>
                  <code>{redact(rule?.responseField || "—")}</code>
                </span>
              </div>
              <div>
                <small>{t("匹配方向", "Direction")}</small>
                <strong>
                  {rule?.requestFlow ?? "TX"} → {rule?.requestFlow === "RX" ? "TX" : "RX"}
                </strong>
              </div>
              <div>
                <small>{t("匹配范围", "Scope")}</small>
                <strong>
                  {rule?.scope === "session"
                    ? t("整个会话", "Entire session")
                    : t("同一连接", "Same connection")}
                </strong>
              </div>
              <div>
                <small>{t("响应超时", "Timeout")}</small>
                <strong>{rule ? `${rule.timeout.toLocaleString()} ms` : "—"}</strong>
              </div>
            </div>
          </section>
        )}
        {error && (
          <p className="p11-error" role="alert">
            {redact(error)}
          </p>
        )}
        <div className="p11-filters">
          <select
            aria-label={t("关联状态筛选", "Correlation state filter")}
            value={state}
            onChange={(event) => setState(event.target.value)}
          >
            <option value="">{t("全部状态", "All states")}</option>
            {Object.entries(labels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <select
            aria-label={t("关联连接筛选", "Correlation connection filter")}
            value={connection}
            onChange={(event) => setConnection(event.target.value)}
          >
            <option value="">{t("全部连接", "All connections")}</option>
            {connections.map((value) => (
              <option key={value} value={value}>
                {redact(value)}
              </option>
            ))}
          </select>
          <label className="p11-search">
            <Search size={14} />
            <input
              aria-label={t("搜索关联记录", "Search correlations")}
              placeholder={t("搜索序号、设备 ID、消息…", "Sequence, device ID, message…")}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <button
            type="button"
            onClick={() => {
              setState("");
              setConnection("");
              setSearch("");
              setStart("");
              setEnd("");
            }}
          >
            {t("重置", "Reset")}
          </button>
          {view === "timeline" && (
            <button type="button" onClick={editRule}>
              <Edit2 size={13} />
              {t("编辑规则", "Edit rule")}
            </button>
          )}
        </div>
        <div className="p11-range">
          <span>{t("时间范围", "Time range")}</span>
          <input
            type="datetime-local"
            step="0.001"
            aria-label={t("关联开始时间", "Correlation start time")}
            value={start}
            onChange={(event) => setStart(event.target.value)}
          />
          <span>→</span>
          <input
            type="datetime-local"
            step="0.001"
            aria-label={t("关联结束时间", "Correlation end time")}
            value={end}
            onChange={(event) => setEnd(event.target.value)}
          />
          <span className="p11-analysis-time">
            {savedAt ? t("历史分析", "History") : t("实时分析", "Live analysis")} ·{" "}
            {filtered.length} / {rows.length}
          </span>
        </div>
        {!rule && view !== "timeline" ? (
          <div className="p11-empty">
            <strong>{t("配置请求与响应关联", "Configure request / response correlation")}</strong>
            <p>
              {t(
                "选择协议、消息和匹配字段，查看关联结果与消息时间线。",
                "Choose a protocol, messages and matching fields to inspect correlations and the timeline.",
              )}
            </p>
            <button type="button" onClick={editRule}>
              {t("配置关联规则", "Configure rule")}
            </button>
          </div>
        ) : (
          <>
            <div className="p11-counts" aria-label={t("关联统计", "Correlation statistics")}>
              <button type="button" onClick={() => setState("")} aria-pressed={!state}>
                {t("全部", "All")}
                <b>{rows.length}</b>
              </button>
              {counts
                .filter((item) => item.count)
                .map((item) => (
                  <button
                    type="button"
                    key={item.state}
                    data-state={item.state}
                    aria-pressed={state === item.state}
                    onClick={() => setState(state === item.state ? "" : item.state)}
                  >
                    {labels[item.state]}
                    <b>{item.count}</b>
                  </button>
                ))}
            </div>
            {view === "timeline" ? (
              <TrafficTimeline
                records={timelineRecords}
                rows={filtered}
                rule={rule}
                selected={current}
                onSelect={selectRow}
                onRecord={onSelect}
                locale={locale}
                labels={labels}
                redact={redact}
                filtering={Boolean(state || connection || search || start || end)}
              />
            ) : (
              <section
                className="p11-results traffic-correlation"
                aria-label={t("关联结果", "Correlation results")}
              >
                <header>
                  <strong>{t("关联结果", "Correlation results")}</strong>
                  <span>
                    {t("共", "Total")} {filtered.length} {t("条", "rows")}
                  </span>
                </header>
                <div className="p11-table-scroll">
                  <table>
                    <thead>
                      <tr>
                        {[
                          "#",
                          t("请求时间", "Request time"),
                          t("响应时间", "Response time"),
                          t("耗时 (ms)", "Elapsed (ms)"),
                          rule?.requestField ?? "—",
                          t("设备 ID", "Device ID"),
                          t("请求消息", "Request message"),
                          t("响应消息", "Response message"),
                          t("状态", "State"),
                          t("请求长度", "Request bytes"),
                          t("响应长度", "Response bytes"),
                          t("操作", "Action"),
                        ].map((label, index) => (
                          <th key={index}>{redact(label)}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((row) => {
                        const request = byId.get(row.request),
                          response = byId.get(row.response),
                          index = rows.indexOf(row);
                        return (
                          <tr
                            key={rowKey(row)}
                            data-correlation-state={row.state}
                            aria-selected={current === row}
                            onClick={() => selectRow(row)}
                          >
                            <td>{index + 1}</td>
                            <td>{timeLabel(request?.time)}</td>
                            <td>{timeLabel(response?.time)}</td>
                            <td>{row.request && row.response ? row.elapsed : "—"}</td>
                            <td>
                              {redact(
                                recordField(
                                  request ?? response,
                                  request
                                    ? (rule?.requestField ?? "")
                                    : (rule?.responseField ?? ""),
                                ) || "—",
                              )}
                            </td>
                            <td>{redact(deviceValue(request ?? response) || "—")}</td>
                            <td className="p11-message">
                              {redact(request?.parsed?.messageName ?? "—")}
                            </td>
                            <td className="p11-message">
                              {redact(response?.parsed?.messageName ?? "—")}
                            </td>
                            <td title={reason(row)}>
                              <CorrelationState state={row.state} label={labels[row.state]} />
                            </td>
                            <td>{request?.size ?? "—"}</td>
                            <td>{response?.size ?? "—"}</td>
                            <td>
                              <button
                                type="button"
                                aria-label={`${t("查看关联", "View correlation")} #${index + 1}`}
                                onClick={() => selectRow(row)}
                              >
                                {t("查看", "View")}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {filtered.length === 0 && (
                    <div className="p11-empty">
                      <strong>
                        {rows.length
                          ? t("没有符合筛选条件的记录", "No correlations match the filters")
                          : t("暂无关联结果", "No correlations yet")}
                      </strong>
                      <p>
                        {t(
                          "关联依据已保留的完整帧及已解析字段。",
                          "Correlation uses retained complete frames and decoded fields.",
                        )}
                      </p>
                    </div>
                  )}
                </div>
              </section>
            )}
          </>
        )}
        <footer className="p11-footnote">
          {t(
            "分析全部保留帧；筛选仅改变显示。",
            "Analyzes all retained frames; filters change only the display.",
          )}
          {dropped > 0 && ` ${t("已淘汰", "Evicted")}: ${dropped}`}
        </footer>
      </div>
      <CorrelationDetail
        row={current}
        records={records}
        rule={rule}
        locale={locale}
        index={currentIndex}
        total={filtered.length}
        labels={labels}
        reason={current ? reason(current) : ""}
        onStep={(step) => {
          const row = filtered[currentIndex + step];
          if (row) selectRow(row);
        }}
        onRecord={onSelect}
        redact={redact}
        timeline={view === "timeline"}
      />
      <dialog
        className="p11-rule-editor"
        ref={editor}
        aria-labelledby={`${optionId}-title`}
        onCancel={cancelEdit}
      >
        <header>
          <strong id={`${optionId}-title`}>{t("编辑关联规则", "Edit correlation rule")}</strong>
          <button
            type="button"
            onClick={cancelEdit}
            aria-label={t("关闭规则编辑", "Close rule editor")}
          >
            <X size={16} />
          </button>
        </header>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const version = ++applied.current;
            setBusy(true);
            setError("");
            void correlateTraffic(draft, [], savedAt ? Date.parse(savedAt) : Date.now())
              .then((result) => {
                if (version !== applied.current) return;
                if (result.ok) {
                  onRule({ ...draft });
                  editor.current?.close();
                } else setError(result.error.message);
              })
              .catch((failure) => {
                if (version === applied.current) setError(String(failure));
              })
              .finally(() => {
                if (version === applied.current) setBusy(false);
              });
          }}
        >
          <label className="p11-editor-protocol">
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
                  {redact(protocols.find((item) => item.path === path)?.name ?? path)}
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
          <p className="p11-editor-note">
            {t(
              "一组请求字段与响应字段按类型和值匹配。仅分析完整 FRAME；字段缺失、截断或脱敏时不猜测。重连按连接编号隔离，同值请求保留歧义。",
              "One request / response field pair matches by type and value. Uses complete FRAME records; missing, truncated or redacted keys are skipped. Reconnects are isolated; reused keys remain ambiguous.",
            )}
          </p>
          {error && (
            <p className="p11-error" role="alert">
              {redact(error)}
            </p>
          )}
          <footer>
            <button
              type="button"
              disabled={!rule}
              onClick={() => {
                ++applied.current;
                setBusy(false);
                onRule(null);
                editor.current?.close();
              }}
            >
              {t("关闭关联", "Disable correlation")}
            </button>
            <button type="button" onClick={cancelEdit}>
              {t("取消", "Cancel")}
            </button>
            <button type="submit" disabled={busy}>
              {busy ? t("验证中…", "Validating…") : t("应用关联规则", "Apply correlation rule")}
            </button>
          </footer>
        </form>
      </dialog>
    </div>
  );
}
