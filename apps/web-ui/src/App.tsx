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
  LoaderCircle,
  Minus,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Square,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState, type PointerEvent } from "react";
import {
  getCoreInfo,
  getWorkspaceCatalog,
  performWindowAction,
  type CoreInfo,
  type WorkspaceCatalog,
  type WorkspaceProtocol,
  type WorkspaceSchema,
} from "./bridge";
import { detectInitialLocale, messages, storeLocale } from "./i18n";

type Page = "schema" | "settings";

type TreeNode = {
  key: string;
  name: string;
  path: string;
  type: "folder" | "protocol";
  children?: TreeNode[];
  protocol?: WorkspaceProtocol;
};

function buildTree(schema: WorkspaceSchema): TreeNode[] {
  const roots: TreeNode[] = [];
  for (const protocol of schema.protocols) {
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
        folder = {
          key: `${schema.id}:folder:${path}`,
          name: part,
          path,
          type: "folder",
          children: [],
        };
        children.push(folder);
      }
      children = folder.children ?? [];
    }

    children.push({
      key: `${schema.id}:protocol:${protocol.path}`,
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
  const [locale] = useState(detectInitialLocale);
  const [navigation, setNavigation] = useState<{ entries: Page[]; index: number }>({
    entries: ["schema"],
    index: 0,
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [catalog, setCatalog] = useState<WorkspaceCatalog | null>(null);
  const [coreInfo, setCoreInfo] = useState<CoreInfo | null>(null);
  const [selectedSchemaId, setSelectedSchemaId] = useState<string>();
  const [selectedProtocolPath, setSelectedProtocolPath] = useState<string>();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const translation = messages[locale];
  const page = navigation.entries[navigation.index];

  useEffect(() => {
    document.documentElement.lang = locale;
    storeLocale(locale);
  }, [locale]);

  useEffect(() => {
    void getCoreInfo()
      .then(setCoreInfo)
      .catch(() => undefined);
    void getWorkspaceCatalog()
      .then((nextCatalog) => {
        setCatalog(nextCatalog);
        if (!nextCatalog.ok || nextCatalog.schemas.length === 0) {
          return;
        }
        const firstSchema = nextCatalog.schemas[0];
        setSelectedSchemaId(firstSchema.id);
        setSelectedProtocolPath(firstSchema.protocols[0]?.path);
        const expandedKeys = new Set<string>();
        for (const schema of nextCatalog.schemas) {
          expandedKeys.add(`schema:${schema.id}`);
          collectExpandedKeys(buildTree(schema), expandedKeys);
        }
        setExpanded(expandedKeys);
      })
      .catch((error: unknown) => {
        setCatalog({
          ok: false,
          source: "native-workspace",
          error: { message: error instanceof Error ? error.message : String(error) },
        });
      });
  }, []);

  const navigate = useCallback((nextPage: Page) => {
    setNavigation((current) => {
      if (current.entries[current.index] === nextPage) {
        return current;
      }
      return {
        entries: [...current.entries.slice(0, current.index + 1), nextPage],
        index: current.index + 1,
      };
    });
  }, []);

  const goBack = () =>
    setNavigation((current) => ({ ...current, index: Math.max(0, current.index - 1) }));
  const goForward = () =>
    setNavigation((current) => ({
      ...current,
      index: Math.min(current.entries.length - 1, current.index + 1),
    }));

  const toggleExpanded = (key: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const selectSchema = (schema: WorkspaceSchema) => {
    setSelectedSchemaId(schema.id);
    setSelectedProtocolPath(schema.protocols[0]?.path);
    setExpanded((current) => new Set(current).add(`schema:${schema.id}`));
    navigate("schema");
  };

  const selectProtocol = (schema: WorkspaceSchema, protocol: WorkspaceProtocol) => {
    setSelectedSchemaId(schema.id);
    setSelectedProtocolPath(protocol.path);
    navigate("schema");
  };

  const selectedSchema =
    catalog?.ok && catalog.schemas.length > 0
      ? (catalog.schemas.find((schema) => schema.id === selectedSchemaId) ?? catalog.schemas[0])
      : undefined;
  const selectedProtocol = selectedSchema?.protocols.find(
    (protocol) => protocol.path === selectedProtocolPath,
  );
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
            onClick={goBack}
            title={translation.navigation.back}
            type="button"
          >
            <ArrowLeft size={17} />
          </button>
          <button
            aria-label={translation.navigation.forward}
            className="nav-button history-forward"
            disabled={navigation.index === navigation.entries.length - 1}
            onClick={goForward}
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
            title={translation.window.minimize}
            type="button"
          >
            <Minus size={16} />
          </button>
          <button
            aria-label={translation.window.maximize}
            className="window-control"
            onClick={() => void performWindowAction("maximize")}
            title={translation.window.maximize}
            type="button"
          >
            <Square size={12} />
          </button>
          <button
            aria-label={translation.window.close}
            className="window-control close"
            onClick={() => void performWindowAction("close")}
            title={translation.window.close}
            type="button"
          >
            <X size={16} />
          </button>
        </div>
      </header>

      <div className={`workspace-layout ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
        <aside className="schema-sidebar">
          <div className="sidebar-header">
            {!sidebarCollapsed && <span>{translation.workspace.schemas}</span>}
            <button
              aria-label={
                sidebarCollapsed
                  ? translation.workspace.expandSidebar
                  : translation.workspace.collapseSidebar
              }
              className="sidebar-toggle"
              onClick={() => setSidebarCollapsed((current) => !current)}
              title={
                sidebarCollapsed
                  ? translation.workspace.expandSidebar
                  : translation.workspace.collapseSidebar
              }
              type="button"
            >
              {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            </button>
          </div>

          {!sidebarCollapsed && (
            <div className="schema-tree">
              {!catalog && (
                <div className="tree-state">
                  <LoaderCircle className="spin" size={16} />
                  {translation.workspace.loading}
                </div>
              )}
              {catalog && !catalog.ok && (
                <div className="tree-state error">
                  <CircleAlert size={16} />
                  {catalog.error.message}
                </div>
              )}
              {catalog?.ok && catalog.schemas.length === 0 && (
                <div className="tree-state">{translation.workspace.empty}</div>
              )}
              {catalog?.ok &&
                catalog.schemas.map((schema) => {
                  const schemaKey = `schema:${schema.id}`;
                  const isOpen = expanded.has(schemaKey);
                  const isSelected = selectedSchema?.id === schema.id;
                  return (
                    <div className="schema-tree-group" key={schema.id}>
                      <div className={`schema-row-wrapper ${isSelected ? "selected" : ""}`}>
                        <button
                          aria-expanded={isOpen}
                          aria-label={
                            isOpen
                              ? translation.workspace.collapseTree
                              : translation.workspace.expandTree
                          }
                          className="schema-expander"
                          onClick={() => toggleExpanded(schemaKey)}
                          type="button"
                        >
                          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                        <button
                          className="schema-row"
                          onClick={() => selectSchema(schema)}
                          type="button"
                        >
                          <Braces size={15} />
                          <span className="schema-name">{schema.name}</span>
                          <span className="schema-count">{schema.protocols.length}</span>
                        </button>
                      </div>
                      {isOpen && (
                        <TreeItems
                          depth={0}
                          expanded={expanded}
                          nodes={buildTree(schema)}
                          onSelect={(protocol) => selectProtocol(schema, protocol)}
                          onToggle={toggleExpanded}
                          selectedPath={isSelected ? selectedProtocolPath : undefined}
                        />
                      )}
                    </div>
                  );
                })}
            </div>
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
            {page === "settings" ? (
              <>
                <header className="content-header">
                  <div className="content-heading-icon">
                    <Settings size={20} />
                  </div>
                  <div>
                    <span className="content-eyebrow">{translation.navigation.settings}</span>
                    <h1>{translation.settings.title}</h1>
                    <p>{translation.settings.empty}</p>
                  </div>
                </header>
                <div className="settings-empty">
                  <HardDrive size={24} />
                  <strong>{translation.workspace.cacheRoot}</strong>
                  <code>{catalog?.ok ? catalog.cacheRoot : translation.workspace.unavailable}</code>
                  <span>{translation.settings.cacheHint}</span>
                </div>
              </>
            ) : (
              <>
                <header className="content-header">
                  <div className="content-heading-icon">
                    {selectedProtocol ? <FileCode2 size={20} /> : <Braces size={20} />}
                  </div>
                  <div className="content-heading-copy">
                    <span className="content-eyebrow">
                      {selectedSchema?.name ?? translation.navigation.schema}
                    </span>
                    <h1>
                      {selectedProtocol?.name ??
                        selectedSchema?.name ??
                        translation.workspace.noSelection}
                    </h1>
                    <p>{selectedProtocol?.path ?? selectedSchema?.description}</p>
                  </div>
                  <div className="cache-location" title={catalog?.ok ? catalog.cacheRoot : ""}>
                    <HardDrive size={14} />
                    <span>{translation.workspace.cacheRoot}</span>
                    <code>{catalog?.ok ? catalog.cacheRoot : "--"}</code>
                  </div>
                </header>

                <div className="content-body">
                  {!catalog && (
                    <div className="content-state">
                      <LoaderCircle className="spin" size={20} />
                      {translation.workspace.loading}
                    </div>
                  )}
                  {catalog && !catalog.ok && (
                    <div className="content-state error">
                      <CircleAlert size={20} />
                      <span>{catalog.error.message}</span>
                    </div>
                  )}
                  {catalog?.ok && !selectedProtocol && (
                    <div className="content-state">
                      <Braces size={26} />
                      <strong>{translation.workspace.selectProtocol}</strong>
                      <span>{translation.workspace.selectProtocolHint}</span>
                    </div>
                  )}
                  {selectedProtocol && (
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
    </div>
  );
}
