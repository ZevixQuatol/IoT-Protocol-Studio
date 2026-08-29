import {
  ArrowLeft,
  ArrowRight,
  Braces,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Cpu,
  FileCode2,
  Folder,
  FolderOpen,
  HardDrive,
  Languages,
  LoaderCircle,
  Minus,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Settings,
  Square,
  X,
} from "lucide-react";
import { useEffect, useState, type FormEvent, type PointerEvent } from "react";
import {
  closeProject,
  createProtocol,
  getCoreInfo,
  getCurrentProject,
  openProject,
  performWindowAction,
  type CoreInfo,
  type WorkspaceProject,
  type WorkspaceProtocol,
  type WorkspaceResult,
} from "./bridge";
import {
  detectInitialLocale,
  messages,
  storeLocale,
  translateWorkspaceError,
  type Locale,
} from "./i18n";

type Page = "schema" | "settings";

type TreeNode = {
  key: string;
  name: string;
  path: string;
  type: "folder" | "protocol";
  children?: TreeNode[];
  protocol?: WorkspaceProtocol;
};

function buildTree(project: WorkspaceProject): TreeNode[] {
  const roots: TreeNode[] = [];
  for (const protocol of project.protocols) {
    const parts = protocol.path.split("/").filter(Boolean);
    if (parts[0] === "protocols") {
      parts.shift();
    }
    const filename = parts.pop();
    if (!filename) {
      continue;
    }

    let path = "protocols";
    let children = roots;
    for (const part of parts) {
      path += `/${part}`;
      let folder = children.find((node) => node.type === "folder" && node.path === path);
      if (!folder) {
        folder = { key: `folder:${path}`, name: part, path, type: "folder", children: [] };
        children.push(folder);
      }
      children = folder.children ?? [];
    }
    children.push({
      key: `protocol:${protocol.path}`,
      name: protocol.name || filename.replace(/\.protocol\.ya?ml$/i, ""),
      path: protocol.path,
      type: "protocol",
      protocol,
    });
  }
  return roots;
}

function collectExpandedKeys(nodes: TreeNode[], keys: Set<string>) {
  for (const node of nodes) {
    if (node.type === "folder") {
      keys.add(node.key);
      collectExpandedKeys(node.children ?? [], keys);
    }
  }
}

type TreeItemsProps = {
  nodes: TreeNode[];
  depth: number;
  expanded: Set<string>;
  selectedPath?: string;
  onToggle: (key: string) => void;
  onSelect: (protocol: WorkspaceProtocol) => void;
};

