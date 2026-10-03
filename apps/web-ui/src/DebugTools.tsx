import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeftRight,
  Binary,
  CheckCircle2,
  Clock3,
  Copy,
  FileJson,
  Hash,
  Search,
  SlidersHorizontal,
  X,
  Wrench,
  CircleAlert,
  ChevronRight,
} from "lucide-react";
import {
  interpretBytes,
  readAnnotationFile,
  type DebugAnnotation,
  type DebugRange,
} from "./debugView";
export type { DebugAnnotation, DebugRange } from "./debugView";
import {
  debugDecode,
  debugFile,
  debugTool,
  inspectHex,
  type DebugField,
  type InspectionResult,
  type TcpRecord,
  type WorkspaceProject,
} from "./bridge";
import type { Locale } from "./i18n";

const formats = [
  "hex",
  "binary",
  "decimal",
  "ascii",
  "utf8",
  "base64",
  "int8",
  "uint8",
  "int16",
  "uint16",
  "int32",
  "uint32",
  "int64",
  "uint64",
  "float32",
  "float64",
  "bcd",
  "timestamp-s",
  "timestamp-ms",
];
const presets: Record<string, string[]> = {
  CRC8: ["8", "07", "00", "0", "0", "00"],
  "CRC16/MODBUS": ["16", "8005", "FFFF", "1", "1", "0000"],
  "CRC16/CCITT-FALSE": ["16", "1021", "FFFF", "0", "0", "0000"],
  "CRC16/XMODEM": ["16", "1021", "0000", "0", "0", "0000"],
  CRC32: ["32", "04C11DB7", "FFFFFFFF", "1", "1", "FFFFFFFF"],
  "Custom CRC": ["16", "1021", "FFFF", "0", "0", "0000"],
};

type Props = {
  locale: Locale;
  input: string;
  result?: InspectionResult;
  annotations: DebugAnnotation[];
  project: WorkspaceProject | null | undefined;
  dirty: boolean;
  byteOffset: { offset: number } | null;
  handoff: { seq: number; record: TcpRecord } | null;
  onRange: (range: DebugRange) => void;
  range: DebugRange;
  toolbar: ReactNode;
  renderBytes: (fields: DebugField[]) => ReactNode;
  onInspect: () => Promise<InspectionResult | undefined>;
  onInput: (value: string) => void;
  onImport: (result: InspectionResult & { ok: true }, annotations: DebugAnnotation[]) => void;
  onIssue: (context: string, message: string) => void;
};

