import type { TcpRecord } from "./bridge";
import type { Locale } from "./i18n";

export type RecordFilters = {
  connection: string;
  device: string;
  deviceField: string;
  message: string;
  start: string;
  end: string;
};
export const emptyFilters: RecordFilters = {
  connection: "",
  device: "",
  deviceField: "",
  message: "",
  start: "",
  end: "",
};
export const connectionKey = (record: TcpRecord) => JSON.stringify([record.address, record.peer]);
export const messageKey = (record: TcpRecord) =>
  record.parsed?.messageName
    ? JSON.stringify([record.parsed.protocolPath, record.parsed.messageName])
    : "unparsed";
export const deviceValue = (record: TcpRecord, field: string) =>
  (record.parsed?.status === "ok" && field
    ? record.parsed.fields.find((item) => item.name === field)?.value
    : undefined) ??
  record.device ??
  "";
export function timeFilterError(filters: RecordFilters): "invalid" | "reversed" | "" {
  const start = filters.start ? Date.parse(filters.start) : undefined;
  const end = filters.end ? Date.parse(filters.end) : undefined;
  if (
    (start !== undefined && !Number.isFinite(start)) ||
    (end !== undefined && !Number.isFinite(end))
  )
    return "invalid";
  if (start !== undefined && end !== undefined && start > end) return "reversed";
  return "";
}
export function matchesRecord(record: TcpRecord, filters: RecordFilters): boolean {
  return (
    !timeFilterError(filters) &&
    (!filters.connection || connectionKey(record) === filters.connection) &&
    (!filters.device ||
      JSON.stringify(deviceValue(record, filters.deviceField)) === filters.device) &&
    (!filters.message || messageKey(record) === filters.message) &&
    (!filters.start || record.time >= Date.parse(filters.start)) &&
    (!filters.end || record.time <= Date.parse(filters.end))
  );
}

export default function TrafficFilters({
  records,
  filters,
  onChange,
  locale,
  session,
  device,
  onDevice,
  disabled,
  sensitive,
}: {
  records: TcpRecord[];
  filters: RecordFilters;
  onChange: (filters: RecordFilters) => void;
  locale: Locale;
  session: string;
  device: string;
  onDevice: (identifier: string) => Promise<boolean>;
  disabled: boolean;
  sensitive: boolean;
}) {
  const t = (cn: string, en: string) => (locale === "zh-CN" ? cn : en);
  const options = (items: [string, string][]) =>
    [...new Map(items)].sort((a, b) => a[1].localeCompare(b[1]));
  const connections = options(
    records.map((item) => [
      connectionKey(item),
      `${item.address}${item.peer ? ` #${item.peer}` : ""}`,
    ]),
  );
  const messages = options(
    records.map((item) => [
      messageKey(item),
      item.parsed?.messageName
        ? `${item.parsed.protocolPath} / ${item.parsed.messageName}`
        : t("未解析 / 未识别", "Unparsed / unidentified"),
    ]),
  );
  const fields = [
    ...new Set(
      records.flatMap((item) =>
        item.parsed?.status === "ok" ? item.parsed.fields.map((field) => field.name) : [],
      ),
    ),
  ].sort();
  const devices = options(
    records.map((item) => {
      const value = deviceValue(item, filters.deviceField);
      return [JSON.stringify(value), value || t("无设备标识", "No device identifier")];
    }),
  );
  const change = (key: keyof RecordFilters, value: string) =>
    onChange({ ...filters, [key]: value });
  const select = (
    key: "connection" | "device" | "message",
    label: string,
    items: [string, string][],
  ) => (
    <label>
      {label}
      <select
        aria-label={label}
        value={filters[key]}
        onChange={(event) => change(key, event.target.value)}
      >
        <option value="">{t("全部", "All")}</option>
        {filters[key] && !items.some(([value]) => value === filters[key]) && (
          <option value={filters[key]}>{t("已无对应记录", "No retained matching records")}</option>
        )}
        {items.map(([value, name]) => (
          <option key={value} value={value}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
  const error = timeFilterError(filters);
  return (
    <details className="traffic-filters">
      <summary>
        {t("结构化筛选", "Structured filters")} · {session}
      </summary>
      <div className="traffic-filter-fields">
        <span>
          {t("会话", "Session")}: {session} ·{" "}
          {t("切换标签选择其他会话", "Select another session using its tab")}
        </span>
        {select("connection", t("筛选连接", "Filter connection"), connections)}
        <label>
          {t("设备标识字段", "Device identifier field")}
          <select
            aria-label={t("设备标识字段", "Device identifier field")}
            value={filters.deviceField}
            onChange={(event) =>
              onChange({ ...filters, deviceField: event.target.value, device: "" })
            }
          >
            <option value="">{t("使用会话配置", "Use session configuration")}</option>
            {filters.deviceField && !fields.includes(filters.deviceField) && (
              <option value={filters.deviceField}>{filters.deviceField}</option>
            )}
            {fields.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        {select("device", t("筛选设备", "Filter device"), devices)}
        {select("message", t("筛选消息类型", "Filter message type"), messages)}
        <label>
          {t("开始时间（本地）", "Start time (local)")}
          <input
            type="datetime-local"
            step="0.001"
            aria-label={t("筛选开始时间", "Filter start time")}
            value={filters.start}
            onChange={(event) => change("start", event.target.value)}
          />
        </label>
        <label>
          {t("结束时间（本地）", "End time (local)")}
          <input
            type="datetime-local"
            step="0.001"
            aria-label={t("筛选结束时间", "Filter end time")}
            value={filters.end}
            onChange={(event) => change("end", event.target.value)}
          />
        </label>
        <button type="button" onClick={() => onChange({ ...emptyFilters })}>
          {t("重置结构化筛选", "Reset structured filters")}
        </button>
      </div>
      {error && (
        <p role="alert">
          {error === "reversed"
            ? t("开始时间不能晚于结束时间。", "Start time must not be after end time.")
            : t("时间格式无效。", "Invalid time format.")}
        </p>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const input = event.currentTarget.elements.namedItem("device") as HTMLInputElement;
          void onDevice(input.value.trim());
        }}
      >
        <label>
          {t("当前会话设备标识", "Current session device identifier")}
          <input
            key={device}
            name="device"
            type={sensitive ? "password" : "text"}
            aria-label={t("当前会话设备标识", "Current session device identifier")}
            defaultValue={device}
            maxLength={128}
            disabled={disabled}
          />
        </label>
        <button type="submit" disabled={disabled}>
          {t("应用设备标识", "Apply device identifier")}
        </button>
        <small>
          {t(
            "应用后仅标记后续记录；历史记录不改写。消息类型筛选使用已解析的消息名，未解析 RX 保持独立。保存导出全部保留记录，不受筛选影响。",
            "Applies to subsequent records only; history is unchanged. Message filters use decoded message names; raw RX stays separate. Export includes all retained records regardless of filters.",
          )}
        </small>
      </form>
    </details>
  );
}
