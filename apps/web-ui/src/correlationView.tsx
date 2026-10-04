import { AlertTriangle, CheckCircle, Clock, XCircle } from "react-feather";
import type { CorrelationRow, TcpRecord } from "./bridge";

export const rowKey = (row: CorrelationRow) => `${row.request}/${row.response}/${row.state}`;
export const recordField = (record: TcpRecord | undefined, name: string) =>
  record?.parsed?.fields.find((field) => field.name === name)?.value ?? "";
export const deviceValue = (record: TcpRecord | undefined) =>
  record?.device ||
  record?.parsed?.fields.find((field) => field.name.toLowerCase() === "deviceid")?.value ||
  "";
export const timeLabel = (time: number | undefined) =>
  time === undefined
    ? "—"
    : new Date(time).toLocaleTimeString("en-GB", { hour12: false }) +
      `.${String(new Date(time).getMilliseconds()).padStart(3, "0")}`;
export function CorrelationState({
  state,
  label,
}: {
  state: CorrelationRow["state"];
  label: string;
}) {
  const Icon =
    state === "matched"
      ? CheckCircle
      : state === "pending" || state === "timeout"
        ? Clock
        : state === "unmatched" || state === "skipped"
          ? XCircle
          : AlertTriangle;
  return (
    <span className="p11-state" data-state={state}>
      <Icon size={14} />
      {label}
    </span>
  );
}
