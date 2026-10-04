import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Copy, Crosshair } from "react-feather";
import type { CorrelationRow, CorrelationRule, TcpRecord } from "./bridge";
import type { Locale } from "./i18n";
import { CorrelationState, deviceValue, timeLabel, rowKey } from "./correlationView";

export default function CorrelationDetail({
  row,
  records,
  rule,
  locale,
  index,
  total,
  labels,
  reason,
  onStep,
  onRecord,
  redact,
  timeline,
}: {
  row?: CorrelationRow;
  records: TcpRecord[];
  rule: CorrelationRule | null;
  locale: Locale;
  index: number;
  total: number;
  labels: Record<CorrelationRow["state"], string>;
  reason: string;
  onStep: (step: number) => void;
  onRecord: (record: TcpRecord) => void;
  redact: (text: string) => string;
  timeline: boolean;
}) {
  const t = (cn: string, en: string) => (locale === "zh-CN" ? cn : en);
  const [tab, setTab] = useState("request");
  const [copyStatus, setCopyStatus] = useState("");
  useEffect(() => {
    setCopyStatus("");
    setTab(row?.request ? "request" : "response");
  }, [row && rowKey(row)]);
  const request = records.find((record) => record.id === row?.request);
  const response = records.find((record) => record.id === row?.response);
  const packet = tab === "request" ? request : response;
  const left = request?.parsed?.fields.find((field) => field.name === rule?.requestField);
  const right = response?.parsed?.fields.find((field) => field.name === rule?.responseField);
  const comparable =
    left && right && !left.truncated && !right.truncated && !left.redacted && !right.redacted;
  const matches = comparable && left.type === right.type && left.value === right.value;
  const card = (record: TcpRecord | undefined, kind: "request" | "response") => (
    <section
      className="p11-packet"
      data-role={kind}
      aria-label={
        kind === "request"
          ? t("请求报文详情", "Request packet details")
          : t("响应报文详情", "Response packet details")
      }
    >
      <header>
        <i />
        <strong>{kind === "request" ? t("请求报文", "Request") : t("响应报文", "Response")}</strong>
        <span>{redact(record?.parsed?.messageName ?? "—")}</span>
      </header>
      {record ? (
        <>
          <dl>
            <dt>{t("时间", "Time")}</dt>
            <dd>{timeLabel(record.time)}</dd>
            <dt>{t("方向", "Direction")}</dt>
            <dd>{record.flow ?? record.direction}</dd>
            <dt>{t("连接", "Connection")}</dt>
            <dd title={redact(record.address)}>
              {redact(record.address)} #{record.peer}
            </dd>
            <dt>{t("长度", "Length")}</dt>
            <dd>{record.size} bytes</dd>
            <dt>{t("设备 ID", "Device ID")}</dt>
            <dd>{redact(deviceValue(record) || "—")}</dd>
            <dt>{t("记录", "Record")}</dt>
            <dd>#{record.id}</dd>
          </dl>
          <code className="p11-hex">{redact(record.hex) || "—"}</code>
          <button
            type="button"
            className="p11-locate"
            onClick={() => onRecord(record)}
            aria-label={`${kind === "request" ? t("定位请求记录", "Locate request record") : t("定位响应记录", "Locate response record")} #${record.id}`}
          >
            <Crosshair size={12} />
            {t("在记录中定位", "Locate in records")}
          </button>
        </>
      ) : (
        <p className="p11-missing">
          {kind === "request"
            ? t("保留记录中没有匹配请求", "No matching request in retained records")
            : row?.state === "pending"
              ? t("等待响应报文", "Waiting for a response")
              : t("未收到可匹配的响应", "No matching response received")}
        </p>
      )}
    </section>
  );
  return (
    <aside
      className="p11-detail"
      aria-label={
        timeline ? t("时间线详情", "Timeline details") : t("关联详情", "Correlation details")
      }
    >
      <header className="p11-detail-heading">
        <strong>
          {timeline ? t("时间线详情", "Timeline details") : t("关联详情", "Correlation details")}
        </strong>
        <span>
          {index + 1} / {total}
        </span>
        <button
          type="button"
          aria-label={t("上一条关联", "Previous correlation")}
          disabled={index <= 0}
          onClick={() => onStep(-1)}
        >
          <ChevronLeft size={14} />
        </button>
        <button
          type="button"
          aria-label={t("下一条关联", "Next correlation")}
          disabled={index < 0 || index >= total - 1}
          onClick={() => onStep(1)}
        >
          <ChevronRight size={14} />
        </button>
      </header>
      {!row ? (
        <div className="p11-empty">
          <Crosshair size={24} />
          <strong>{t("选择一条关联记录", "Select a correlation")}</strong>
          <p>
            {t("查看请求、响应与已解析字段", "Inspect the request, response and decoded fields")}
          </p>
        </div>
      ) : (
        <div className="p11-detail-content">
          <div className="p11-detail-state">
            <CorrelationState state={row.state} label={labels[row.state]} />
            <span>
              {t("耗时", "Elapsed")}{" "}
              <b>{row.request && row.response ? `${row.elapsed} ms` : "—"}</b>
            </span>
          </div>
          <p className="p11-reason">{reason}</p>
          <div className="p11-packet-pair">
            {card(request, "request")}
            {card(response, "response")}
          </div>
          <section className="p11-field-comparison">
            <header>{t("字段对比（关联字段）", "Matching field comparison")}</header>
            <table>
              <thead>
                <tr>
                  <th>{t("字段", "Field")}</th>
                  <th>{t("请求值", "Request")}</th>
                  <th>{t("响应值", "Response")}</th>
                  <th>{t("对比", "Comparison")}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td title={`${rule?.requestField} → ${rule?.responseField}`}>
                    {redact(rule?.requestField ?? "—")}
                    <small>→ {redact(rule?.responseField ?? "—")}</small>
                  </td>
                  <td>{redact(left?.value ?? "—")}</td>
                  <td>{redact(right?.value ?? "—")}</td>
                  <td className={matches ? "p11-match" : ""}>
                    {!comparable ? "—" : matches ? t("一致", "Equal") : t("不同", "Different")}
                  </td>
                </tr>
              </tbody>
            </table>
          </section>
          <div
            className="p11-packet-tabs"
            role="tablist"
            aria-label={t("关联报文", "Correlation packets")}
          >
            <button
              type="button"
              role="tab"
              aria-selected={tab === "request"}
              onClick={() => setTab("request")}
            >
              {t("请求报文", "Request packet")}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "response"}
              onClick={() => setTab("response")}
            >
              {t("响应报文", "Response packet")}
            </button>
          </div>
          {packet ? (
            <div
              className="p11-packet-inspection"
              role="tabpanel"
              aria-label={
                tab === "request"
                  ? t("请求字段解析", "Request decoded fields")
                  : t("响应字段解析", "Response decoded fields")
              }
            >
              <div className="p11-raw">
                <code>{redact(packet.hex)}</code>
                <button
                  type="button"
                  aria-label={t("复制关联 HEX", "Copy correlation HEX")}
                  onClick={(event) => {
                    const owner = event.currentTarget.ownerDocument.defaultView ?? window;
                    void owner.navigator.clipboard
                      .writeText(redact(packet.hex))
                      .then(() => setCopyStatus(t("HEX 已复制", "HEX copied")))
                      .catch(() => setCopyStatus(t("复制失败", "Copy failed")));
                  }}
                >
                  <Copy size={13} />
                </button>
              </div>
              <header>
                {t("字段解析", "Decoded fields")} · {redact(packet.parsed?.messageName ?? "—")}
              </header>
              <table>
                <thead>
                  <tr>
                    <th>{t("字段名", "Field")}</th>
                    <th>{t("值", "Value")}</th>
                    <th>{t("类型", "Type")}</th>
                    <th>{t("字节范围", "Bytes")}</th>
                  </tr>
                </thead>
                <tbody>
                  {packet.parsed?.fields.map((field, fieldIndex) => (
                    <tr key={`${field.name}-${fieldIndex}`}>
                      <td>{redact(field.name)}</td>
                      <td>
                        {redact(field.value)}
                        {field.truncated ? "…" : ""}
                      </td>
                      <td>{field.type}</td>
                      <td>
                        {field.length ? `${field.offset}–${field.offset + field.length - 1}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(!packet.parsed || !packet.parsed.fields.length) && (
                <p className="p11-missing">
                  {redact(packet.parsed?.error || t("暂无已解析字段", "No decoded fields"))}
                </p>
              )}
              {copyStatus && <small role="status">{copyStatus}</small>}
            </div>
          ) : (
            <p className="p11-missing">{t("没有可显示的报文", "No packet available")}</p>
          )}
        </div>
      )}
    </aside>
  );
}
