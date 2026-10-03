import { useEffect, useRef, useState } from "react";
import { CircleAlert, Pencil, Plus, Trash2, X } from "lucide-react";
import type { DebugField, InspectionResult } from "./bridge";
import { annotationColors, type DebugAnnotation, type DebugRange } from "./debugView";
import type { Locale, Theme } from "./i18n";

export default function DebugHexView({
  result,
  fields,
  range,
  annotations,
  locale,
  theme,
  onByte,
  onAnnotations,
}: {
  result?: InspectionResult;
  fields: DebugField[];
  range: DebugRange;
  annotations: DebugAnnotation[];
  locale: Locale;
  theme: Theme;
  onByte: (offset: number) => void;
  onAnnotations: (annotations: DebugAnnotation[]) => void;
}) {
  const zh = locale === "zh-CN",
    t = (cn: string, en: string) => (zh ? cn : en);
  const valid = result?.ok ? result : undefined;
  const colors = annotationColors[theme];
  const newestAnnotations = [...annotations].reverse();
  const [indexMode, setIndexMode] = useState<"byte" | "offset">("offset");
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null);
  const [editing, setEditing] = useState<DebugAnnotation | null>(null);
  const [label, setLabel] = useState(""),
    [note, setNote] = useState("");
  const [start, setStart] = useState("0"),
    [end, setEnd] = useState("0"),
    [color, setColor] = useState(2);
  const [error, setError] = useState(false),
    [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    setSelection(null);
    setOpen(false);
  }, [valid?.normalizedHex]);
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    else if (!open) dialog.current?.close();
  }, [open]);
  const edit = (
    annotation?: DebugAnnotation,
    first = range?.start ?? 0,
    last = range?.end ?? first,
  ) => {
    setEditing(annotation ?? null);
    setLabel(annotation?.label ?? "");
    setNote(annotation?.note ?? "");
    setStart(String(annotation?.start ?? first));
    setEnd(String(annotation?.end ?? last));
    setColor(annotation?.color ?? 2);
    setError(false);
    setSelection(null);
    setOpen(true);
  };
  const bytes = valid?.bytes ?? [];
  // ponytail: render up to 64 KiB with bounded field/annotation scans; profile before adding virtualization.
  const rows = Math.max(4, Math.ceil(bytes.length / 16));
  return (
    <>
      <section className="debug-hex-panel" aria-label={t("HEX 字节视图", "HEX byte view")}>
        <div
          className="debug-hex-scroll"
          onMouseLeave={() =>
            setSelection((current) => (current ? { ...current, end: current.start } : null))
          }
        >
          <table className="debug-byte-table">
            <thead>
              <tr>
                <th>
                  <button
                    aria-label={indexMode === "offset" ? t("偏移", "Offset") : t("字节", "Byte")}
                    onClick={() => setIndexMode(indexMode === "offset" ? "byte" : "offset")}
                  >
                    {indexMode === "offset" ? t("偏移", "Offset") : t("字节", "Byte")}
                  </button>
                </th>
                {Array.from({ length: 16 }, (_, i) => (
                  <th key={i}>{i.toString(16).toUpperCase().padStart(2, "0")}</th>
                ))}
                <th>
                  ASCII
                  {!annotations.length && (
                    <button
                      aria-label={t("添加标注", "Add annotation")}
                      title={t(
                        "点击起始字节，再点击结束字节以添加标注",
                        "Click the first byte, then the last byte to annotate",
                      )}
                      disabled={!valid || !range}
                      onClick={() => edit()}
                    >
                      <Plus size={13} />
                    </button>
                  )}
                </th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: rows }, (_, row) => (
                <tr key={row}>
                  <th scope="row">
                    {indexMode === "offset"
                      ? (row * 16).toString(16).toUpperCase().padStart(4, "0")
                      : row * 16 + 1}
                  </th>
                  {Array.from({ length: 16 }, (_, column) => {
                    const offset = row * 16 + column,
                      byte = bytes[offset];
                    const fieldIndex = fields.findIndex(
                      (field) => offset >= field.offset && offset < field.offset + field.length,
                    );
                    const annotation = newestAnnotations.find(
                      (item) => offset >= item.start && offset <= item.end,
                    );
                    const selected = selection
                      ? offset >= Math.min(selection.start, selection.end) &&
                        offset <= Math.max(selection.start, selection.end)
                      : range && offset >= range.start && offset <= range.end;
                    return (
                      <td key={column}>
                        {byte === undefined ? (
                          <span className="debug-missing-byte">--</span>
                        ) : (
                          <button
                            id={`debug-byte-${offset}`}
                            type="button"
                            className={`debug-hex-select ${selected ? "selected" : ""}`}
                            aria-label={`${t("偏移", "Offset")} ${offset} · HEX ${byte.toString(16).toUpperCase().padStart(2, "0")}`}
                            aria-pressed={!!selected}
                            title={
                              annotation
                                ? `${annotation.label}${annotation.note ? `: ${annotation.note}` : ""}`
                                : fields[fieldIndex]?.name
                            }
                            style={{
                              backgroundColor: annotation
                                ? `${colors[annotation.color]}33`
                                : fieldIndex >= 0
                                  ? `${colors[fieldIndex % colors.length]}24`
                                  : undefined,
                            }}
                            onMouseEnter={() =>
                              setSelection((current) =>
                                current ? { ...current, end: offset } : null,
                              )
                            }
                            onClick={() => {
                              onByte(offset);
                              if (selection)
                                edit(
                                  undefined,
                                  Math.min(selection.start, offset),
                                  Math.max(selection.start, offset),
                                );
                              else setSelection({ start: offset, end: offset });
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Escape") setSelection(null);
                            }}
                          >
                            {byte.toString(16).toUpperCase().padStart(2, "0")}
                          </button>
                        )}
                      </td>
                    );
                  })}
                  <td className="debug-ascii-column">
                    <code>{valid?.ascii.slice(row * 16, row * 16 + 16) || "................"}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!result?.ok && result && (
          <p className="debug-hex-error" role="alert">
            <CircleAlert size={18} /> [{result.error.code}] {result.error.message} ·{" "}
            {t("位置", "Position")} {result.error.position + 1}
          </p>
        )}
      </section>
      {!!annotations.length && (
        <section className="debug-annotations-panel" aria-label={t("标注", "Annotations")}>
          <header>
            <strong>
              {t("标注", "Annotations")} <span>{annotations.length}</span>
            </strong>
            <button
              disabled={!valid || !range || annotations.length >= 1000}
              onClick={() => edit()}
            >
              <Plus size={16} />
              {t("添加标注", "Add annotation")}
            </button>
          </header>
          {!!annotations.length && (
            <div className="debug-annotation-list">
              {annotations.map((annotation) => (
                <button
                  key={annotation.id}
                  onClick={() => edit(annotation)}
                  aria-label={`${t("编辑标注", "Edit annotation")}: ${annotation.label}`}
                >
                  <span
                    className="debug-annotation-dot"
                    style={{ background: colors[annotation.color] }}
                  />
                  <strong>{annotation.label}</strong>
                  <code>
                    {annotation.start}–{annotation.end}
                  </code>
                  <span>{annotation.note}</span>
                  <Pencil size={15} />
                </button>
              ))}
            </div>
          )}
        </section>
      )}
      <dialog
        ref={dialog}
        className="debug-annotation-dialog"
        aria-labelledby="debug-annotation-title"
        onClose={() => {
          setOpen(false);
          setSelection(null);
        }}
      >
        <form
          className="debug-annotation-form"
          onSubmit={(event) => {
            event.preventDefault();
            const first = Number(start),
              last = Number(end);
            if (
              !valid ||
              !/^\d+$/.test(start) ||
              !/^\d+$/.test(end) ||
              first > last ||
              last >= valid.byteCount ||
              !label.trim() ||
              label.trim().length > 160 ||
              note.length > 1000 ||
              !colors[color] ||
              (!editing && annotations.length >= 1000)
            ) {
              setError(true);
              return;
            }
            const saved = {
              id: editing?.id ?? Math.max(0, ...annotations.map((item) => item.id)) + 1,
              start: first,
              end: last,
              label: label.trim(),
              color,
              ...(note ? { note } : {}),
            };
            onAnnotations(
              editing
                ? annotations.map((item) => (item.id === editing.id ? saved : item))
                : [...annotations, saved],
            );
            setOpen(false);
          }}
        >
          <header>
            <strong id="debug-annotation-title">
              {editing ? t("编辑标注", "Edit annotation") : t("添加标注", "Add annotation")}
            </strong>
            <button
              type="button"
              aria-label={t("关闭弹窗", "Close dialog")}
              onClick={() => setOpen(false)}
            >
              <X size={18} />
            </button>
          </header>
          <label className="debug-annotation-label">
            {t("名称", "Name")}
            <input
              value={label}
              maxLength={160}
              autoFocus
              aria-invalid={error}
              onChange={(event) => {
                setLabel(event.target.value);
                setError(false);
              }}
            />
          </label>
          <fieldset className="debug-color-presets">
            <legend>{t("颜色", "Color")}</legend>
            {colors.map((value, index) => (
              <button
                key={value}
                type="button"
                className="debug-color-swatch"
                aria-label={`${t("颜色", "Color")} ${index + 1}`}
                aria-pressed={index === color}
                style={{ background: value }}
                onClick={() => setColor(index)}
              />
            ))}
          </fieldset>
          <div className="debug-annotation-range">
            <label>
              {t("起始偏移", "Start offset")}
              <input
                inputMode="numeric"
                value={start}
                onChange={(event) => setStart(event.target.value)}
              />
            </label>
            <label>
              {t("结束偏移", "End offset")}
              <input
                inputMode="numeric"
                value={end}
                onChange={(event) => setEnd(event.target.value)}
              />
            </label>
          </div>
          <label>
            {t("备注", "Note")}
            <textarea
              value={note}
              maxLength={1000}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          {error && (
            <p className="debug-annotation-error" role="alert">
              {t("请填写名称及有效字节范围。", "Enter a name and a valid byte range.")}
            </p>
          )}
          <footer>
            {editing && (
              <button
                className="danger"
                type="button"
                onClick={() => {
                  onAnnotations(annotations.filter((item) => item.id !== editing.id));
                  setOpen(false);
                }}
              >
                <Trash2 size={15} />
                {t("删除", "Delete")}
              </button>
            )}
            <button type="button" onClick={() => setOpen(false)}>
              {t("取消", "Cancel")}
            </button>
            <button className="primary" type="submit">
              {t("保存", "Save")}
            </button>
          </footer>
        </form>
      </dialog>
    </>
  );
}
