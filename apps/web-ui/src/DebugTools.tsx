import { useEffect, useRef, useState } from "react";
import {
  debugDecode,
  debugFile,
  debugTool,
  inspectHex,
  type DebugField,
  type InspectionResult,
  type WorkspaceProject,
} from "./bridge";
import type { Locale } from "./i18n";

export type DebugAnnotation = {
  id: number;
  start: number;
  end: number;
  label: string;
  color: number;
};
export type DebugRange = { start: number; end: number } | null;

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

// Annotation files contain bytes as well as ranges, so a range can never silently attach to another frame.
export function readAnnotationFile(content: string): {
  hex: string;
  annotations: DebugAnnotation[];
} {
  if (new TextEncoder().encode(content).length > 1024 * 1024) throw new Error("File exceeds 1 MiB");
  const file = JSON.parse(content.replace(/^\uFEFF/, ""));
  if (
    !file ||
    file.kind !== "iotps-debug" ||
    file.version !== 1 ||
    typeof file.hex !== "string" ||
    !/^[\da-f]{2}(?: [\da-f]{2})*$/i.test(file.hex) ||
    file.hex.length > 65536 * 3 ||
    !Array.isArray(file.annotations) ||
    file.annotations.length > 1000
  )
    throw new Error("Invalid annotation file / unsupported version");
  const count = (file.hex.length + 1) / 3;
  const annotations = file.annotations.map((item: unknown, index: number) => {
    if (!item || typeof item !== "object") throw new Error("Invalid annotation");
    const row = item as Record<string, unknown>;
    if (
      !Number.isInteger(row.start) ||
      !Number.isInteger(row.end) ||
      (row.start as number) < 0 ||
      (row.end as number) < (row.start as number) ||
      (row.end as number) >= count ||
      typeof row.label !== "string" ||
      !row.label.trim() ||
      row.label.length > 160 ||
      !Number.isInteger(row.color) ||
      (row.color as number) < 0 ||
      (row.color as number) > 9
    )
      throw new Error("Invalid annotation range, label or color");
    return {
      id: index + 1,
      start: row.start as number,
      end: row.end as number,
      label: row.label.trim(),
      color: row.color as number,
    };
  });
  return { hex: file.hex.toUpperCase(), annotations };
}

type Props = {
  locale: Locale;
  input: string;
  result?: InspectionResult;
  annotations: DebugAnnotation[];
  project: WorkspaceProject | null | undefined;
  dirty: boolean;
  byteOffset: { offset: number } | null;
  onRange: (range: DebugRange) => void;
  onInput: (value: string) => void;
  onImport: (result: InspectionResult & { ok: true }, annotations: DebugAnnotation[]) => void;
};

