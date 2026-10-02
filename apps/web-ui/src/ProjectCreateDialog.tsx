import { useEffect, useRef, useState, type FormEvent } from "react";
import { Check, CircleAlert, Folder, Info, X } from "lucide-react";
import { chooseProjectDirectory } from "./bridge";
import type { Locale } from "./i18n";

export default function ProjectCreateDialog({
  locale,
  busy,
  initialParent,
  workspaceError,
  onCreate,
  onClose,
}: {
  locale: Locale;
  busy: boolean;
  initialParent: string;
  workspaceError?: string;
  onCreate: (name: string, parent: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const zh = locale === "zh-CN";
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState("");
  const [parent, setParent] = useState(initialParent);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState("");
  const locked = busy || picking;
  const destination = parent.trim()
    ? `${parent.trim().replace(/[\\/]+$/, "")}${parent.trim().includes("\\") ? "\\" : "/"}${name.trim()}`
    : "";
  useEffect(() => {
    dialog.current?.showModal();
    dialog.current?.querySelector("input")?.focus();
  }, []);
  const pick = async () => {
    setPicking(true);
    setError("");
    try {
      const result = await chooseProjectDirectory();
      if (result.ok && !result.cancelled) setParent(result.path);
      else if (!result.ok) setError(result.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPicking(false);
    }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (locked) return;
    if (
      !name.trim() ||
      /[\\/<>:"|?*\u0000-\u001f]/.test(name.trim()) ||
      name.trim().endsWith(".")
    ) {
      setError(zh ? "请输入有效的项目名称。" : "Enter a valid project name.");
      return;
    }
    if (!parent.trim()) {
      setError(zh ? "请选择保存目录。" : "Choose a parent directory.");
      return;
    }
    setError("");
    if (await onCreate(name.trim(), parent.trim())) onClose();
  };
  return (
    <dialog
      ref={dialog}
      className="project-create-dialog"
      aria-labelledby="project-create-title"
      onCancel={(event) => {
        if (locked) event.preventDefault();
      }}
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <header>
          <h2 id="project-create-title">{zh ? "新建项目" : "New project"}</h2>
          <button
            type="button"
            disabled={locked}
            onClick={onClose}
            aria-label={zh ? "关闭" : "Close"}
          >
            <X size={27} />
          </button>
        </header>
        <div className="project-create-fields">
          <label htmlFor="project-name">
            {zh ? "项目名称" : "Project name"} <span>*</span>
          </label>
          <div>
            <div className="project-name-control">
              <input
                id="project-name"
                autoFocus
                required
                maxLength={100}
                value={name}
                disabled={locked}
                onChange={(event) => setName(event.target.value)}
                placeholder={zh ? "输入项目名称" : "Enter a project name"}
              />
              {name && (
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => setName("")}
                  aria-label={zh ? "清空名称" : "Clear name"}
                >
                  <X size={17} />
                </button>
              )}
            </div>
            <p>
              {zh
                ? "项目名称用于界面展示，并作为磁盘上的项目文件夹名称。"
                : "The name is displayed in the app and used for the project folder."}
            </p>
          </div>
          <label htmlFor="project-parent">
            {zh ? "保存位置" : "Save location"} <span>*</span>
          </label>
          <div className="project-location-control">
            <input
              id="project-parent"
              required
              maxLength={32767}
              value={parent}
              disabled={locked}
              onChange={(event) => setParent(event.target.value)}
              placeholder={zh ? "选择项目的父目录" : "Choose a parent directory"}
            />
            <button
              type="button"
              disabled={locked}
              onClick={() => void pick()}
              title={zh ? "选择保存目录" : "Choose save directory"}
              aria-label={zh ? "选择保存目录" : "Choose save directory"}
            >
              <Folder size={25} />
            </button>
          </div>
        </div>
        <div className="project-destination">
          <Info size={22} />
          <div>
            <span>{zh ? "项目将在以下位置创建：" : "Your project will be created here:"}</span>
            <strong>
              {destination ||
                (zh ? "请选择保存位置并填写项目名称" : "Choose a location and enter a name")}
            </strong>
          </div>
        </div>
        {(error || workspaceError) && (
          <p role="alert" className="project-create-error">
            <CircleAlert size={18} />
            {error || workspaceError}
          </p>
        )}
        <footer>
          <button type="button" disabled={locked} onClick={onClose}>
            <X size={27} />
            {zh ? "取消" : "Cancel"}
          </button>
          <button type="submit" disabled={locked}>
            <Check size={30} />
            {busy ? (zh ? "创建中…" : "Creating…") : zh ? "创建" : "Create"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
