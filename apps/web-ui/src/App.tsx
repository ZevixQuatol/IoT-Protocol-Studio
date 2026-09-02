import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Cpu,
  FileCode2,
  Folder,
  FolderOpen,
  HardDrive,
  Languages,
  ListTree,
  LoaderCircle,
  Minus,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Send,
  Save,
  Square,
  X,
} from "lucide-react";
import { useEffect, useState, type FormEvent, type PointerEvent } from "react";
import DotsHorizontalIcon from "./icons/dots-horizontal-icon";
import KeyframesIcon from "./icons/keyframes-icon";
import {
  closeProject,
  createProtocol,
  encodeProtocolMessage,
  getCoreInfo,
  getCurrentProject,
  openProject,
  performWindowAction,
  saveProtocol,
  updateFieldDisplayName,
  type CoreInfo,
  type MessageEncodeResult,
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
type DesignerView = "code" | "visual" | "message";

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

function defaultMessageFieldValue(
  field: WorkspaceProtocol["schema"]["messages"][number]["fields"][number],
) {
  if (field.lengthOf) {
    return "";
  }
  if (field.type === "boolean") {
    return "false";
  }
  if (field.type === "string") {
    return "";
  }
  if (field.type === "bytes") {
    return Array.from({ length: Number(field.length ?? 1) }, () => "00").join(" ");
  }
  if (field.type === "array") {
    return Array.from({ length: Number(field.count ?? 1) }, () => "0").join(", ");
  }
  return "0";
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
  const [draftContent, setDraftContent] = useState("");
  const [designerView, setDesignerView] = useState<DesignerView>("code");
  const [messageName, setMessageName] = useState("");
  const [messageFieldValues, setMessageFieldValues] = useState<Record<string, string>>({});
  const [messageEncodeResult, setMessageEncodeResult] = useState<MessageEncodeResult>();
  const [structureSelection, setStructureSelection] = useState<{
    messageName: string;
    fieldName?: string;
  }>();
  const [fieldDisplayNameDraft, setFieldDisplayNameDraft] = useState("");
  const [errorMessage, setErrorMessage] = useState<string>();
  const translation = messages[locale];
  const page = navigation.entries[navigation.index];
  const project = workspace?.ok ? workspace.project : null;
  const selectedProtocol = project?.protocols.find(
    (protocol) => protocol.path === selectedProtocolPath,
  );
  const selectedMessage = selectedProtocol?.schema.messages.find(
    (message) => message.name === messageName,
  );
  const selectedStructureMessage = selectedProtocol?.schema.messages.find(
    (message) => message.name === structureSelection?.messageName,
  );
  const selectedStructureField = structureSelection?.fieldName
    ? selectedStructureMessage?.fields.find((field) => field.name === structureSelection.fieldName)
    : undefined;
  const structureProperties = selectedStructureField
    ? [
        [translation.structure.name, selectedStructureField.name],
        [translation.structure.type, selectedStructureField.type],
        [translation.structure.offset, selectedStructureField.offset],
        [translation.structure.length, selectedStructureField.length ?? "—"],
        [
          translation.structure.byteOrder,
          `${selectedStructureField.byteOrder}${selectedStructureField.byteOrderInherited ? ` · ${translation.structure.inherited}` : ""}`,
        ],
        [translation.structure.lengthOf, selectedStructureField.lengthOf ?? "—"],
        ...(selectedStructureField.type === "array"
          ? [
              [translation.structure.elementType, selectedStructureField.elementType ?? "—"],
              [translation.structure.count, selectedStructureField.count ?? "—"],
            ]
          : []),
      ]
    : selectedStructureMessage
      ? [
          [translation.structure.name, selectedStructureMessage.name],
          [translation.structure.displayName, selectedStructureMessage.displayName || "—"],
          [translation.structure.typeId, selectedStructureMessage.typeId ?? "—"],
          [translation.structure.fields, String(selectedStructureMessage.fields.length)],
        ]
      : [];
  const isDirty = selectedProtocol ? draftContent !== selectedProtocol.content : false;

  const applyWorkspace = (result: WorkspaceResult, preferredPath?: string) => {
    if (!result.ok) {
      const errorLocation = result.error.line
        ? `${result.error.path}:${result.error.line}:${result.error.column ?? 1}`
        : result.error.path;
      setErrorMessage(
        `${translateWorkspaceError(locale, result.error.code, result.error.message)} [${result.error.code}]${errorLocation ? ` (${errorLocation})` : ""}`,
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
    setDraftContent(selectedProtocol?.content ?? "");
  }, [selectedProtocol?.content, selectedProtocol?.path]);

  useEffect(() => {
    const nextMessage = selectedProtocol?.schema.messages[0];
    setMessageName(nextMessage?.name ?? "");
    setMessageFieldValues(
      Object.fromEntries(
        (nextMessage?.fields ?? []).map((field) => [field.name, defaultMessageFieldValue(field)]),
      ),
    );
    setMessageEncodeResult(undefined);
  }, [selectedProtocol?.path]);

  useEffect(() => {
    if (!selectedProtocol) {
      setMessageName("");
      setMessageFieldValues({});
      setMessageEncodeResult(undefined);
      return;
    }
    const nextMessage =
      selectedProtocol.schema.messages.find((message) => message.name === messageName) ??
      selectedProtocol.schema.messages[0];
    if (nextMessage?.name !== messageName) {
      setMessageName(nextMessage?.name ?? "");
    }
    setMessageFieldValues(
      Object.fromEntries(
        (nextMessage?.fields ?? []).map((field) => [field.name, defaultMessageFieldValue(field)]),
      ),
    );
    setMessageEncodeResult(undefined);
  }, [messageName, selectedProtocol?.schema.messages]);

  useEffect(() => {
    setStructureSelection(undefined);
  }, [selectedProtocol?.path]);

  useEffect(() => {
    setStructureSelection((current) => {
      if (!current) {
        return current;
      }
      const message = selectedProtocol?.schema.messages.find(
        (candidate) => candidate.name === current.messageName,
      );
      if (!message) {
        return undefined;
      }
      return current.fieldName &&
        !message.fields.some((candidate) => candidate.name === current.fieldName)
        ? { messageName: current.messageName }
        : current;
    });
  }, [selectedProtocol?.schema]);

  useEffect(() => {
    setFieldDisplayNameDraft(selectedStructureField?.displayName ?? "");
  }, [selectedStructureField?.displayName, selectedStructureField?.name]);

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

  const saveSelectedProtocol = () => {
    if (selectedProtocol) {
      void run(() => saveProtocol(selectedProtocol.path, draftContent), selectedProtocol.path);
    }
  };

  const submitFieldDisplayName = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedProtocol || !selectedStructureMessage || !selectedStructureField || isDirty) {
      return;
    }
    void run(
      () =>
        updateFieldDisplayName({
          relativePath: selectedProtocol.path,
          messageName: selectedStructureMessage.name,
          fieldName: selectedStructureField.name,
          displayName: fieldDisplayNameDraft.trim(),
        }),
      selectedProtocol.path,
    );
  };

  const encodeSelectedMessage = async () => {
    if (!selectedProtocol || !selectedMessage || isDirty) {
      return;
    }
    setBusy(true);
    try {
      setMessageEncodeResult(
        await encodeProtocolMessage({
          relativePath: selectedProtocol.path,
          messageName: selectedMessage.name,
          fields: selectedMessage.fields
            .filter((field) => !field.lengthOf)
            .map((field) => ({ name: field.name, value: messageFieldValues[field.name] ?? "" })),
        }),
      );
    } catch (error) {
      setMessageEncodeResult({
        ok: false,
        source: "browser-preview",
        error: {
          code: "bridge_error",
          message: error instanceof Error ? error.message : String(error),
          path: selectedMessage.name,
        },
      });
    } finally {
      setBusy(false);
    }
  };

  const selectMessage = (nextName: string) => {
    setMessageName(nextName);
    const nextMessage = selectedProtocol?.schema.messages.find(
      (message) => message.name === nextName,
    );
    setMessageFieldValues(
      Object.fromEntries(
        (nextMessage?.fields ?? []).map((field) => [field.name, defaultMessageFieldValue(field)]),
      ),
    );
    setMessageEncodeResult(undefined);
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
        <aside aria-label={translation.navigation.title} className="navigation-rail">
          <button
            aria-current={page === "schema" ? "page" : undefined}
            aria-label={translation.navigation.schema}
            className={`nav-button schema-button ${page === "schema" ? "active" : ""}`}
            onClick={() => navigate("schema")}
            title={translation.navigation.schema}
            type="button"
          >
            <KeyframesIcon size={17} />
          </button>
          <button
            aria-current={page === "settings" ? "page" : undefined}
            aria-label={translation.navigation.settings}
            className={`nav-button settings-button ${page === "settings" ? "active" : ""}`}
            onClick={() => navigate("settings")}
            title={translation.navigation.settings}
            type="button"
          >
            <DotsHorizontalIcon size={16} />
          </button>
        </aside>

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
                <button
                  aria-disabled="true"
                  className="planned-action"
                  disabled
                  title={translation.workspace.newProjectHint}
                  type="button"
                >
                  <Plus size={15} />
                  {translation.workspace.newProject}
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
                    <DotsHorizontalIcon size={20} />
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
                    {selectedProtocol ? <FileCode2 size={20} /> : <KeyframesIcon size={20} />}
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
                      <KeyframesIcon size={26} />
                      <strong>{translation.workspace.selectProtocol}</strong>
                      <span>{translation.workspace.selectProtocolHint}</span>
                    </div>
                  ) : (
                    <section className="protocol-source">
                      <div className="source-toolbar">
                        <div className="source-identity">
                          <FileCode2 size={15} />
                          <span>{selectedProtocol.path.split("/").at(-1)}</span>
                        </div>
                        <div className="designer-actions">
                          <div
                            aria-label={translation.editor.view}
                            className="designer-tabs"
                            role="tablist"
                          >
                            <button
                              aria-selected={designerView === "code"}
                              className={designerView === "code" ? "active" : ""}
                              onClick={() => setDesignerView("code")}
                              role="tab"
                              type="button"
                            >
                              <FileCode2 size={13} />
                              {translation.editor.code}
                            </button>
                            <button
                              aria-selected={designerView === "visual"}
                              className={designerView === "visual" ? "active" : ""}
                              onClick={() => setDesignerView("visual")}
                              role="tab"
                              type="button"
                            >
                              <ListTree size={13} />
                              {translation.editor.visual}
                            </button>
                            <button
                              aria-selected={designerView === "message"}
                              className={designerView === "message" ? "active" : ""}
                              onClick={() => setDesignerView("message")}
                              role="tab"
                              type="button"
                            >
                              <Send size={13} />
                              {translation.editor.message}
                            </button>
                          </div>
                          {designerView === "code" && (
                            <div className="source-actions" title={translation.editor.editingHint}>
                              <span className={isDirty ? "dirty" : ""}>
                                {isDirty ? translation.editor.unsaved : translation.editor.saved}
                              </span>
                              <button
                                disabled={busy || !isDirty}
                                onClick={saveSelectedProtocol}
                                type="button"
                              >
                                <Save size={13} />
                                {translation.editor.save}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                      {designerView === "code" ? (
                        <textarea
                          aria-label={`${translation.workspace.physicalFile}: ${selectedProtocol.path}`}
                          onChange={(event) => setDraftContent(event.target.value)}
                          spellCheck={false}
                          value={draftContent}
                        />
                      ) : designerView === "visual" ? (
                        <div className="protocol-structure" role="tabpanel">
                          <div className="structure-main">
                            <div className="structure-summary">
                              <span>
                                <small>{translation.structure.schemaVersion}</small>
                                <strong>{selectedProtocol.schema.version}</strong>
                              </span>
                              <span>
                                <small>{translation.structure.protocolVersion}</small>
                                <strong>{selectedProtocol.schema.protocolVersion}</strong>
                              </span>
                              <span>
                                <small>{translation.structure.defaultByteOrder}</small>
                                <strong>{selectedProtocol.schema.defaultByteOrder}</strong>
                              </span>
                              <span>
                                <small>{translation.structure.messages}</small>
                                <strong>{selectedProtocol.schema.messages.length}</strong>
                              </span>
                            </div>
                            {isDirty && (
                              <div className="structure-notice">
                                <CircleAlert size={14} />
                                {translation.structure.unsavedHint}
                              </div>
                            )}
                            {selectedProtocol.schema.messages.length === 0 ? (
                              <div className="structure-empty">
                                <ListTree size={24} />
                                <span>{translation.structure.empty}</span>
                              </div>
                            ) : (
                              <ul className="message-tree" role="tree">
                                {selectedProtocol.schema.messages.map((message) => {
                                  const messageSelected =
                                    selectedStructureMessage?.name === message.name &&
                                    !structureSelection?.fieldName;
                                  return (
                                    <li
                                      aria-expanded="true"
                                      aria-selected={messageSelected}
                                      key={message.name}
                                      role="treeitem"
                                    >
                                      <button
                                        className={`message-node ${messageSelected ? "selected" : ""}`}
                                        onClick={() =>
                                          setStructureSelection({ messageName: message.name })
                                        }
                                        type="button"
                                      >
                                        <ChevronDown size={15} />
                                        <div>
                                          <strong>{message.displayName || message.name}</strong>
                                          {message.displayName && <code>{message.name}</code>}
                                        </div>
                                        <span>
                                          {message.fields.length} {translation.structure.fields}
                                        </span>
                                        {message.typeId && (
                                          <span>
                                            {translation.structure.typeId} {message.typeId}
                                          </span>
                                        )}
                                      </button>
                                      <ul role="group">
                                        {message.fields.map((field, fieldIndex) => {
                                          const fieldSelected =
                                            selectedStructureMessage?.name === message.name &&
                                            selectedStructureField?.name === field.name;
                                          return (
                                            <li
                                              aria-label={`${field.name}: ${field.type}`}
                                              aria-selected={fieldSelected}
                                              className="field-node-item"
                                              key={field.name}
                                              role="treeitem"
                                            >
                                              <button
                                                className={`field-node ${fieldSelected ? "selected" : ""}`}
                                                onClick={() =>
                                                  setStructureSelection({
                                                    messageName: message.name,
                                                    fieldName: field.name,
                                                  })
                                                }
                                                type="button"
                                              >
                                                <span className="field-index">
                                                  {fieldIndex + 1}
                                                </span>
                                                <div className="field-name">
                                                  <strong>{field.displayName || field.name}</strong>
                                                  {field.displayName && <code>{field.name}</code>}
                                                </div>
                                                <code className="field-type">
                                                  {field.type === "array"
                                                    ? `${field.elementType ?? "?"}[${field.count ?? "?"}]`
                                                    : field.type}
                                                </code>
                                                <div className="field-metadata">
                                                  <span title={translation.structure.offset}>
                                                    @{field.offset}
                                                  </span>
                                                  <span title={translation.structure.length}>
                                                    {field.length ?? "—"} B
                                                  </span>
                                                  <span
                                                    title={`${translation.structure.byteOrder}${field.byteOrderInherited ? ` · ${translation.structure.inherited}` : ""}`}
                                                  >
                                                    {field.byteOrder === "little" ? "LE" : "BE"}
                                                  </span>
                                                  {field.lengthOf && (
                                                    <span title={translation.structure.lengthOf}>
                                                      → {field.lengthOf}
                                                    </span>
                                                  )}
                                                </div>
                                              </button>
                                            </li>
                                          );
                                        })}
                                      </ul>
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                          </div>
                          <aside
                            aria-label={translation.structure.properties}
                            className="property-inspector"
                          >
                            <div className="property-inspector-title">
                              <small>{translation.structure.properties}</small>
                              <strong>
                                {selectedStructureField?.displayName ||
                                  selectedStructureField?.name ||
                                  selectedStructureMessage?.displayName ||
                                  selectedStructureMessage?.name ||
                                  "—"}
                              </strong>
                            </div>
                            {!selectedStructureMessage ? (
                              <div className="property-inspector-empty">
                                <ListTree size={22} />
                                <span>{translation.structure.selectHint}</span>
                              </div>
                            ) : (
                              <>
                                {selectedStructureField && (
                                  <form
                                    className="field-property-editor"
                                    onSubmit={submitFieldDisplayName}
                                  >
                                    <label htmlFor="field-display-name">
                                      {translation.structure.displayName}
                                    </label>
                                    <div>
                                      <input
                                        id="field-display-name"
                                        onChange={(event) =>
                                          setFieldDisplayNameDraft(event.target.value)
                                        }
                                        value={fieldDisplayNameDraft}
                                      />
                                      <button
                                        disabled={
                                          busy ||
                                          isDirty ||
                                          fieldDisplayNameDraft.trim() ===
                                            selectedStructureField.displayName
                                        }
                                        title={
                                          isDirty
                                            ? translation.structure.saveBlocked
                                            : translation.editor.save
                                        }
                                        type="submit"
                                      >
                                        <Save size={13} />
                                        {translation.editor.save}
                                      </button>
                                    </div>
                                  </form>
                                )}
                                <dl className="property-list">
                                  {structureProperties.map(([label, value]) => (
                                    <div key={label}>
                                      <dt>{label}</dt>
                                      <dd>
                                        <code>{value}</code>
                                      </dd>
                                    </div>
                                  ))}
                                </dl>
                              </>
                            )}
                          </aside>
                        </div>
                      ) : (
                        <div className="message-studio" role="tabpanel">
                          {isDirty && (
                            <div className="message-studio-notice">
                              <CircleAlert size={14} />
                              {translation.messageStudio.unsavedHint}
                            </div>
                          )}
                          <div className="message-studio-header">
                            <div>
                              <span className="content-eyebrow">
                                {translation.messageStudio.title}
                              </span>
                              <h2>
                                {selectedMessage?.displayName || selectedMessage?.name || "—"}
                              </h2>
                            </div>
                            <label className="message-selector">
                              <span>{translation.messageStudio.selectMessage}</span>
                              <select
                                disabled={selectedProtocol.schema.messages.length === 0}
                                onChange={(event) => selectMessage(event.target.value)}
                                value={messageName}
                              >
                                {selectedProtocol.schema.messages.map((message) => (
                                  <option key={message.name} value={message.name}>
                                    {message.displayName || message.name}
                                    {message.displayName ? ` (${message.name})` : ""}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>
                          {!selectedMessage ? (
                            <div className="message-preview-empty">
                              <ListTree size={24} />
                              <strong>{translation.messageStudio.noMessage}</strong>
                            </div>
                          ) : (
                            <>
                              <div className="message-field-grid">
                                <div className="message-field-row message-field-heading">
                                  <span>{translation.structure.name}</span>
                                  <span>{translation.structure.type}</span>
                                  <span>{translation.messageStudio.fieldValue}</span>
                                </div>
                                {selectedMessage.fields.map((field) => {
                                  const hint =
                                    field.type === "bytes"
                                      ? translation.messageStudio.bytesHint
                                      : field.type === "array"
                                        ? translation.messageStudio.arrayHint
                                        : undefined;
                                  return (
                                    <div className="message-field-row" key={field.name}>
                                      <div className="message-field-meta">
                                        <strong>{field.displayName || field.name}</strong>
                                        <code>{field.name}</code>
                                        <small>
                                          @{field.offset} · {field.length ?? "—"} B
                                        </small>
                                      </div>
                                      <code className="message-field-type">
                                        {field.type === "array"
                                          ? `${field.elementType ?? "?"}[${field.count ?? "?"}]`
                                          : field.type}
                                      </code>
                                      {field.lengthOf ? (
                                        <div className="message-derived-value">
                                          <strong>{translation.messageStudio.derived}</strong>
                                          <span>{translation.messageStudio.automatic}</span>
                                        </div>
                                      ) : (
                                        <label className="message-value-input">
                                          <input
                                            aria-label={`${translation.messageStudio.fieldValue}: ${field.name}`}
                                            onChange={(event) =>
                                              setMessageFieldValues((current) => ({
                                                ...current,
                                                [field.name]: event.target.value,
                                              }))
                                            }
                                            placeholder={hint}
                                            value={messageFieldValues[field.name] ?? ""}
                                          />
                                          {hint && <small>{hint}</small>}
                                        </label>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                              <div className="message-studio-actions">
                                <button
                                  className="primary"
                                  disabled={busy || isDirty}
                                  onClick={() => void encodeSelectedMessage()}
                                  type="button"
                                >
                                  <Send size={14} />
                                  {translation.messageStudio.encode}
                                </button>
                                <span>{translation.messageStudio.emptyPreview}</span>
                              </div>
                              {messageEncodeResult && (
                                <div
                                  className={`message-preview ${messageEncodeResult.ok ? "success" : "error"}`}
                                >
                                  <div className="message-preview-header">
                                    <strong>{translation.messageStudio.encodedPreview}</strong>
                                    {messageEncodeResult.ok && (
                                      <span>
                                        {translation.messageStudio.byteCount}:{" "}
                                        {messageEncodeResult.byteCount}
                                      </span>
                                    )}
                                  </div>
                                  {messageEncodeResult.ok ? (
                                    <>
                                      <code className="message-preview-hex">
                                        {messageEncodeResult.normalizedHex}
                                      </code>
                                      <div className="message-preview-ascii">
                                        <span>{translation.messageStudio.ascii}</span>
                                        <code>{messageEncodeResult.ascii}</code>
                                      </div>
                                    </>
                                  ) : (
                                    <div className="message-preview-error">
                                      <strong>
                                        [{messageEncodeResult.error.code}]{" "}
                                        {messageEncodeResult.error.path}
                                      </strong>
                                      <span>{messageEncodeResult.error.message}</span>
                                      {messageEncodeResult.error.offset !== undefined && (
                                        <code>offset {messageEncodeResult.error.offset}</code>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}
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
