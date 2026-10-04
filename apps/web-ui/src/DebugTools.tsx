import { useEffect, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, Wrench, CircleAlert, ChevronRight } from "lucide-react";
import { interpretBytes, type DebugAnnotation, type DebugRange } from "./debugView";
export type { DebugAnnotation, DebugRange } from "./debugView";
import DebugToolPanel from "./DebugToolPanel";
import {
  debugDecode,
  type DebugField,
  type InspectionResult,
  type TcpRecord,
  type WorkspaceProject,
} from "./bridge";
import type { Locale } from "./i18n";
import type { DiagnosticDetail } from "./diagnostics";

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
  onIssue: (context: string, message: string, detail?: DiagnosticDetail) => void;
};

export default function DebugTools(props: Props) {
  const zh = props.locale === "zh-CN";
  const t = (cn: string, en: string) => (zh ? cn : en);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [decodeState, setDecodeState] = useState<"idle" | "pass" | "none" | "fail">("idle");
  const [decodeError, setDecodeError] = useState<{
    code: string;
    message: string;
    path?: string;
    offset?: number;
  }>();
  const [busy, setBusy] = useState(false);
  const [protocolPath, setProtocolPath] = useState("");
  const [messageName, setMessageName] = useState("");
  const [fields, setFields] = useState<DebugField[]>([]);
  const [ranges, setRanges] = useState<{ path: string; offset: number; length: number }[]>([]);
  const [activeField, setActiveField] = useState<string>();
  const protocol = props.project?.protocols.find((p) => p.path === protocolPath);
  const valid = props.result?.ok ? props.result : undefined;
  const snapshot = JSON.stringify([
    props.input.replace(/\s/g, "").toUpperCase(),
    props.project,
    props.dirty,
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
    setFields([]);
    setRanges([]);
    setDecodeState("idle");
    setDecodeError(undefined);
    setActiveField(undefined);
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
  useEffect(() => {
    if (!props.range) return;
    const candidates = fields
      .flatMap((field) => [
        field,
        ...(field.bits ?? []).map((bit) => ({ ...bit, name: `${field.name}.${bit.name}` })),
      ])
      .filter(
        (field) =>
          props.range!.start >= field.offset && props.range!.end < field.offset + field.length,
      );
    setActiveField((current) =>
      candidates.some((field) => field.name === current) ? current : candidates[0]?.name,
    );
  }, [props.range, fields]);

  const run = async (action: (current: () => boolean) => Promise<void>) => {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    const captured = live.current;
    const current = () => live.current === captured;
    try {
      await action(current);
    } catch (e) {
      if (current()) {
        setDecodeState("fail");
        setDecodeError({
          code: "bridge_error",
          message: e instanceof Error ? e.message : String(e),
        });
        props.onIssue(protocolPath, e instanceof Error ? e.message : String(e));
      }
    } finally {
      working.current = false;
      setBusy(false);
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
        const hexOffset = Math.floor(Math.max(0, decoded.error.offset ?? 0) / 16) * 16;
        props.onIssue(protocolPath, decoded.error.message, {
          ...decoded.error,
          hex: raw.normalizedHex
            .split(" ")
            .slice(hexOffset, hexOffset + 32)
            .join(" "),
          hexOffset,
        });
      }
    });
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
    <section
      className={`debug-workbench ${toolsOpen ? "with-tools" : ""}`}
      aria-label={t("调试工具", "Debug tools")}
    >
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
        <DebugToolPanel
          locale={props.locale}
          context={snapshot}
          open={toolsOpen}
          input={props.input}
          result={props.result}
          selection={selection}
          annotations={props.annotations}
          onClose={() => setToolsOpen(false)}
          onRange={props.onRange}
          onInput={props.onInput}
          onImport={props.onImport}
          onIssue={props.onIssue}
        />
      </div>
    </section>
  );
}

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