export default function DebugTools(props: Props) {
  const zh = props.locale === "zh-CN";
  const t = (cn: string, en: string) => (zh ? cn : en);
  const [tool, setTool] = useState("convert");
  const [toolsOpen, setToolsOpen] = useState(false);
  const [decodeState, setDecodeState] = useState<"idle" | "pass" | "none" | "fail">("idle");
  const [decodeError, setDecodeError] = useState<{
    code: string;
    message: string;
    path?: string;
    offset?: number;
  }>();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState(false);
  const [source, setSource] = useState("");
  const [from, setFrom] = useState("hex");
  const [to, setTo] = useState("binary");
  const [order, setOrder] = useState("big");
  const [output, setOutput] = useState<{ text: string; hex: string }>();
  const [bitOperation, setBitOperation] = useState("XOR");
  const [operand, setOperand] = useState("FF");
  const [search, setSearch] = useState("");
  const [replacement, setReplacement] = useState("");
  const [matches, setMatches] = useState<number[]>([]);
  const [matchIndex, setMatchIndex] = useState(-1);
  const [algorithm, setAlgorithm] = useState("CRC16/MODBUS");
  const [crc, setCrc] = useState(presets["CRC16/MODBUS"]);
  const [start, setStart] = useState("0");
  const [end, setEnd] = useState("");
  const [protocolPath, setProtocolPath] = useState("");
  const [messageName, setMessageName] = useState("");
  const [fields, setFields] = useState<DebugField[]>([]);
  const [ranges, setRanges] = useState<{ path: string; offset: number; length: number }[]>([]);
  const [activeField, setActiveField] = useState<string>();
  const updateCrc = (index: number, value: string) => {
    setAlgorithm("Custom CRC");
    setCrc(crc.map((item, i) => (i === index ? value : item)));
  };
  const protocol = props.project?.protocols.find((p) => p.path === protocolPath);
  const valid = props.result?.ok ? props.result : undefined;
  const snapshot = JSON.stringify([
    props.input.replace(/\s/g, "").toUpperCase(),
    props.project,
    props.dirty,
    tool,
    source,
    from,
    to,
    order,
    bitOperation,
    operand,
    search,
    replacement,
    algorithm,
    crc,
    start,
    end,
    protocolPath,
    messageName,
  ]);
  const live = useRef(snapshot);
  live.current = snapshot;
  const working = useRef(false);
  useEffect(() => {
    live.current = snapshot;
    return () => {
      live.current = "unmounted";
    };
  }, []);
  useEffect(() => {
    setOutput(undefined);
    setStatus("");
  }, [snapshot]);
  useEffect(() => {
    setFields([]);
    setRanges([]);
    setDecodeState("idle");
    setDecodeError(undefined);
    setActiveField(undefined);
    setMatches([]);
    setMatchIndex(-1);
    props.onRange(null);
  }, [
    props.input.replace(/\s/g, "").toUpperCase(),
    props.project,
    props.dirty,
    protocolPath,
    messageName,
  ]);
  useEffect(() => {
    if (!props.handoff?.record.parsed) return;
    setProtocolPath(props.handoff.record.parsed.protocolPath);
    setMessageName(props.handoff.record.parsed.messageName);
  }, [props.handoff]);
  useEffect(() => {
    const parsed = props.handoff?.record.parsed;
    if (
      !props.result?.ok ||
      !parsed ||
      parsed.status !== "ok" ||
      props.input.replace(/\s/g, "").toUpperCase() !==
        props.handoff?.record.hex.replace(/\s/g, "").toUpperCase() ||
      protocolPath !== parsed.protocolPath ||
      messageName !== parsed.messageName
    )
      return;
    setFields(parsed.fields);
    setDecodeState(
      parsed.checksum === "pass" ? "pass" : parsed.checksum === "fail" ? "fail" : "none",
    );
  }, [props.handoff, props.result, protocolPath, messageName]);

  const focusField = (field: DebugField, scrollBytes: boolean) => {
    setActiveField(field.name);
    if (field.length) props.onRange({ start: field.offset, end: field.offset + field.length - 1 });
    if (scrollBytes)
      document.getElementById(`debug-byte-${field.offset}`)?.scrollIntoView({ block: "nearest" });
    else document.getElementById(`debug-field-${field.name}`)?.scrollIntoView({ block: "nearest" });
  };
  useEffect(() => {
    if (props.byteOffset === null || !fields.length) return;
    const field = fields.find(
      (f) => props.byteOffset!.offset >= f.offset && props.byteOffset!.offset < f.offset + f.length,
    );
    if (field) focusField(field, false);
    else {
      setActiveField(undefined);
      props.onRange(null);
    }
  }, [props.byteOffset, fields]);

  const run = async (action: (current: () => boolean) => Promise<void>) => {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setStatus("");
    setError(false);
    const captured = live.current;
    const current = () => live.current === captured;
    try {
      await action(current);
    } catch (e) {
      if (current()) {
        setError(true);
        setStatus(e instanceof Error ? e.message : String(e));
        props.onIssue(
          tool === "protocol" ? protocolPath : tool,
          e instanceof Error ? e.message : String(e),
        );
      }
    } finally {
      working.current = false;
      setBusy(false);
    }
  };
  const assertOk = <
    T extends {
      ok: boolean;
      error?: { code: string; message: string; path?: string; offset?: number };
    },
  >(
    value: T,
  ): Extract<T, { ok: true }> => {
    if (!value.ok)
      throw new Error(
        value.error?.code === "native_host_required"
          ? t("请在 Windows 桌面客户端使用此功能。", "Use this feature in the Windows desktop app.")
          : `[${value.error?.code}] ${value.error?.message} ${value.error?.path ?? ""}${value.error?.offset !== undefined ? ` @ ${value.error.offset}` : ""}`,
      );
    return value as Extract<T, { ok: true }>;
  };
  const useMatch = (offsets: number[], index: number) => {
    setMatchIndex(index);
    const offset = offsets[index];
    if (offset !== undefined) {
      props.onRange({
        start: offset,
        end: offset + search.replace(/0x|[\s,:_-]/gi, "").length / 2 - 1,
      });
      document.getElementById(`debug-byte-${offset}`)?.scrollIntoView({ block: "nearest" });
    }
  };

  useEffect(() => {
    if (protocolPath && !props.project?.protocols.some((p) => p.path === protocolPath)) {
      setProtocolPath("");
      setMessageName("");
    }
  }, [props.project, protocolPath]);
  const parse = () =>
    run(async (current) => {
      setFields([]);
      setRanges([]);
      setDecodeState("idle");
      setDecodeError(undefined);
      props.onRange(null);
      const raw = await props.onInspect();
      if (!current() || !raw?.ok || !protocol || !messageName || props.dirty) return;
      const decoded = await debugDecode(protocolPath, messageName, raw.normalizedHex);
      if (!current()) return;
      if (decoded.ok) {
        setFields(decoded.fields);
        setRanges(decoded.ranges ?? []);
        setDecodeState(decoded.checksum === "pass" ? "pass" : "none");
      } else {
        setDecodeState("fail");
        setDecodeError(decoded.error);
        props.onIssue(protocolPath, decoded.error.message);
      }
    });
  const chooseTool = (value: string) => {
    setTool(value);
    if (["convert", "reverse", "bcd", "timestamp"].includes(value)) {
      setFrom("hex");
      setTo(
        value === "reverse"
          ? "reverse"
          : value === "bcd"
            ? "bcd"
            : value === "timestamp"
              ? "timestamp-s"
              : "binary",
      );
    }
  };
  const selection =
    props.range ??
    (props.byteOffset ? { start: props.byteOffset.offset, end: props.byteOffset.offset } : null);
  const selected = selection
    ? fields
        .flatMap((field) => [
          field,
          ...(field.bits ?? []).map((bit) => ({
            ...field,
            name: `${field.name}.${bit.name}`,
            displayName: bit.displayName,
            value: bit.value,
            offset: bit.offset,
            length: bit.length,
          })),
        ])
        .find(
          (field) =>
            field.name === activeField &&
            selection.start >= field.offset &&
            selection.end < field.offset + field.length,
        )
    : undefined;
  const selectedNote = selection
    ? [...props.annotations]
        .reverse()
        .find((note) => selection.start >= note.start && selection.end <= note.end)
    : undefined;
  const numeric = interpretBytes(
    valid && selection ? valid.bytes.slice(selection.start, selection.end + 1) : [],
    (selected?.byteOrder ?? protocol?.schema.defaultByteOrder) === "little",
  );
  const detailRows = (rows: string[][]) => (
    <dl>
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );

  return (
    <section className="debug-workbench" aria-label={t("调试工具", "Debug tools")}>
      <header className="debug-workbench-title">
        <h1>{t("HEX 报文调试与解析", "HEX debugging and analysis")}</h1>
        <button aria-expanded={toolsOpen} onClick={() => setToolsOpen(!toolsOpen)}>
          <Wrench size={18} />
          {t("调试工具", "Debug tools")}
        </button>
      </header>
      <div className="debug-workbench-toolbar">
        {props.toolbar}
        <label>
          {t("协议", "Protocol")}
          <select
            aria-label={t("调试协议", "Debug protocol")}
            value={protocolPath}
            disabled={busy}
            onChange={(event) => {
              setProtocolPath(event.target.value);
              setMessageName(
                props.project?.protocols.find((p) => p.path === event.target.value)?.schema
                  .messages[0]?.name ?? "",
              );
            }}
          >
            <option value="">{t("仅 HEX", "HEX only")}</option>
            {props.project?.protocols.map((p) => (
              <option key={p.path} value={p.path}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        {protocol && (
          <select
            aria-label={t("调试消息", "Debug message")}
            value={messageName}
            disabled={busy}
            onChange={(event) => setMessageName(event.target.value)}
          >
            <option value="">{t("选择消息", "Select message")}</option>
            {protocol.schema.messages.map((m) => (
              <option key={m.name} value={m.name}>
                {m.name}
              </option>
            ))}
          </select>
        )}
        <button
          className="primary debug-parse-button"
          disabled={
            busy ||
            !props.input.trim() ||
            /[^\da-f\s]/i.test(props.input) ||
            props.input.replace(/\s/g, "").length % 2 !== 0 ||
            (!!protocol && (!messageName || props.dirty))
          }
          onClick={() => void parse()}
        >
          {busy ? t("正在解析", "Inspecting") : t("解析", "Inspect")}
        </button>
      </div>
      {props.dirty && protocol && (
        <p className="debug-workbench-warning" role="alert">
          {t("请先保存协议代码修改，再解析报文。", "Save protocol changes before decoding.")}
        </p>
      )}
      <div className={`debug-workbench-body ${toolsOpen ? "tools-open" : ""}`}>
        <div className="debug-data-column">
          {props.renderBytes(fields)}
          <section
            className="debug-selected-details"
            aria-label={t("选中字节详情", "Selected byte details")}
          >
            <div>
              <h2>{t("选中字节详情", "Selected byte details")}</h2>
              {detailRows([
                [t("字段名", "Field"), selected?.name ?? "—"],
                [t("类型", "Type"), selected?.type ?? "—"],
                [
                  t("字节范围", "Byte range"),
                  selection ? `${selection.start}–${selection.end}` : "—",
                ],
                [
                  "HEX",
                  numeric.hex.length > 192 ? `${numeric.hex.slice(0, 192)}…` : numeric.hex || "—",
                ],
                [
                  t("解析值", "Decoded value"),
                  selected?.redacted ? t("已隐藏", "Redacted") : (selected?.value ?? "—"),
                ],
              ])}
            </div>
            <div>
              <h2>{t("数据解释", "Interpretation")}</h2>
              {detailRows([
                [t("十进制（无符号）", "Unsigned decimal"), numeric.unsigned],
                [t("十进制（有符号）", "Signed decimal"), numeric.signed],
                [t("二进制", "Binary"), numeric.binary],
                [t("浮点数", "Floating point"), numeric.float],
                [
                  t("字节序", "Byte order"),
                  selected?.byteOrder ?? protocol?.schema.defaultByteOrder ?? "big",
                ],
              ])}
            </div>
            <div>
              <h2>{t("字段备注", "Field note")}</h2>
              <p>{selectedNote?.note || selectedNote?.label || "—"}</p>
            </div>
          </section>
        </div>
        <section className="debug-decoded-panel" aria-label={t("解析结果", "Decoded result")}>
          <header>
            <strong>
              {protocol
                ? `${protocol.name} / ${messageName || "—"}`
                : t("解析结果", "Decoded result")}
            </strong>
            {decodeState !== "idle" && (
              <span className={decodeState === "fail" ? "failure" : "success"}>
                {decodeState === "fail" ? <CircleAlert size={17} /> : <CheckCircle2 size={17} />}
                {decodeState === "pass"
                  ? t("校验通过", "Checksum passed")
                  : decodeState === "fail"
                    ? t("解析失败", "Decode failed")
                    : t("解析成功", "Decoded")}
              </span>
            )}
            {valid && <small>{valid.byteCount} B</small>}
          </header>
          <div className="debug-fields-scroll">
            <table className="debug-fields-table">
              <thead>
                <tr>
                  <th>{t("字段", "Field")}</th>
                  <th>{t("类型", "Type")}</th>
                  <th>{t("值", "Value")}</th>
                  <th>{t("字节范围", "Byte range")}</th>
                </tr>
              </thead>
              <tbody>
                {ranges
                  .filter((range) => range.length > 0)
                  .map((range) => (
                    <tr key={range.path}>
                      <td colSpan={3}>
                        <button
                          onClick={() =>
                            focusField(
                              {
                                name: range.path,
                                displayName: "",
                                type: "struct",
                                value: "",
                                offset: range.offset,
                                length: range.length,
                              },
                              true,
                            )
                          }
                        >
                          <ChevronRight size={13} />
                          {range.path}
                        </button>
                      </td>
                      <td>
                        {range.offset}–{range.offset + range.length - 1}
                      </td>
                    </tr>
                  ))}
                {fields.map((field) => (
                  <FieldRows
                    key={field.name}
                    field={field}
                    active={activeField}
                    onFocus={(field) => focusField(field, true)}
                  />
                ))}
              </tbody>
            </table>
          </div>
          {decodeError && (
            <div className="debug-decode-error" role="alert">
              <strong>
                <CircleAlert size={17} />
                {t("问题列表", "Problems")} · 1
              </strong>
              <p>
                [{decodeError.code}] {decodeError.path} · {decodeError.message}
              </p>
              {decodeError.offset !== undefined && (
                <button
                  onClick={() => {
                    props.onRange({ start: decodeError.offset!, end: decodeError.offset! });
                    document
                      .getElementById(`debug-byte-${decodeError.offset}`)
                      ?.scrollIntoView({ block: "nearest" });
                  }}
                >
                  {t("跳转", "Jump")} · {decodeError.offset}
                </button>
              )}
            </div>
          )}
        </section>
        <aside
          className="debug-tools-dock"
          aria-label={t("工具面板", "Tools panel")}
          hidden={!toolsOpen}
        >
          <header>
            <strong>{t("工具面板", "Tools panel")}</strong>
            <button
              aria-label={t("关闭工具面板", "Close tools panel")}
              onClick={() => setToolsOpen(false)}
            >
              <X size={18} />
            </button>
          </header>
          <div className="debug-tools-dock-body">
            <nav aria-label={t("调试工具", "Debug tools")}>
              {toolItems.map(([value, cn, en, Icon]) => (
                <button
                  key={value}
                  className={tool === value ? "active" : ""}
                  aria-pressed={tool === value}
                  onClick={() => chooseTool(value)}
                >
                  <Icon size={18} />
                  {t(cn, en)}
                </button>
              ))}
            </nav>
            <div className="debug-tool-content">
              <h2>
                {t(
                  toolItems.find((item) => item[0] === tool)?.[1] ?? "数值转换",
                  toolItems.find((item) => item[0] === tool)?.[2] ?? "Data conversion",
                )}
              </h2>
              {tool === "files" && (
                <>
                  <p>
                    {t(
                      "保存报文及标注；导入将替换当前报文和标注。最多 64 KiB 报文、1000 条标注，每条说明最多 160 字符。",
                      "Save bytes and annotations. Import replaces them. Up to 64 KiB, 1000 annotations, 160 characters per label.",
                    )}
                  </p>
                  <div className="debug-tool-actions">
                    <button
                      type="button"
                      disabled={busy || !valid}
                      onClick={() =>
                        void run(async (current) => {
                          if (!valid) return;
                          const content = JSON.stringify(
                            {
                              kind: "iotps-debug",
                              version: 1,
                              hex: valid.normalizedHex,
                              annotations: props.annotations.map(
                                ({ start, end, label, color, note }) => ({
                                  start,
                                  end,
                                  label,
                                  color,
                                  ...(note === undefined ? {} : { note }),
                                }),
                              ),
                            },
                            null,
                            2,
                          );
                          readAnnotationFile(content);
                          const result = assertOk(await debugFile("save", content));
                          if (current() && !result.cancelled) setStatus(t("已导出", "Exported"));
                        })
                      }
                    >
                      {t("导出标注", "Export annotations")}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void run(async (current) => {
                          const result = assertOk(await debugFile("open"));
                          if (!current() || result.cancelled) return;
                          const file = readAnnotationFile(result.content);
                          const inspected = assertOk(await inspectHex(file.hex));
                          if (current()) props.onImport(inspected, file.annotations);
                        })
                      }
                    >
                      {t("导入标注", "Import annotations")}
                    </button>
                  </div>
                </>
              )}
              {tool === "search" && (
                <>
                  <label>
                    {t("查找 HEX", "Find HEX")}
                    <input
                      value={search}
                      onChange={(e) => {
                        setSearch(e.target.value);
                        setMatches([]);
                        setMatchIndex(-1);
                        props.onRange(null);
                      }}
                    />
                  </label>
                  <label>
                    {t("替换为 HEX（留空删除）", "Replace HEX (empty deletes)")}
                    <input value={replacement} onChange={(e) => setReplacement(e.target.value)} />
                  </label>
                  <p>
                    {t(
                      "按完整字节匹配，不重叠；替换后需重新解析，旧标注会清除。",
                      "Non-overlapping byte matches. Reparse after replacement; old annotations are cleared.",
                    )}
                  </p>
                  <div className="debug-tool-actions">
                    <button
                      type="button"
                      disabled={busy || !valid || !search.trim()}
                      onClick={() =>
                        void run(async (current) => {
                          const result = assertOk(await debugTool("find", props.input, search, ""));
                          if (current()) {
                            setMatches(result.matches);
                            useMatch(result.matches, 0);
                            setStatus(`${result.matches.length} ${t("处匹配", "matches")}`);
                          }
                        })
                      }
                    >
                      {t("查找", "Find")}
                    </button>
                    <button
                      type="button"
                      disabled={!matches.length}
                      onClick={() => useMatch(matches, (matchIndex + 1) % matches.length)}
                    >
                      {t("下一处", "Next")}{" "}
                      {matches.length ? `${matchIndex + 1}/${matches.length}` : ""}
                    </button>
                    <button
                      type="button"
                      disabled={busy || !valid || !search.trim()}
                      onClick={() =>
                        void run(async (current) => {
                          const result = assertOk(
                            await debugTool("replace", props.input, search, replacement),
                          );
                          if (current()) {
                            props.onInput(result.hex);
                            setMatches([]);
                            props.onRange(null);
                          }
                        })
                      }
                    >
                      {t("全部替换", "Replace all")}
                    </button>
                  </div>
                </>
              )}
              {["convert", "reverse", "bcd", "timestamp"].includes(tool) && (
                <>
                  <div className="debug-tool-grid">
                    <label>
                      {t("输入格式", "Input format")}
                      <select value={from} onChange={(e) => setFrom(e.target.value)}>
                        {formats.map((f) => (
                          <option key={f}>{f}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      {t("输出格式", "Output format")}
                      <select value={to} onChange={(e) => setTo(e.target.value)}>
                        {[...formats, "reverse"].map((f) => (
                          <option key={f} value={f}>
                            {f === "reverse" ? t("字节反转", "Reverse bytes") : f}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      {t("数值字节序", "Numeric byte order")}
                      <select value={order} onChange={(e) => setOrder(e.target.value)}>
                        <option value="big">Big Endian</option>
                        <option value="little">Little Endian</option>
                      </select>
                    </label>
                  </div>
                  <label>
                    {t("转换输入", "Conversion input")}
                    <textarea
                      value={source}
                      onChange={(e) => setSource(e.target.value)}
                      spellCheck={false}
                    />
                  </label>
                  <p>
                    {t(
                      "binary 每字节 8 位，以空格分隔；decimal 为 0–255 字节列表；数值格式为单个值。最多 64 KiB。",
                      "Binary: 8 bits per byte, space separated. Decimal: byte list 0–255. Numeric formats: one value. Limit: 64 KiB.",
                    )}
                  </p>
                  <p>
                    {t(
                      "bcd 为无符号压缩 BCD，输入偶数位数字，保留前导零。timestamp-s / ms 使用 64 位有符号 Unix 秒 / 毫秒；日期输入为 UTC YYYY-MM-DDTHH:MM:SSZ / YYYY-MM-DDTHH:MM:SS.mmmZ。",
                      "BCD: unsigned packed decimal, even digit count, leading zeros preserved. Timestamp-s / ms: signed 64-bit Unix seconds / milliseconds, UTC YYYY-MM-DDTHH:MM:SSZ / YYYY-MM-DDTHH:MM:SS.mmmZ.",
                    )}
                  </p>
                  <div className="debug-tool-actions">
                    <button
                      type="button"
                      disabled={!valid}
                      onClick={() => {
                        setFrom("hex");
                        setSource(valid!.normalizedHex);
                      }}
                    >
                      {t("读取当前报文", "Use current frame")}
                    </button>
                    <button
                      type="button"
                      disabled={busy || !source}
                      onClick={() =>
                        void run(async (current) => {
                          const result = assertOk(
                            await debugTool("convert", source, from, to, order),
                          );
                          if (current()) setOutput(result);
                        })
                      }
                    >
                      {t("转换", "Convert")}
                    </button>
                    <button
                      type="button"
                      disabled={!output}
                      onClick={() => output && props.onInput(output.hex)}
                    >
                      {t("应用到报文", "Apply bytes")}
                    </button>
                  </div>
                  {output && (
                    <label>
                      {t("转换结果", "Conversion result")}
                      <textarea readOnly value={output.text} />
                    </label>
                  )}
                </>
              )}
              {tool === "bits" && (
                <>
                  <label>
                    {t("运算 HEX", "Operation HEX")}
                    <textarea
                      value={source}
                      onChange={(e) => setSource(e.target.value)}
                      spellCheck={false}
                    />
                  </label>
                  <label>
                    {t("位运算类型", "Bit operation")}
                    <select value={bitOperation} onChange={(e) => setBitOperation(e.target.value)}>
                      {["XOR", "AND", "OR", "SHL", "SHR"].map((op) => (
                        <option key={op}>{op}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t("HEX 掩码 / 十进制移位数", "HEX mask / decimal shift count")}
                    <input value={operand} onChange={(e) => setOperand(e.target.value)} />
                  </label>
                  <p>
                    {t(
                      "掩码可为单字节（重复应用）或与输入等长。SHL / SHR 对整个报文左移 / 右移，首字节为高位，补零并保持长度；移位数不超过总位数。最多 64 KiB。",
                      "Mask: one repeated byte or matching input length. SHL / SHR shift the whole frame, first byte most significant, zero fill, fixed length. Shift count up to total bits; limit 64 KiB.",
                    )}
                  </p>
                  <div className="debug-tool-actions">
                    <button
                      type="button"
                      disabled={!valid}
                      onClick={() => setSource(valid!.normalizedHex)}
                    >
                      {t("读取当前报文", "Use current frame")}
                    </button>
                    <button
                      type="button"
                      disabled={busy || !source || !operand}
                      onClick={() =>
                        void run(async (current) => {
                          const result = assertOk(
                            await debugTool("bits", source, bitOperation, operand),
                          );
                          if (current()) setOutput(result);
                        })
                      }
                    >
                      {t("运算", "Compute")}
                    </button>
                    <button
                      type="button"
                      disabled={!output}
                      onClick={() => output && props.onInput(output.hex)}
                    >
                      {t("应用到报文", "Apply bytes")}
                    </button>
                  </div>
                  {output && (
                    <label>
                      {t("运算结果", "Operation result")}
                      <textarea readOnly value={output.text} />
                    </label>
                  )}
                </>
              )}
              {tool === "checksum" && (
                <>
                  <label>
                    {t("算法", "Algorithm")}
                    <select
                      value={algorithm}
                      onChange={(e) => {
                        setAlgorithm(e.target.value);
                        if (presets[e.target.value]) setCrc([...presets[e.target.value]]);
                      }}
                    >
                      {["SUM8", "SUM16", "XOR8", "LRC", ...Object.keys(presets)].map((a) => (
                        <option key={a}>{a}</option>
                      ))}
                    </select>
                  </label>
                  <div className="debug-tool-grid">
                    <label>
                      {t("开始偏移（含）", "Start offset (inclusive)")}
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={start}
                        onChange={(e) => setStart(e.target.value)}
                      />
                    </label>
                    <label>
                      {t("结束偏移（含）", "End offset (inclusive)")}
                      <input
                        type="number"
                        min="0"
                        step="1"
                        placeholder={valid ? String(valid.byteCount - 1) : ""}
                        value={end}
                        onChange={(e) => setEnd(e.target.value)}
                      />
                    </label>
                  </div>
                  <p>
                    {t(
                      "偏移从 0 开始，结束留空表示报文末尾。CRC 多项式使用正常表示（如 8005，不是 A001），参数填写 HEX，不带 0x。",
                      "Offsets start at 0; blank end means last byte. CRC polynomial uses normal representation (8005, not A001). Parameters are HEX without 0x.",
                    )}
                  </p>
                  {presets[algorithm] && (
                    <div className="debug-tool-grid">
                      {[
                        "Width",
                        "Polynomial",
                        "Initial",
                        "Reflect input",
                        "Reflect output",
                        "XOR out",
                      ].map((label, i) => (
                        <label key={label}>
                          {label}
                          {i === 0 || i === 3 || i === 4 ? (
                            <select value={crc[i]} onChange={(e) => updateCrc(i, e.target.value)}>
                              {(i === 0 ? ["8", "16", "32"] : ["0", "1"]).map((v) => (
                                <option key={v}>{v}</option>
                              ))}
                            </select>
                          ) : (
                            <input value={crc[i]} onChange={(e) => updateCrc(i, e.target.value)} />
                          )}
                        </label>
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    disabled={busy || !valid}
                    onClick={() =>
                      void run(async (current) => {
                        const result = assertOk(
                          await debugTool(
                            "checksum",
                            props.input,
                            presets[algorithm] ? "CRC" : algorithm,
                            start,
                            end || String(valid!.byteCount - 1),
                            ...crc,
                          ),
                        );
                        if (current()) setOutput(result);
                      })
                    }
                  >
                    {t("计算", "Calculate")}
                  </button>
                  {output && <output className="debug-checksum-value">0x{output.text}</output>}
                </>
              )}
              {busy && <p role="status">{t("处理中…", "Working…")}</p>}
              {status && (
                <p role={error ? "alert" : "status"} className={error ? "error" : ""}>
                  {status}
                </p>
              )}
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}

const toolItems = [
  ["convert", "数值转换", "Conversion", Binary],
  ["reverse", "字节序转换", "Byte order", ArrowLeftRight],
  ["bcd", "BCD 工具", "BCD", FileJson],
  ["timestamp", "时间戳转换", "Timestamp", Clock3],
  ["bits", "位运算", "Bit operations", SlidersHorizontal],
  ["search", "查找替换", "Find / replace", Search],
  ["checksum", "CRC / 校验", "CRC / checksum", Hash],
  ["files", "标注文件", "Annotation files", FileJson],
] as const;

function FieldRows({
  field,
  active,
  onFocus,
}: {
  field: DebugField;
  active?: string;
  onFocus: (field: DebugField) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <tr className={active === field.name ? "active" : ""}>
        <td>
          <button
            id={`debug-field-${field.name}`}
            aria-pressed={active === field.name}
            onClick={() => onFocus(field)}
          >
            <ChevronRight size={13} />
            {field.displayName || field.name}
          </button>
          {!!field.bits?.length && (
            <button
              className="debug-bit-toggle"
              aria-label={`${field.name} bits`}
              aria-expanded={expanded}
              onClick={() => setExpanded(!expanded)}
            >
              <ChevronRight size={13} />
            </button>
          )}
        </td>
        <td>
          <code>{field.type}</code>
        </td>
        <td>
          <code>
            {field.enumName === undefined
              ? field.value
              : field.enumName
                ? `${field.enumName} (${field.value})`
                : `? (${field.value})`}
          </code>
        </td>
        <td>{field.length ? `${field.offset}–${field.offset + field.length - 1}` : "0 B"}</td>
      </tr>
      {expanded &&
        field.bits?.map((bit) => (
          <tr key={bit.name} className={active === `${field.name}.${bit.name}` ? "active" : ""}>
            <td>
              <button
                id={`debug-field-${field.name}.${bit.name}`}
                onClick={() =>
                  onFocus({
                    ...field,
                    name: `${field.name}.${bit.name}`,
                    value: bit.value,
                    offset: bit.offset,
                    length: bit.length,
                  })
                }
              >
                {bit.displayName || bit.name}
              </button>
            </td>
            <td>
              bit {bit.bitOffset}–{bit.bitOffset + bit.width - 1}
            </td>
            <td>
              <code>{bit.value}</code>
            </td>
            <td>
              {bit.offset}–{bit.offset + bit.length - 1}
            </td>
          </tr>
        ))}
    </>
  );
}
