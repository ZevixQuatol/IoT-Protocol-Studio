import { useRef, useState, type RefObject } from "react";
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleX,
  Copy,
  ExternalLink,
  FileText,
  Maximize2,
  MoreHorizontal,
  Play,
  Save,
  TriangleAlert,
} from "lucide-react";
import type { ProtocolValidationResult, WorkspaceProtocol } from "./bridge";
import { exportProtocolFile } from "./bridge";
import type { Locale } from "./i18n";

export type ProtocolCheck = { path: string; content: string; result: ProtocolValidationResult };

function highlighted(line: string) {
  // ponytail: visual tokens only; Core parses YAML. Add an editor library if folding/completion is required.
  const tokens =
    /("(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|#[^\n]*$|[\w.-]+(?=\s*:)|\b(?:true|false|null|0x[\da-fA-F]+|\d+(?:\.\d+)?)\b)/g;
  const parts = [];
  let start = 0;
  for (const match of line.matchAll(tokens)) {
    parts.push(line.slice(start, match.index));
    const value = match[0];
    const kind = value.startsWith("#")
      ? "comment"
      : /^["']/.test(value)
        ? "string"
        : /^\s*:/.test(line.slice(match.index + value.length))
          ? "key"
          : "value";
    parts.push(
      <span className={`yaml-${kind}`} key={match.index}>
        {value}
      </span>,
    );
    start = match.index + value.length;
  }
  parts.push(line.slice(start));
  return parts;
}

export function jumpToProtocolLine(editor: HTMLTextAreaElement | null, line = 1, column = 1) {
  if (!editor) return;
  const lines = editor.value.split("\n");
  const index = Math.max(0, Math.min(lines.length - 1, line - 1));
  const start = lines.slice(0, index).reduce((offset, text) => offset + text.length + 1, 0);
  editor.focus();
  editor.setSelectionRange(
    start + Math.min(lines[index].length, Math.max(0, column - 1)),
    start + lines[index].length,
  );
  editor.scrollTop = Math.max(
    0,
    index * parseFloat(getComputedStyle(editor).lineHeight) - editor.clientHeight / 3,
  );
  editor.dispatchEvent(new Event("scroll"));
}

export default function ProtocolCodeEditor({
  protocol,
  locale,
  value,
  dirty,
  busy,
  check,
  editorRef,
  onChange,
  onSave,
  onValidate,
  onView,
  onActionError,
}: {
  protocol: WorkspaceProtocol;
  locale: Locale;
  value: string;
  dirty: boolean;
  busy: boolean;
  check?: ProtocolValidationResult;
  editorRef: RefObject<HTMLTextAreaElement | null>;
  onChange: (text: string) => void;
  onSave: () => void;
  onValidate: () => void;
  onView: (view: "code" | "visual" | "message") => void;
  onActionError: (message: string) => void;
}) {
  const zh = locale === "zh-CN";
  const overlay = useRef<HTMLDivElement>(null);
  const gutter = useRef<HTMLDivElement>(null);
  const [currentLine, setCurrentLine] = useState(1);
  const [menuOpen, setMenuOpen] = useState(false);
  const failed = check && !check.ok ? check.error : undefined;
  const passed = check?.ok || (!dirty && !failed);
  const lines = value.split("\n");
  const unavailable = zh ? "此功能尚未实现" : "Not available yet";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch (error) {
      onActionError(error instanceof Error ? error.message : String(error));
    }
  };
  const exportYaml = async () => {
    try {
      const result = await exportProtocolFile(value);
      if (!result.ok) onActionError(result.error.message);
    } catch (error) {
      onActionError(error instanceof Error ? error.message : String(error));
    }
  };
  return (
    <div className={`protocol-code-layout ${failed ? "validation-failed" : ""}`}>
      <section
        className="protocol-code-main"
        aria-label={zh ? "协议 YAML 代码编辑" : "Protocol YAML editor"}
      >
        <header className="protocol-code-heading">
          <div className="protocol-code-title">
            <small title={protocol.path}>{protocol.path}</small>
            <div>
              <h1>{protocol.name}</h1>
              <span className={`protocol-save-state ${dirty ? "dirty" : "saved"}`}>
                {dirty ? (zh ? "未保存修改" : "Unsaved changes") : zh ? "已保存" : "Saved"}
              </span>
              <span
                className={`protocol-validation-state ${failed ? "failed" : passed ? "passed" : "pending"}`}
              >
                {failed ? (
                  <CircleX size={22} />
                ) : passed ? (
                  <CheckCircle2 size={22} />
                ) : (
                  <TriangleAlert size={20} />
                )}
                {failed
                  ? zh
                    ? "校验失败"
                    : "Validation failed"
                  : passed
                    ? zh
                      ? "校验通过"
                      : "Validation passed"
                    : zh
                      ? "待校验"
                      : "Not validated"}
              </span>
            </div>
          </div>
          <div className="protocol-code-actions">
            <button className="protocol-save-button" disabled={busy || !dirty} onClick={onSave}>
              <Save size={22} />
              {zh ? "保存" : "Save"}
            </button>
            <button disabled={busy} onClick={onValidate}>
              <Play size={22} />
              {zh ? "校验" : "Validate"}
            </button>
            <div
              className="protocol-code-menu"
              onKeyDown={(event) => {
                if (event.key === "Escape") setMenuOpen(false);
              }}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) setMenuOpen(false);
              }}
            >
              <button
                aria-label={zh ? "协议操作" : "Protocol actions"}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                onClick={() => setMenuOpen(!menuOpen)}
              >
                <MoreHorizontal size={25} />
              </button>
              {menuOpen && (
                <div role="menu" aria-label={zh ? "协议操作" : "Protocol actions"}>
                  <button
                    role="menuitem"
                    onClick={() => {
                      void copy();
                      setMenuOpen(false);
                    }}
                  >
                    {zh ? "复制到剪贴板" : "Copy to clipboard"}
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => {
                      exportYaml();
                      setMenuOpen(false);
                    }}
                  >
                    {zh ? "导出协议" : "Export protocol"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <div
          className="protocol-code-tabs"
          role="tablist"
          aria-label={zh ? "编辑器视图" : "Editor view"}
        >
          {(["code", "visual", "message"] as const).map((view, index) => (
            <button
              key={view}
              role="tab"
              aria-selected={view === "code"}
              onClick={() => onView(view)}
            >
              {(zh ? ["代码", "结构", "报文"] : ["Code", "Structure", "Message"])[index]}
            </button>
          ))}
        </div>
        <div className="yaml-code-editor" role="tabpanel">
          <div className="yaml-gutter" aria-hidden="true">
            <div ref={gutter}>
              {lines.map((_, index) => (
                <div key={index} className={failed?.line === index + 1 ? "error-line" : ""}>
                  {failed?.line === index + 1 && <CircleX size={15} />}
                  <span>{index + 1}</span>
                </div>
              ))}
            </div>
          </div>
          <div ref={overlay} className="yaml-highlight-scroll" aria-hidden="true">
            <pre>
              {lines.map((line, index) => (
                <div
                  className={`yaml-line ${failed?.line === index + 1 ? "error-line" : currentLine === index + 1 ? "current-line" : ""}`}
                  key={index}
                >
                  {highlighted(line) || " "}
                  {!line && " "}
                </div>
              ))}
            </pre>
          </div>
          <textarea
            ref={editorRef}
            aria-label={`${zh ? "物理文件" : "Physical file"}: ${protocol.path}`}
            value={value}
            readOnly={busy}
            spellCheck={false}
            wrap="off"
            onChange={(event) => onChange(event.target.value)}
            onSelect={(event) =>
              setCurrentLine(
                event.currentTarget.value.slice(0, event.currentTarget.selectionStart).split("\n")
                  .length,
              )
            }
            onScroll={(event) => {
              if (overlay.current) {
                overlay.current.scrollTop = event.currentTarget.scrollTop;
                overlay.current.scrollLeft = event.currentTarget.scrollLeft;
              }
              if (gutter.current)
                gutter.current.style.transform = `translateY(${-event.currentTarget.scrollTop}px)`;
            }}
            onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
                event.preventDefault();
                if (!busy && dirty) onSave();
              }
              if (event.key === "Tab" && !event.shiftKey && !busy) {
                event.preventDefault();
                const input = event.currentTarget;
                const start = input.selectionStart;
                const end = input.selectionEnd;
                onChange(value.slice(0, start) + "  " + value.slice(end));
                requestAnimationFrame(() => input.setSelectionRange(start + 2, start + 2));
              }
            }}
          />
        </div>
      </section>
      <aside
        className="protocol-code-inspector"
        aria-label={zh ? "协议信息" : "Protocol information"}
      >
        <h2>{zh ? "协议信息" : "Protocol information"}</h2>
        <dl>
          <div>
            <dt>{zh ? "名称" : "Name"}</dt>
            <dd>{protocol.name}</dd>
          </div>
          <div>
            <dt>{zh ? "版本" : "Version"}</dt>
            <dd>{protocol.schema.protocolVersion}</dd>
          </div>
          <div>
            <dt>{zh ? "字节序" : "Byte order"}</dt>
            <dd>
              {protocol.schema.defaultByteOrder === "little" ? "Little Endian" : "Big Endian"}
            </dd>
          </div>
          <div>
            <dt>{zh ? "描述" : "Description"}</dt>
            <dd>{protocol.description || "—"}</dd>
          </div>
        </dl>
        {dirty && (
          <p className="protocol-info-hint">
            {zh ? "信息来自最近保存的协议。" : "Information from the last saved protocol."}
          </p>
        )}
        <h2>{zh ? "快速操作" : "Quick actions"}</h2>
        <div className="protocol-quick-actions">
          <button disabled title={unavailable}>
            <FileText size={23} />
            {zh ? "格式化 YAML" : "Format YAML"}
          </button>
          <button disabled={busy} onClick={onValidate}>
            <CheckCircle2 size={23} />
            {zh ? "校验协议" : "Validate protocol"}
          </button>
          <button onClick={() => onView("message")}>
            <Play size={23} />
            {zh ? "生成示例报文" : "Message preview"}
          </button>
          <button onClick={exportYaml}>
            <FileText size={23} />
            {zh ? "导出协议" : "Export protocol"}
          </button>
          <button onClick={() => void copy()}>
            <Copy size={23} />
            {zh ? "复制到剪贴板" : "Copy to clipboard"}
          </button>
        </div>
        <h2>{zh ? "文档与参考" : "Documentation"}</h2>
        <div className="protocol-quick-actions">
          <button disabled title={unavailable}>
            <BookOpen size={23} />
            {zh ? "查看协议文档" : "Protocol documentation"}
          </button>
          <button disabled title={unavailable}>
            <ExternalLink size={23} />
            {zh ? "打开示例目录" : "Example directory"}
          </button>
        </div>
      </aside>
    </div>
  );
}

