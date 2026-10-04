import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Copy,
  Edit2,
  Eye,
  EyeOff,
  Folder,
  Info,
  Lock,
  Plus,
  Save,
  Search,
  Trash2,
  X,
} from "react-feather";
import { environments, type EnvironmentConfig, type EnvironmentVariable } from "./bridge";
import type { Locale } from "./i18n";
import "./environments.css";

const empty: EnvironmentConfig = { active: "", environments: [] };
type Environment = EnvironmentConfig["environments"][number];
type Issue = { path: string; zh: string; en: string };
type DialogMode = "create" | "copy" | "rename";
const bytes = (value: string) => new TextEncoder().encode(value).length;
const blank = (value: string) => /^[ \t\r\n]*$/.test(value);

function issuesFor(config: EnvironmentConfig): Issue[] {
  const issues: Issue[] = [];
  const add = (path: string, zh: string, en: string) => issues.push({ path, zh, en });
  const names = new Set<string>();
  config.environments.forEach((env, ei) => {
    const ep = `environments[${ei}]`;
    if (blank(env.name) || bytes(env.name) > 100 || /[\x00-\x1f]/.test(env.name))
      add(
        `${ep}.name`,
        "请输入有效环境名称（最多 100 字节）",
        "Enter a valid environment name (up to 100 bytes)",
      );
    if (names.has(env.name))
      add(`${ep}.name`, "环境名称不能重复", "Environment names must be unique");
    names.add(env.name);
    if (bytes(env.description || "") > 1000)
      add(`${ep}.description`, "环境描述最多 1000 字节", "Description must be at most 1000 bytes");
    const variables = new Set<string>();
    env.variables.forEach((v, vi) => {
      const vp = `${ep}.variables[${vi}]`;
      if (!/^[A-Za-z_][A-Za-z_0-9]*$/.test(v.name) || bytes(v.name) > 100)
        add(
          `${vp}.name`,
          "名称须以字母或下划线开头，仅含字母、数字、下划线",
          "Use an identifier starting with a letter or underscore",
        );
      else if (["random", "sequence", "timestamp"].includes(v.name))
        add(`${vp}.name`, "名称与内置变量重复", "This name is reserved for a built-in variable");
      else if (variables.has(v.name))
        add(`${vp}.name`, "变量名称不能重复", "Variable names must be unique");
      variables.add(v.name);
      if (v.required && blank(v.defaultValue))
        add(`${vp}.default`, "必填项不能为空", "Required value cannot be empty");
      else if (bytes(v.defaultValue) > 65536)
        add(`${vp}.default`, "默认值最多 65536 字节", "Value must be at most 65536 bytes");
      else if (
        v.type === "number" &&
        v.defaultValue !== "" &&
        (!/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(v.defaultValue) ||
          !Number.isFinite(Number(v.defaultValue)))
      )
        add(`${vp}.default`, "请输入有效的数字", "Enter a valid finite number");
      else if (v.type === "boolean" && !["", "true", "false"].includes(v.defaultValue))
        add(`${vp}.default`, "布尔值须为 true 或 false", "Use true or false for a boolean value");
      if (bytes(v.description || "") > 1000)
        add(`${vp}.description`, "备注最多 1000 字节", "Notes must be at most 1000 bytes");
    });
  });
  return issues;
}

