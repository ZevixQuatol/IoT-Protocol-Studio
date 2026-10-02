import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  CheckCircle2,
  Code2,
  Copy,
  FileText,
  FolderOpen,
  MoreHorizontal,
  Save,
  TriangleAlert,
  Trash2,
  X,
} from "lucide-react";
import {
  messageTemplates,
  type MessageEncodeField,
  type MessageEncodeResult,
  type MessageTemplate,
  type TemplateAction,
  type WorkspaceProtocol,
} from "./bridge";
import { messages, type Locale } from "./i18n";

export default function MessageTemplates({
  protocol,
  projectRoot,
  message,
  messageLabel,
  fields,
  fieldCount,
  busy,
  disabled,
  locale,
  onBusy,
  onLoad,
  onView,
  onCopy,
  onExport,
  canCopy,
  selector,
  children,
}: {
  protocol: WorkspaceProtocol;
  projectRoot: string;
  message: string;
  messageLabel: string;
  fields: MessageEncodeField[];
  fieldCount: number;
  busy: boolean;
  disabled: boolean;
  locale: Locale;
  onBusy: (value: boolean) => void;
  onLoad: (fields: MessageEncodeField[]) => void;
  onView: (view: "code" | "visual" | "message") => void;
  onCopy: () => void;
  onExport: () => void;
  canCopy: boolean;
  selector: ReactNode;
  children: ReactNode;
}) {
  const t = messages[locale],
    zh = locale === "zh-CN",
    path = protocol.path;
  const [items, setItems] = useState<MessageTemplate[]>([]);
  const [selected, setSelected] = useState("");
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirm, setConfirm] = useState<"save" | "replace" | "delete" | null>(null);
  const dialog = useRef<HTMLDialogElement>(null),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    let active = true;
    void messageTemplates("list", path, message)
      .then((result) => {
        if (!active) return;
        if (result.ok) setItems(result.templates);
        else setError(`[${result.error.code}] ${result.error.message}`);
      })
      .catch((reason) => {
        if (active) setError(String(reason));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      alive.current = false;
    };
  }, [path, message]);
  useEffect(() => {
    if (confirm && !dialog.current?.open) dialog.current?.showModal();
  }, [confirm]);
  const blocked = disabled || busy || loading;
  const choice = items.find((item) => item.name === selected);
  const openSave = () => {
    if (blocked) return;
    setError("");
    setNotice("");
    setMenuOpen(false);
    setTarget(selected);
    setName(selected);
    setConfirm(choice ? "replace" : "save");
  };
  const run = async (action: TemplateAction) => {
    if (blocked) return;
    const templateName =
      action === "save"
        ? name.trim()
        : action === "replace" || action === "delete"
          ? target
          : selected;
    if (!templateName) return;
    onBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await messageTemplates(
        action,
        path,
        message,
        templateName,
        action === "save" || action === "replace" ? fields : [],
      );
      if (!alive.current) return;
      if (!result.ok) {
        setError(
          result.error.code === "message_template_incompatible"
            ? t.messageStudio.incompatible
            : result.error.code === "message_template_conflict"
              ? t.messageStudio.templateConflict
              : `[${result.error.code}] ${result.error.message}`,
        );
        if (action === "save" && result.error.code === "message_template_conflict") {
          setTarget(templateName);
          setConfirm("replace");
        }
        return;
      }
      if (action === "load") {
        onLoad(result.templates[0].fields);
        setNotice(zh ? "模板已加载" : "Template loaded");
      } else {
        setItems(result.templates);
        setSelected(action === "delete" ? "" : templateName);
        setNotice(
          action === "delete" ? t.messageStudio.templateDeleted : t.messageStudio.templateSaved,
        );
      }
      dialog.current?.close();
      setConfirm(null);
    } catch (reason) {
      if (alive.current) setError(String(reason));
    } finally {
      onBusy(false);
    }
  };
  const location = `${projectRoot.replace(/[\\/]$/, "")}\\message-templates.yaml`;
  const unavailable = zh ? "此功能尚未实现" : "Not available yet";
  const facts = (rows: string[][]) => (
    <dl>
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd title={value}>{value}</dd>
        </div>
      ))}
    </dl>
  );
  return (
    <section className="message-workbench" aria-label={t.messageStudio.title}>
      <div className="message-workbench-main">
        <header className="message-workbench-heading">
          <div>
            <small title={path}>
              {path} · {zh ? "报文组包工作台" : "Message workbench"}
            </small>
            <div>
              <h1>{protocol.name}</h1>
              <span className={disabled ? "message-unsaved" : "message-saved"}>
                {disabled ? <TriangleAlert size={20} /> : <CheckCircle2 size={20} />}
                {disabled ? t.editor.unsaved : t.editor.saved}
              </span>
            </div>
          </div>
          <div className="message-toolbar-actions">
            <button disabled={blocked} onClick={openSave}>
              <Save size={23} />
              {zh ? "保存模板" : "Save template"}
            </button>
            <button disabled={blocked || !choice?.compatible} onClick={() => void run("load")}>
              <FolderOpen size={23} />
              {zh ? "载入模板" : "Load template"}
            </button>
            <div
              className="message-toolbar-menu"
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) setMenuOpen(false);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") setMenuOpen(false);
              }}
            >
              <button
                aria-label={zh ? "模板操作" : "Template actions"}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                onClick={() => setMenuOpen(!menuOpen)}
              >
                <MoreHorizontal size={23} />
              </button>
              {menuOpen && (
                <div role="menu">
                  <button
                    role="menuitem"
                    disabled={blocked}
                    onClick={() => {
                      setError("");
                      setName("");
                      setConfirm("save");
                      setMenuOpen(false);
                    }}
                  >
                    {zh ? "另存为新模板" : "Save as new template"}
                  </button>
                  <button
                    role="menuitem"
                    disabled={blocked || !choice}
                    onClick={() => {
                      setTarget(selected);
                      setError("");
                      setConfirm("delete");
                      setMenuOpen(false);
                    }}
                  >
                    <Trash2 size={16} />
                    {t.messageStudio.deleteTemplate}
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <div className="message-workbench-tabs" role="tablist" aria-label={t.editor.view}>
          {(["code", "visual", "message"] as const).map((view, index) => (
            <button
              key={view}
              role="tab"
              aria-selected={view === "message"}
              onClick={() => onView(view)}
            >
              {(zh ? ["代码", "结构", "报文"] : ["Code", "Structure", "Message"])[index]}
            </button>
          ))}
        </div>
        <div className="message-workbench-selectors">
          {selector}
          <label>
            {t.messageStudio.templates}
            <select
              value={selected}
              disabled={blocked}
              onChange={(event) => {
                setSelected(event.target.value);
                setNotice("");
                setError("");
              }}
            >
              <option value="">
                {loading ? (zh ? "加载中…" : "Loading…") : t.messageStudio.chooseTemplate}
              </option>
              {items.map((item) => (
                <option key={item.name} value={item.name}>
                  {item.name}
                  {item.compatible ? "" : zh ? "（不兼容）" : " (incompatible)"}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="message-workbench-fields" role="tabpanel" tabIndex={0}>
          {disabled && (
            <p className="message-workbench-notice">
              <TriangleAlert size={18} />
              {t.messageStudio.unsavedHint}
            </p>
          )}
          <div className="message-field-count">
            {zh ? "字段" : "Fields"} ({fieldCount})
          </div>
          {children}
          {choice && !choice.compatible && (
            <p className="message-workbench-notice">{t.messageStudio.incompatible}</p>
          )}
          {error && !confirm && <p role="alert">{error}</p>}
          {notice && <p role="status">{notice}</p>}
        </div>
      </div>
      <aside
        className="message-workbench-inspector"
        aria-label={zh ? "报文信息" : "Message information"}
      >
        <h2>{zh ? "报文信息" : "Message information"}</h2>
        {facts(
          zh
            ? [
                ["名称", message || "—"],
                ["协议", protocol.name],
                ["版本", protocol.schema.protocolVersion],
                ["字段数量", String(fieldCount)],
                ["显示名称", messageLabel || "—"],
              ]
            : [
                ["Name", message || "—"],
                ["Protocol", protocol.name],
                ["Version", protocol.schema.protocolVersion],
                ["Fields", String(fieldCount)],
                ["Display name", messageLabel || "—"],
              ],
        )}
        <h2>{zh ? "模板信息" : "Template information"}</h2>
        {choice ? (
          facts(
            zh
              ? [
                  ["名称", choice.name],
                  ["关联报文", message],
                  ["默认值数量", String(choice.fields.length)],
                  ["状态", choice.compatible ? "兼容" : "不兼容"],
                  ["保存位置", "message-templates.yaml"],
                ]
              : [
                  ["Name", choice.name],
                  ["Message", message],
                  ["Default values", String(choice.fields.length)],
                  ["Status", choice.compatible ? "Compatible" : "Incompatible"],
                  ["Location", "message-templates.yaml"],
                ],
          )
        ) : (
          <p>{zh ? "选择模板后查看信息" : "Select a template to view details"}</p>
        )}
        <h2>{zh ? "快速操作" : "Quick actions"}</h2>
        <div className="message-quick-actions">
          <button disabled={blocked} onClick={openSave}>
            <Save size={23} />
            {zh ? "保存为模板" : "Save as template"}
          </button>
          <button disabled={!canCopy || busy || disabled} onClick={onExport}>
            <FileText size={23} />
            {zh ? "导出 HEX" : "Export HEX"}
          </button>
          <button disabled={!canCopy || busy || disabled} onClick={onCopy}>
            <Copy size={23} />
            {t.messageStudio.copyHex}
          </button>
          <button disabled title={unavailable}>
            <Code2 size={23} />
            {zh ? "生成示例代码" : "Generate sample code"}
          </button>
        </div>
      </aside>
      <dialog
        ref={dialog}
        className={`message-template-dialog ${confirm === "replace" ? "template-overwrite-dialog" : ""}`}
        aria-labelledby="template-confirm-title"
        onCancel={(event) => {
          if (busy) event.preventDefault();
        }}
        onClose={() => setConfirm(null)}
      >
        <header>
          <TriangleAlert
            className={confirm === "replace" || confirm === "delete" ? "danger" : ""}
            size={36}
          />
          <div>
            <h2 id="template-confirm-title">
              {confirm === "replace"
                ? zh
                  ? "覆盖模板确认"
                  : "Confirm template overwrite"
                : confirm === "delete"
                  ? t.messageStudio.deleteTemplate
                  : zh
                    ? "保存新模板"
                    : "Save new template"}
            </h2>
            <p>
              {confirm === "delete"
                ? t.messageStudio.confirmTemplate
                : zh
                  ? "当前操作由「保存模板」触发。"
                  : "Save the current message field values as a template."}
            </p>
          </div>
          <button
            type="button"
            aria-label={zh ? "关闭弹窗" : "Close dialog"}
            disabled={busy}
            onClick={() => dialog.current?.close()}
          >
            <X size={22} />
          </button>
        </header>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (confirm !== "save") return;
            if (items.some((item) => item.name === name.trim())) {
              setTarget(name.trim());
              setConfirm("replace");
              setError("");
            } else void run("save");
          }}
        >
          {confirm === "save" ? (
            <label className="template-name-input">
              {t.messageStudio.templateName}
              <input
                autoFocus
                value={name}
                required
                maxLength={64}
                disabled={blocked}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
          ) : (
            <div className="template-confirm-details">
              {facts(
                zh
                  ? [
                      [t.messageStudio.templateName, target],
                      ["关联报文", message],
                      ["现有模板位置", location],
                      [
                        "默认值数量",
                        String(items.find((item) => item.name === target)?.fields.length ?? "—"),
                      ],
                    ]
                  : [
                      [t.messageStudio.templateName, target],
                      ["Message", message],
                      ["Template location", location],
                      [
                        "Default values",
                        String(items.find((item) => item.name === target)?.fields.length ?? "—"),
                      ],
                    ],
              )}
            </div>
          )}
          {confirm === "replace" && (
            <>
              <p className="template-overwrite-warning">
                <TriangleAlert size={25} />
                {zh
                  ? "同名模板已存在。覆盖后将替换现有字段默认值，且无法撤销。"
                  : "A template with this name exists. Its field defaults will be replaced. This cannot be undone."}
              </p>
              <div className="template-overwrite-content">
                <p>{zh ? "将覆盖以下内容：" : "The following content will be replaced:"}</p>
                <div>
                  <FileText size={24} />
                  <strong>{zh ? "字段默认值" : "Field defaults"}</strong>
                  <span>
                    {zh
                      ? `保存当前 ${fields.length} 个可输入字段的值`
                      : `Save the current values of ${fields.length} input fields`}
                  </span>
                </div>
                <div>
                  <FolderOpen size={24} />
                  <strong>{zh ? "关联报文" : "Message binding"}</strong>
                  <span>
                    {protocol.name} / {message}
                  </span>
                </div>
                <div>
                  <Code2 size={24} />
                  <strong>{zh ? "payload 示例字节" : "Payload preview"}</strong>
                  <span>
                    {zh
                      ? "由字段值生成，不单独保存"
                      : "Generated from field values; not stored separately"}
                  </span>
                </div>
              </div>
              <label className="template-backup-option" title={unavailable}>
                <input type="checkbox" disabled />
                {zh
                  ? "保留原模板备份（暂不支持）"
                  : "Keep a backup of the original template (unavailable)"}
              </label>
            </>
          )}
          {confirm === "delete" && (
            <p className="template-overwrite-warning">
              {t.messageStudio.confirmTemplate} {target}
            </p>
          )}
          {error && <p role="alert">{error}</p>}
          <footer>
            <button type="button" disabled={busy} onClick={() => dialog.current?.close()}>
              {t.create.cancel}
            </button>
            {confirm === "replace" && (
              <button
                type="button"
                disabled={blocked}
                onClick={() => {
                  setName("");
                  setError("");
                  setConfirm("save");
                }}
              >
                {zh ? "另存为新模板" : "Save as new template"}
              </button>
            )}
            <button
              type={confirm === "save" ? "submit" : "button"}
              className="primary"
              disabled={blocked || (confirm === "save" && !name.trim())}
              onClick={() => {
                if (confirm === "replace" || confirm === "delete") void run(confirm);
              }}
            >
              {confirm === "replace"
                ? zh
                  ? "覆盖模板"
                  : "Overwrite template"
                : confirm === "delete"
                  ? t.messageStudio.deleteTemplate
                  : t.messageStudio.saveTemplate}
            </button>
          </footer>
        </form>
      </dialog>
    </section>
  );
}

export function MessageOutput({
  result,
  locale,
  disabled,
  onCopy,
  onDebug,
  onConnection,
  onExport,
  onStatus,
  status,
  debugDisabled,
  dynamic,
}: {
  result?: MessageEncodeResult;
  locale: Locale;
  disabled: boolean;
  onCopy: () => void;
  onDebug: () => void;
  onConnection: () => void;
  onExport: () => void;
  onStatus: (message: string) => void;
  status: string;
  debugDisabled: boolean;
  dynamic: boolean;
}) {
  const zh = locale === "zh-CN",
    [view, setView] = useState("hex"),
    [menu, setMenu] = useState(false);
  const blocked = disabled || !result?.ok;
  const bytes = result?.ok ? (result.normalizedHex.match(/[\da-fA-F]{2}/g) ?? []) : [];
  const rows = Array.from({ length: Math.ceil(bytes.length / 16) }, (_, index) =>
    bytes.slice(index * 16, index * 16 + 16),
  );
  return (
    <section className="message-output" aria-label={zh ? "报文预览" : "Message preview"}>
      <header>
        <div role="tablist" aria-label={zh ? "预览格式" : "Preview format"}>
          {["hex", "ascii"].map((type) => (
            <button
              role="tab"
              aria-selected={view === type}
              onClick={() => setView(type)}
              key={type}
            >
              {type.toUpperCase()}
            </button>
          ))}
        </div>
        {result?.ok && <span>{result.byteCount} B</span>}
        {status && <span role="status">{status}</span>}
        <div className="message-output-actions">
          <button disabled={blocked} onClick={onCopy}>
            <Copy size={18} />
            {zh ? "复制 HEX" : "Copy HEX"}
          </button>
          <button
            disabled={blocked}
            onClick={async () => {
              if (result?.ok)
                try {
                  await navigator.clipboard.writeText(result.ascii);
                  onStatus(zh ? "ASCII 已复制" : "ASCII copied");
                } catch (error) {
                  onStatus(String(error));
                }
            }}
          >
            <FileText size={18} />
            {zh ? "复制 ASCII" : "Copy ASCII"}
          </button>
          <div
            className="message-toolbar-menu"
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) setMenu(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") setMenu(false);
            }}
          >
            <button
              aria-label={zh ? "报文操作" : "Message actions"}
              aria-expanded={menu}
              onClick={() => setMenu(!menu)}
            >
              <MoreHorizontal size={22} />
            </button>
            {menu && (
              <div>
                <button disabled={blocked} onClick={onExport}>
                  {zh ? "导出 HEX" : "Export HEX"}
                </button>
                <button disabled={blocked || debugDisabled} onClick={onDebug}>
                  {zh ? "送入调试" : "Open in Debug"}
                </button>
                <button disabled={blocked} onClick={onConnection}>
                  {zh ? "送入通信" : "Open in Connections"}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      <div className="message-output-body" role="tabpanel">
        {!result ? (
          <p>
            {zh ? "生成报文后查看 HEX 和 ASCII" : "Generate a message to preview HEX and ASCII"}
          </p>
        ) : !result.ok ? (
          <p role="alert">
            [{result.error.code}] {result.error.path} · {result.error.message}
            {result.error.offset !== undefined ? ` · offset ${result.error.offset}` : ""}
          </p>
        ) : (
          <>
            {dynamic && (
              <small>
                {zh
                  ? "动态值为预览样例；通信发送时重新生成。"
                  : "Dynamic values are a preview; regenerated when sending."}
              </small>
            )}
            {view === "ascii" ? (
              <pre>{result.ascii}</pre>
            ) : (
              rows.map((row, index) => (
                <div className="message-byte-row" key={index}>
                  <span>{(index * 16).toString(16).toUpperCase().padStart(4, "0")}</span>
                  <code>{row.join("  ")}</code>
                  <code>{result.ascii.slice(index * 16, index * 16 + 16)}</code>
                </div>
              ))
            )}
          </>
        )}
      </div>
    </section>
  );
}
