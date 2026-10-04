import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  Copy,
  MapPin,
  Radio,
  Search,
  X,
  XCircle,
} from "react-feather";
import type { TcpRecord } from "./bridge";
import type { Locale } from "./i18n";

export default function TcpRecordDetail({
  record,
  locale,
  onClose,
  onDebug,
  onCopy,
  onStep,
  previous,
  next,
  serial = false,
  compact = false,
  collapsed = false,
  onLocate,
}: {
  record: TcpRecord | null;
  locale: Locale;
  onClose: () => void;
  onDebug: (record: TcpRecord) => void;
  onCopy: (record: TcpRecord) => void;
  onStep: (step: number) => void;
  previous: boolean;
  next: boolean;
  serial?: boolean;
  compact?: boolean;
  collapsed?: boolean;
  onLocate?: () => void;
}) {
  const t = (cn: string, en: string) => (locale === "zh-CN" ? cn : en);
  const [tab, setTab] = useState("result");
  const [fieldName, setFieldName] = useState("");
  useEffect(() => setTab(compact ? "raw" : "result"), [serial, compact]);
  useEffect(() => setFieldName(""), [record?.id]);
  const parsed = record?.parsed;
  const field = parsed?.fields.find((item) => item.name === fieldName);
  const bytes = record?.hex.trim().split(/\s+/).filter(Boolean) ?? [];
  const state = !parsed
    ? t("未解析", "Not decoded")
    : parsed.status === "ok"
      ? t("解析成功", "Decoded")
      : parsed.status === "unmatched"
        ? t("未匹配消息", "Message not matched")
        : t("解析失败", "Decode failed");
  return (
    <aside
      className={`tcp-detail-panel ${compact ? "tcp-popup-detail" : ""}`}
      hidden={collapsed}
      aria-label={t("报文详情", "Packet details")}
    >
      <header className="tcp-panel-heading">
        <strong>{t("报文详情", "Packet details")}</strong>
        {compact && (
          <button type="button" disabled={!record} onClick={onLocate} className="tcp-locate-record">
            <MapPin size={14} />
            {t("在记录中定位", "Locate record")}
          </button>
        )}
        <button
          type="button"
          disabled={!previous}
          onClick={() => onStep(-1)}
          aria-label={t("上一条", "Previous record")}
          title={t("上一条", "Previous record")}
        >
          <ArrowLeft size={14} />
        </button>
        <button
          type="button"
          disabled={!next}
          onClick={() => onStep(1)}
          aria-label={t("下一条", "Next record")}
          title={t("下一条", "Next record")}
        >
          <ArrowRight size={14} />
        </button>
        <button
          type="button"
          disabled={!record}
          onClick={onClose}
          aria-label={t("关闭详情", "Close details")}
          title={t("关闭详情", "Close details")}
        >
          <X size={14} />
        </button>
      </header>
      {compact && record && (
        <section className="tcp-popup-message">
          <h2>
            {parsed?.messageName || record.detail || t("原始数据", "Raw data")}
            <small>{record.direction === "FRAME" ? (record.flow ?? "RX") : record.direction}</small>
          </h2>
          <p>
            <span>
              {t("时间", "Time")} {new Date(record.time).toLocaleString(locale, { hour12: false })}.
              {String(record.time % 1000).padStart(3, "0")}
            </span>
            <span>
              {t("长度", "Length")} {record.size} bytes
            </span>
          </p>
          {parsed?.error && (
            <p className="tcp-error" role="alert">
              {parsed.error}
            </p>
          )}
        </section>
      )}
      <div className="tcp-section-tabs" role="tablist" aria-label={t("详情视图", "Detail views")}>
        {(compact
          ? [
              ["raw", "HEX"],
              ["fields", t("字段", "Fields")],
              ["checksum", t("校验", "Checksum")],
            ]
          : [
              ["result", serial ? t("报文详情", "Packet details") : t("解析结果", "Parse result")],
              ["raw", serial ? "HEX / ASCII" : t("原始数据", "Raw data")],
              ["fields", serial ? t("字段解析", "Field decode") : t("字段视图", "Fields")],
              ...(serial ? [["checksum", t("校验", "Checksum")]] : []),
            ]
        ).map(([id, label]) => (
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
      {!record ? (
        <div className="tcp-detail-empty">
          <Search size={28} />
          <strong>{t("选择一条收发记录", "Select a traffic record")}</strong>
          <p>{t("查看原始字节、字段值与校验结果", "Inspect bytes, fields and checksum results")}</p>
        </div>
      ) : (
        <div className="tcp-detail-scroll">
          <section className="tcp-detail-summary" hidden={compact || tab !== "result"}>
            <strong className={`tcp-parse-state ${parsed?.status ?? "unparsed"}`}>
              {parsed?.status === "ok" ? (
                <CheckCircle size={16} />
              ) : parsed?.status === "error" ? (
                <XCircle size={16} />
              ) : (
                <Radio size={16} />
              )}
              {state}
            </strong>
            <dl>
              <dt>{t("消息名", "Message")}</dt>
              <dd>{parsed?.messageName || "—"}</dd>
              <dt>{t("方向", "Direction")}</dt>
              <dd>
                {record.direction === "FRAME" ? `FRAME · ${record.flow ?? "RX"}` : record.direction}
              </dd>
              <dt>{t("时间", "Time")}</dt>
              <dd>
                {new Date(record.time).toLocaleString(locale, { hour12: false })}.
                {String(record.time % 1000).padStart(3, "0")}
              </dd>
              <dt>{t("长度", "Length")}</dt>
              <dd>
                {record.size} {t("字节", "bytes")}
              </dd>
              <dt>{t("连接", "Peer")}</dt>
              <dd>
                {record.address || "—"}
                {record.peer > 0 && ` #${record.peer}`}
              </dd>
              {record.detail && (
                <>
                  <dt>{t("描述", "Description")}</dt>
                  <dd>{record.detail}</dd>
                </>
              )}
            </dl>
            {parsed?.error && (
              <p role="alert" className="tcp-error">
                {parsed.error}
              </p>
            )}
          </section>
          <section
            className="tcp-detail-fields"
            hidden={tab === "checksum" || (!compact && tab === "raw")}
          >
            <h3>
              {t("字段列表", "Fields")}
              {parsed && <small>{parsed.messageName}</small>}
            </h3>
            {parsed?.fields.length ? (
              <div className="tcp-field-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>{t("字段名", "Field")}</th>
                      {compact && <th>HEX</th>}
                      <th>{t("值", "Value")}</th>
                      <th>{t("类型", "Type")}</th>
                      <th>{t("字节范围", "Byte range")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.fields.map((item) => (
                      <tr
                        key={item.name}
                        className={fieldName === item.name ? "selected" : ""}
                        onClick={() => setFieldName(item.name)}
                      >
                        <td>
                          <button
                            type="button"
                            title={item.displayName || item.name}
                            aria-pressed={fieldName === item.name}
                          >
                            {item.name}
                          </button>
                        </td>
                        {compact && (
                          <td className="tcp-popup-field-hex">
                            {item.redacted || item.truncated
                              ? "—"
                              : bytes.slice(item.offset, item.offset + item.length).join(" ") ||
                                "—"}
                          </td>
                        )}
                        <td title={item.value}>
                          {item.enumName ? `${item.enumName} (${item.value})` : item.value}
                          {item.truncated && "…"}
                        </td>
                        <td>{item.type}</td>
                        <td>
                          {item.length ? `${item.offset} - ${item.offset + item.length - 1}` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="tcp-muted">
                {t("此记录没有已解析字段", "No decoded fields in this record")}
              </p>
            )}
            {field && (
              <div className="tcp-field-description" hidden={tab !== "fields"}>
                <strong>{field.displayName || field.name}</strong>
                <p>
                  {field.name} · {field.type}
                </p>
                <code>{field.value}</code>
                {field.bits?.map((bit) => (
                  <p key={bit.name}>
                    {bit.displayName || bit.name}: {bit.value} · bit {bit.bitOffset}–
                    {bit.bitOffset + bit.width - 1}
                  </p>
                ))}
              </div>
            )}
          </section>
          <section className="tcp-detail-raw" hidden={tab === "fields" || tab === "checksum"}>
            <h3>
              {t("原始数据", "Raw data")} <small>HEX / ASCII</small>
              <button
                type="button"
                disabled={!record.hex}
                onClick={() => onCopy(record)}
                aria-label={t("复制 HEX", "Copy HEX")}
                title={t("复制 HEX", "Copy HEX")}
              >
                <Copy size={13} />
              </button>
            </h3>
            {bytes.length ? (
              <div className="tcp-raw-scroll">
                <table>
                  <tbody>
                    {Array.from({ length: Math.ceil(bytes.length / 8) }, (_, row) => (
                      <tr key={row}>
                        <th>{(row * 8).toString(16).toUpperCase().padStart(4, "0")}</th>
                        <td>
                          {bytes.slice(row * 8, row * 8 + 8).map((byte, index) => (
                            <span
                              key={index}
                              className={
                                field &&
                                row * 8 + index >= field.offset &&
                                row * 8 + index < field.offset + field.length
                                  ? "selected"
                                  : ""
                              }
                            >
                              {byte.toUpperCase()}{" "}
                            </span>
                          ))}
                        </td>
                        <td>
                          {bytes
                            .slice(row * 8, row * 8 + 8)
                            .map((byte) => {
                              const value = parseInt(byte, 16);
                              return value >= 32 && value < 127 ? String.fromCharCode(value) : ".";
                            })
                            .join("")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="tcp-muted">
                {t("此事件没有报文字节", "This event has no packet bytes")}
              </p>
            )}
          </section>
          <section className="tcp-detail-checksum" hidden={!compact && tab === "raw"}>
            <h3>{t("校验结果", "Checksum result")}</h3>
            <p
              className={
                parsed?.checksum === "pass"
                  ? "tcp-success"
                  : parsed?.checksum === "fail"
                    ? "tcp-failure"
                    : "tcp-muted"
              }
            >
              {parsed?.checksum === "pass" ? (
                <CheckCircle size={16} />
              ) : parsed?.checksum === "fail" ? (
                <XCircle size={16} />
              ) : null}
              {parsed?.checksum === "pass"
                ? t("校验通过", "Checksum passed")
                : parsed?.checksum === "fail"
                  ? t("校验失败", "Checksum failed")
                  : t("未执行校验", "Checksum not checked")}
            </p>
          </section>
          <button
            className="tcp-open-debug"
            type="button"
            disabled={!record.hex}
            onClick={() => onDebug(record)}
          >
            {t("送入调试", "Open in Debug")}
            <ArrowRight size={14} />
          </button>
        </div>
      )}
    </aside>
  );
}
