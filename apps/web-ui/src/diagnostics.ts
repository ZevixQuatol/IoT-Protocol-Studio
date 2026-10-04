export type DiagnosticPage = "schema" | "debug" | "tcp" | "environments" | "settings";
export type DiagnosticLevel = "error" | "warn" | "info" | "debug";
export type Diagnostic = {
  id: number;
  time: number;
  page: DiagnosticPage;
  context: string;
  message: string;
  problem: boolean;
  session?: string;
  protocol?: string;
  level?: DiagnosticLevel;
  code?: string;
  path?: string;
  offset?: number;
  line?: number;
  column?: number;
  hex?: string;
  hexOffset?: number;
};
export type DiagnosticDetail = Pick<
  Diagnostic,
  "code" | "path" | "offset" | "line" | "column" | "hex" | "hexOffset"
>;

export const diagnosticLevel = (item: Diagnostic): DiagnosticLevel =>
  item.level ?? (item.problem ? "error" : "info");

export function diagnosticTime(time: number, milliseconds: boolean) {
  const date = new Date(time);
  const pad = (value: number, size = 2) => String(value).padStart(size, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${milliseconds ? `.${pad(date.getMilliseconds(), 3)}` : ""}`;
}

export function filterDiagnostics(
  items: Diagnostic[],
  filter: { level: string; source: string; search: string; start?: string; end?: string },
) {
  const start = filter.start ? new Date(filter.start).getTime() : -Infinity;
  const end = filter.end ? new Date(filter.end).getTime() + 999 : Infinity;
  const search = filter.search.trim().toLowerCase();
  return items
    .filter(
      (item) =>
        (filter.level === "all" || diagnosticLevel(item) === filter.level) &&
        (filter.source === "all" || item.page === filter.source) &&
        item.time >= start &&
        item.time <= end &&
        (!search ||
          `${item.context} ${item.message} ${item.code ?? ""} ${item.path ?? ""} ${item.protocol ?? ""} ${item.session ?? ""}`
            .toLowerCase()
            .includes(search)),
    )
    .sort((a, b) => b.time - a.time || b.id - a.id);
}

export function diagnosticAdvice(item: Diagnostic, zh: boolean) {
  const steps =
    item.page === "tcp"
      ? [
          zh
            ? "检查连接参数、设备状态和网络或串口可用性"
            : "Check connection settings, device state and network or serial availability",
          zh
            ? "打开相关会话，查看连接状态和收发记录"
            : "Open the related session and inspect its status and traffic",
        ]
      : item.page === "schema" || item.page === "debug"
        ? [
            zh
              ? "检查相关协议字段的类型、长度和字节序"
              : "Check the related protocol field type, length and byte order",
            zh
              ? "核对输入报文与协议定义，再执行校验或解析"
              : "Compare the input with the protocol, then validate or parse again",
          ]
        : [
            zh ? "检查操作参数与文件读写权限" : "Check operation parameters and file permissions",
            zh
              ? "返回相关页面，修正后重试"
              : "Return to the related page, correct the issue and retry",
          ];
  return steps;
}
