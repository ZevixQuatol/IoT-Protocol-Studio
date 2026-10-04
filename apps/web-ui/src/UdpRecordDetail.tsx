import { useEffect, useState } from "react";
import { ArrowRight, CheckCircle, Copy, Search, XCircle } from "react-feather";
import type { TcpRecord } from "./bridge";
import type { Locale } from "./i18n";

export type UdpEndpoints = { source: string; target: string };

export default function UdpRecordDetail({
  record,
  endpoints,
  locale,
  onDebug,
  onCopy,
}: {
  record: TcpRecord | null;
  endpoints: UdpEndpoints;
  locale: Locale;
  onDebug: (record: TcpRecord) => void;
  onCopy: (record: TcpRecord) => void;
}) {
  const t = (cn: string, en: string) => (locale === "zh-CN" ? cn : en);
  const [tab, setTab] = useState("result");
  const [fieldName, setFieldName] = useState("");
  useEffect(() => setFieldName(""), [record?.id]);
  const parsed = record?.parsed;
  const field = parsed?.fields.find((item) => item.name === fieldName);
  const bytes = record?.hex.trim().split(/\s+/).filter(Boolean) ?? [];
  const checksum = parsed?.checksum;
  const fields = (
    <section className="udp-fields">
      {parsed?.fields.length ? (
        <div className="tcp-field-scroll">
          <table>
            <thead>
              <tr>
                <th>{t("字段名", "Field")}</th>
                <th>{t("值", "Value")}</th>
                <th>{t("类型", "Type")}</th>
                <th>{t("字节范围", "Byte range")}</th>
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
                  <td>{item.length ? `${item.offset}–${item.offset + item.length - 1}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="tcp-muted">{t("此记录没有已解析字段", "No decoded fields in this record")}</p>
      )}
      {field?.bits?.map((bit) => (
        <p key={bit.name}>
          {bit.displayName || bit.name}: {bit.value} · bit {bit.bitOffset}–
          {bit.bitOffset + bit.width - 1}
        </p>
      ))}
    </section>
  );
  return (
    <aside className="tcp-detail-panel udp-detail" aria-label={t("报文详情", "Packet details")}>
      <div className="tcp-section-tabs" role="tablist" aria-label={t("详情视图", "Detail views")}>
        {[
          ["result", t("报文详情", "Packet details")],
          ["raw", t("原始数据", "Raw data")],
          ["fields", t("字段视图", "Fields")],
        ].map(([value, label]) => (
          <button
            type="button"
            key={value}
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </div>
      {!record ? (
        <div className="tcp-detail-empty">
          <Search size={28} />
          <strong>{t("选择一条收发记录", "Select a traffic record")}</strong>
          <p>{t("查看来源、原始字节与解析字段", "Inspect endpoints, bytes and decoded fields")}</p>
        </div>
      ) : (
        <div className="tcp-detail-scroll">
          {tab === "result" && (
            <>
              <dl className="udp-summary">
                <dt>{t("消息类型", "Message")}</dt>
                <dd>{parsed?.messageName || "—"}</dd>
                <dt>{t("来源地址", "Source")}</dt>
                <dd
                  title={t(
                    "发送时显示本地绑定端点；通配地址不代表实际来源 IP",
                    "Sent packets show the local bind endpoint, not the actual source IP",
                  )}
                >
                  {endpoints.source}
                </dd>
                <dt>{t("目标 / 绑定", "Target / bind")}</dt>
                <dd
                  title={t(
                    "接收时显示本地绑定端点；通配地址不代表实际目标 IP",
                    "Received packets show the local bind endpoint, not the actual destination IP",
                  )}
                >
                  {endpoints.target}
                </dd>
                <dt>{t("收发时间", "Time")}</dt>
                <dd>
                  {new Date(record.time).toLocaleString(locale, { hour12: false })}.
                  {String(record.time % 1000).padStart(3, "0")}
                </dd>
                <dt>{t("长度", "Length")}</dt>
                <dd>{record.hex ? `${record.size} bytes` : "—"}</dd>
                <dt>{t("解析状态", "Parse state")}</dt>
                <dd className={`tcp-parse-state ${parsed?.status ?? "unparsed"}`}>
                  {parsed?.status === "ok" ? (
                    <CheckCircle size={15} />
                  ) : parsed?.status === "error" ? (
                    <XCircle size={15} />
                  ) : null}
                  {parsed?.status === "ok"
                    ? t("解析成功", "Decoded")
                    : parsed?.status === "error"
                      ? t("解析失败", "Decode failed")
                      : parsed?.status === "unmatched"
                        ? t("未匹配消息", "Unmatched")
                        : record.direction === "SYS"
                          ? "—"
                          : t("未解析", "Not decoded")}
                </dd>
                <dt>{t("CRC / 校验", "Checksum")}</dt>
                <dd
                  className={
                    checksum === "pass"
                      ? "tcp-success"
                      : checksum === "fail"
                        ? "tcp-failure"
                        : "tcp-muted"
                  }
                >
                  {checksum === "pass" ? (
                    <CheckCircle size={15} />
                  ) : checksum === "fail" ? (
                    <XCircle size={15} />
                  ) : null}
                  {checksum === "pass"
                    ? t("校验通过", "Passed")
                    : checksum === "fail"
                      ? t("校验失败", "Failed")
                      : t("未执行校验", "Not checked")}
                </dd>
              </dl>
              {record.direction === "SYS" && <p className="tcp-muted">{record.detail}</p>}
            </>
          )}
          {parsed?.error && (
            <p className="tcp-error" role="alert">
              {parsed.error}
            </p>
          )}
          {tab !== "raw" && fields}
          {tab !== "result" && (
            <section className="udp-raw">
              <div className="tcp-server-hex">
                <table>
                  <tbody>
                    {Array.from({ length: Math.ceil(bytes.length / 8) }, (_, row) => (
                      <tr key={row}>
                        <th>{(row * 8).toString(16).toUpperCase().padStart(4, "0")}</th>
                        <td>
                          {bytes.slice(row * 8, row * 8 + 8).map((byte, col) => (
                            <span
                              key={col}
                              className={
                                field &&
                                row * 8 + col >= field.offset &&
                                row * 8 + col < field.offset + field.length
                                  ? "selected"
                                  : ""
                              }
                            >
                              {byte}
                            </span>
                          ))}
                        </td>
                        <td className="tcp-server-ascii">
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
              {!bytes.length && (
                <p className="tcp-muted">
                  {t("此事件没有报文字节", "No packet bytes in this event")}
                </p>
              )}
            </section>
          )}
          <div className="udp-detail-actions">
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
