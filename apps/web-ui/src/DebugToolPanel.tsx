import { useEffect, useRef, useState } from "react";
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
} from "lucide-react";
import {
  debugFile,
  debugTool,
  inspectHex,
  type DebugToolResult,
  type InspectionResult,
} from "./bridge";
import { readAnnotationFile, type DebugAnnotation, type DebugRange } from "./debugView";
import type { Locale } from "./i18n";

const tools = [
  ["convert", "数值转换", "Conversion", Binary],
  ["reverse", "字节序转换", "Byte order", ArrowLeftRight],
  ["bcd", "BCD 工具", "BCD", FileJson],
  ["timestamp", "时间戳转换", "Timestamp", Clock3],
  ["bits", "位运算", "Bit operations", SlidersHorizontal],
  ["search", "查找替换", "Find / replace", Search],
  ["checksum", "CRC / 校验", "CRC / checksum", Hash],
  ["files", "标注文件", "Annotation files", FileJson],
] as const;
const presets: Record<string, string[]> = {
  CRC8: ["8", "07", "00", "0", "0", "00"],
  "CRC16/MODBUS": ["16", "8005", "FFFF", "1", "1", "0000"],
  "CRC16/CCITT-FALSE": ["16", "1021", "FFFF", "0", "0", "0000"],
  "CRC16/XMODEM": ["16", "1021", "0000", "0", "0", "0000"],
  "CRC16/X25": ["16", "1021", "FFFF", "1", "1", "FFFF"],
  CRC32: ["32", "04C11DB7", "FFFFFFFF", "1", "1", "FFFFFFFF"],
  "Custom CRC": ["16", "1021", "FFFF", "0", "0", "0000"],
};
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
type Props = {
  locale: Locale;
  context: string;
  open: boolean;
  input: string;
  result?: InspectionResult;
  selection: DebugRange;
  annotations: DebugAnnotation[];
  onClose: () => void;
  onRange: (range: DebugRange) => void;
  onInput: (input: string) => void;
  onImport: (result: InspectionResult & { ok: true }, annotations: DebugAnnotation[]) => void;
  onIssue: (context: string, message: string) => void;
};