function TreeItems({ nodes, depth, expanded, selectedPath, onToggle, onSelect }: TreeItemsProps) {
  return nodes.map((node) => {
    const isOpen = expanded.has(node.key);
    if (node.type === "folder") {
      return (
        <div key={node.key}>
          <button
            aria-expanded={isOpen}
            className="tree-item folder-item"
            onClick={() => onToggle(node.key)}
            style={{ paddingLeft: 14 + depth * 16 }}
            type="button"
          >
            {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            {isOpen ? <FolderOpen size={15} /> : <Folder size={15} />}
            <span>{node.name}</span>
          </button>
          {isOpen && (
            <TreeItems
              depth={depth + 1}
              expanded={expanded}
              nodes={node.children ?? []}
              onSelect={onSelect}
              onToggle={onToggle}
              selectedPath={selectedPath}
            />
          )}
        </div>
      );
    }
    return (
      <button
        aria-current={selectedPath === node.path ? "page" : undefined}
        className={`tree-item protocol-item ${selectedPath === node.path ? "active" : ""}`}
        key={node.key}
        onClick={() => node.protocol && onSelect(node.protocol)}
        style={{ paddingLeft: 32 + depth * 16 }}
        type="button"
      >
        <FileCode2 size={15} />
        <span>{node.name}</span>
      </button>
    );
  });
}

export default function App() {
  const [locale, setLocale] = useState<Locale>(detectInitialLocale);
  const [navigation, setNavigation] = useState<{ entries: Page[]; index: number }>({
    entries: ["schema"],
    index: 0,
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [workspace, setWorkspace] = useState<WorkspaceResult | null>(null);
  const [coreInfo, setCoreInfo] = useState<CoreInfo | null>(null);
  const [selectedProtocolPath, setSelectedProtocolPath] = useState<string>();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();
  const translation = messages[locale];
  const page = navigation.entries[navigation.index];
  const project = workspace?.ok ? workspace.project : null;
  const selectedProtocol = project?.protocols.find(
    (protocol) => protocol.path === selectedProtocolPath,
  );

  const applyWorkspace = (result: WorkspaceResult, preferredPath?: string) => {
    if (!result.ok) {
      setErrorMessage(
        `${translateWorkspaceError(locale, result.error.code, result.error.message)} [${result.error.code}]${result.error.path ? ` (${result.error.path})` : ""}`,
      );
      return false;
    }
    if (result.cancelled) {
      return false;
    }
    setErrorMessage(undefined);
    setWorkspace(result);
    const path =
      result.project?.protocols.find((protocol) => protocol.path === preferredPath)?.path ??
      result.project?.protocols[0]?.path;
    setSelectedProtocolPath(path);
    const keys = new Set<string>();
    if (result.project) {
      collectExpandedKeys(buildTree(result.project), keys);
    }
    setExpanded(keys);
    return true;
  };

  useEffect(() => {
    document.documentElement.lang = locale;
    storeLocale(locale);
  }, [locale]);

  useEffect(() => {
    void getCoreInfo()
      .then(setCoreInfo)
      .catch(() => undefined);
    void getCurrentProject()
      .then(applyWorkspace)
      .catch((error: unknown) => {
        setErrorMessage(error instanceof Error ? error.message : String(error));
      });
  }, []);

  const navigate = (nextPage: Page) => {
    setNavigation((current) => {
      if (current.entries[current.index] === nextPage) {
        return current;
      }
      return {
        entries: [...current.entries.slice(0, current.index + 1), nextPage],
        index: current.index + 1,
      };
    });
  };

  const run = async (action: () => Promise<WorkspaceResult>, preferredPath?: string) => {
    setBusy(true);
    try {
      return applyWorkspace(await action(), preferredPath);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const submitCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const relativePath = String(data.get("relativePath") ?? "").trim();
    void run(
      () =>
        createProtocol({
          relativePath,
          name: String(data.get("name") ?? "").trim(),
          displayName: String(data.get("displayName") ?? "").trim(),
          version: String(data.get("version") ?? "").trim(),
          description: String(data.get("description") ?? "").trim(),
          byteOrder: data.get("byteOrder") === "little" ? "little" : "big",
        }),
      `protocols/${relativePath}`,
    ).then((created) => {
      if (created) {
        setCreateOpen(false);
        form.reset();
      }
    });
  };

  const toggleExpanded = (key: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const startWindowDrag = (event: PointerEvent<HTMLElement>) => {
    if (event.button === 0 && event.target instanceof Element && !event.target.closest("button")) {
      void performWindowAction("drag");
    }
  };

  return (
    <div className="app-shell">
      <header className="titlebar" onPointerDown={startWindowDrag}>
        <nav aria-label={translation.navigation.title} className="titlebar-nav">
          <button
            aria-label={translation.navigation.back}
            className="nav-button history-back"
            disabled={navigation.index === 0}
            onClick={() =>
              setNavigation((current) => ({ ...current, index: Math.max(0, current.index - 1) }))
            }
            title={translation.navigation.back}
            type="button"
          >
            <ArrowLeft size={17} />
          </button>
          <button
            aria-label={translation.navigation.forward}
            className="nav-button history-forward"
            disabled={navigation.index === navigation.entries.length - 1}
            onClick={() =>
              setNavigation((current) => ({
                ...current,
                index: Math.min(current.entries.length - 1, current.index + 1),
              }))
            }
            title={translation.navigation.forward}
            type="button"
          >
            <ArrowRight size={17} />
          </button>
          <button
            aria-current={page === "schema" ? "page" : undefined}
            aria-label={translation.navigation.schema}
            className={`nav-button schema-button ${page === "schema" ? "active" : ""}`}
            onClick={() => navigate("schema")}
            title={translation.navigation.schema}
            type="button"
          >
            <Braces size={17} />
          </button>
          <button
            aria-current={page === "settings" ? "page" : undefined}
            aria-label={translation.navigation.settings}
            className={`nav-button settings-button ${page === "settings" ? "active" : ""}`}
            onClick={() => navigate("settings")}
            title={translation.navigation.settings}
            type="button"
          >
            <Settings size={16} />
          </button>
        </nav>
        <div aria-hidden="true" className="titlebar-drag-region" />
        <div className="window-controls">
          <button
            aria-label={translation.window.minimize}
            className="window-control"
            onClick={() => void performWindowAction("minimize")}
          >
            <Minus size={16} />
          </button>
          <button
            aria-label={translation.window.maximize}
            className="window-control"
            onClick={() => void performWindowAction("maximize")}
          >
            <Square size={12} />
          </button>
          <button
            aria-label={translation.window.close}
            className="window-control close"
            onClick={() => void performWindowAction("close")}
          >
            <X size={16} />
          </button>
        </div>
      </header>

      <div className={`workspace-layout ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
        <aside className="schema-sidebar">
          <div className="sidebar-header">
            {!sidebarCollapsed && <span>{translation.workspace.project}</span>}
            <button
              aria-label={
                sidebarCollapsed
                  ? translation.workspace.expandSidebar
                  : translation.workspace.collapseSidebar
              }
              className="sidebar-toggle"
              onClick={() => setSidebarCollapsed((current) => !current)}
              type="button"
            >
              {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            </button>
          </div>

          {!sidebarCollapsed && (
            <>
              <div className="project-actions">
                <button disabled={busy} onClick={() => void run(openProject)} type="button">
                  <FolderOpen size={15} />
                  {translation.workspace.openProject}
                </button>
                {project && (
                  <>
                    <button disabled={busy} onClick={() => setCreateOpen(true)} type="button">
                      <Plus size={15} />
                      {translation.workspace.createProtocol}
                    </button>
                    <button
                      aria-label={translation.workspace.closeProject}
                      disabled={busy}
                      onClick={() => void run(closeProject)}
                      title={translation.workspace.closeProject}
                      type="button"
                    >
                      <X size={15} />
                    </button>
                  </>
                )}
              </div>
              <div className="schema-tree">
                {busy && (
                  <div className="tree-state">
                    <LoaderCircle className="spin" size={16} />
                    {translation.workspace.loading}
                  </div>
                )}
                {!busy && project && (
                  <>
                    <div className="project-title">
                      <FolderOpen size={15} />
                      <span>{project.name}</span>
                      <span>{project.protocols.length}</span>
                    </div>
                    <TreeItems
                      depth={0}
                      expanded={expanded}
                      nodes={buildTree(project)}
                      onSelect={(protocol) => {
                        setSelectedProtocolPath(protocol.path);
                        navigate("schema");
                      }}
                      onToggle={toggleExpanded}
                      selectedPath={selectedProtocolPath}
                    />
                  </>
                )}
                {!busy && !project && (
                  <div className="tree-state">{translation.workspace.noProject}</div>
                )}
              </div>
            </>
          )}

          {!sidebarCollapsed && (
            <div className="sidebar-footer">
              <Cpu size={14} />
              <span>Core {coreInfo?.version ?? "..."}</span>
              <span className={`core-dot ${coreInfo?.source === "native-core" ? "native" : ""}`} />
            </div>
          )}
        </aside>

        <section className="content-stage">
          <main className={`content-card ${page === "settings" ? "settings-page" : "schema-page"}`}>
            {errorMessage && (
              <div className="error-banner">
                <CircleAlert size={16} />
                <span>{errorMessage}</span>
                <button onClick={() => setErrorMessage(undefined)} type="button">
                  <X size={14} />
                </button>
              </div>
            )}
            {page === "settings" ? (
              <>
                <header className="content-header">
                  <div className="content-heading-icon">
                    <Settings size={20} />
                  </div>
                  <div>
                    <span className="content-eyebrow">{translation.navigation.settings}</span>
                    <h1>{translation.settings.title}</h1>
                    <p>{translation.settings.languageHint}</p>
                  </div>
                </header>
                <div className="settings-empty">
                  <Languages size={24} />
                  <strong>{translation.settings.language}</strong>
                  <div className="language-options">
                    <button
                      className={locale === "zh-CN" ? "active" : ""}
                      onClick={() => setLocale("zh-CN")}
                      type="button"
                    >
                      中文
                    </button>
                    <button
                      className={locale === "en-US" ? "active" : ""}
                      onClick={() => setLocale("en-US")}
                      type="button"
                    >
                      English
                    </button>
                  </div>
                  <code>{project?.rootPath ?? translation.workspace.noProject}</code>
                </div>
              </>
            ) : !project ? (
              <div className="workspace-empty">
                <FolderOpen size={34} />
                <h1>{translation.workspace.noProject}</h1>
                <p>{translation.workspace.openHint}</p>
                <button disabled={busy} onClick={() => void run(openProject)} type="button">
                  {translation.workspace.openProject}
                </button>
              </div>
            ) : (
              <>
                <header className="content-header">
                  <div className="content-heading-icon">
                    {selectedProtocol ? <FileCode2 size={20} /> : <Braces size={20} />}
                  </div>
                  <div className="content-heading-copy">
                    <span className="content-eyebrow">{project.name}</span>
                    <h1>{selectedProtocol?.name ?? translation.workspace.selectProtocol}</h1>
                    <p>{selectedProtocol?.path ?? project.description}</p>
                  </div>
                  <div className="cache-location" title={project.rootPath}>
                    <HardDrive size={14} />
                    <span>{translation.workspace.projectRoot}</span>
                    <code>{project.rootPath}</code>
                  </div>
                </header>
                <div className="content-body">
                  {!selectedProtocol ? (
                    <div className="content-state">
                      <Braces size={26} />
                      <strong>{translation.workspace.selectProtocol}</strong>
                      <span>{translation.workspace.selectProtocolHint}</span>
                    </div>
                  ) : (
                    <section className="protocol-source">
                      <div className="source-toolbar">
                        <div>
                          <FileCode2 size={15} />
                          <span>{selectedProtocol.path.split("/").at(-1)}</span>
                        </div>
                        <span>{translation.workspace.physicalFile}</span>
                      </div>
                      <pre>{selectedProtocol.content}</pre>
                    </section>
                  )}
                </div>
              </>
            )}
          </main>
        </section>
      </div>

      {createOpen && (
        <div className="modal-backdrop">
          <form aria-modal="true" className="protocol-dialog" onSubmit={submitCreate} role="dialog">
            <header>
              <div>
                <span>{translation.workspace.project}</span>
                <h2>{translation.create.title}</h2>
              </div>
              <button onClick={() => setCreateOpen(false)} type="button">
                <X size={16} />
              </button>
            </header>
            <label>
              {translation.create.relativePath}
              <input
                name="relativePath"
                pattern=".+\.protocol\.ya?ml"
                placeholder="vendors/acme/telemetry.protocol.yaml"
                required
              />
              <small>{translation.create.relativePathHint}</small>
            </label>
            <label>
              {translation.create.name}
              <input name="name" placeholder="acme-telemetry" required />
            </label>
            <label>
              {translation.create.displayName}
              <input name="displayName" />
            </label>
            <div className="form-row">
              <label>
                {translation.create.version}
                <input defaultValue="1.0" name="version" required />
              </label>
              <label>
                {translation.create.byteOrder}
                <select defaultValue="big" name="byteOrder">
                  <option value="big">Big Endian</option>
                  <option value="little">Little Endian</option>
                </select>
              </label>
            </div>
            <label>
              {translation.create.description}
              <textarea name="description" rows={3} />
            </label>
            <footer>
              <button onClick={() => setCreateOpen(false)} type="button">
                {translation.create.cancel}
              </button>
              <button className="primary" disabled={busy} type="submit">
                {translation.create.submit}
              </button>
            </footer>
          </form>
        </div>
      )}
    </div>
  );
}
