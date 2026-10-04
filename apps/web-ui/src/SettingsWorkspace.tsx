import { useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Cpu,
  Download,
  FileText,
  Globe,
  Info,
  Monitor,
  RefreshCw,
  Search,
  Sliders,
  Terminal,
  Trash2,
} from "react-feather";
import type { CoreInfo } from "./bridge";
import type { Locale, Theme } from "./i18n";
import type { DisplayPreferences, ThemeMode } from "./displayPreferences";
import {
  diagnosticAdvice,
  diagnosticLevel,
  diagnosticTime,
  filterDiagnostics,
  type Diagnostic,
  type DiagnosticLevel,
} from "./diagnostics";
import "./settings-workspace.css";

type SettingsTab = "appearance" | "problems" | "logs";
type Props = {
  locale: Locale;
  theme: Theme;
  themeMode: ThemeMode;
  display: DisplayPreferences;
  coreInfo?: CoreInfo | null;
  diagnostics: Diagnostic[];
  onTheme: (mode: ThemeMode) => void;
  onLocale: (locale: Locale) => void;
  onDisplay: (display: DisplayPreferences) => void;
  onLocate: (item: Diagnostic) => void;
  onClear: () => void;
  onExport: (items: Diagnostic[]) => Promise<"saved" | "cancelled">;
};

function Severity({ level, label }: { level: DiagnosticLevel; label?: string }) {
  const Icon = level === "error" ? AlertCircle : level === "warn" ? AlertTriangle : Info;
  return (
    <span className={`p14-severity ${level}`}>
      <Icon size={14} />
      {label}
    </span>
  );
}