function EnvironmentDialog({
  mode,
  source,
  config,
  zh,
  busy,
  error,
  onSave,
  onClose,
}: {
  mode: DialogMode;
  source?: Environment;
  config: EnvironmentConfig;
  zh: boolean;
  busy: boolean;
  error: string;
  onSave: (name: string, description: string, base: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(
    mode === "rename" ? source?.name || "" : mode === "copy" ? `${source?.name || ""}_copy` : "",
  );
  const [description, setDescription] = useState(
    mode === "create" ? "" : source?.description || "",
  );
  const [base, setBase] = useState(mode === "copy" ? source?.name || "" : "");
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  const duplicate = config.environments.some(
    (env) => env.name === name && !(mode === "rename" && env === source),
  );
  const validName = !blank(name) && bytes(name) <= 100 && !/[\x00-\x1f]/.test(name);
  const valid = validName && !duplicate && bytes(description) <= 1000;
  const title =
    mode === "rename"
      ? zh
        ? "编辑环境"
        : "Edit environment"
      : mode === "copy"
        ? zh
          ? "复制环境"
          : "Copy environment"
        : zh
          ? "新建环境"
          : "New environment";
  return (
    <dialog
      className="env-dialog"
      ref={ref}
      aria-labelledby="env-dialog-title"
      onCancel={(event) => {
        if (busy) event.preventDefault();
        else onClose();
      }}
    >
      <header>
        <h2 id="env-dialog-title">{title}</h2>
        <button
          type="button"
          aria-label={zh ? "关闭弹窗" : "Close dialog"}
          disabled={busy}
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </header>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setTouched(true);
          if (valid && (await onSave(name, description, base))) onClose();
        }}
      >
        <label>
          {zh ? "环境名称" : "Environment name"}
          <span className="env-required"> *</span>
          <input
            autoFocus
            aria-label={zh ? "新环境名称" : "New environment name"}
            aria-invalid={touched && (!validName || duplicate)}
            disabled={busy}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setTouched(true);
            }}
          />
        </label>
        <small className={touched && (!validName || duplicate) ? "env-field-error" : "env-muted"}>
          {duplicate
            ? zh
              ? "环境名称已存在"
              : "An environment with this name already exists"
            : zh
              ? "名称不能为空，最多 100 字节"
              : "A non-empty name, up to 100 bytes"}
        </small>
        <label>
          {zh ? "环境描述" : "Description"}
          <textarea
            aria-label={zh ? "环境描述" : "Environment description"}
            disabled={busy}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
          <small className={bytes(description) > 1000 ? "env-field-error" : "env-muted"}>
            {bytes(description)} / 1000 {zh ? "字节" : "bytes"}
          </small>
        </label>
        {mode !== "rename" && (
          <label>
            {zh ? "基于现有环境（可选）" : "Copy variables from (optional)"}
            <select
              aria-label={zh ? "基于现有环境" : "Base environment"}
              disabled={busy}
              value={base}
              onChange={(e) => setBase(e.target.value)}
            >
              <option value="">
                {zh ? "不基于现有环境（空白）" : "Start with an empty environment"}
              </option>
              {config.environments.map((env) => (
                <option key={env.name} value={env.name}>
                  {env.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {error && (
          <p className="env-dialog-error" role="alert">
            {error}
          </p>
        )}
        <footer>
          <button type="button" disabled={busy} onClick={onClose}>
            {zh ? "取消" : "Cancel"}
          </button>
          <button className="env-primary" type="submit" disabled={busy || !valid}>
            {mode === "rename" ? (zh ? "保存" : "Save") : zh ? "创建" : "Create"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}

function EnvironmentConfirmation({
  zh,
  title,
  message,
  label,
  busy,
  error,
  destructive,
  onConfirm,
  onClose,
}: {
  zh: boolean;
  title: string;
  message: string;
  label: string;
  busy: boolean;
  error: string;
  destructive: boolean;
  onConfirm: () => Promise<boolean>;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    cancelRef.current?.focus();
  }, []);
  return (
    <dialog
      ref={ref}
      className="env-dialog"
      aria-labelledby="env-confirm-title"
      onCancel={(event) => {
        if (busy) event.preventDefault();
        else onClose();
      }}
    >
      <header>
        <h2 id="env-confirm-title">{title}</h2>
        <button
          disabled={busy}
          type="button"
          aria-label={zh ? "关闭弹窗" : "Close dialog"}
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </header>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (await onConfirm()) onClose();
        }}
      >
        <p className="env-confirm-message">{message}</p>
        {error && (
          <p role="alert" className="env-dialog-error">
            {error}
          </p>
        )}
        <footer>
          <button ref={cancelRef} disabled={busy} type="button" onClick={onClose}>
            {zh ? "取消" : "Cancel"}
          </button>
          <button
            type="submit"
            disabled={busy}
            className={destructive ? "env-delete-primary" : "env-primary"}
          >
            {label}
          </button>
        </footer>
      </form>
    </dialog>
  );
}

function HelpCards({ zh }: { zh: boolean }) {
  return (
    <div className="env-help-grid">
      <section className="env-panel env-help">
        <h2>
          <Info size={17} />
          {zh ? "变量引用说明" : "Variable references"}
        </h2>
        <p>
          {zh
            ? "在报文模板、HEX 输入或发送内容中引用变量，格式为 {{变量名}}。"
            : "Reference values in message templates, HEX input or outgoing content using {{name}}."}
        </p>
        <div className="env-example">
          <strong>{zh ? "示例" : "Example"}</strong>
          <code>{"{{deviceId}}  {{sampleInterval}}"}</code>
        </div>
        <small>
          {zh
            ? "替换后的内容需符合发送格式；HEX 输入应为有效十六进制。"
            : "Resolved values must match the send format. HEX input must contain valid hexadecimal bytes."}
        </small>
      </section>
      <section className="env-panel env-help">
        <h2>
          <Info size={17} />
          {zh ? "内置变量" : "Built-in variables"}
        </h2>
        <p>
          {zh
            ? "在变量引用支持的位置使用以下内置变量："
            : "Available wherever variable references are supported:"}
        </p>
        <dl>
          <dt>{"{{random}}"}</dt>
          <dd>{zh ? "随机整数，范围 0–65535" : "Random integer from 0 to 65535"}</dd>
          <dt>{"{{sequence}}"}</dt>
          <dd>{zh ? "递增序号，每次发送加 1" : "Sequence incremented on each send"}</dd>
          <dt>{"{{timestamp}}"}</dt>
          <dd>{zh ? "当前 Unix 时间戳（毫秒）" : "Current Unix timestamp in milliseconds"}</dd>
        </dl>
      </section>
      <section className="env-panel env-help env-types">
        <h2>{zh ? "变量类型说明" : "Variable types"}</h2>
        <dl>
          <dt>{zh ? "文本" : "String"}</dt>
          <dd>{zh ? "字符串文本内容" : "Text content"}</dd>
          <dt>{zh ? "数字" : "Number"}</dt>
          <dd>{zh ? "有限整数或浮点数" : "Finite integer or decimal"}</dd>
          <dt>{zh ? "布尔" : "Boolean"}</dt>
          <dd>true / false</dd>
        </dl>
        <div className="env-sensitive-note">
          <h3>
            <Lock size={15} />
            {zh ? "敏感变量说明" : "Sensitive values"}
          </h3>
          <p>
            {zh
              ? "默认隐藏显示；项目配置文件仍以明文保存。"
              : "Hidden by default in the editor; project configuration stores values as plain text."}
          </p>
        </div>
      </section>
    </div>
  );
}

export default function Environments({
  rootPath,
  projectName,
  locale,
  onSensitiveValues,
  onOpen,
  onCreate,
}: {
  rootPath?: string;
  projectName?: string;
  locale: Locale;
  onSensitiveValues?: (values: string[]) => void;
  onOpen?: () => void;
  onCreate?: () => void;
}) {
  const zh = locale === "zh-CN";
  const [config, setConfig] = useState<EnvironmentConfig>(empty);
  const [saved, setSaved] = useState(JSON.stringify(empty));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [visibleSecret, setVisibleSecret] = useState<number | null>(null);
  const [tab, setTab] = useState("variables");
  const [search, setSearch] = useState("");
  const [envSearch, setEnvSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [checked, setChecked] = useState<number[]>([]);
  const [dialog, setDialog] = useState<DialogMode | null>(null);
  const [confirmation, setConfirmation] = useState<"delete" | "switch" | null>(null);
  const dirty = JSON.stringify(config) !== saved;
  const selectedIndex = config.environments.findIndex((env) => env.name === config.active);
  const selected = config.environments[selectedIndex];
  const issues = issuesFor(config);
  const issueAt = (path: string) => issues.find((issue) => issue.path === path);

  useEffect(() => {
    onSensitiveValues?.(
      config.environments.flatMap((env) =>
        env.variables.filter((v) => v.sensitive).map((v) => v.defaultValue),
      ),
    );
  }, [config, onSensitiveValues]);
  useEffect(() => {
    setConfig(empty);
    setSaved(JSON.stringify(empty));
    setLoaded(false);
    setVisibleSecret(null);
    setError("");
    setStatus("");
    if (!rootPath) return;
    let cancelled = false;
    setBusy(true);
    void environments()
      .then((result) => {
        if (cancelled) return;
        if (result.ok) {
          setConfig(result.config);
          setSaved(JSON.stringify(result.config));
          setLoaded(true);
        } else
          setError(
            `${result.error.message} [${result.error.code}]${result.error.path ? ` (${result.error.path})` : ""}`,
          );
      })
      .catch(() => {
        if (!cancelled) setError(zh ? "无法读取环境配置。" : "Could not load environments.");
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [rootPath]);

  const save = async (next: EnvironmentConfig = config) => {
    if (!loaded) return false;
    const invalid = issuesFor(next);
    if (invalid.length) {
      setError(zh ? "请修正变量配置后保存。" : "Fix configuration errors before saving.");
      return false;
    }
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const result = await environments(next);
      if (result.ok) {
        setConfig(result.config);
        setSaved(JSON.stringify(result.config));
        setVisibleSecret(null);
        setChecked([]);
        setStatus(zh ? "已保存" : "Saved");
        return true;
      }
      setError(
        `${result.error.message} [${result.error.code}]${result.error.path ? ` (${result.error.path})` : ""}`,
      );
    } catch {
      setError(zh ? "无法保存环境配置。" : "Could not save environments.");
    } finally {
      setBusy(false);
    }
    return false;
  };
  const edit = (update: (env: Environment) => Environment) => {
    setStatus("");
    setError("");
    setConfig((current) => ({
      ...current,
      environments: current.environments.map((env) =>
        env.name === current.active ? update(env) : env,
      ),
    }));
  };
  const updateVariable = <K extends keyof EnvironmentVariable>(
    index: number,
    key: K,
    value: EnvironmentVariable[K],
  ) =>
    edit((env) => ({
      ...env,
      variables: env.variables.map((v, i) => (i === index ? { ...v, [key]: value } : v)),
    }));
  const removeVariables = (indices: number[]) => {
    setVisibleSecret(null);
    setChecked([]);
    edit((env) => ({ ...env, variables: env.variables.filter((_, i) => !indices.includes(i)) }));
  };
  const openDialog = (mode: DialogMode) => {
    setError("");
    setDialog(mode);
  };
  const openProject = () => {
    if (dirty) setConfirmation("switch");
    else onOpen?.();
  };
  const rows = (selected?.variables || [])
    .map((v, index) => ({ v, index }))
    .filter(
      ({ v }) =>
        (!typeFilter || v.type === typeFilter) &&
        `${v.name} ${v.description || ""}`.toLowerCase().includes(search.toLowerCase()),
    );
  const locateIssue = () => {
    const issue = issues.find((item) => item.path.startsWith(`environments[${selectedIndex}]`));
    if (!issue) return;
    const vi = issue.path.match(/variables\[(\d+)\]\.(\w+)/);
    setSearch("");
    setTypeFilter("");
    setTab(vi ? "variables" : "configuration");
    requestAnimationFrame(() =>
      document.getElementById(vi ? `env-${vi[2]}-${vi[1]}` : "env-settings-description")?.focus(),
    );
  };

  if (!rootPath)
    return (
      <div className="env-no-project">
        <div className="env-no-project-center">
          <span className="env-folder">
            <Folder size={46} />
          </span>
          <h1>{zh ? "尚未打开项目" : "No project open"}</h1>
          <p>
            {zh
              ? "请先打开或创建一个协议项目，然后管理环境与变量。"
              : "Open or create a protocol project to manage environments and variables."}
          </p>
          <button className="env-primary" onClick={onOpen}>
            <Folder size={16} />
            {zh ? "打开项目…" : "Open project…"}
          </button>
          <button onClick={onCreate}>{zh ? "新建项目" : "Create project"}</button>
        </div>
        <HelpCards zh={zh} />
      </div>
    );

  return (
    <div className="env-workspace">
      <aside className="env-sidebar">
        <section className="env-panel env-project">
          <span className="env-muted">{zh ? "当前项目" : "Current project"}</span>
          <h1>
            <Folder size={21} />
            {projectName || rootPath.split(/[\\/]/).pop()}
          </h1>
          <p title={rootPath}>{rootPath}</p>
          <button onClick={openProject} disabled={busy}>
            {zh ? "切换项目" : "Switch project"}
          </button>
        </section>
        <section className="env-panel env-list">
          <header>
            <h2>{zh ? "环境管理" : "Environments"}</h2>
            <button
              disabled={busy || !loaded || config.environments.length >= 100}
              onClick={() => openDialog("create")}
            >
              <Plus size={15} />
              {zh ? "新建环境" : "New environment"}
            </button>
          </header>
          <div className="env-search">
            <Search size={15} />
            <input
              aria-label={zh ? "搜索环境" : "Search environments"}
              value={envSearch}
              onChange={(e) => setEnvSearch(e.target.value)}
              placeholder={zh ? "搜索环境…" : "Search environments…"}
            />
          </div>
          <nav aria-label={zh ? "环境列表" : "Environment list"}>
            {config.environments
              .filter((env) => env.name.toLowerCase().includes(envSearch.toLowerCase()))
              .map((env) => (
                <button
                  key={env.name}
                  className={env.name === config.active ? "active" : ""}
                  aria-pressed={env.name === config.active}
                  disabled={busy || !loaded}
                  onClick={() => {
                    if (env.name === config.active) return;
                    void save({ ...config, active: env.name }).then((ok) => {
                      if (ok) {
                        setSearch("");
                        setTypeFilter("");
                      }
                    });
                  }}
                >
                  <span className="env-dot" />
                  <span className="env-list-label">
                    <strong>{env.name}</strong>
                    {env.description && <small>{env.description}</small>}
                  </span>
                  {env.name === config.active && (
                    <span className="env-badge">{zh ? "当前生效" : "Active"}</span>
                  )}
                </button>
              ))}
          </nav>
          {!config.environments.length && (
            <p className="env-muted">
              {zh
                ? "创建环境来管理项目变量。"
                : "Create an environment to configure project variables."}
            </p>
          )}
        </section>
      </aside>
      <div className="env-main">
        <div
          className="env-tabs"
          role="tablist"
          aria-label={zh ? "环境配置视图" : "Environment views"}
        >
          {[
            ["variables", zh ? "变量管理" : "Variables"],
            ["configuration", zh ? "环境配置" : "Environment settings"],
            ["builtins", zh ? "内置变量" : "Built-ins"],
          ].map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              className={tab === key ? "active" : ""}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>
        {selected && (
          <section className="env-panel env-active">
            <div>
              <strong>
                {zh ? "当前环境：" : "Environment: "}
                <span>{selected.name}</span>
              </strong>
              {selected.description && <small>{selected.description}</small>}
              <span className="env-badge">{zh ? "当前生效" : "Active"}</span>
            </div>
            <div className="env-active-actions">
              <button disabled={busy} onClick={() => openDialog("copy")}>
                <Copy size={14} />
                {zh ? "复制环境" : "Copy environment"}
              </button>
              <button disabled={busy} onClick={() => openDialog("rename")}>
                <Edit2 size={14} />
                {zh ? "重命名" : "Rename"}
              </button>
              <button
                disabled={busy}
                onClick={() => {
                  setError("");
                  setConfirmation("delete");
                }}
              >
                <Trash2 size={14} />
                {zh ? "删除" : "Delete"}
              </button>
            </div>
          </section>
        )}
        {(issues.length > 0 || error) && (
          <div className="env-error-banner" role="alert">
            <AlertCircle size={16} />
            <span>
              {issues.length
                ? zh
                  ? `存在 ${issues.length} 个配置错误，请修正后保存。`
                  : `${issues.length} configuration errors. Fix them before saving.`
                : error}
            </span>
            {issues.length > 0 && (
              <button onClick={locateIssue}>{zh ? "定位第一个错误" : "Find first error"}</button>
            )}
          </div>
        )}
        {selected && tab === "variables" && (
          <section className="env-panel env-variables">
            <div className="env-variable-toolbar">
              <button
                className="env-primary"
                disabled={busy || selected.variables.length >= 200}
                onClick={() => {
                  edit((env) => ({
                    ...env,
                    variables: [
                      ...env.variables,
                      {
                        name: "",
                        type: "string",
                        defaultValue: "",
                        required: false,
                        sensitive: false,
                      },
                    ],
                  }));
                  setSearch("");
                  setTypeFilter("");
                }}
              >
                <Plus size={17} />
                {zh ? "添加变量" : "Add variable"}
              </button>
              <button disabled={busy || !checked.length} onClick={() => removeVariables(checked)}>
                <Trash2 size={14} />
                {zh ? "删除所选" : "Delete selected"}
                {checked.length > 0 && ` (${checked.length})`}
              </button>
              <div className="env-search">
                <Search size={16} />
                <input
                  aria-label={zh ? "搜索变量名或备注" : "Search variable names or notes"}
                  placeholder={zh ? "搜索变量名或备注…" : "Search variable names or notes…"}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <select
                aria-label={zh ? "筛选变量类型" : "Filter variable types"}
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
              >
                <option value="">{zh ? "全部类型" : "All types"}</option>
                <option value="string">{zh ? "文本" : "String"}</option>
                <option value="number">{zh ? "数字" : "Number"}</option>
                <option value="boolean">{zh ? "布尔" : "Boolean"}</option>
              </select>
            </div>
            <div className="env-table-wrap">
              <table className="env-table">
                <colgroup>
                  <col className="env-col-check" />
                  <col className="env-col-name" />
                  <col className="env-col-type" />
                  <col className="env-col-default" />
                  <col className="env-col-flag" />
                  <col className="env-col-flag" />
                  <col />
                  <col className="env-col-actions" />
                </colgroup>
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        aria-label={zh ? "选择全部可见变量" : "Select all visible variables"}
                        checked={
                          rows.length > 0 && rows.every(({ index }) => checked.includes(index))
                        }
                        disabled={busy || !rows.length}
                        onChange={(e) =>
                          setChecked(
                            e.target.checked
                              ? Array.from(new Set([...checked, ...rows.map(({ index }) => index)]))
                              : checked.filter((i) => !rows.some(({ index }) => index === i)),
                          )
                        }
                      />
                    </th>
                    {[
                      zh ? "名称" : "Name",
                      zh ? "类型" : "Type",
                      zh ? "默认值" : "Default value",
                      zh ? "必填" : "Required",
                      zh ? "敏感" : "Sensitive",
                      zh ? "备注" : "Notes",
                      zh ? "操作" : "Actions",
                    ].map((label) => (
                      <th key={label}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ v, index }) => {
                    const path = `environments[${selectedIndex}].variables[${index}]`;
                    const fieldIssue = (key: string) => issueAt(`${path}.${key}`);
                    const message = (key: string) => {
                      const issue = fieldIssue(key);
                      return (
                        issue && (
                          <small id={`env-${key}-error-${index}`} className="env-field-error">
                            <AlertCircle size={12} />
                            {zh ? issue.zh : issue.en}
                          </small>
                        )
                      );
                    };
                    return (
                      <tr className="environment-variable" key={index}>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`${zh ? "选择变量" : "Select variable"} ${v.name || index + 1}`}
                            disabled={busy}
                            checked={checked.includes(index)}
                            onChange={(e) =>
                              setChecked(
                                e.target.checked
                                  ? [...checked, index]
                                  : checked.filter((i) => i !== index),
                              )
                            }
                          />
                        </td>
                        <td>
                          <input
                            id={`env-name-${index}`}
                            aria-label={zh ? "名称" : "Name"}
                            aria-invalid={!!fieldIssue("name")}
                            aria-describedby={
                              fieldIssue("name") ? `env-name-error-${index}` : undefined
                            }
                            disabled={busy}
                            value={v.name}
                            onChange={(e) => updateVariable(index, "name", e.target.value)}
                          />
                          {message("name")}
                        </td>
                        <td>
                          <select
                            aria-label={zh ? "类型" : "Type"}
                            disabled={busy}
                            value={v.type}
                            onChange={(e) =>
                              updateVariable(
                                index,
                                "type",
                                e.target.value as EnvironmentVariable["type"],
                              )
                            }
                          >
                            <option value="string">{zh ? "文本" : "String"}</option>
                            <option value="number">{zh ? "数字" : "Number"}</option>
                            <option value="boolean">{zh ? "布尔" : "Boolean"}</option>
                          </select>
                        </td>
                        <td>
                          <div className={`env-value ${fieldIssue("default") ? "invalid" : ""}`}>
                            <input
                              id={`env-default-${index}`}
                              aria-label={zh ? "默认值" : "Default value"}
                              aria-invalid={!!fieldIssue("default")}
                              aria-describedby={
                                fieldIssue("default") ? `env-default-error-${index}` : undefined
                              }
                              disabled={busy}
                              autoComplete="off"
                              type={v.sensitive && visibleSecret !== index ? "password" : "text"}
                              value={v.defaultValue}
                              onChange={(e) =>
                                updateVariable(index, "defaultValue", e.target.value)
                              }
                            />
                            {v.sensitive && (
                              <button
                                aria-label={
                                  visibleSecret === index
                                    ? zh
                                      ? "隐藏敏感值"
                                      : "Hide sensitive value"
                                    : zh
                                      ? "查看敏感值"
                                      : "Reveal sensitive value"
                                }
                                disabled={busy}
                                onClick={() =>
                                  setVisibleSecret(visibleSecret === index ? null : index)
                                }
                              >
                                {visibleSecret === index ? <EyeOff size={15} /> : <Eye size={15} />}
                              </button>
                            )}
                          </div>
                          {message("default")}
                        </td>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={zh ? "必填" : "Required"}
                            checked={v.required}
                            disabled={busy}
                            onChange={(e) => updateVariable(index, "required", e.target.checked)}
                          />
                        </td>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={zh ? "敏感" : "Sensitive"}
                            checked={v.sensitive}
                            disabled={busy}
                            onChange={(e) => {
                              setVisibleSecret(null);
                              updateVariable(index, "sensitive", e.target.checked);
                            }}
                          />
                        </td>
                        <td>
                          <input
                            id={`env-description-${index}`}
                            aria-label={zh ? "备注" : "Notes"}
                            aria-invalid={!!fieldIssue("description")}
                            disabled={busy}
                            value={v.description || ""}
                            placeholder={zh ? "添加备注" : "Add notes"}
                            onChange={(e) => updateVariable(index, "description", e.target.value)}
                          />
                          {message("description")}
                        </td>
                        <td>
                          <div className="env-row-actions">
                            <button
                              aria-label={`${zh ? "编辑变量" : "Edit variable"} ${v.name || index + 1}`}
                              disabled={busy}
                              onClick={() =>
                                document.getElementById(`env-default-${index}`)?.focus()
                              }
                            >
                              <Edit2 size={15} />
                            </button>
                            <button
                              className="env-danger"
                              aria-label={`${zh ? "删除变量" : "Remove variable"} ${v.name || index + 1}`}
                              disabled={busy}
                              onClick={() => removeVariables([index])}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {!rows.length && (
                    <tr>
                      <td colSpan={8} className="env-empty-table">
                        {selected.variables.length
                          ? zh
                            ? "没有符合筛选条件的变量"
                            : "No matching variables"
                          : zh
                            ? "暂无变量，点击「添加变量」开始配置。"
                            : "No variables yet. Add one to start configuring."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}
        {selected && tab === "configuration" && (
          <section className="env-panel env-settings">
            <h2>{zh ? "环境配置" : "Environment settings"}</h2>
            <label>
              {zh ? "环境名称" : "Environment name"}
              <input readOnly value={selected.name} />
            </label>
            <label>
              {zh ? "环境描述" : "Description"}
              <textarea
                id="env-settings-description"
                aria-label={zh ? "环境描述" : "Environment description"}
                rows={3}
                disabled={busy}
                value={selected.description || ""}
                aria-invalid={!!issueAt(`environments[${selectedIndex}].description`)}
                onChange={(e) => edit((env) => ({ ...env, description: e.target.value }))}
              />
            </label>
            <p className="env-muted">
              {zh
                ? "切换环境会保存配置，不会修改正在运行的 TCP 连接。"
                : "Switching environments saves configuration and keeps running TCP connections unchanged."}
            </p>
          </section>
        )}
        {!selected && (
          <section className="env-panel env-empty">
            <Folder size={30} />
            <h2>{zh ? "暂无环境" : "No environments"}</h2>
            <p>
              {zh
                ? "新建环境后，即可配置和引用项目变量。"
                : "Create an environment to configure and reference project variables."}
            </p>
            <button
              className="env-primary"
              disabled={busy || !loaded}
              onClick={() => openDialog("create")}
            >
              <Plus size={16} />
              {zh ? "新建环境" : "New environment"}
            </button>
          </section>
        )}
        <HelpCards zh={zh} />
        <footer className="env-savebar">
          <span role="status">
            {busy
              ? zh
                ? "正在读取或保存…"
                : "Loading or saving…"
              : status ||
                (dirty
                  ? zh
                    ? "有未保存的修改"
                    : "Unsaved changes"
                  : loaded
                    ? zh
                      ? "配置已同步"
                      : "Configuration is up to date"
                    : zh
                      ? "配置未加载"
                      : "Configuration not loaded")}
          </span>
          <button
            disabled={busy || !dirty}
            onClick={() => {
              setConfig(JSON.parse(saved) as EnvironmentConfig);
              setVisibleSecret(null);
              setChecked([]);
              setError("");
              setStatus("");
            }}
          >
            {zh ? "放弃修改" : "Discard changes"}
          </button>
          <button
            className="env-primary"
            disabled={busy || !loaded || !dirty || issues.length > 0}
            onClick={() => void save()}
          >
            <Save size={15} />
            {zh ? "保存修改" : "Save changes"}
          </button>
        </footer>
      </div>
      {confirmation && (
        <EnvironmentConfirmation
          zh={zh}
          busy={busy}
          error={error}
          destructive={confirmation === "delete"}
          title={
            confirmation === "delete"
              ? zh
                ? "删除环境"
                : "Delete environment"
              : zh
                ? "切换项目"
                : "Switch project"
          }
          message={
            confirmation === "delete"
              ? zh
                ? `确定删除环境“${selected?.name}”及其 ${selected?.variables.length || 0} 个变量？`
                : `Delete environment “${selected?.name}” and its ${selected?.variables.length || 0} variables?`
              : zh
                ? "切换项目会放弃未保存的修改，是否继续？"
                : "Discard unsaved changes and switch projects?"
          }
          label={
            confirmation === "delete"
              ? zh
                ? "确认删除"
                : "Confirm deletion"
              : zh
                ? "继续"
                : "Continue"
          }
          onClose={() => setConfirmation(null)}
          onConfirm={async () => {
            if (confirmation === "switch") {
              onOpen?.();
              return true;
            }
            if (!selected) return false;
            const remaining = config.environments.filter((env) => env.name !== selected.name);
            return save({ active: remaining[0]?.name || "", environments: remaining });
          }}
        />
      )}
      {dialog && (
        <EnvironmentDialog
          mode={dialog}
          source={selected}
          config={config}
          zh={zh}
          busy={busy}
          error={error}
          onClose={() => setDialog(null)}
          onSave={async (name, description, base) => {
            if (dialog === "rename" && selected)
              return save({
                active: name,
                environments: config.environments.map((env) =>
                  env === selected ? { ...env, name, description } : env,
                ),
              });
            const template = config.environments.find((env) => env.name === base);
            return save({
              active: name,
              environments: [
                ...config.environments,
                { name, description, variables: template?.variables.map((v) => ({ ...v })) || [] },
              ],
            });
          }}
        />
      )}
    </div>
  );
}