export default function DebugTools(props: Props) {
  const zh = props.locale === "zh-CN";
  const t = (cn: string, en: string) => (zh ? cn : en);
  const [tool, setTool] = useState("files");
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

  const focusField = (field: DebugField, scrollBytes: boolean) => {
    setActiveField(field.name);
    props.onRange({ start: field.offset, end: field.offset + field.length - 1 });
    if (scrollBytes)
      document.getElementById(`debug-byte-${field.offset}`)?.scrollIntoView({ block: "nearest" });
    else document.getElementById(`debug-field-${field.name}`)?.scrollIntoView({ block: "nearest" });
  };
  useEffect(() => {
    if (props.byteOffset === null || !fields.length || tool !== "protocol") return;
    const field = fields.find(
      (f) => props.byteOffset!.offset >= f.offset && props.byteOffset!.offset < f.offset + f.length,
    );
    if (field) focusField(field, false);
    else {
      setActiveField(undefined);
      props.onRange(null);
    }
  }, [props.byteOffset, fields, tool]);

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

  return (
    <section className="debug-tools" aria-label={t("调试工具", "Debug tools")}>
      <label className="debug-tool-picker">
        {t("工具", "Tools")}
        <select
          aria-label={t("调试工具", "Debug tools")}
          value={tool}
          onChange={(e) => setTool(e.target.value)}
        >
          <option value="files">{t("标注文件", "Annotation files")}</option>
          <option value="search">{t("查找替换", "Find / replace")}</option>
          <option value="convert">{t("数据转换", "Data conversion")}</option>
          <option value="bits">{t("位运算", "Bit operations")}</option>
          <option value="checksum">{t("校验计算", "Checksum")}</option>
          <option value="protocol">{t("协议解析", "Protocol decode")}</option>
        </select>
      </label>
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
                      annotations: props.annotations.map(({ start, end, label, color }) => ({
                        start,
                        end,
                        label,
                        color,
                      })),
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
              {t("下一处", "Next")} {matches.length ? `${matchIndex + 1}/${matches.length}` : ""}
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
      {tool === "convert" && (
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
                  const result = assertOk(await debugTool("convert", source, from, to, order));
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
            <button type="button" disabled={!valid} onClick={() => setSource(valid!.normalizedHex)}>
              {t("读取当前报文", "Use current frame")}
            </button>
            <button
              type="button"
              disabled={busy || !source || !operand}
              onClick={() =>
                void run(async (current) => {
                  const result = assertOk(await debugTool("bits", source, bitOperation, operand));
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
              {["Width", "Polynomial", "Initial", "Reflect input", "Reflect output", "XOR out"].map(
                (label, i) => (
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
                ),
              )}
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
      {tool === "protocol" && (
        <>
          {!props.project && (
            <p>
              {t(
                "前置条件：在项目页打开或创建项目，并保存协议和消息定义。",
                "Prerequisite: open/create a project and save protocol/message definitions.",
              )}
            </p>
          )}
          {props.dirty && (
            <p role="alert">
              {t("请先保存协议代码修改，再解析报文。", "Save protocol changes before decoding.")}
            </p>
          )}
          <label>
            {t("协议", "Protocol")}
            <select
              value={protocolPath}
              onChange={(e) => {
                setProtocolPath(e.target.value);
                setMessageName("");
              }}
            >
              <option value="">{t("选择协议", "Select protocol")}</option>
              {props.project?.protocols.map((p) => (
                <option key={p.path} value={p.path}>
                  {p.name} · {p.path}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("消息", "Message")}
            <select value={messageName} onChange={(e) => setMessageName(e.target.value)}>
              <option value="">{t("选择消息", "Select message")}</option>
              {protocol?.schema.messages.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.displayName || m.name}
                </option>
              ))}
            </select>
          </label>
          <p>
            {t(
              "当前支持基础类型、固定字符串/字节/数组和长度字段。动态结构与自动识别消息依赖协议设计模块。",
              "Supports primitives, fixed strings/bytes/arrays and length fields. Dynamic layouts and automatic message matching require Protocol Designer support.",
            )}
          </p>
          <button
            type="button"
            disabled={busy || !valid || props.dirty || !protocol || !messageName}
            onClick={() =>
              void run(async (current) => {
                setFields([]);
                props.onRange(null);
                const result = assertOk(await debugDecode(protocolPath, messageName, props.input));
                if (current()) setFields(result.fields);
              })
            }
          >
            {t("解析字段", "Decode fields")}
          </button>
          {!!fields.length && (
            <div className="debug-field-list" aria-label={t("解析字段列表", "Decoded fields")}>
              {fields.map((field) => (
                <button
                  type="button"
                  id={`debug-field-${field.name}`}
                  key={field.name}
                  className={activeField === field.name ? "active" : ""}
                  aria-pressed={activeField === field.name}
                  onClick={() => focusField(field, true)}
                >
                  <strong>{field.displayName || field.name}</strong>
                  <small>
                    {field.name} · {field.type} · {field.offset}–{field.offset + field.length - 1}
                  </small>
                  <code>{field.value}</code>
                </button>
              ))}
            </div>
          )}
        </>
      )}
      {busy && <p role="status">{t("处理中…", "Working…")}</p>}
      {status && (
        <p role={error ? "alert" : "status"} className={error ? "error" : ""}>
          {status}
        </p>
      )}
    </section>
  );
}