function Appearance(props: Props) {
  const zh = props.locale === "zh-CN",
    t = (cn: string, en: string) => (zh ? cn : en);
  const [preview, setPreview] = useState<Theme>(props.theme);
  const update = <K extends keyof DisplayPreferences>(key: K, value: DisplayPreferences[K]) =>
    props.onDisplay({ ...props.display, [key]: value });
  const modes: { mode: ThemeMode; title: string; hint: string }[] = [
    {
      mode: "dark",
      title: t("深色主题", "Dark theme"),
      hint: t("适合低光环境，减少视觉疲劳", "Comfortable in low light"),
    },
    { mode: "light", title: t("浅色主题", "Light theme"), hint: t("清爽明亮", "Clear and bright") },
    {
      mode: "system",
      title: t("跟随系统", "Follow system"),
      hint: t("跟随 Windows 系统设置", "Use the Windows system theme"),
    },
  ];
  return (
    <div className="settings-body p14-appearance">
      <section className="p14-card p14-themes" aria-labelledby="settings-theme-title">
        <h2 id="settings-theme-title">{t("主题外观", "Theme appearance")}</h2>
        <div className="p14-theme-options" role="group" aria-label={t("主题", "Theme")}>
          {modes.map(({ mode, title, hint }) => (
            <button
              key={mode}
              type="button"
              aria-pressed={props.themeMode === mode}
              onClick={() => props.onTheme(mode)}
              className={`p14-theme-card ${mode}-choice ${props.themeMode === mode ? "active" : ""}`}
            >
              <span className="p14-choice-label">
                <span className="p14-radio">{props.themeMode === mode && <Check size={11} />}</span>
                <strong>{title}</strong>
                <small>{props.themeMode === mode ? t("当前使用", "Current") : hint}</small>
              </span>
              <img
                src={`/settings/preview-${mode === "system" ? props.theme : mode}.jpg`}
                alt={t(`${title}界面效果`, `${title} interface preview`)}
              />
            </button>
          ))}
        </div>
      </section>
      <section className="p14-card p14-display-card">
        <div className="p14-language" aria-labelledby="settings-language-title">
          <h2 id="settings-language-title">
            <Globe size={18} />
            {t("语言设置", "Language")}
          </h2>
          <p>{t("选择界面显示语言", "Choose the interface language")}</p>
          <div
            className="p14-language-options"
            role="group"
            aria-label={t("界面语言", "Interface language")}
          >
            {(["zh-CN", "en-US"] as const).map((locale) => (
              <button
                type="button"
                key={locale}
                aria-pressed={props.locale === locale}
                className={props.locale === locale ? "active" : ""}
                onClick={() => props.onLocale(locale)}
              >
                <span className="p14-radio">{props.locale === locale && <Check size={11} />}</span>
                {locale === "zh-CN" ? "简体中文" : "English"}
                {props.locale === locale && <small>{t("当前使用", "Current")}</small>}
              </button>
            ))}
          </div>
        </div>
        <div className="p14-display" aria-labelledby="settings-display-title">
          <h2 id="settings-display-title">
            <Sliders size={18} />
            {t("界面显示", "Display")}
          </h2>
          <label>
            <span>{t("字体大小", "Font size")}</span>
            <select
              value={props.display.fontSize}
              onChange={(event) =>
                update("fontSize", Number(event.target.value) as DisplayPreferences["fontSize"])
              }
            >
              <option value={12}>{t("紧凑 (12px)", "Small (12px)")}</option>
              <option value={13}>{t("标准 (13px)", "Standard (13px)")}</option>
              <option value={15}>{t("大号 (15px)", "Large (15px)")}</option>
            </select>
          </label>
          <label>
            <span>{t("表格行高", "Table row height")}</span>
            <select
              value={props.display.rowHeight}
              onChange={(event) =>
                update("rowHeight", event.target.value as DisplayPreferences["rowHeight"])
              }
            >
              <option value="compact">{t("紧凑", "Compact")}</option>
              <option value="standard">{t("标准", "Standard")}</option>
              <option value="comfortable">{t("宽松", "Comfortable")}</option>
            </select>
          </label>
          <label>
            <span>{t("HEX 字体", "HEX font")}</span>
            <select
              value={props.display.hexFont}
              onChange={(event) =>
                update("hexFont", event.target.value as DisplayPreferences["hexFont"])
              }
            >
              <option value="consolas">Consolas {t("（推荐）", "(recommended)")}</option>
              <option value="cascadia">Cascadia Code</option>
              <option value="system">{t("系统等宽字体", "System monospace")}</option>
            </select>
          </label>
          <label className="p14-switch-row">
            <input
              type="checkbox"
              role="switch"
              checked={props.display.lineNumbers}
              onChange={(event) => update("lineNumbers", event.target.checked)}
            />
            <span>{t("显示行号", "Show line numbers")}</span>
            <small>{t("在 HEX 编辑器和日志中显示行号", "Show line numbers in HEX and logs")}</small>
          </label>
          <label className="p14-switch-row">
            <input
              type="checkbox"
              role="switch"
              checked={props.display.milliseconds}
              onChange={(event) => update("milliseconds", event.target.checked)}
            />
            <span>{t("显示时间戳", "Show milliseconds")}</span>
            <small>{t("在诊断记录中显示毫秒时间", "Show milliseconds in diagnostics")}</small>
          </label>
        </div>
      </section>
      <section className="p14-card p14-previews" aria-labelledby="settings-preview-title">
        <h2 id="settings-preview-title">{t("预览效果", "Theme preview")}</h2>
        <p>
          {t(
            "不同主题下的界面效果示意（仅展示部分区域）",
            "Illustrative app captures under each theme",
          )}
        </p>
        <div
          className="p14-preview-tabs"
          role="tablist"
          aria-label={t("主题预览", "Theme preview")}
        >
          {(["dark", "light"] as const).map((theme) => (
            <button
              key={theme}
              type="button"
              role="tab"
              aria-selected={preview === theme}
              onClick={() => setPreview(theme)}
            >
              {theme === "dark" ? t("深色主题", "Dark theme") : t("浅色主题", "Light theme")}
              {props.theme === theme && t("（当前）", " (current)")}
            </button>
          ))}
        </div>
        <div className="p14-preview-images">
          {(["dark", "light"] as const).map((theme) => (
            <figure key={theme} className={preview === theme ? "selected" : ""}>
              <img
                src={`/settings/preview-${theme}.jpg`}
                alt={
                  theme === "dark"
                    ? t("深色应用预览", "Dark app preview")
                    : t("浅色应用预览", "Light app preview")
                }
              />
              <figcaption>
                {theme === "dark" ? t("深色主题", "Dark theme") : t("浅色主题", "Light theme")}
              </figcaption>
            </figure>
          ))}
        </div>
        <p className="p14-preview-note">
          {t("设置自动保存并立即生效", "Settings save automatically and apply immediately")}
        </p>
      </section>
    </div>
  );
}