export default function DebugToolPanel(props: Props) {
  const t = (cn: string, en: string) => (props.locale === "zh-CN" ? cn : en);
  const [tool, setTool] = useState("convert");
  const [source, setSource] = useState("");
  const [from, setFrom] = useState("hex");
  const [to, setTo] = useState("hex");
  const [width, setWidth] = useState("16");
  const [order, setOrder] = useState("little");
  const [rowValues, setRows] = useState<string[][]>([]);
  const [outputState, setOutputState] = useState<{ text: string; hex: string; snapshot: string }>();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [replacement, setReplacement] = useState("");
  const [searchFormat, setSearchFormat] = useState("hex");
  const [matches, setMatches] = useState<number[]>([]);
  const [needle, setNeedle] = useState("");
  const [matchIndex, setMatchIndex] = useState(-1);
  const [operation, setOperation] = useState("XOR");
  const [operand, setOperand] = useState("FF");
  const [algorithm, setAlgorithm] = useState("CRC16/MODBUS");
  const [crc, setCrc] = useState(presets["CRC16/MODBUS"]);
  const [start, setStart] = useState("0");
  const [end, setEnd] = useState("");
  const valid = props.result?.ok ? props.result : undefined;
  const selectedHex =
    valid && props.selection
      ? valid.bytes
          .slice(props.selection.start, props.selection.end + 1)
          .map((b) => b.toString(16).toUpperCase().padStart(2, "0"))
          .join(" ")
      : "";
  const snapshot = JSON.stringify([
    props.context,
    props.input.replace(/\s/g, "").toUpperCase(),
    tool,
    source,
    from,
    to,
    width,
    tool === "checksum" ? "" : order,
    search,
    replacement,
    searchFormat,
    operation,
    operand,
    algorithm,
    crc,
    start,
    end,
  ]);
  const live = useRef(snapshot);
  live.current = snapshot;
  const output = outputState?.snapshot === snapshot ? outputState : undefined;
  const rows = tool === "convert" && output ? rowValues : [];
  const setOutput = (value: { text: string; hex: string } | undefined) =>
    setOutputState(value ? { ...value, snapshot: live.current } : undefined);
  const request = useRef(0);
  const working = useRef(false);
  useEffect(() => {
    if (props.open && selectedHex && !source) {
      setSource(selectedHex);
      setFrom("hex");
      const bits = selectedHex.split(" ").length * 8;
      if ([8, 16, 32, 64].includes(bits)) setWidth(String(bits));
    }
  }, [props.open]);
  useEffect(() => {
    live.current = snapshot;
    return () => {
      live.current = "unmounted";
      request.current++;
    };
  }, []);
  useEffect(() => {
    setOutput(undefined);
    setRows([]);
    setStatus("");
    setError(false);
  }, [snapshot]);
  useEffect(() => {
    setMatches([]);
    setMatchIndex(-1);
    setNeedle("");
  }, [props.context, props.input.replace(/\s/g, "").toUpperCase(), search, searchFormat]);
  const assertOk = <T extends { ok: boolean; error?: { code: string; message: string } }>(
    value: T,
  ): Extract<T, { ok: true }> => {
    if (!value.ok)
      throw new Error(
        value.error?.code === "native_host_required"
          ? t("请在 Windows 桌面客户端使用此功能。", "Use this feature in the Windows desktop app.")
          : `[${value.error?.code}] ${value.error?.message}`,
      );
    return value as Extract<T, { ok: true }>;
  };
  const run = async (action: (current: () => boolean) => Promise<void>) => {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setStatus("");
    setError(false);
    const captured = live.current;
    const id = ++request.current;
    const current = () => captured === live.current && id === request.current;
    try {
      await action(current);
    } catch (e) {
      if (current()) {
        const message = e instanceof Error ? e.message : String(e);
        setError(true);
        setStatus(message);
        props.onIssue(tool, message);
      }
    } finally {
      working.current = false;
      setBusy(false);
    }
  };
  const convert = async (
    value: string,
    inputFormat: string,
    outputFormat: string,
    byteOrder = order,
  ) => assertOk(await debugTool("convert", value, inputFormat, outputFormat, byteOrder));
  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setError(false);
      setStatus(t("已复制", "Copied"));
    } catch {
      setError(true);
      setStatus(t("复制失败，请检查剪贴板权限。", "Copy failed. Check clipboard permissions."));
    }
  };
  const choose = (value: string) => {
    setTool(value);
    setFrom("hex");
    setTo(
      value === "reverse"
        ? "reverse"
        : value === "bcd"
          ? "bcd"
          : value === "timestamp"
            ? "timestamp-s"
            : "hex",
    );
    if (["convert", "reverse", "bcd", "timestamp", "bits"].includes(value) && selectedHex)
      setSource(selectedHex);
  };
  const readSource = () => {
    setFrom("hex");
    setSource(selectedHex || valid?.normalizedHex || "");
  };
  const navigateMatch = (offsets: number[], index: number, hex = needle) => {
    setMatchIndex(index);
    if (offsets[index] === undefined) {
      props.onRange(null);
      return;
    }
    props.onRange({
      start: offsets[index],
      end: offsets[index] + hex.replace(/\s/g, "").length / 2 - 1,
    });
    document.getElementById(`debug-byte-${offsets[index]}`)?.scrollIntoView({ block: "nearest" });
  };
  const find = async (current: () => boolean) => {
    const hex = (await convert(search, searchFormat, "hex", "big")).hex;
    const result = assertOk(await debugTool("find", props.input, hex, ""));
    if (current()) {
      setNeedle(hex);
      setMatches(result.matches);
      navigateMatch(result.matches, 0, hex);
    }
    return { hex, result };
  };
  const replace = (all: boolean) =>
    run(async (current) => {
      const { hex, result } = await find(current);
      if (!current() || !result.matches.length) return;
      const next = replacement ? (await convert(replacement, searchFormat, "hex", "big")).hex : "";
      if (!current()) return;
      let edited: Extract<DebugToolResult, { ok: true }>;
      if (all) edited = assertOk(await debugTool("replace", props.input, hex, next));
      else {
        const bytes = result.hex.split(" ");
        const offset = result.matches[Math.max(0, Math.min(matchIndex, result.matches.length - 1))];
        const count = hex.split(" ").length;
        edited = assertOk(
          await debugTool("replace", bytes.slice(offset, offset + count).join(" "), hex, next),
        );
        bytes.splice(offset, count, ...(edited.hex ? edited.hex.split(" ") : []));
        if (bytes.length > 65536)
          throw new Error(t("替换结果超过 64 KiB。", "Replacement exceeds 64 KiB."));
        edited = { ...edited, hex: bytes.join(" ") };
      }
      if (current()) {
        props.onInput(edited.hex);
        props.onRange(null);
        setMatches([]);
        setMatchIndex(-1);
      }
    });
  // Core converts each representation; the panel only groups and displays the results.
  useEffect(() => {
    if (tool !== "convert" || !source.trim()) return;
    const captured = snapshot;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const inputFormat =
          from === "decimal" ? `${source.trim().startsWith("-") ? "int" : "uint"}${width}` : from;
        const normalized = await convert(source, inputFormat, "hex");
        const targets = [
          "hex",
          `uint${width}`,
          `int${width}`,
          "binary",
          ...(width === "32" ? ["float32"] : width === "64" ? ["float64"] : []),
        ];
        const values = await Promise.all(
          targets.map((f) =>
            convert(
              f === "binary" && order === "little"
                ? normalized.hex.split(" ").reverse().join(" ")
                : normalized.hex,
              "hex",
              f,
            ),
          ),
        );
        if (cancelled || live.current !== captured) return;
        const bytes = normalized.hex.split(" ");
        const big = order === "little" ? [...bytes].reverse() : bytes;
        const little = [...big].reverse();
        const labels = [
          "HEX",
          t("DEC（无符号）", "DEC (unsigned)"),
          t("DEC（有符号）", "DEC (signed)"),
          t("二进制", "Binary"),
          width === "32" ? "float32" : "float64",
        ];
        setRows([
          [t("HEX（大端）", "HEX (BE)"), big.join(" ")],
          [t("HEX（小端）", "HEX (LE)"), little.join(" ")],
          ...values
            .slice(1)
            .map((v, i) => [
              labels[i + 1],
              i === 2 ? v.text.replace(/\s/g, "").match(/.{4}/g)!.join(" ") : v.text,
            ]),
        ]);
        setOutput(normalized);
        setError(false);
        setStatus("");
      } catch (e) {
        if (!cancelled && live.current === captured) {
          setError(true);
          setStatus(e instanceof Error ? e.message : String(e));
        }
      }
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [snapshot, props.locale]);
  const resultTable = (values: string[][]) => (
    <div className="debug-tool-result">
      <h3>{t("转换结果", "Results")}</h3>
      <dl>
        {values.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>
              <code>{value}</code>
              <button aria-label={`${t("复制", "Copy")} ${label}`} onClick={() => void copy(value)}>
                <Copy size={14} />
              </button>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
  const orderControl = (
    <div className="debug-segmented" aria-label={t("字节序", "Byte order")}>
      {[
        ["little", "小端 (LE)", "Little (LE)"],
        ["big", "大端 (BE)", "Big (BE)"],
      ].map(([v, cn, en]) => (
        <button
          key={v}
          aria-label={t(cn, en)}
          aria-pressed={order === v}
          onClick={() => setOrder(v)}
        >
          {t(cn, en)}
        </button>
      ))}
    </div>
  );
  const sourceControl = (
    <>
      <label>
        {t("输入", "Input")}
        <textarea
          className={tool === "convert" ? "debug-conversion-input" : ""}
          aria-label={t("转换输入", "Conversion input")}
          value={source}
          onChange={(e) => setSource(e.target.value)}
          spellCheck={false}
        />
      </label>
      <button className="debug-use-source" disabled={!valid} onClick={readSource}>
        {selectedHex ? t("读取选中范围", "Use selection") : t("读取当前报文", "Use frame")}
      </button>
    </>
  );
  const endValue = end || (valid ? String(valid.byteCount - 1) : "");
  const checksumBytes = output?.text.match(/.{2}/g) ?? [];
  const checksumHex = (order === "little" ? [...checksumBytes].reverse() : checksumBytes).join(" ");
  const following =
    valid && output
      ? valid.bytes
          .slice(Number(endValue) + 1, Number(endValue) + 1 + checksumBytes.length)
          .map((b) => b.toString(16).toUpperCase().padStart(2, "0"))
          .join(" ")
      : "";
  const canCompare =
    !!output &&
    checksumBytes.length > 0 &&
    following.split(" ").length === checksumBytes.length &&
    !!following;
  return (
    <aside
      className="debug-tools-dock"
      aria-label={t("工具面板", "Tools panel")}
      hidden={!props.open}
    >
      <header>
        <strong>{t("工具面板", "Tools panel")}</strong>
        <button aria-label={t("关闭工具面板", "Close tools panel")} onClick={props.onClose}>
          <X size={18} />
        </button>
      </header>
      <div className="debug-tools-dock-body">
        <nav aria-label={t("调试工具", "Debug tools")}>
          {tools.map(([value, cn, en, Icon]) => (
            <button
              key={value}
              className={tool === value ? "active" : ""}
              aria-pressed={tool === value}
              onClick={() => choose(value)}
            >
              <Icon size={17} />
              <span>{t(cn, en)}</span>
            </button>
          ))}
        </nav>
        <div className="debug-tool-content">
          <div className="debug-tool-heading">
            <h2>
              {t(
                tools.find((item) => item[0] === tool)?.[1] ?? "",
                tools.find((item) => item[0] === tool)?.[2] ?? "",
              )}
            </h2>
            {output && (
              <button
                aria-label={t("复制结果", "Copy result")}
                onClick={() =>
                  void copy(
                    rows.length
                      ? rows.map((r) => r.join(": ")).join("\n")
                      : tool === "checksum"
                        ? `0x${output.text}\n${checksumHex}`
                        : output.text,
                  )
                }
              >
                <Copy size={14} />
              </button>
            )}
          </div>
          {tool === "convert" && (
            <>
              <div className="debug-segmented">
                {[
                  ["hex", "HEX"],
                  ["decimal", "DEC"],
                  ["binary", "BIN"],
                ].map(([value, label]) => (
                  <button key={value} aria-pressed={from === value} onClick={() => setFrom(value)}>
                    {label}
                  </button>
                ))}
              </div>
              {sourceControl}
              <div className="debug-tool-grid debug-conversion-options">
                <label>
                  {t("数据类型", "Data type")}
                  <select
                    aria-label={t("数据位宽", "Data width")}
                    value={width}
                    onChange={(e) => setWidth(e.target.value)}
                  >
                    {[8, 16, 32, 64].map((w) => (
                      <option key={w} value={w}>
                        {w} {t("位", "bits")} ({w / 8} {t("字节", "bytes")})
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t("字节序", "Byte order")}
                  {orderControl}
                </label>
              </div>
              {rows.length
                ? resultTable(rows)
                : !error && (
                    <p>
                      {t(
                        "输入与位宽一致的完整字节。DEC 输入单个整数，BIN 每字节 8 位并以空格分隔。",
                        "Enter complete bytes matching the width. DEC accepts one integer; BIN uses space-separated 8-bit bytes.",
                      )}
                    </p>
                  )}
              <section className="debug-quick-tools">
                <h3>{t("快捷工具", "Quick tools")}</h3>
                <div>
                  <button onClick={() => choose("bcd")}>
                    <FileJson size={16} />
                    {t("BCD 编码", "BCD encoding")}
                  </button>
                  <button onClick={() => choose("timestamp")}>
                    <Clock3 size={16} />
                    {t("Unix 时间戳", "Unix timestamp")}
                  </button>
                </div>
              </section>
            </>
          )}
          {["reverse", "bcd", "timestamp"].includes(tool) && (
            <>
              {sourceControl}
              <div className="debug-tool-grid">
                <label>
                  {t("输入格式", "Input format")}
                  <select
                    aria-label={t("输入格式", "Input format")}
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                  >
                    {formats.map((f) => (
                      <option key={f}>{f}</option>
                    ))}
                  </select>
                </label>
                <label>
                  {t("输出格式", "Output format")}
                  <select
                    aria-label={t("输出格式", "Output format")}
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                  >
                    {[...formats, "reverse"].map((f) => (
                      <option key={f}>{f}</option>
                    ))}
                  </select>
                </label>
              </div>
              {orderControl}
              <p>
                {tool === "bcd"
                  ? t(
                      "压缩 BCD：无符号偶数位数字，保留前导零。",
                      "Packed BCD: unsigned even digit count; leading zeros preserved.",
                    )
                  : tool === "timestamp"
                    ? t(
                        "Unix 秒 / 毫秒使用 64 位有符号值，日期为 UTC ISO 格式。",
                        "Unix seconds / milliseconds use signed 64-bit values; dates use UTC ISO format.",
                      )
                    : t("反转完整字节序列。", "Reverse the complete byte sequence.")}
              </p>
              <button
                className="primary"
                disabled={busy || !source.trim()}
                onClick={() =>
                  void run(async (current) => {
                    const result = await convert(source, from, to);
                    if (current()) setOutput(result);
                  })
                }
              >
                {t("转换", "Convert")}
              </button>
              {output && (
                <>
                  {resultTable([
                    [t("结果", "Result"), output.text],
                    ["HEX", output.hex],
                  ])}
                  <button onClick={() => props.onInput(output.hex)}>
                    {t("应用到报文", "Apply bytes")}
                  </button>
                </>
              )}
            </>
          )}
          {tool === "search" && (
            <>
              <label>
                {t("查找内容", "Find")}
                <input
                  aria-label={t("查找内容", "Find")}
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    props.onRange(null);
                  }}
                  spellCheck={false}
                />
              </label>
              <label>
                {t("替换内容", "Replacement")}
                <input
                  aria-label={t("替换内容", "Replacement")}
                  value={replacement}
                  onChange={(e) => setReplacement(e.target.value)}
                  spellCheck={false}
                />
              </label>
              <label>
                {t("输入格式", "Input format")}
                <select
                  value={searchFormat}
                  aria-label={t("查找输入格式", "Search input format")}
                  onChange={(e) => {
                    setSearchFormat(e.target.value);
                    props.onRange(null);
                  }}
                >
                  {["hex", "ascii", "utf8", "binary", "decimal"].map((f) => (
                    <option key={f} value={f}>
                      {f.toUpperCase()}
                    </option>
                  ))}
                </select>
              </label>
              <p>
                {t(
                  "按完整字节匹配，不重叠；留空替换内容可删除。替换后需重新解析。",
                  "Non-overlapping complete byte matches. Empty replacement deletes; reparse after editing.",
                )}
              </p>
              <button
                className="primary"
                disabled={busy || !valid || !search.trim()}
                onClick={() =>
                  void run(async (current) => {
                    await find(current);
                  })
                }
              >
                <Search size={14} />
                {t("查找", "Find")}
              </button>
              <div className="debug-tool-actions debug-search-actions">
                <button
                  disabled={!matches.length || busy}
                  onClick={() =>
                    navigateMatch(matches, (matchIndex - 1 + matches.length) % matches.length)
                  }
                >
                  {t("上一个", "Previous")}
                </button>
                <button
                  disabled={!matches.length || busy}
                  onClick={() => navigateMatch(matches, (matchIndex + 1) % matches.length)}
                >
                  {t("下一个", "Next")}
                </button>
                <button disabled={!matches.length || busy} onClick={() => void replace(false)}>
                  {t("替换", "Replace")}
                </button>
                <button
                  className="primary"
                  disabled={!matches.length || busy}
                  onClick={() => void replace(true)}
                >
                  {t("全部替换", "Replace all")}
                </button>
              </div>
              <div className="debug-search-summary">
                {t("匹配结果", "Matches")} <strong>{matches.length}</strong> {t("处", "")}{" "}
                {matches.length > 0 && (
                  <small>
                    {matchIndex + 1} / {matches.length}
                  </small>
                )}
              </div>
              {!!matches.length && (
                <div className="debug-match-scroll">
                  <table className="debug-match-table">
                    <thead>
                      <tr>
                        <th>{t("偏移", "Offset")}</th>
                        <th>{t("原始值", "Value")}</th>
                        <th>{t("替换值", "Replace with")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matches.map((offset, i) => (
                        <tr key={offset} className={i === matchIndex ? "active" : ""}>
                          <td>
                            <button onClick={() => navigateMatch(matches, i)}>
                              0x{offset.toString(16).toUpperCase().padStart(4, "0")}
                            </button>
                          </td>
                          <td>
                            <code>{needle}</code>
                          </td>
                          <td>
                            <code>{replacement || "—"}</code>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
          {tool === "checksum" && (
            <>
              <label>
                {t("算法", "Algorithm")}
                <select
                  value={algorithm}
                  aria-label={t("算法", "Algorithm")}
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
              <h3>{t("输入范围", "Input range")}</h3>
              <div className="debug-tool-grid">
                <label>
                  {t("起始偏移", "Start offset")}
                  <input
                    aria-label={t("起始偏移", "Start offset")}
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
                    aria-label={t("结束偏移（含）", "End offset (inclusive)")}
                    type="number"
                    min="0"
                    step="1"
                    value={end}
                    placeholder={endValue}
                    onChange={(e) => setEnd(e.target.value)}
                  />
                </label>
              </div>
              <div className="debug-tool-actions">
                <button
                  disabled={!props.selection}
                  onClick={() => {
                    setStart(String(props.selection!.start));
                    setEnd(String(props.selection!.end));
                  }}
                >
                  {t("使用选中范围", "Use selection")}
                </button>
                <button
                  disabled={!valid}
                  onClick={() => {
                    setStart("0");
                    setEnd("");
                  }}
                >
                  {t("全部数据", "All bytes")}
                </button>
              </div>
              <p>
                {valid
                  ? `${t("报文范围", "Frame range")}: 0 – ${valid.byteCount - 1} (${valid.byteCount} ${t("字节", "bytes")})`
                  : t("请先解析报文。", "Inspect a frame first.")}
              </p>
              {presets[algorithm] && (
                <>
                  <h3>{t("参数", "Parameters")}</h3>
                  <div className="debug-crc-params">
                    {[
                      ["位宽", "Width"],
                      ["多项式 (Poly)", "Polynomial (Poly)"],
                      ["初始值 (Init)", "Initial (Init)"],
                      ["输入反转 (RefIn)", "Reflect input (RefIn)"],
                      ["输出反转 (RefOut)", "Reflect output (RefOut)"],
                      ["异或值 (XorOut)", "XOR out (XorOut)"],
                    ].map(([cn, en], i) => (
                      <label key={i}>
                        {t(cn, en)}
                        {i === 0 || i === 3 || i === 4 ? (
                          <select
                            value={crc[i]}
                            onChange={(e) => {
                              setAlgorithm("Custom CRC");
                              setCrc(crc.map((v, j) => (j === i ? e.target.value : v)));
                            }}
                          >
                            {(i === 0 ? ["8", "16", "32"] : ["0", "1"]).map((v) => (
                              <option key={v} value={v}>
                                {i === 0 ? v : v === "1" ? t("反转", "Yes") : t("不反转", "No")}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            value={crc[i]}
                            onChange={(e) => {
                              setAlgorithm("Custom CRC");
                              setCrc(crc.map((v, j) => (j === i ? e.target.value : v)));
                            }}
                          />
                        )}
                      </label>
                    ))}
                  </div>
                  <p>
                    {t(
                      "参数使用 HEX；多项式为正常表示（MODBUS 为 8005）。",
                      "HEX parameters; polynomial uses normal representation (8005 for MODBUS).",
                    )}
                  </p>
                </>
              )}
              <button
                className="primary"
                disabled={busy || !valid}
                onClick={() =>
                  void run(async (current) => {
                    const result = assertOk(
                      await debugTool(
                        "checksum",
                        props.input,
                        presets[algorithm] ? "CRC" : algorithm,
                        start,
                        endValue,
                        ...crc,
                      ),
                    );
                    if (current()) setOutput(result);
                  })
                }
              >
                {t("计算", "Calculate")}
              </button>
              {output && (
                <section className="debug-tool-result">
                  <h3>{t("计算结果", "Result")}</h3>
                  <dl>
                    <div>
                      <dt>HEX</dt>
                      <dd className="success">
                        <code>0x{output.text}</code>
                      </dd>
                    </div>
                    <div>
                      <dt>DEC</dt>
                      <dd>
                        <code>{BigInt(`0x${output.text}`).toString()}</code>
                      </dd>
                    </div>
                    <div>
                      <dt>{t("字节序列", "Bytes")}</dt>
                      <dd>
                        <code>{checksumHex}</code>
                      </dd>
                    </div>
                  </dl>
                  {orderControl}
                  {canCompare && (
                    <p className={checksumHex === following ? "success" : "error"}>
                      {checksumHex === following && <CheckCircle2 size={15} />}
                      {checksumHex === following
                        ? t("与范围后校验字节一致", "Matches following checksum bytes")
                        : t("与范围后字节不一致", "Does not match following bytes")}
                    </p>
                  )}
                </section>
              )}
            </>
          )}
          {tool === "bits" && (
            <>
              {sourceControl}
              <label>
                {t("运算类型", "Operation")}
                <select value={operation} onChange={(e) => setOperation(e.target.value)}>
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
                  "掩码为单字节或与输入等长。移位对整个报文操作，补零并保持长度。",
                  "Mask: one repeated byte or matching input length. Shifts operate on the whole frame, zero filled at fixed length.",
                )}
              </p>
              <button
                className="primary"
                disabled={busy || !source || !operand}
                onClick={() =>
                  void run(async (current) => {
                    const result = assertOk(await debugTool("bits", source, operation, operand));
                    if (current()) setOutput(result);
                  })
                }
              >
                {t("运算", "Compute")}
              </button>
              {output && (
                <>
                  {resultTable([["HEX", output.text]])}
                  <button onClick={() => props.onInput(output.hex)}>
                    {t("应用到报文", "Apply bytes")}
                  </button>
                </>
              )}
            </>
          )}
          {tool === "files" && (
            <>
              <p>
                {t(
                  "保存报文及标注；导入将替换当前内容。",
                  "Save bytes and annotations; import replaces current content.",
                )}
              </p>
              <div className="debug-tool-actions">
                <button
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
          {busy && <p role="status">{t("处理中…", "Working…")}</p>}
          {status && (
            <p role={error ? "alert" : "status"} className={error ? "error" : ""}>
              {status}
            </p>
          )}
        </div>
      </div>
    </aside>
  );
}
