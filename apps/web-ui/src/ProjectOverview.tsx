import { useState } from "react";
import {
  Box,
  CircleAlert,
  Clock,
  ExternalLink,
  File,
  FileText,
  Folder,
  MoreHorizontal,
  Pencil,
  Plus,
  Settings,
  Trash2,
  Upload,
} from "lucide-react";
import type { WorkspaceProject, WorkspaceProtocol } from "./bridge";
import type { Locale } from "./i18n";
import type { RecentProject } from "./recentProjects";

const timeLabel = (time: number | undefined, locale: Locale) =>
  time
    ? new Intl.DateTimeFormat(locale, {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(time)
    : "—";

export default function ProjectOverview({
  project,
  locale,
  busy,
  recent,
  onCreateProtocol,
  onOpenProtocol,
  onDeleteProtocol,
  onReveal,
  onSettings,
}: {
  project: WorkspaceProject;
  locale: Locale;
  busy: boolean;
  recent?: RecentProject;
  onCreateProtocol: () => void;
  onOpenProtocol: (protocol: WorkspaceProtocol) => void;
  onDeleteProtocol: (protocol: WorkspaceProtocol) => void;
  onReveal: () => void;
  onSettings: () => void;
}) {
  const zh = locale === "zh-CN";
  const [focused, setFocused] = useState(project.protocols[0]?.path);
  const [checked, setChecked] = useState<string[]>([]);
  const currentFocus =
    project.protocols.find((protocol) => protocol.path === focused)?.path ??
    project.protocols[0]?.path;
  const checkedCount = project.protocols.filter((protocol) =>
    checked.includes(protocol.path),
  ).length;
  const unavailable = zh ? "此功能尚未实现" : "Not available yet";
  const toggle = (path: string) =>
    setChecked((items) =>
      items.includes(path) ? items.filter((item) => item !== path) : [...items, path],
    );
  return (
    <div className="project-overview">
      <section className="project-manager" aria-labelledby="project-manager-title">
        <header className="project-manager-header">
          <div>
            <h1 id="project-manager-title">{zh ? "项目管理" : "Project management"}</h1>
            <p>{zh ? "协议、示例与项目对象" : "Protocols, examples and project objects"}</p>
          </div>
          <div className="project-toolbar">
            <button
              className="accent-icon"
              onClick={onCreateProtocol}
              disabled={busy}
              title={zh ? "新建协议" : "New protocol"}
              aria-label={zh ? "新建协议" : "New protocol"}
            >
              <Plus size={30} />
            </button>
            <button
              disabled
              title={unavailable}
              aria-label={zh ? "导入示例项目" : "Import example project"}
            >
              <Upload size={25} />
            </button>
            <button
              onClick={onReveal}
              disabled={busy}
              title={zh ? "打开项目目录" : "Reveal project folder"}
              aria-label={zh ? "打开项目目录" : "Reveal project folder"}
            >
              <Folder size={25} />
            </button>
            <button
              onClick={onSettings}
              disabled={busy}
              title={zh ? "项目操作" : "Project actions"}
              aria-label={zh ? "项目操作" : "Project actions"}
            >
              <MoreHorizontal size={25} />
            </button>
          </div>
        </header>
        <div className="project-table-scroll">
          <table className="project-object-table">
            <thead>
              <tr>
                <th className="project-check">
                  <input
                    type="checkbox"
                    aria-label={zh ? "选择全部协议" : "Select all protocols"}
                    disabled={!project.protocols.length}
                    checked={
                      !!project.protocols.length &&
                      project.protocols.every((p) => checked.includes(p.path))
                    }
                    onChange={(event) =>
                      setChecked(event.target.checked ? project.protocols.map((p) => p.path) : [])
                    }
                  />
                </th>
                <th>{zh ? "名称" : "Name"}</th>
                <th>{zh ? "类型" : "Type"}</th>
                <th>{zh ? "描述" : "Description"}</th>
                <th>{zh ? "状态" : "Status"}</th>
                <th>{zh ? "文件路径" : "File path"}</th>
                <th>{zh ? "操作" : "Actions"}</th>
              </tr>
            </thead>
            <tbody>
              {project.protocols.map((protocol) => (
                <tr key={protocol.path} className={currentFocus === protocol.path ? "focused" : ""}>
                  <td className="project-check">
                    <input
                      type="checkbox"
                      aria-label={`${zh ? "选择" : "Select"} ${protocol.name}`}
                      checked={checked.includes(protocol.path)}
                      onChange={() => toggle(protocol.path)}
                    />
                  </td>
                  <td>
                    <button
                      className="project-object-name"
                      onClick={() => setFocused(protocol.path)}
                      onDoubleClick={() => onOpenProtocol(protocol)}
                      title={zh ? "双击打开协议" : "Double-click to open protocol"}
                    >
                      <Box size={25} />
                      <span>
                        {protocol.name}
                        <small>{protocol.path.split(/[\\/]/).at(-1)}</small>
                      </span>
                    </button>
                  </td>
                  <td>{zh ? "协议" : "Protocol"}</td>
                  <td>
                    {protocol.description ||
                      (zh
                        ? `${protocol.schema.messages.length} 个报文类型`
                        : `${protocol.schema.messages.length} message types`)}
                  </td>
                  <td>
                    <span
                      className={`project-status ${protocol.schema.messages.length ? "configured" : ""}`}
                    >
                      {protocol.schema.messages.length
                        ? zh
                          ? "已配置"
                          : "Configured"
                        : zh
                          ? "可用"
                          : "Available"}
                    </span>
                  </td>
                  <td className="project-object-path">{protocol.path}</td>
                  <td>
                    <div className="project-row-controls">
                      <button
                        disabled={busy}
                        onClick={() => onOpenProtocol(protocol)}
                        aria-label={`${zh ? "打开" : "Open"} ${protocol.name}`}
                        title={zh ? "打开协议" : "Open protocol"}
                      >
                        <File size={20} />
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => onOpenProtocol(protocol)}
                        aria-label={`${zh ? "编辑" : "Edit"} ${protocol.name}`}
                        title={zh ? "编辑协议" : "Edit protocol"}
                      >
                        <Pencil size={20} />
                      </button>
                      <button
                        className="danger-icon"
                        disabled={busy}
                        onClick={() => onDeleteProtocol(protocol)}
                        aria-label={`${zh ? "删除" : "Delete"} ${protocol.name}`}
                        title={zh ? "删除协议" : "Delete protocol"}
                      >
                        <Trash2 size={20} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!project.protocols.length && (
            <div className="project-empty">
              <Box size={36} />
              <p>{zh ? "项目中暂无协议" : "No protocols in this project"}</p>
              <button className="secondary-button" onClick={onCreateProtocol} disabled={busy}>
                <Plus size={18} />
                {zh ? "新建协议" : "New protocol"}
              </button>
            </div>
          )}
          {!!checkedCount && (
            <p className="project-selection-count">
              {zh ? `已选择 ${checkedCount} 项` : `${checkedCount} selected`}
            </p>
          )}
        </div>
      </section>
      <aside className="project-inspector" aria-label={zh ? "当前项目" : "Current project"}>
        <h2>{zh ? "当前项目" : "Current project"}</h2>
        <div className="project-summary">
          <Folder size={30} fill="currentColor" />
          <div>
            <strong>{project.name}</strong>
            <span title={project.rootPath}>{project.rootPath}</span>
          </div>
        </div>
        <dl className="project-facts">
          <div>
            <dt>{zh ? "协议数量" : "Protocols"}</dt>
            <dd>{project.protocols.length}</dd>
          </div>
          <div>
            <dt>{zh ? "报文类型" : "Message types"}</dt>
            <dd>{project.protocols.reduce((n, p) => n + p.schema.messages.length, 0)}</dd>
          </div>
          <div>
            <dt>{zh ? "最近打开" : "Last opened"}</dt>
            <dd>{timeLabel(recent?.lastOpenedAt, locale)}</dd>
          </div>
          <div>
            <dt>{zh ? "路径状态" : "Path status"}</dt>
            <dd>
              <span className="project-status configured">{zh ? "正常" : "Ready"}</span>
            </dd>
          </div>
        </dl>
        <h2>{zh ? "项目操作" : "Project actions"}</h2>
        <div className="project-inspector-actions">
          <button onClick={onCreateProtocol} disabled={busy}>
            <Plus className="accent-icon" size={28} />
            <span>{zh ? "新建协议" : "New protocol"}</span>
          </button>
          <button disabled title={unavailable}>
            <Upload size={25} />
            <span>{zh ? "导入示例项目" : "Import example project"}</span>
          </button>
          <button onClick={onReveal} disabled={busy}>
            <Folder size={25} />
            <span>{zh ? "打开项目目录" : "Reveal project folder"}</span>
          </button>
          <button onClick={onSettings} disabled={busy}>
            <Settings size={25} />
            <span>{zh ? "项目设置" : "Project settings"}</span>
          </button>
        </div>
        <h2>{zh ? "快捷链接" : "Quick links"}</h2>
        <div className="project-inspector-actions project-quick-links">
          <button disabled title={unavailable}>
            <FileText size={23} />
            <span>{zh ? "协议模板" : "Protocol templates"}</span>
          </button>
          <button disabled title={unavailable}>
            <ExternalLink size={23} />
            <span>{zh ? "文档中心" : "Documentation"}</span>
          </button>
        </div>
      </aside>
    </div>
  );
}

export function ProjectFooter({
  locale,
  projects,
  problems,
  busy,
  onOpen,
  onVisit,
}: {
  locale: Locale;
  projects: RecentProject[];
  busy: boolean;
  onOpen: (path: string) => void;
  problems: { id: number; time: number; context: string; message: string; protocol?: string }[];
  onVisit: (id: number) => void;
}) {
  const zh = locale === "zh-CN";
  return (
    <div className="project-footer">
      <section className="project-recent" aria-labelledby="project-recent-title">
        <h2 id="project-recent-title">
          <Clock size={24} />
          {zh ? "最近项目" : "Recent projects"}
        </h2>
        <div className="project-footer-scroll">
          {projects.map((project) => (
            <button
              key={project.rootPath}
              disabled={busy}
              onClick={() => onOpen(project.rootPath)}
              title={project.rootPath}
            >
              <Folder size={24} />
              <strong>{project.name}</strong>
              <span>{project.rootPath}</span>
              <time>{timeLabel(project.lastOpenedAt, locale)}</time>
            </button>
          ))}
        </div>
      </section>
      <section className="project-problems" aria-labelledby="project-problems-title">
        <h2 id="project-problems-title">
          <CircleAlert size={24} />
          {zh ? "问题列表" : "Problems"}
          <span className={problems.length ? "danger-icon" : "project-problem-count"}>
            {problems.length}
          </span>
        </h2>
        <div className="project-footer-scroll">
          {problems.length ? (
            <table>
              <thead>
                <tr>
                  <th>{zh ? "级别" : "Level"}</th>
                  <th>{zh ? "信息" : "Context"}</th>
                  <th>{zh ? "问题描述" : "Description"}</th>
                  <th>{zh ? "时间" : "Time"}</th>
                </tr>
              </thead>
              <tbody>
                {problems.map((problem) => (
                  <tr key={problem.id}>
                    <td>
                      <CircleAlert size={20} className="danger-icon" />
                    </td>
                    <td>{problem.protocol || problem.context}</td>
                    <td>
                      <button onClick={() => onVisit(problem.id)} title={problem.message}>
                        {problem.message}
                      </button>
                    </td>
                    <td>
                      <time>{timeLabel(problem.time, locale)}</time>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="project-no-problems">
              {zh ? "暂无问题，项目已准备就绪。" : "No problems. Your project is ready."}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
