import { useEffect, useState } from "react";
import {
  ArrowRight,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Copy,
  Search,
  XCircle,
} from "react-feather";
import type { TcpRecord } from "./bridge";
import type { Locale } from "./i18n";
import { clientLabel } from "./ServerPeers";

export default function ServerRecordDetail({
  record,
  locale,
  index,
  total,
  onStep,
  onDebug,
  onCopy,
}: {
  record: TcpRecord | null;
  locale: Locale;
  index: number;
  total: number;
  onStep: (step: number) => void;
  onDebug: (record: TcpRecord) => void;
  onCopy: (record: TcpRecord) => void;
}) {
  const t = (cn: string, en: string) => (locale === "zh-CN" ? cn : en);
  const [tab, setTab] = useState("hex");
  const [fieldName, setFieldName] = useState("");
  useEffect(() => setFieldName(""), [record?.id]);
  const parsed = record?.parsed;
  const field = parsed?.fields.find((item) => item.name === fieldName);
  const bytes = record?.hex.trim().split(/\s+/).filter(Boolean) ?? [];
  const direction = record?.direction === "FRAME" ? (record.flow ?? "RX") : record?.direction;
  const checksum = parsed?.checksum;
  return (
    <aside
      className="tcp-detail-panel tcp-server-detail"
      aria-label={t("报文详情", "Packet details")}
    >
      <header className="tcp-panel-heading">
        <strong>{t("报文详情", "Packet details")}</strong>
        <small>
          {index < 0 ? "—" : index + 1} / {total}
        </small>
        <button
          type="button"
          disabled={index <= 0}
          onClick={() => onStep(-1)}
          aria-label={t("上一条", "Previous record")}
        >
          <ChevronUp size={16} />
        </button>
        <button
          type="button"
          disabled={index < 0 || index >= total - 1}
          onClick={() => onStep(1)}
          aria-label={t("下一条", "Next record")}
        >
          <ChevronDown size={16} />
        </button>
      </header>
      {!record ? (
        <div className="tcp-detail-empty">
          <Search size={28} />
          <strong>{t("选择一条收发记录", "Select a traffic record")}</strong>
          <p>{t("查看 HEX、字段值与校验结果", "Inspect HEX, fields and checksum results")}</p>
        </div>
      ) : (
        <div className="tcp-detail-scroll">
          <dl className="tcp-server-summary">
            <dt>{t("时间", "Time")}</dt>
            <dd>
              {new Date(record.time).toLocaleString(locale, { hour12: false })}.
              {String(record.time % 1000).padStart(3, "0")}
            </dd>
            <dt>{t("客户端", "Client")}</dt>
            <dd>{record.peer > 0 ? `${clientLabel(record.peer)} (${record.address})` : "—"}</dd>
            <dt>{t("方向", "Direction")}</dt>
            <dd>
              {direction}{" "}
              {direction === "TX"
                ? t("（发送）", "(send)")
                : direction === "RX"
                  ? t("（接收）", "(receive)")
                  : ""}
            </dd>
            <dt>{t("消息名", "Message")}</dt>
            <dd>{parsed?.messageName || "—"}</dd>
            <dt>{t("长度", "Length")}</dt>
            <dd>{record.hex ? `${record.size} bytes` : "—"}</dd>
            <dt>{t("解析状态", "Parse state")}</dt>
            <dd className={`tcp-parse-state ${parsed?.status ?? "unparsed"}`}>
              {parsed?.status === "ok" ? (
                <CheckCircle size={16} />
              ) : parsed?.status === "error" ? (
                <XCircle size={16} />
              ) : null}
              {parsed?.status === "ok"
                ? t("解析成功", "Decoded")
                : parsed?.status === "error"
                  ? t("解析失败", "Decode failed")
                  : parsed?.status === "unmatched"
                    ? t("未匹配", "Unmatched")
                    : t("未解析", "Not decoded")}
            </dd>
          </dl>
          {record.detail && <p className="tcp-muted">{record.detail}</p>}
          {parsed?.error && (
            <p className="tcp-error" role="alert">
              {parsed.error}
            </p>
          )}
          <div
            className="tcp-section-tabs"
            role="tablist"
            aria-label={t("详情视图", "Detail views")}
          >
            {[
              ["hex", "HEX / ASCII"],
              ["fields", t("字段解析", "Fields")],
              ["raw", t("原始数据", "Raw data")],
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
            <div className="tcp-server-hex">
              <table>
                <tbody>
                  {Array.from({ length: Math.ceil(bytes.length / 8) }, (_, row) => (
                    <tr key={row}>
                      <th>{(row * 8).toString(16).toUpperCase().padStart(4, "0")}</th>
                      <td>
                        {bytes.slice(row * 8, row * 8 + 8).map((byte, column) => (
                          <span
                            key={column}
                            className={
                              field &&
                              row * 8 + column >= field.offset &&
                              row * 8 + column < field.offset + field.length
                                ? "selected"
                                : ""
                            }
                          >
                            {byte.toUpperCase()}
                          </span>
                        ))}
                      </td>
                      <td className="tcp-server-ascii">
                        {bytes
                          .slice(row * 8, row * 8 + 8)
                          .map((byte) => {
                            const code = parseInt(byte, 16);
                            return code >= 32 && code < 127 ? String.fromCharCode(code) : ".";
                          })
                          .join("")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!bytes.length && (
                <p className="tcp-muted">
                  {t("此事件没有报文字节", "This event has no packet bytes")}
                </p>
              )}
            </div>
          )}
          {tab === "raw" && (
            <section className="tcp-server-raw">
              <pre>{record.hex || "—"}</pre>
              <button type="button" disabled={!record.hex} onClick={() => onCopy(record)}>
                <Copy size={14} />
                {t("复制 HEX", "Copy HEX")}
              </button>
            </section>
          )}
          {tab !== "raw" && (
            <section className="tcp-server-fields">
              <h3>
                {t("字段值", "Field values")} {parsed?.messageName && `(${parsed.messageName})`}
              </h3>
              {parsed?.fields.length ? (
                <div className="tcp-field-scroll">
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
                      {parsed.fields.map((item) => (
                        <tr key={item.name} className={fieldName === item.name ? "selected" : ""}>
                          <td>
                            <button
                              type="button"
                              aria-pressed={fieldName === item.name}
                              onClick={() => setFieldName(fieldName === item.name ? "" : item.name)}
                              title={item.displayName || item.name}
                            >
                              {item.name}
                            </button>
                          </td>
                          <td title={item.value}>
                            {item.value}
                            {item.enumName && ` (${item.enumName})`}
                            {item.truncated && "…"}
                          </td>
                          <td>{item.type}</td>
                          <td>
                            {item.length
                              ? `${item.offset} - ${item.offset + item.length - 1}`
                              : "—"}
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
              {field?.bits?.map((bit) => (
                <p className="tcp-muted" key={bit.name}>
                  {bit.displayName || bit.name}: {bit.value} · bit {bit.bitOffset}–
                  {bit.bitOffset + bit.width - 1}
                </p>
              ))}
            </section>
          )}
          <section className="tcp-server-checksum">
            <h3>{t("校验结果", "Checksum result")}</h3>
            <p
              className={
                checksum === "pass"
                  ? "tcp-success"
                  : checksum === "fail"
                    ? "tcp-failure"
                    : "tcp-muted"
              }
            >
              {checksum === "pass" ? (
                <CheckCircle size={22} />
              ) : checksum === "fail" ? (
                <XCircle size={22} />
              ) : null}
              {checksum === "pass"
                ? t("校验通过", "Checksum passed")
                : checksum === "fail"
                  ? t("校验失败", "Checksum failed")
                  : t("未执行校验", "Checksum not checked")}
            </p>
          </section>
          <div className="tcp-server-detail-actions">
            <button type="button" disabled={!record.hex} onClick={() => onCopy(record)}>
              <Copy size={13} />
              {t("复制 HEX", "Copy HEX")}
            </button>
            <button type="button" disabled={!record.hex} onClick={() => onDebug(record)}>
              {t("送入调试", "Open in Debug")}
              <ArrowRight size={13} />
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
