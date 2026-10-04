import { useState } from "react";
import { ZoomIn, ZoomOut } from "react-feather";
import type { CorrelationRow, CorrelationRule, TcpRecord } from "./bridge";
import type { Locale } from "./i18n";
import { CorrelationState, deviceValue, rowKey, timeLabel } from "./correlationView";

export default function TrafficTimeline({
  records,
  rows,
  rule,
  selected,
  onSelect,
  onRecord,
  locale,
  labels,
  redact,
  filtering,
}: {
  records: TcpRecord[];
  rows: CorrelationRow[];
  rule: CorrelationRule | null;
  selected?: CorrelationRow;
  onSelect: (row: CorrelationRow) => void;
  onRecord: (record: TcpRecord) => void;
  locale: Locale;
  labels: Record<CorrelationRow["state"], string>;
  redact: (text: string) => string;
  filtering?: boolean;
}) {
  const t = (cn: string, en: string) => (locale === "zh-CN" ? cn : en);
  const [zoom, setZoom] = useState(1);
  const [grouped, setGrouped] = useState(true);
  const [showRequests, setShowRequests] = useState(true);
  const [showResponses, setShowResponses] = useState(true);
  const [showLinks, setShowLinks] = useState(true);
  const byId = new Map(records.map((record) => [record.id, record]));
  const items: {
    row?: CorrelationRow;
    request?: TcpRecord;
    response?: TcpRecord;
    group: string;
  }[] = rows.map((row) => {
    const request = byId.get(row.request),
      response = byId.get(row.response);
    const record = request ?? response;
    return {
      row,
      request,
      response,
      group: grouped
        ? deviceValue(record) || (record ? `${record.address} #${record.peer}` : "—")
        : rowKey(row),
    };
  });
  if (!rule)
    for (const record of records.filter((record) => record.direction !== "SYS")) {
      const outgoing = (record.flow ?? record.direction) === "TX";
      items.push({
        request: outgoing ? record : undefined,
        response: outgoing ? undefined : record,
        group: grouped
          ? deviceValue(record) || `${record.address} #${record.peer}`
          : `record-${record.id}`,
      });
    }
  const groups = [...new Set(items.map((item) => item.group))];
  const times = items.flatMap(({ row, request, response }) => [
    ...(request ? [request.time] : []),
    ...(response ? [response.time] : []),
    ...(row?.state === "timeout" && request && rule ? [request.time + rule.timeout] : []),
  ]);
  const first = times.length ? Math.min(...times) : 0;
  const last = times.length ? Math.max(...times) : 0;
  const span = Math.max(last - first, 1);
  const width = 920 * zoom,
    left = 155,
    plotWidth = width - left - 70;
  const x = (time: number) => left + 20 + ((time - first) / span) * (plotWidth - 40);
  const height = Math.max(210, 45 + groups.length * 70);
  const events = records
    .filter(
      (record) =>
        !filtering ||
        !rule ||
        rows.some((row) => row.request === record.id || row.response === record.id),
    )
    .map((record) => {
      const row =
        rows.find((row) => row.response === record.id) ??
        rows.find((row) => row.request === record.id);
      return { record, row, time: record.time, timeout: false };
    });
  for (const row of rows.filter((row) => row.state === "timeout")) {
    const record = byId.get(row.request);
    if (record && rule)
      events.push({ record, row, time: record.time + rule.timeout, timeout: true });
  }
  events.sort((a, b) => a.time - b.time || a.record.id - b.record.id);
  return (
    <section
      className="p11-timeline traffic-timeline"
      aria-label={t("消息时间线", "Message timeline")}
    >
      <div className="p11-timeline-tools">
        {(
          [
            [showRequests, setShowRequests, t("显示请求", "Show requests")],
            [showResponses, setShowResponses, t("显示响应", "Show responses")],
            [showLinks, setShowLinks, t("显示关联", "Show links")],
            [grouped, setGrouped, t("按设备分组", "Group by device")],
          ] as const
        ).map(([value, setter, label]) => (
          <label key={label}>
            <input
              type="checkbox"
              checked={value}
              onChange={(event) => setter(event.target.checked)}
            />
            {label}
          </label>
        ))}
        <span className="p11-zoom">
          <button
            type="button"
            disabled={zoom === 1}
            aria-label={t("缩小时间线", "Zoom out timeline")}
            onClick={() => setZoom(Math.max(1, zoom - 1))}
          >
            <ZoomOut size={14} />
          </button>
          <span>{zoom}×</span>
          <button
            type="button"
            disabled={zoom === 4}
            aria-label={t("放大时间线", "Zoom in timeline")}
            onClick={() => setZoom(Math.min(4, zoom + 1))}
          >
            <ZoomIn size={14} />
          </button>
        </span>
      </div>
      <div className="p11-chart-scroll">
        {items.length ? (
          <svg
            className="p11-chart"
            width={width}
            height={height}
            role="img"
            aria-label={t("请求响应时间轴", "Request response time axis")}
          >
            {Array.from({ length: 9 }, (_, index) => {
              const time = first + (span * index) / 8,
                pos = x(time);
              return (
                <g key={index} className="p11-grid">
                  <line x1={pos} x2={pos} y1={35} y2={height} />
                  <text x={pos} y={22} textAnchor="middle">
                    {timeLabel(time)}
                  </text>
                </g>
              );
            })}
            {groups.map((group, index) => (
              <g key={group} className="p11-lane">
                <line x1={0} x2={width} y1={35 + index * 70} y2={35 + index * 70} />
                <text x={12} y={64 + index * 70}>
                  {grouped ? t("设备", "Device") : `#${index + 1}`}
                </text>
                <text x={12} y={81 + index * 70}>
                  {redact(
                    grouped
                      ? group
                      : (items[index].request?.parsed?.messageName ??
                          items[index].response?.parsed?.messageName ??
                          "—"),
                  )}
                </text>
              </g>
            ))}
            {items.map(({ row, request, response, group }, index) => {
              const y = 64 + groups.indexOf(group) * 70;
              const a = request ? x(request.time) : response ? x(response.time) : left;
              const b = response
                ? x(response.time)
                : row?.state === "timeout" && request && rule
                  ? x(request.time + rule.timeout)
                  : a;
              const active = selected && row && rowKey(selected) === rowKey(row);
              const select = () => {
                if (row) onSelect(row);
                else if (request ?? response) onRecord((request ?? response)!);
              };
              return (
                <g
                  key={row ? rowKey(row) : `record-${(request ?? response)?.id}`}
                  className="p11-link"
                  data-state={row?.state ?? "pending"}
                  data-selected={!!active}
                  role="button"
                  tabIndex={0}
                  aria-label={`${t("选择时间线关联", "Select timeline correlation")} #${index + 1}`}
                  onClick={select}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      select();
                    }
                  }}
                >
                  <title>
                    {row
                      ? `#${index + 1} ${labels[row.state]}${request && response ? ` · ${row.elapsed} ms` : ""}`
                      : redact((request ?? response)?.parsed?.messageName ?? "")}
                  </title>
                  {active && (
                    <rect
                      className="p11-selection"
                      x={Math.max(left, a - 8)}
                      y={y - 23}
                      width={Math.max(20, b - a + 16)}
                      height={54}
                      rx={3}
                    />
                  )}
                  <rect
                    className="p11-hit"
                    x={Math.max(left, a - 10)}
                    y={y - 23}
                    width={Math.max(24, b - a + 20)}
                    height={54}
                  />
                  {showLinks && request && (response || row?.state === "timeout") && (
                    <path
                      className="p11-duration"
                      d={`M ${a} ${y} V ${y + 16} H ${b} V ${y + 16}`}
                    />
                  )}
                  {showRequests && request && (
                    <circle className="p11-request-dot" cx={a} cy={y} r={4.5} />
                  )}
                  {showResponses && response && (
                    <circle className="p11-response-dot" cx={b} cy={y + 16} r={4.5} />
                  )}
                  {row?.state === "timeout" && (
                    <g className="p11-timeout-dot">
                      <circle cx={b} cy={y + 16} r={5} />
                      <path d={`M ${b - 2} ${y + 14} l 4 4 M ${b + 2} ${y + 14} l -4 4`} />
                    </g>
                  )}
                  <text x={a + 6} y={y - 9}>
                    #{index + 1}{" "}
                    {row
                      ? request && response
                        ? `${row.elapsed} ms`
                        : labels[row.state]
                      : redact((request ?? response)?.parsed?.messageName ?? "")}
                  </text>
                </g>
              );
            })}
          </svg>
        ) : (
          <div className="p11-empty">
            <strong>{t("暂无可显示的时间线事件", "No timeline events to display")}</strong>
          </div>
        )}
      </div>
      <div className="p11-legend">
        <span>
          <i className="p11-request-dot" />
          {t("请求", "Request")} ({rule?.requestFlow ?? "TX"})
        </span>
        <span>
          <i className="p11-response-dot" />
          {t("响应", "Response")} ({rule?.requestFlow === "RX" ? "TX" : "RX"})
        </span>
        <span>
          {t("虚线：超时 · 异常使用状态颜色标记", "Dashed: timeout · exceptions use state colors")}
        </span>
      </div>
      <section className="p11-events">
        <header>
          <strong>{t("事件列表", "Event list")}</strong>
          <span>
            {events.length} {t("条", "events")}
          </span>
        </header>
        <div className="p11-table-scroll">
          <table>
            <thead>
              <tr>
                {[
                  "#",
                  t("时间", "Time"),
                  t("方向", "Direction"),
                  t("消息", "Message"),
                  t("设备 ID", "Device ID"),
                  t("长度", "Bytes"),
                  t("关联", "Correlation"),
                  t("状态 / 耗时", "State / elapsed"),
                  "HEX",
                ].map((label) => (
                  <th key={label}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {events.map((event, index) => (
                <tr
                  key={`${event.record.id}-${event.timeout}`}
                  data-timeline-exception={
                    Boolean(event.row && !["matched", "pending"].includes(event.row.state)) ||
                    Boolean(event.record.parsed && event.record.parsed.status !== "ok") ||
                    (event.record.direction === "SYS" &&
                      /error|fail|timeout|gap|truncat|conflict|unsupported|discard|reset|missing|invalid/i.test(
                        event.record.detail,
                      ))
                  }
                  aria-selected={
                    !!event.row && !!selected && rowKey(event.row) === rowKey(selected)
                  }
                  onClick={() => event.row && onSelect(event.row)}
                >
                  <td>
                    <button
                      type="button"
                      aria-label={`${t("查看报文", "View packet")} #${event.record.id}`}
                      onClick={(click) => {
                        click.stopPropagation();
                        onRecord(event.record);
                      }}
                    >
                      {event.record.id}
                    </button>
                  </td>
                  <td>{timeLabel(event.time)}</td>
                  <td>{event.timeout ? "—" : (event.record.flow ?? event.record.direction)}</td>
                  <td className="p11-message">
                    {event.timeout
                      ? t("请求超时", "Request timeout")
                      : redact(event.record.parsed?.messageName ?? event.record.detail)}
                  </td>
                  <td>{redact(deviceValue(event.record) || "—")}</td>
                  <td>{event.timeout ? "—" : event.record.size}</td>
                  <td>{event.row ? `#${rows.indexOf(event.row) + 1}` : "—"}</td>
                  <td>
                    {event.row && (
                      <>
                        <CorrelationState state={event.row.state} label={labels[event.row.state]} />
                        {event.row.request && event.row.response
                          ? ` · ${event.row.elapsed} ms`
                          : ""}
                      </>
                    )}
                  </td>
                  <td className="p11-event-hex">
                    {event.timeout ? `${rule?.timeout} ms` : redact(event.record.hex)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