function DiagnosticPanel({ props, problems }: { props: Props; problems: boolean }) {
  const zh = props.locale === "zh-CN",
    t = (cn: string, en: string) => (zh ? cn : en);
  const [level, setLevel] = useState("all"),
    [source, setSource] = useState("all"),
    [search, setSearch] = useState("");
  const [start, setStart] = useState(""),
    [end, setEnd] = useState("");
  const [selection, setSelection] = useState<number>(),
    [page, setPage] = useState(1);
  const [status, setStatus] = useState(""),
    [exporting, setExporting] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const items = problems ? props.diagnostics.filter((item) => item.problem) : props.diagnostics;
  const invalidTime = !!(start && end && new Date(start).getTime() > new Date(end).getTime());
  const filtered = filterDiagnostics(items, {
    level,
    source,
    search,
    start: problems ? undefined : start,
    end: problems ? undefined : end,
  });
  const pageSize = 50,
    pages = Math.max(1, Math.ceil(filtered.length / pageSize)),
    currentPage = Math.min(page, pages);
  const rows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const selected = rows.find((item) => item.id === selection) ?? rows[0];
  const sources = [...new Set(items.map((item) => item.page))];
  const sourceName = (value: string) =>
    ({
      schema: t("协议", "Protocol"),
      debug: t("编解码", "Codec"),
      tcp: t("通信", "Transport"),
      environments: t("环境变量", "Environment"),
      settings: t("应用", "App"),
    })[value] ?? value;
  const levelName = (value: string) =>
    ({
      error: t("错误", "Error"),
      warn: t("警告", "Warning"),
      info: t("信息", "Info"),
      debug: t("调试", "Debug"),
    })[value] ?? value;
  const locate = () => {
    if (selected) props.onLocate(selected);
  };
  const change = (set: (value: string) => void, value: string) => {
    set(value);
    setPage(1);
  };
  const exportLogs = async () => {
    setExporting(true);
    setStatus("");
    try {
      setStatus(
        (await props.onExport(filtered)) === "cancelled"
          ? t("已取消导出", "Export cancelled")
          : t("日志已导出", "Log exported"),
      );
    } catch (error) {
      setStatus(String(error instanceof Error ? error.message : error));
    } finally {
      setExporting(false);
    }
  };
  const copyLog = async () => {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(
        `${diagnosticTime(selected.time, props.display.milliseconds)} ${diagnosticLevel(selected).toUpperCase()} ${sourceName(selected.page)}\n${selected.context}\n${selected.message}`,
      );
      setStatus(t("日志已复制", "Log copied"));
    } catch {
      setStatus(
        t(
          "无法访问剪贴板，请选择日志内容手动复制",
          "Clipboard unavailable; select and copy the log text",
        ),
      );
    }
  };
  return (
    <div className="settings-body p14-diagnostics">
      <div className="p14-filterbar">
        {problems ? (
          <div
            className="p14-level-tabs"
            role="tablist"
            aria-label={t("问题级别", "Problem severity")}
          >
            {(["all", "error", "warn", "info"] as const).map((value) => (
              <button
                type="button"
                key={value}
                role="tab"
                aria-selected={level === value}
                onClick={() => change(setLevel, value)}
              >
                {value !== "all" && <Severity level={value} />}{" "}
                {value === "all" ? t("全部", "All") : levelName(value)} (
                {value === "all"
                  ? items.length
                  : items.filter((item) => diagnosticLevel(item) === value).length}
                )
              </button>
            ))}
          </div>
        ) : (
          <select
            aria-label={t("日志级别", "Log level")}
            value={level}
            onChange={(event) => change(setLevel, event.target.value)}
          >
            <option value="all">{t("全部级别", "All levels")}</option>
            {["error", "warn", "info", "debug"].map((value) => (
              <option key={value} value={value}>
                {value.toUpperCase()}
              </option>
            ))}
          </select>
        )}
        <select
          aria-label={t("诊断来源", "Diagnostic source")}
          value={source}
          onChange={(event) => change(setSource, event.target.value)}
        >
          <option value="all">{t("全部来源", "All sources")}</option>
          {sources.map((value) => (
            <option key={value} value={value}>
              {sourceName(value)}
            </option>
          ))}
        </select>
        {!problems && (
          <div className="p14-time-range">
            <input
              aria-label={t("开始时间", "Start time")}
              type="datetime-local"
              step="1"
              value={start}
              onInput={(event) => change(setStart, event.currentTarget.value)}
            />
            <span>→</span>
            <input
              aria-label={t("结束时间", "End time")}
              type="datetime-local"
              step="1"
              value={end}
              onInput={(event) => change(setEnd, event.currentTarget.value)}
            />
          </div>
        )}
        <label className="p14-search">
          <Search size={15} />
          <input
            aria-label={t("搜索诊断", "Search diagnostics")}
            placeholder={
              problems ? t("搜索问题描述…", "Search problems…") : t("搜索日志内容…", "Search logs…")
            }
            value={search}
            onChange={(event) => change(setSearch, event.target.value)}
          />
        </label>
        <button
          className="p14-icon-button"
          type="button"
          aria-label={t("重置筛选", "Reset filters")}
          title={t("重置筛选", "Reset filters")}
          onClick={() => {
            setLevel("all");
            setSource("all");
            setSearch("");
            setStart("");
            setEnd("");
            setPage(1);
          }}
        >
          <RefreshCw size={15} />
        </button>
      </div>
      {!problems && (
        <div className="p14-log-actions">
          <span>
            {t("本次运行的诊断记录 · 最多保留 500 条", "Current run · retains up to 500 entries")}
          </span>
          <button
            type="button"
            disabled={exporting || !filtered.length || invalidTime}
            onClick={() => void exportLogs()}
          >
            <Download size={14} />
            {exporting ? t("导出中…", "Exporting…") : t("导出日志", "Export logs")}
          </button>
          <button
            type="button"
            className="p14-danger"
            disabled={!props.diagnostics.length || exporting}
            onClick={() => setConfirmClear(true)}
          >
            <Trash2 size={14} />
            {t("清空", "Clear")}
          </button>
        </div>
      )}
      {invalidTime && (
        <p className="p14-status error" role="alert">
          {t("开始时间不能晚于结束时间", "Start time must be before end time")}
        </p>
      )}
      {status && (
        <p className="p14-status" role="status">
          {status}
        </p>
      )}
      {confirmClear && (
        <div className="p14-clear-confirm" role="alert">
          <span>
            {t(
              "清空本次运行的全部问题与诊断记录？",
              "Clear all problems and diagnostic entries for this run?",
            )}
          </span>
          <button
            type="button"
            onClick={() => {
              props.onClear();
              setConfirmClear(false);
              setStatus(t("诊断记录已清空", "Diagnostics cleared"));
            }}
          >
            {t("确认清空", "Confirm clear")}
          </button>
          <button type="button" onClick={() => setConfirmClear(false)}>
            {t("取消", "Cancel")}
          </button>
        </div>
      )}
      <div className="p14-card p14-table-wrap">
        <table
          className={`p14-table ${problems ? "p14-problem-table" : "p14-log-table"}`}
          aria-label={problems ? t("问题列表", "Problems") : t("诊断日志", "Diagnostic log")}
        >
          <thead>
            <tr>
              {!problems && props.display.lineNumbers && <th className="p14-line-number">#</th>}
              {!problems && <th>{t("时间", "Time")}</th>}
              <th>{t("级别", "Level")}</th>
              <th>{problems ? t("描述", "Description") : t("来源", "Source")}</th>
              <th>
                {problems ? t("所属协议 / 会话", "Protocol / session") : t("内容", "Content")}
              </th>
              {problems && (
                <>
                  <th>{t("位置", "Location")}</th>
                  <th>{t("时间", "Time")}</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((item, index) => (
              <tr
                key={item.id}
                aria-selected={selected?.id === item.id}
                onClick={() => setSelection(item.id)}
                onDoubleClick={() => props.onLocate(item)}
              >
                {!problems && props.display.lineNumbers && (
                  <td className="p14-line-number">{(currentPage - 1) * pageSize + index + 1}</td>
                )}
                {!problems && (
                  <td>
                    <time>{diagnosticTime(item.time, props.display.milliseconds)}</time>
                  </td>
                )}
                <td>
                  <Severity
                    level={diagnosticLevel(item)}
                    label={
                      problems
                        ? levelName(diagnosticLevel(item))
                        : diagnosticLevel(item).toUpperCase()
                    }
                  />
                </td>
                <td>
                  {problems ? (
                    <button
                      type="button"
                      className="p14-row-button"
                      onClick={() => setSelection(item.id)}
                      title={item.message}
                    >
                      {item.message}
                    </button>
                  ) : (
                    sourceName(item.page)
                  )}
                </td>
                <td title={problems ? item.context : item.message}>
                  {problems ? (
                    item.context
                  ) : (
                    <button
                      type="button"
                      className="p14-row-button"
                      onClick={() => setSelection(item.id)}
                      title={item.message}
                    >
                      {item.message}
                    </button>
                  )}
                </td>
                {problems && (
                  <>
                    <td title={item.path ?? item.protocol ?? item.session}>
                      {item.path ?? item.protocol ?? item.session ?? "—"}
                      {item.line
                        ? `:${item.line}`
                        : item.offset !== undefined
                          ? ` @${item.offset}`
                          : ""}
                    </td>
                    <td>
                      <time>{diagnosticTime(item.time, props.display.milliseconds)}</time>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <div className="p14-empty">
            <Info size={28} />
            <strong>
              {items.length
                ? t("没有匹配的记录", "No matching entries")
                : problems
                  ? t("暂无问题", "No problems")
                  : t("暂无诊断日志", "No diagnostic logs")}
            </strong>
            <p>
              {items.length
                ? t(
                    "调整级别、来源、时间或搜索条件",
                    "Adjust level, source, time or search filters",
                  )
                : t(
                    "操作产生的诊断信息会显示在这里",
                    "Diagnostics from your operations will appear here",
                  )}
            </p>
          </div>
        )}
      </div>
      <footer className="p14-table-footer">
        <span>
          {t("共", "Total")} {filtered.length}{" "}
          {t(problems ? "条问题" : "条日志", problems ? "problems" : "logs")}
          {filtered.length !== items.length && ` / ${items.length}`}
        </span>
        <div>
          <button
            type="button"
            aria-label={t("上一页", "Previous page")}
            disabled={currentPage === 1}
            onClick={() => setPage(currentPage - 1)}
          >
            <ChevronLeft size={15} />
          </button>
          <span>
            {currentPage} / {pages}
          </span>
          <button
            type="button"
            aria-label={t("下一页", "Next page")}
            disabled={currentPage === pages}
            onClick={() => setPage(currentPage + 1)}
          >
            <ChevronRight size={15} />
          </button>
          <small>{t("50 条/页", "50 / page")}</small>
        </div>
      </footer>
      {selected && (
        <section
          className={`p14-card p14-detail ${problems ? "problem" : "log"}`}
          aria-label={problems ? t("问题详情", "Problem details") : t("日志详情", "Log details")}
        >
          <div className="p14-detail-context">
            <h2>
              <Severity level={diagnosticLevel(selected)} />
              {problems
                ? (selected.code ?? t("问题详情", "Problem details"))
                : t("日志详情", "Log details")}
            </h2>
            <dl>
              <dt>{t("级别", "Level")}</dt>
              <dd>
                <Severity
                  level={diagnosticLevel(selected)}
                  label={diagnosticLevel(selected).toUpperCase()}
                />
              </dd>
              <dt>{t("来源", "Source")}</dt>
              <dd>{sourceName(selected.page)}</dd>
              <dt>{t("上下文", "Context")}</dt>
              <dd>{selected.context}</dd>
              <dt>{t("位置", "Location")}</dt>
              <dd>
                {selected.path ?? selected.protocol ?? selected.session ?? "—"}
                {selected.offset !== undefined && ` @${selected.offset}`}
              </dd>
              <dt>{t("时间", "Time")}</dt>
              <dd>
                <time>{diagnosticTime(selected.time, props.display.milliseconds)}</time>
              </dd>
            </dl>
          </div>
          <div className="p14-detail-message">
            <h3>{problems ? t("问题描述", "Description") : t("内容", "Content")}</h3>
            <pre>{selected.message}</pre>
            {selected.code && (
              <p>
                {t("错误代码", "Error code")}: <code>{selected.code}</code>
              </p>
            )}
            {selected.line && (
              <p>
                {t("行 / 列", "Line / column")}: {selected.line} / {selected.column ?? 1}
              </p>
            )}
            {selected.hex && (
              <div className="p14-hex-excerpt">
                <h3>{t("相关报文片段", "Related HEX excerpt")}</h3>
                <code>
                  <span className="p14-hex-offset">
                    {(selected.hexOffset ?? 0).toString(16).toUpperCase().padStart(4, "0")}
                  </span>
                  {selected.hex
                    .split(" ")
                    .map((byte, index) =>
                      (selected.hexOffset ?? 0) + index === selected.offset ? (
                        <mark key={index}>{byte} </mark>
                      ) : (
                        <span key={index}>{byte} </span>
                      ),
                    )}
                </code>
              </div>
            )}
          </div>
          <div className="p14-detail-actions">
            <h3>{problems ? t("下一步建议", "Next steps") : t("相关操作", "Related actions")}</h3>
            {problems && (
              <ol>
                {diagnosticAdvice(selected, zh).map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            )}
            <button type="button" className={problems ? "primary" : ""} onClick={locate}>
              <ArrowUpRight size={14} />
              {selected.page === "tcp"
                ? t("定位到会话", "Open session")
                : selected.page === "schema"
                  ? t("查看协议", "Open protocol")
                  : selected.page === "debug"
                    ? t("定位到报文", "Open HEX")
                    : t("打开相关页面", "Open related page")}
            </button>
            {!problems && (
              <button type="button" onClick={() => void copyLog()}>
                <Copy size={14} />
                {t("复制日志", "Copy log")}
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

export default function SettingsWorkspace(props: Props) {
  const [active, setActive] = useState<SettingsTab>("appearance");
  const zh = props.locale === "zh-CN",
    t = (cn: string, en: string) => (zh ? cn : en);
  const tabs = [
    {
      id: "appearance" as const,
      Icon: Monitor,
      label: t("外观与语言", "Appearance & language"),
      hint: t(
        "自定义应用的外观、语言和界面显示偏好",
        "Customize appearance, language and display preferences",
      ),
    },
    {
      id: "problems" as const,
      Icon: AlertCircle,
      label: t("问题", "Problems"),
      hint: t(
        "显示当前项目与会话问题，帮助定位和解决问题",
        "Inspect project and session issues and open their context",
      ),
    },
    {
      id: "logs" as const,
      Icon: FileText,
      label: t("诊断日志", "Diagnostic logs"),
      hint: t(
        "查看应用运行日志，用于问题排查和定位",
        "View application diagnostics to investigate issues",
      ),
    },
  ];
  const selected = tabs.find((tab) => tab.id === active)!;
  return (
    <div className="p14-workspace">
      <aside className="p14-sidebar">
        <h2>{t("设置", "Settings")}</h2>
        <nav aria-label={t("设置导航", "Settings navigation")}>
          {tabs.map(({ id, Icon, label }) => (
            <button
              type="button"
              key={id}
              aria-current={active === id ? "page" : undefined}
              onClick={() => setActive(id)}
            >
              <Icon size={17} />
              {label}
            </button>
          ))}
        </nav>
        <div className="p14-core">
          <h2 id="settings-core-title">
            <Cpu size={13} />
            Core {props.coreInfo?.version ?? "…"}
          </h2>
          <span>
            {props.coreInfo?.source === "native-core"
              ? t("原生内核", "Native core")
              : t("浏览器预览", "Browser preview")}
          </span>
        </div>
      </aside>
      <div className="p14-main">
        <header className="p14-header">
          <selected.Icon size={26} />
          <div>
            <h1>{selected.label}</h1>
            <p>{selected.hint}</p>
          </div>
        </header>
        {active === "appearance" ? (
          <Appearance {...props} />
        ) : (
          <DiagnosticPanel key={active} props={props} problems={active === "problems"} />
        )}
      </div>
    </div>
  );
}