export function ProtocolProblems({
  locale,
  protocol,
  check,
  expanded,
  onToggle,
  onJump,
}: {
  locale: Locale;
  protocol: WorkspaceProtocol;
  check?: ProtocolValidationResult;
  expanded: boolean;
  onToggle: () => void;
  onJump: () => void;
}) {
  const zh = locale === "zh-CN";
  const error = check && !check.ok ? check.error : undefined;
  const suggestion =
    error?.code === "yaml_unknown_field_type" || error?.message.includes("yaml_unknown_field_type")
      ? zh
        ? "使用支持的字段类型，如 float32 或 uint16，并确认缩放系数。"
        : "Use a supported type such as float32 or uint16 and check scaling."
      : zh
        ? "根据错误位置检查 YAML 和字段定义。"
        : "Check YAML and field definitions at the reported location.";
  return (
    <section
      className={`protocol-problems ${expanded ? "expanded" : ""}`}
      aria-label={zh ? "问题列表" : "Problems"}
    >
      <header>
        <button className="protocol-problems-toggle" aria-expanded={expanded} onClick={onToggle}>
          {expanded ? <ChevronUp size={22} /> : <ChevronDown size={22} />}
          <strong>{zh ? "问题列表" : "Problems"}</strong>
        </button>
        <span className={error ? "failed" : "passed"}>
          {error ? <CircleX size={21} /> : <CheckCircle2 size={21} />} {error ? 1 : 0}
        </span>
        <span className="warning">
          <TriangleAlert size={21} /> 0
        </span>
        {error?.line && (
          <button
            className="protocol-problem-jump"
            onClick={onJump}
            title={zh ? "跳转到错误行" : "Jump to error"}
          >
            <Maximize2 size={19} />
          </button>
        )}
      </header>
      {expanded && (
        <div className="protocol-problems-scroll">
          {error ? (
            <table>
              <thead>
                <tr>
                  {(zh
                    ? ["级别", "位置", "问题描述", "修正方向", "操作"]
                    : ["Level", "Location", "Description", "Suggestion", "Action"]
                  ).map((text) => (
                    <th key={text}>{text}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <CircleX size={20} />
                    {zh ? "错误" : "Error"}
                  </td>
                  <td>
                    {protocol.path.split(/[\\/]/).at(-1)}
                    {error.line ? `:${error.line}` : ""}
                  </td>
                  <td title={error.path}>
                    {error.message}
                    <small>{error.path}</small>
                  </td>
                  <td>{suggestion}</td>
                  <td>
                    <button disabled={!error.line} onClick={onJump}>
                      {zh ? "跳转" : "Jump"}
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          ) : (
            <p>{zh ? "暂无校验问题" : "No validation problems"}</p>
          )}
        </div>
      )}
    </section>
  );
}
