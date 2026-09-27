import { useEffect, useState } from "react";
import { environments, type EnvironmentConfig, type EnvironmentVariable } from "./bridge";
import type { Locale } from "./i18n";

const empty: EnvironmentConfig = { active: "", environments: [] };

export default function Environments({ rootPath, locale }: { rootPath?: string; locale: Locale }) {
  const zh = locale === "zh-CN";
  const [config, setConfig] = useState<EnvironmentConfig>(empty);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    setConfig(empty);
    setError("");
    setStatus("");
    if (!rootPath) return;
    let cancelled = false;
    setBusy(true);
    void environments()
      .then((result) => {
        if (cancelled) return;
        if (result.ok) setConfig(result.config);
        else
          setError(
            `${result.error.message} [${result.error.code}]${result.error.path ? ` (${result.error.path})` : ""}`,
          );
      })
      .catch((cause) => {
        if (!cancelled) setError(String(cause));
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [rootPath]);

  const save = async (next: EnvironmentConfig = config) => {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const result = await environments(next);
      if (result.ok) {
        setConfig(result.config);
        setStatus(zh ? "已保存" : "Saved");
        return true;
      }
      setError(
        `${result.error.message} [${result.error.code}]${result.error.path ? ` (${result.error.path})` : ""}`,
      );
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
    return false;
  };

  const selected = config.environments.find((item) => item.name === config.active);
  const edit = (update: (item: NonNullable<typeof selected>) => typeof selected) => {
    setStatus("");
    setConfig((current) => ({
      ...current,
      environments: current.environments.map((item) =>
        item.name === current.active ? update(item)! : item,
      ),
    }));
  };
  const updateVariable = <K extends keyof EnvironmentVariable>(
    index: number,
    property: K,
    value: EnvironmentVariable[K],
  ) => {
    edit((item) => ({
      ...item,
      variables: item.variables.map((variable, position) =>
        position === index ? { ...variable, [property]: value } : variable,
      ),
    }));
  };

  return (
    <>
      <header className="content-header">
        <div className="content-heading-icon">{"{}"}</div>
        <div>
          <span className="content-eyebrow">{zh ? "项目配置" : "PROJECT CONFIGURATION"}</span>
          <h1>{zh ? "环境与变量" : "Environments and variables"}</h1>
          <p>
            {zh ? "当前生效环境：" : "Active environment: "}
            {config.active || (zh ? "无" : "None")}
          </p>
        </div>
      </header>
      <div className="environment-body">
        {!rootPath ? (
          <p>{zh ? "请先打开项目。" : "Open a project first."}</p>
        ) : (
          <>
            <p className="environment-hint">
              {zh
                ? "变量可用于服务器地址、设备编号等配置。切换环境不会修改正在运行的 TCP 连接。"
                : "Store server addresses, device IDs and other values here. Switching environments does not change running TCP connections."}
            </p>
            <div className="environment-toolbar">
              <label>
                {zh ? "切换环境" : "Switch environment"}
                <select
                  aria-label={zh ? "当前生效环境" : "Active environment"}
                  disabled={busy || config.environments.length === 0}
                  onChange={(event) => void save({ ...config, active: event.target.value })}
                  value={config.active}
                >
                  {config.environments.length === 0 && (
                    <option value="">{zh ? "无环境" : "No environments"}</option>
                  )}
                  {config.environments.map((item) => (
                    <option key={item.name} value={item.name}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <form
                onSubmit={async (event) => {
                  event.preventDefault();
                  const name = newName.trim();
                  if (!name) return;
                  if (
                    await save({
                      active: name,
                      environments: [...config.environments, { name, variables: [] }],
                    })
                  )
                    setNewName("");
                }}
              >
                <input
                  aria-label={zh ? "新环境名称" : "New environment name"}
                  disabled={busy}
                  maxLength={100}
                  onChange={(event) => setNewName(event.target.value)}
                  placeholder={zh ? "新环境名称" : "New environment name"}
                  value={newName}
                />
                <button disabled={busy || !newName.trim()} type="submit">
                  {zh ? "创建环境" : "Create environment"}
                </button>
              </form>
            </div>
            {selected && (
              <section className="environment-editor">
                <div className="environment-toolbar">
                  <label>
                    {zh ? "环境名称" : "Environment name"}
                    <input
                      disabled={busy}
                      maxLength={100}
                      onChange={(event) => {
                        const name = event.target.value;
                        edit((item) => ({ ...item, name }));
                        setConfig((current) => ({ ...current, active: name }));
                      }}
                      value={selected.name}
                    />
                  </label>
                  <button
                    disabled={busy}
                    onClick={() => {
                      if (
                        !window.confirm(
                          zh
                            ? `删除环境“${selected.name}”？`
                            : `Delete environment “${selected.name}”?`,
                        )
                      )
                        return;
                      const remaining = config.environments.filter(
                        (item) => item.name !== selected.name,
                      );
                      void save({ active: remaining[0]?.name ?? "", environments: remaining });
                    }}
                    type="button"
                  >
                    {zh ? "删除环境" : "Delete environment"}
                  </button>
                </div>
                <h2>{zh ? "变量" : "Variables"}</h2>
                {selected.variables.map((variable, index) => (
                  <div className="environment-variable" key={index}>
                    <label>
                      {zh ? "名称" : "Name"}
                      <input
                        disabled={busy}
                        maxLength={100}
                        placeholder={
                          zh ? "如 serverAddress、deviceId" : "e.g. serverAddress, deviceId"
                        }
                        onChange={(event) => updateVariable(index, "name", event.target.value)}
                        value={variable.name}
                      />
                    </label>
                    <label>
                      {zh ? "类型" : "Type"}
                      <select
                        disabled={busy}
                        onChange={(event) =>
                          updateVariable(
                            index,
                            "type",
                            event.target.value as EnvironmentVariable["type"],
                          )
                        }
                        value={variable.type}
                      >
                        <option value="string">{zh ? "文本" : "String"}</option>
                        <option value="number">{zh ? "数字" : "Number"}</option>
                        <option value="boolean">{zh ? "布尔" : "Boolean"}</option>
                      </select>
                    </label>
                    <label>
                      {zh ? "默认值" : "Default value"}
                      <input
                        disabled={busy}
                        onChange={(event) =>
                          updateVariable(index, "defaultValue", event.target.value)
                        }
                        value={variable.defaultValue}
                      />
                    </label>
                    <label className="environment-required">
                      <input
                        checked={variable.required}
                        disabled={busy}
                        onChange={(event) =>
                          updateVariable(index, "required", event.target.checked)
                        }
                        type="checkbox"
                      />
                      {zh ? "必填" : "Required"}
                    </label>
                    <button
                      aria-label={
                        zh
                          ? `删除变量 ${variable.name || index + 1}`
                          : `Remove variable ${variable.name || index + 1}`
                      }
                      disabled={busy}
                      onClick={() =>
                        edit((item) => ({
                          ...item,
                          variables: item.variables.filter((_, position) => position !== index),
                        }))
                      }
                      type="button"
                    >
                      ×
                    </button>
                  </div>
                ))}
                <div className="environment-actions">
                  <button
                    disabled={busy || selected.variables.length >= 200}
                    onClick={() =>
                      edit((item) => ({
                        ...item,
                        variables: [
                          ...item.variables,
                          { name: "", type: "string", defaultValue: "", required: false },
                        ],
                      }))
                    }
                    type="button"
                  >
                    {zh ? "添加变量" : "Add variable"}
                  </button>
                  <button disabled={busy} onClick={() => void save()} type="button">
                    {zh ? "保存修改" : "Save changes"}
                  </button>
                </div>
              </section>
            )}
            {error && (
              <p className="environment-error" role="alert">
                {error}
              </p>
            )}
            {status && <p role="status">{status}</p>}
          </>
        )}
      </div>
    </>
  );
}
