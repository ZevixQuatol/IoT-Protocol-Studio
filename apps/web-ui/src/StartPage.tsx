import { ChevronRight, Clock, FileText, Folder, Plus, Trash2 } from "lucide-react";
import type { Locale } from "./i18n";
import type { RecentProject } from "./recentProjects";

type Props = {
  locale: Locale;
  projects: RecentProject[];
  busy: boolean;
  onCreate: () => void;
  onOpen: (path?: string) => void;
  onForget: (path: string) => void;
  onClear: () => void;
  onReveal: (path: string) => void;
};

export default function StartPage({
  locale,
  projects,
  busy,
  onCreate,
  onOpen,
  onForget,
  onClear,
  onReveal,
}: Props) {
  const zh = locale === "zh-CN";
  const open = zh ? "打开项目" : "Open project";
  const create = zh ? "新建项目" : "New project";
  const remove = zh ? "删除记录" : "Remove from recent";
  const clear = zh ? "清空记录" : "Clear recent";
  return (
    <div className="start-page">
      <section className="start-hero" aria-labelledby="start-title">
        <h1 id="start-title">IoT Protocol Studio</h1>
        <p>
          {zh
            ? "面向协议开发、设备联调与通信分析的桌面工具。"
            : "A desktop tool for protocol development, device testing and communication analysis."}
        </p>
        <div className="start-actions">
          <button className="start-primary" type="button" disabled={busy} onClick={onCreate}>
            <Plus size={40} strokeWidth={3} aria-hidden="true" />
            <span>{create}</span>
          </button>
          <button type="button" disabled={busy} onClick={() => onOpen()}>
            <Folder size={36} className="start-folder" aria-hidden="true" />
            <span>{open}</span>
          </button>
        </div>
      </section>
      <section className="start-recent" aria-labelledby="start-recent-title">
        <header className="start-section-heading">
          <h2 id="start-recent-title">{zh ? "最近打开" : "Recent projects"}</h2>
          <button type="button" disabled={busy || !projects.length} onClick={onClear} title={clear}>
            <Trash2 size={21} aria-hidden="true" />
            <span>{clear}</span>
          </button>
        </header>
        <div className="start-table-scroll">
          <table className="start-projects">
            <thead>
              <tr>
                <th scope="col">{zh ? "项目名称" : "Project name"}</th>
                <th scope="col">{zh ? "项目路径" : "Project path"}</th>
                <th scope="col">{zh ? "最后打开时间" : "Last opened"}</th>
                <th scope="col">
                  <span className="start-sr-only">{zh ? "操作" : "Actions"}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => (
                <tr key={project.rootPath}>
                  <td>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onOpen(project.rootPath)}
                      title={project.name}
                    >
                      <Folder size={22} className="start-folder" aria-hidden="true" />
                      <span>{project.name}</span>
                    </button>
                  </td>
                  <td className="start-project-path" title={project.rootPath}>
                    {project.rootPath}
                  </td>
                  <td>
                    <time
                      dateTime={
                        Number.isFinite(project.lastOpenedAt)
                          ? new Date(project.lastOpenedAt!).toISOString()
                          : undefined
                      }
                    >
                      {Number.isFinite(project.lastOpenedAt)
                        ? new Date(project.lastOpenedAt!).toLocaleString(locale, {
                            year: "numeric",
                            month: "2-digit",
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: false,
                          })
                        : "—"}
                    </time>
                  </td>
                  <td className="start-row-actions">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onOpen(project.rootPath)}
                      title={open}
                      aria-label={`${open}: ${project.name}`}
                    >
                      <Folder size={21} className="start-folder" aria-hidden="true" />
                    </button>
                    <button
                      className="start-remove"
                      type="button"
                      disabled={busy}
                      onClick={() => onForget(project.rootPath)}
                      title={remove}
                      aria-label={`${remove}: ${project.name}`}
                    >
                      <Trash2 size={21} aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
              {!projects.length && (
                <tr>
                  <td colSpan={4} className="start-empty">
                    {zh
                      ? "暂无最近项目，新建或打开项目开始使用。"
                      : "No recent projects. Create or open a project to get started."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      <section className="start-other" aria-labelledby="start-other-title">
        <h2 id="start-other-title">{zh ? "其他方式开始" : "Other ways to start"}</h2>
        <div className="start-shortcuts">
          <button type="button" disabled={busy} onClick={() => onOpen()}>
            <Folder size={32} aria-hidden="true" />
            <span>
              <strong>{zh ? "从目录打开" : "Open from directory"}</strong>
              <small>
                {zh ? "选择已有项目目录，快速打开" : "Choose an existing project directory"}
              </small>
            </span>
            <ChevronRight size={22} aria-hidden="true" />
          </button>
          <button
            type="button"
            disabled={busy || !projects.length}
            onClick={() => onReveal(projects[0].rootPath)}
          >
            <Clock size={34} aria-hidden="true" />
            <span>
              <strong>{zh ? "查看最近项目所在位置" : "Locate the latest project"}</strong>
              <small>
                {zh ? "在文件资源管理器中打开最近项目" : "Open the latest project in File Explorer"}
              </small>
            </span>
            <ChevronRight size={22} aria-hidden="true" />
          </button>
          <button
            type="button"
            disabled
            title={zh ? "示例项目导入尚未实现" : "Sample project import is not available yet"}
          >
            <FileText size={32} aria-hidden="true" />
            <span>
              <strong>{zh ? "导入示例项目" : "Import sample project"}</strong>
              <small>
                {zh ? "从示例模板创建学习项目" : "Learn with a project from a sample template"}
              </small>
            </span>
            <ChevronRight size={22} aria-hidden="true" />
          </button>
        </div>
      </section>
    </div>
  );
}
