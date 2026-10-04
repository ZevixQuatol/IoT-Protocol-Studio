import { useEffect, useState, type ReactNode } from "react";
import {
  AlertCircle,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileText,
  Folder,
  Inbox,
  Play,
  Save,
  Search,
  Shield,
  Upload,
  XCircle,
} from "react-feather";
import type { TcpRecord } from "./bridge";
import type { TrafficArchive } from "./trafficFile";
import { deviceValue, messageKey, timeFilterError, type RecordFilters } from "./TrafficFilters";
import type { Locale } from "./i18n";
import "./traffic-history.css";

export type TrafficSource = { kind: "archive" | "pcap" | "current"; name: string; bytes?: number };
export const trafficTime = (time: number, locale: Locale, full = true) => {
  const date = new Date(time);
  const clock = `${date.toLocaleTimeString(locale, { hour12: false })}.${String(date.getMilliseconds()).padStart(3, "0")}`;
  return full
    ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${clock}`
    : clock;
};
const fileSize = (size: number) =>
  size >= 1024 * 1024
    ? `${(size / (1024 * 1024)).toFixed(2)} MiB`
    : `${(size / 1024).toFixed(1)} KiB`;

export function ParseState({ record, locale }: { record: TcpRecord; locale: Locale }) {
  const zh = locale === "zh-CN";
  const parsed = record.parsed;
  const state = parsed?.status ?? "unparsed";
  return (
    <span className={`p12-parse ${state}`}>
      {state === "ok" ? (
        <CheckCircle size={13} />
      ) : state === "error" ? (
        <XCircle size={13} />
      ) : state === "unmatched" ? (
        <AlertCircle size={13} />
      ) : null}
      {state === "ok"
        ? zh
          ? "解析成功"
          : "Decoded"
        : state === "error"
          ? zh
            ? "解析失败"
            : "Failed"
          : state === "unmatched"
            ? zh
              ? "未匹配"
              : "Unmatched"
            : record.direction === "SYS"
              ? "—"
              : zh
                ? "未解析"
                : "Not decoded"}
    </span>
  );
}

function PacketDetail({
  record,
  records,
  locale,
  source,
  onSelect,
  onCopy,
  onDebug,
}: {
  record: TcpRecord | null;
  records: TcpRecord[];
  locale: Locale;
  source: string;
  onSelect: (record: TcpRecord) => void;
  onCopy: (record: TcpRecord) => void;
  onDebug: (record: TcpRecord) => void;
}) {
  const t = (cn: string, en: string) => (locale === "zh-CN" ? cn : en);
  const [tab, setTab] = useState("hex");
  const [fieldName, setFieldName] = useState("");
  useEffect(() => setFieldName(""), [record?.id]);
  const index = records.findIndex((item) => item.id === record?.id);
  const bytes = record?.hex.split(" ").filter(Boolean) ?? [];
  const field = record?.parsed?.fields.find((item) => item.name === fieldName);
  return (
    <aside className="p12-card p12-detail" aria-label={t("报文详情", "Packet details")}>
      <header>
        <strong>{t("报文详情", "Packet details")}</strong>
        <span>
          {index >= 0 ? index + 1 : "—"} / {records.length.toLocaleString(locale)}
        </span>
        <button
          type="button"
          aria-label={t("上一条", "Previous record")}
          disabled={index <= 0}
          onClick={() => onSelect(records[index - 1])}
        >
          <ChevronLeft size={14} />
        </button>
        <button
          type="button"
          aria-label={t("下一条", "Next record")}
          disabled={index < 0 || index >= records.length - 1}
          onClick={() => onSelect(records[index + 1])}
        >
          <ChevronRight size={14} />
        </button>
      </header>
      {!record ? (
        <div className="p12-empty">
          <Search size={28} />
          <strong>{t("选择一条记录", "Select a record")}</strong>
          <p>{t("查看报文、字段与校验结果", "Inspect bytes, fields and checksums")}</p>
        </div>
      ) : (
        <div className="p12-detail-scroll">
          <h3 className="p12-caption">{t("基本信息", "Basic information")}</h3>
          <dl>
            <dt>{t("时间", "Time")}</dt>
            <dd>{trafficTime(record.time, locale)}</dd>
            <dt>{t("方向", "Direction")}</dt>
            <dd>
              {record.direction === "FRAME" ? `${record.flow ?? "RX"} · FRAME` : record.direction}
            </dd>
            <dt>{t("来源", "Source")}</dt>
            <dd title={source}>{source}</dd>
            <dt>{t("消息", "Message")}</dt>
            <dd>{record.parsed?.messageName || record.detail || "—"}</dd>
            <dt>{t("设备 ID", "Device ID")}</dt>
            <dd>{deviceValue(record, "deviceId") || "—"}</dd>
            <dt>{t("长度", "Length")}</dt>
            <dd>{record.size} bytes</dd>
            <dt>{t("解析状态", "Parse state")}</dt>
            <dd>
              <ParseState record={record} locale={locale} />
            </dd>
            <dt>{t("连接", "Connection")}</dt>
            <dd title={record.address}>
              {record.address || "—"}
              {record.peer > 0 ? ` #${record.peer}` : ""}
            </dd>
          </dl>
          <div
            className="p12-detail-tabs"
            role="tablist"
            aria-label={t("详情视图", "Detail views")}
          >
            {[
              ["hex", t("HEX 数据", "HEX data")],
              ["fields", t("字段解析", "Fields")],
              ["checksum", t("校验信息", "Checksum")],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === "hex" && (
            <section className="p12-hex">
              <button
                type="button"
                aria-label={t("复制 HEX", "Copy HEX")}
                disabled={!record.hex}
                onClick={() => onCopy(record)}
              >
                <Copy size={13} />
              </button>
              {bytes.length ? (
                <table>
                  <tbody>
                    {Array.from({ length: Math.ceil(bytes.length / 8) }, (_, row) => (
                      <tr key={row}>
                        <th>{(row * 8).toString(16).toUpperCase().padStart(4, "0")}</th>
                        <td>
                          {bytes.slice(row * 8, row * 8 + 8).map((byte, i) => (
                            <span
                              key={i}
                              className={
                                field &&
                                row * 8 + i >= field.offset &&
                                row * 8 + i < field.offset + field.length
                                  ? "selected"
                                  : ""
                              }
                            >
                              {byte}{" "}
                            </span>
                          ))}
                        </td>
                        <td>
                          {bytes
                            .slice(row * 8, row * 8 + 8)
                            .map((byte) => {
                              const n = parseInt(byte, 16);
                              return n >= 32 && n < 127 ? String.fromCharCode(n) : ".";
                            })
                            .join("")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p>{t("此事件没有报文字节", "This event has no packet bytes")}</p>
              )}
              <small>{record.size} bytes</small>
            </section>
          )}
          {tab === "fields" && (
            <section className="p12-fields">
              {record.parsed?.fields.length ? (
                <table>
                  <thead>
                    <tr>
                      {[
                        t("字段名", "Field"),
                        t("值", "Value"),
                        t("类型", "Type"),
                        t("字节范围", "Bytes"),
                      ].map((label) => (
                        <th key={label}>{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {record.parsed.fields.map((item) => (
                      <tr key={item.name} className={fieldName === item.name ? "selected" : ""}>
                        <td>
                          <button
                            type="button"
                            onClick={() => setFieldName(item.name)}
                            title={item.displayName}
                          >
                            {item.name}
                          </button>
                        </td>
                        <td title={item.value}>
                          {item.enumName ? `${item.enumName} (${item.value})` : item.value}
                          {item.truncated ? "…" : ""}
                        </td>
                        <td>{item.type}</td>
                        <td>
                          {item.length ? `${item.offset}–${item.offset + item.length - 1}` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p>{t("此记录没有已解析字段", "No decoded fields")}</p>
              )}
              {field && (
                <p className="p12-field-hint">
                  {field.displayName || field.name} · {field.value}
                  {field.bits?.map((bit) => (
                    <span key={bit.name}>
                      {bit.displayName || bit.name}: {bit.value} · bit {bit.bitOffset}–
                      {bit.bitOffset + bit.width - 1}
                    </span>
                  ))}
                  <button type="button" onClick={() => setTab("hex")}>
                    {t("在 HEX 中定位", "Locate in HEX")}
                  </button>
                </p>
              )}
            </section>
          )}
          {tab === "checksum" && (
            <section className="p12-checksum">
              <Shield size={24} />
              <strong>
                {record.parsed?.checksum === "pass"
                  ? t("校验通过", "Checksum passed")
                  : record.parsed?.checksum === "fail"
                    ? t("校验失败", "Checksum failed")
                    : t("未执行校验", "Checksum not checked")}
              </strong>
              {record.parsed?.error && <p role="alert">{record.parsed.error}</p>}
            </section>
          )}
          <button
            className="p12-debug"
            type="button"
            disabled={!record.hex}
            onClick={() => onDebug(record)}
          >
            {t("送入调试", "Open in Debug")}
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </aside>
  );
}

export default function TrafficHistory({
  archive,
  source,
  view,
  captureOpen,
  captureIp,
  importing,
  locale,
  records,
  selected,
  filters,
  direction,
  search,
  parseFilter,
  replay,
  analysis,
  error,
  notice,
  onView,
  onCaptureOpen,
  onCaptureIp,
  onCapture,
  onImport,
  onSave,
  onLive,
  onCurrent,
  onSelect,
  onFilters,
  onDirection,
  onSearch,
  onParseFilter,
  onCopy,
  onDebug,
}: {
  archive: TrafficArchive | null;
  source: TrafficSource | null;
  view: string;
  captureOpen: boolean;
  captureIp: string;
  importing: boolean;
  locale: Locale;
  records: TcpRecord[];
  selected: TcpRecord | null;
  filters: RecordFilters;
  direction: string;
  search: string;
  parseFilter: string;
  replay: ReactNode;
  analysis: ReactNode;
  error: string;
  notice: string;
  onView: (view: string) => void;
  onCaptureOpen: (open: boolean) => void;
  onCaptureIp: (ip: string) => void;
  onCapture: () => void;
  onImport: () => void;
  onSave: () => void;
  onLive: () => void;
  onCurrent: () => void;
  onSelect: (record: TcpRecord) => void;
  onFilters: (filters: RecordFilters) => void;
  onDirection: (direction: string) => void;
  onSearch: (search: string) => void;
  onParseFilter: (state: string) => void;
  onCopy: (record: TcpRecord) => void;
  onDebug: (record: TcpRecord) => void;
}) {
  const t = (cn: string, en: string) => (locale === "zh-CN" ? cn : en);
  const all = archive?.records ?? [];
  const times = all.map((item) => item.time);
  const sourceName = source?.name || archive?.session || t("尚未选择文件", "No file selected");
  const summary =
    source?.kind === "pcap"
      ? all.find(
          (item) => item.direction === "SYS" && item.detail.startsWith("PCAP offline import:"),
        )?.detail
      : undefined;
  const packetCount = summary?.match(/import: (\d+) packet/)?.[1];
  const issueCount = summary?.match(/, (\d+) issue/)?.[1];
  const categories = summary
    ? [...summary.matchAll(/(truncated|unsupported|gap|partial|overlap|limit|other)=(\d+)/g)]
    : [];
  const names: Record<string, string> = {
    truncated: t("数据截断", "Truncated data"),
    unsupported: t("未支持的协议或链路", "Unsupported protocols or links"),
    gap: t("TCP 数据缺口", "TCP stream gaps"),
    partial: t("不完整帧", "Incomplete frames"),
    overlap: t("重叠数据冲突", "Conflicting overlaps"),
    limit: t("超过导入限制", "Import limits"),
    other: t("其他诊断", "Other diagnostics"),
  };
  const messages = [
    ...new Map(
      all.filter((item) => item.parsed).map((item) => [messageKey(item), item.parsed!.messageName]),
    ).entries(),
  ];
  const range = times.length
    ? `${trafficTime(Math.min(...times), locale)} → ${trafficTime(Math.max(...times), locale)}`
    : "—";
  const table = (
    <div className="p12-record-scroll">
      <table className="p12-record-table">
        <thead>
          <tr>
            {[
              "#",
              t("时间", "Time"),
              t("方向", "Direction"),
              t("消息", "Message"),
              t("设备 ID", "Device ID"),
              t("长度", "Length"),
              t("HEX 摘要", "HEX preview"),
              t("解析状态", "Parse state"),
            ].map((label) => (
              <th key={label}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {records.map((item) => (
            <tr
              key={item.id}
              aria-selected={selected?.id === item.id}
              className={selected?.id === item.id ? "selected" : ""}
            >
              <td>
                <button
                  type="button"
                  aria-label={`${t("查看记录", "View record")} #${item.id}`}
                  onClick={() => onSelect(item)}
                >
                  {item.id}
                </button>
              </td>
              <td onClick={() => onSelect(item)}>{trafficTime(item.time, locale, false)}</td>
              <td onClick={() => onSelect(item)}>
                <span
                  className={`p12-direction ${item.direction === "FRAME" ? (item.flow ?? "RX") : item.direction}`}
                >
                  {item.direction === "FRAME" ? (item.flow ?? "RX") : item.direction}
                </span>
              </td>
              <td onClick={() => onSelect(item)} title={item.parsed?.messageName || item.detail}>
                {item.parsed?.messageName || item.detail || "—"}
              </td>
              <td onClick={() => onSelect(item)}>
                {deviceValue(item, filters.deviceField || "deviceId") || "—"}
              </td>
              <td onClick={() => onSelect(item)}>{item.size || "—"}</td>
              <td onClick={() => onSelect(item)} title={item.hex || item.detail}>
                {item.hex || "—"}
              </td>
              <td onClick={() => onSelect(item)}>
                <ParseState record={item} locale={locale} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!records.length && (
        <div className="p12-empty">
          <Inbox size={28} />
          <strong>
            {all.length
              ? t("没有匹配的记录", "No matching records")
              : t("尚无历史记录", "No history loaded")}
          </strong>
          <p>
            {all.length
              ? t("调整搜索或筛选条件", "Adjust search or filters")
              : t("导入记录文件或经典 PCAP 开始分析", "Import an archive or classic PCAP to start")}
          </p>
        </div>
      )}
    </div>
  );
  return (
    <div className="p12-history">
      <nav className="p12-view-tabs" aria-label={t("历史记录视图", "History views")}>
        {[
          ["records", t("记录", "Records")],
          ["correlation", t("关联", "Correlation")],
          ["timeline", t("时间线", "Timeline")],
          ["replay", t("回放", "Replay")],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={view === id}
            onClick={() => onView(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      <section className="p12-card p12-source">
        <div className="p12-source-heading">
          <h2>{t("历史记录", "History")}</h2>
          <span className="p12-readonly">
            <Shield size={12} />
            {t("历史文件（只读）", "History (read only)")}
          </span>
          <div className="p12-source-actions">
            <button type="button" onClick={onImport}>
              <Upload size={14} />
              {t("导入文件", "Import file")}
            </button>
            <button
              type="button"
              aria-pressed={captureOpen}
              onClick={() => onCaptureOpen(!captureOpen)}
            >
              <Folder size={14} />
              {t("导入 PCAP", "Import PCAP")}
            </button>
            <button type="button" disabled={!archive} onClick={onSave}>
              <Save size={14} />
              {t("保存记录为…", "Save archive as…")}
            </button>
            <button type="button" onClick={onLive}>
              {t("返回当前会话", "Back to live session")}
            </button>
          </div>
        </div>
        <div className="p12-source-meta">
          <span>
            {t("文件", "File")} <b title={sourceName}>{sourceName}</b>
          </span>
          <span>
            {t("来源", "Source")}{" "}
            <b>
              {source?.kind === "pcap"
                ? "PCAP"
                : source?.kind === "current"
                  ? t("当前记录快照", "Live snapshot")
                  : t("本地记录文件", "Local archive")}
            </b>
          </span>
          <span>
            {t("时间范围", "Time range")} <b>{range}</b>
          </span>
          <span>
            {t("记录条数", "Records")} <b>{all.length.toLocaleString(locale)}</b>
          </span>
          {source?.bytes !== undefined && (
            <span>
              {t("文件大小", "File size")} <b>{fileSize(source.bytes)}</b>
            </span>
          )}
          {Boolean(archive?.dropped) && (
            <span className="p12-warning">
              {t("已淘汰", "Evicted")} {archive!.dropped}
            </span>
          )}
        </div>
      </section>
      {captureOpen && (
        <section className="p12-capture-grid" aria-label={t("PCAP 导入", "PCAP import")}>
          <form
            className="p12-card p12-capture-form"
            onSubmit={(event) => {
              event.preventDefault();
              onCapture();
            }}
          >
            <h2 className="p12-caption">{t("导入 PCAP 文件", "Import PCAP file")}</h2>
            <p>
              {t(
                "从经典 PCAP 提取 IPv4 TCP / UDP 报文，导入后作为只读历史分析。",
                "Extract IPv4 TCP / UDP data from classic PCAP for read-only analysis.",
              )}
            </p>
            <div className="p12-capture-inputs">
              <label>
                {t("PCAP 文件", "PCAP file")}
                <span className="p12-file-slot">
                  <FileText size={16} />
                  <span title={sourceName}>
                    {source?.kind === "pcap"
                      ? sourceName
                      : t(
                          "在文件选择器中选择 .pcap 文件",
                          "Choose a .pcap file in the file picker",
                        )}
                  </span>
                </span>
              </label>
              <label>
                {t("捕获端本机 IPv4", "Captured local IPv4")}
                <input
                  required
                  maxLength={15}
                  aria-label={t("捕获本机 IPv4", "Captured local IPv4")}
                  value={captureIp}
                  onChange={(event) => onCaptureIp(event.target.value)}
                  placeholder="192.168.1.100"
                />
                <small>{t("用于区分 TX / RX 方向", "Identifies TX / RX direction")}</small>
              </label>
              <button className="p12-primary" type="submit" disabled={importing}>
                <Upload size={15} />
                {importing
                  ? t("正在导入…", "Importing…")
                  : t("选择 PCAP 并导入", "Choose PCAP and import")}
              </button>
            </div>
            <details>
              <summary>{t("支持范围与限制", "Support and limits")}</summary>
              <p>
                {t(
                  "仅支持经典 PCAP、Ethernet / VLAN、未分片 IPv4、TCP / UDP；不支持 PCAPNG、IPv6 和 IP 分片。复用当前已应用的协议绑定和分帧设置；TCP 关闭分帧时只保留原始段。最多 16 MiB / 100000 包 / 128 连接；保留最近 1000 条 / 4 MiB 记录及最近 100 条诊断。导入不会连接或发包。",
                  "Classic PCAP, Ethernet / VLAN, unfragmented IPv4 TCP / UDP only. PCAPNG, IPv6 and IP fragments are unsupported. Uses applied protocol binding and framing; TCP with framing off keeps raw segments only. Up to 16 MiB / 100000 packets / 128 connections; retains 1000 records / 4 MiB and the latest 100 diagnostics. Import never connects or sends packets.",
                )}
              </p>
            </details>
          </form>
          <div className="p12-card p12-import-result">
            <h2>{t("导入结果", "Import result")}</h2>
            {source?.kind === "pcap" ? (
              <>
                <strong className="p12-success">
                  <CheckCircle size={17} />
                  {t("导入完成", "Import complete")}
                </strong>
                <dl>
                  <dt>{t("捕获数据包", "Captured packets")}</dt>
                  <dd>{packetCount ?? "—"}</dd>
                  <dt>{t("保留记录", "Retained records")}</dt>
                  <dd>{all.length}</dd>
                  <dt>{t("解析成功帧", "Decoded frames")}</dt>
                  <dd>{all.filter((item) => item.parsed?.status === "ok").length}</dd>
                  <dt>{t("解析失败帧", "Failed frames")}</dt>
                  <dd>{all.filter((item) => item.parsed?.status === "error").length}</dd>
                  <dt>{t("诊断项", "Diagnostics")}</dt>
                  <dd>{issueCount ?? "—"}</dd>
                </dl>
              </>
            ) : (
              <p>{t("选择文件后显示导入结果", "Import a file to see results")}</p>
            )}
          </div>
          <div className="p12-card p12-diagnostics">
            <h2 className="p12-warning">
              <AlertCircle size={15} />
              {t("未支持数据与诊断", "Unsupported data and diagnostics")}
            </h2>
            {categories.length ? (
              <ul>
                {categories.map(([, kind, count]) => (
                  <li key={kind}>
                    <span>{names[kind]}</span>
                    <b>{count}</b>
                  </li>
                ))}
              </ul>
            ) : (
              <p>
                {source?.kind === "pcap"
                  ? t("未报告分类诊断", "No categorized diagnostics reported")
                  : t("诊断由导入结果提供", "Diagnostics appear after import")}
              </p>
            )}
            <button
              type="button"
              disabled={!archive}
              onClick={() => {
                onView("records");
                onDirection("SYS");
              }}
            >
              {t("查看诊断记录", "View diagnostic records")}
              <ChevronRight size={14} />
            </button>
            <small>
              {t(
                "各项为诊断次数，可能对应同一数据包。",
                "Counts are diagnostic events; one packet may have multiple events.",
              )}
            </small>
          </div>
        </section>
      )}
      {error && (
        <p className="p12-alert" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="p12-notice" role="status">
          {notice}
        </p>
      )}
      <div className="p12-content">
        <main className="p12-main">
          {view === "records" && (
            <>
              <div className="p12-filter-bar">
                <label className="p12-search">
                  <Search size={15} />
                  <input
                    aria-label={t("筛选记录", "Filter records")}
                    placeholder={t("搜索消息、设备 ID、HEX…", "Search message, device ID, HEX…")}
                    value={search}
                    onChange={(event) => onSearch(event.target.value)}
                  />
                </label>
                <select
                  aria-label={t("记录方向", "Direction")}
                  value={direction}
                  onChange={(event) => onDirection(event.target.value)}
                >
                  <option value="all">{t("全部方向", "All directions")}</option>
                  {["TX", "RX", "FRAME", "SYS"].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
                <select
                  aria-label={t("消息类型", "Message type")}
                  value={filters.message}
                  onChange={(event) => onFilters({ ...filters, message: event.target.value })}
                >
                  <option value="">{t("全部消息", "All messages")}</option>
                  {messages.map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={t("解析状态筛选", "Parse status filter")}
                  value={parseFilter}
                  onChange={(event) => onParseFilter(event.target.value)}
                >
                  {[
                    ["all", t("全部状态", "All states")],
                    ["ok", t("解析成功", "Decoded")],
                    ["error", t("解析失败", "Failed")],
                    ["unmatched", t("未匹配", "Unmatched")],
                    ["unparsed", t("未解析", "Not decoded")],
                  ].map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
                <label className="p12-date">
                  {t("开始", "From")}
                  <input
                    type="datetime-local"
                    step="0.001"
                    aria-label={t("开始时间", "Start time")}
                    value={filters.start}
                    onChange={(event) => onFilters({ ...filters, start: event.target.value })}
                  />
                </label>
                <label className="p12-date">
                  {t("结束", "To")}
                  <input
                    type="datetime-local"
                    step="0.001"
                    aria-label={t("结束时间", "End time")}
                    value={filters.end}
                    onChange={(event) => onFilters({ ...filters, end: event.target.value })}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => {
                    onSearch("");
                    onDirection("all");
                    onParseFilter("all");
                    onFilters({
                      connection: "",
                      device: "",
                      deviceField: "",
                      message: "",
                      start: "",
                      end: "",
                    });
                  }}
                >
                  {t("重置", "Reset")}
                </button>
              </div>
              {timeFilterError(filters) && (
                <p className="p12-alert" role="alert">
                  {t(
                    "请输入有效时间，结束时间不得早于开始时间。",
                    "Enter a valid range; the end must not precede the start.",
                  )}
                </p>
              )}
              {table}
              <footer className="p12-record-footer">
                {t("当前显示", "Showing")} {records.length} / {all.length} ·{" "}
                {t("历史记录只读", "History is read only")}
              </footer>
            </>
          )}
          {view === "replay" &&
            (archive ? (
              replay
            ) : (
              <div className="p12-card p12-empty">
                <Play size={32} />
                <strong>{t("选择回放数据", "Choose replay data")}</strong>
                <p>
                  {t(
                    "离线回放按捕获顺序查看记录，不向设备发包。",
                    "Offline replay follows capture order without sending packets.",
                  )}
                </p>
                <div>
                  <button type="button" onClick={onCurrent}>
                    {t("使用当前记录", "Use current records")}
                  </button>
                  <button type="button" onClick={onImport}>
                    {t("导入历史文件", "Import archive")}
                  </button>
                </div>
              </div>
            ))}
          {(view === "correlation" || view === "timeline") && (
            <div className="p12-card p12-analysis">{analysis}</div>
          )}
        </main>
        <PacketDetail
          record={selected}
          records={view === "replay" ? all : records}
          locale={locale}
          source={sourceName}
          onSelect={onSelect}
          onCopy={onCopy}
          onDebug={onDebug}
        />
      </div>
    </div>
  );
}
