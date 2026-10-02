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
  FolderPlus,
  FilePlus2,
  Pencil,
  Trash2,
  Import,
  HardDrive,
  Languages,
  ListTree,
  LoaderCircle,
  Moon,
  Minus,
  Palette,
  Send,
  Save,
  Square,
  Sun,
  X,
} from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent,
} from "react";
import DotsHorizontalIcon from "./icons/dots-horizontal-icon";
import KeyframesIcon from "./icons/keyframes-icon";
import SparklesIcon from "./icons/sparkles-icon";
import UnorderedListIcon from "./icons/unordered-list-icon";
import DebugTools, { type DebugAnnotation, type DebugRange } from "./DebugTools";
import SchemaEditor, { type SchemaEditTarget } from "./SchemaEditor";
import MessageTemplates, { MessageOutput } from "./MessageTemplates";
import Environments from "./Environments";
import TcpWorkspace from "./TcpWorkspace";
import StartPage from "./StartPage";
import { Plus, Search, Settings } from "lucide-react";
import NavigationIcon from "./NavigationIcon";
import ProjectOverview, { ProjectFooter } from "./ProjectOverview";
import ProjectCreateDialog from "./ProjectCreateDialog";
import ProtocolCodeEditor, {
  ProtocolProblems,
  jumpToProtocolLine,
  type ProtocolCheck,
} from "./ProtocolCodeEditor";
import { activeVariables, resolveValue, sendValues } from "./sendVariables";
import {
  closeProject,
  changeProtocols,
  changeFolder,
  createProject,
  createProtocol,
  encodeProtocolMessage,
  editSchema,
  environments,
  getCoreInfo,
  getCurrentProject,
  inspectHex,
  openProject,
  revealProject,
  renameProject,
  performWindowAction,
  saveProtocol,
  validateProtocol,
  exportMessageHex,
  logFile,
  updateFieldDisplayName,
  type CoreInfo,
  type InspectionResult,
  type TcpRecord,
  type MessageEncodeResult,
  type MessageEncodeRequest,
  type TcpDraft,
  type WorkspaceProject,
  type WorkspaceProtocol,
  type WorkspaceResult,
  type SchemaEditRequest,
} from "./bridge";
import { readRecentProjects, rememberProject, storeRecentProjects } from "./recentProjects";
import {
  detectInitialLocale,
  detectInitialTheme,
  messages,
  storeLocale,
  storeTheme,
  translateWorkspaceError,
  type Locale,
  type Theme,
  type TranslationMessages,
} from "./i18n";

type Page = "schema" | "debug" | "tcp" | "environments" | "settings";
type Diagnostic = {
  id: number;
  time: number;
  page: Page;
  context: string;
  message: string;
  problem: boolean;
  session?: string;
  protocol?: string;
};
type DesignerView = "code" | "visual" | "message";

type TreeNode = {
  key: string;
  name: string;
  path: string;
  type: "folder" | "protocol";
  children?: TreeNode[];
  protocol?: WorkspaceProtocol;
};

type DebugAnnotationSegment = {
  annotation: DebugAnnotation;
  start: number;
  end: number;
};

const ANNOTATION_COLORS = {
  light: [
    "#C15DD5",
    "#9075FC",
    "#1EC0D7",
    "#79C93A",
    "#D5D71A",
    "#FFCB45",
    "#FF813A",
    "#FB5E49",
    "#F92A5E",
    "#F16BA3",
  ],
  dark: [
    "#C981D7",
    "#A18CF0",
    "#66BECA",
    "#9CC673",
    "#D0D16A",
    "#EDCB74",
    "#E99463",
    "#F27A6A",
    "#EC6486",
    "#E991B5",
  ],
};

const SIDEBAR_MIN_WIDTH = 210;

function getSidebarMaxWidth() {
  return Math.max(SIDEBAR_MIN_WIDTH, Math.floor(window.innerWidth / 4));
}

function buildTree(project: WorkspaceProject): TreeNode[] {
  const roots: TreeNode[] = [];
  const ensureFolder = (folderPath: string) => {
    let path = "protocols";
    let children = roots;
    for (const part of folderPath.split("/").slice(1)) {
      path += `/${part}`;
      let folder = children.find((node) => node.type === "folder" && node.path === path);
      if (!folder) {
        folder = { key: `folder:${path}`, name: part, path, type: "folder", children: [] };
        children.push(folder);
      }
      children = folder.children!;
    }
    return children;
  };
  for (const folder of [...(project.folders ?? [])].sort(
    (a, b) => a.split("/").length - b.split("/").length,
  ))
    ensureFolder(folder);
  for (const protocol of project.protocols) {
    const parts = protocol.path.split("/").filter(Boolean);
    if (parts[0] === "protocols") {
      parts.shift();
    }
    const filename = parts.pop();
    if (!filename) {
      continue;
    }

    const children = ensureFolder(["protocols", ...parts].join("/"));
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

function buildDebugAnnotationSegments(
  annotations: DebugAnnotation[],
  byteCount: number,
): DebugAnnotationSegment[] {
  const annotationAtOffset: Array<DebugAnnotation | undefined> = Array(byteCount).fill(undefined);
  for (const annotation of annotations) {
    for (
      let offset = annotation.start;
      offset <= annotation.end && offset < byteCount;
      offset += 1
    ) {
      if (offset >= 0) {
        annotationAtOffset[offset] = annotation;
      }
    }
  }

  const segments: DebugAnnotationSegment[] = [];
  let offset = 0;
  while (offset < byteCount) {
    const annotation = annotationAtOffset[offset];
    if (!annotation) {
      offset += 1;
      continue;
    }

    let end = offset;
    while (end + 1 < byteCount && annotationAtOffset[end + 1]?.id === annotation.id) {
      end += 1;
    }
    segments.push({ annotation, start: offset, end });
    offset = end + 1;
  }
  return segments;
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
  if (field.enumValues?.length) return field.enumValues[0].value;
  return "0";
}

function expandInputFields(
  fields: WorkspaceProtocol["schema"]["messages"][number]["fields"],
  structures: WorkspaceProtocol["schema"]["structures"],
  values: Record<string, string>,
  prefix = "",
  depth = 0,
): WorkspaceProtocol["schema"]["messages"][number]["fields"] {
  if (depth > 4) return [];
  const output: typeof fields = [];
  for (const field of fields) {
    if (field.whenField && values[prefix + field.whenField] !== field.whenEquals) continue;
    const name = prefix + field.name;
    const count = field.countFrom
      ? Number(values[prefix + field.countFrom] ?? "0")
      : Number(field.count ?? "0");
    if (field.type === "struct" || field.elementType === "struct") {
      const structure = structures?.find((item) => item.name === field.structRef);
      if (!structure) continue;
      const instances = field.type === "array" ? Math.min(1024, Math.max(0, count || 0)) : 1;
      for (let index = 0; index < instances; index += 1)
        output.push(
          ...expandInputFields(
            structure.fields,
            structures,
            values,
            `${name}${field.type === "array" ? `[${index}]` : ""}.`,
            depth + 1,
          ),
        );
    } else {
      output.push({
        ...field,
        name,
        count: field.countFrom ? String(count || 0) : field.count,
        offset: prefix || field.whenField || field.countFrom ? "—" : field.offset,
      });
    }
  }
  return output;
}

function bitPart(raw: string, offset: number, width: number): string {
  try {
    const value = BigInt(raw || "0");
    return value < 0n ? "0" : ((value >> BigInt(offset)) & ((1n << BigInt(width)) - 1n)).toString();
  } catch {
    return "0";
  }
}

function replaceBitPart(raw: string, offset: number, width: number, part: string): string {
  try {
    const current = BigInt(raw || "0");
    const next = BigInt(part);
    const mask = (1n << BigInt(width)) - 1n;
    if (current < 0n || next < 0n || next > mask) return raw;
    const shifted = mask << BigInt(offset);
    return ((current & ~shifted) | (next << BigInt(offset))).toString();
  } catch {
    return raw;
  }
}

type TreeItemsProps = {
  showFileNames?: boolean;
  nodes: TreeNode[];
  depth: number;
  expanded: Set<string>;
  selectedPath?: string;
  onToggle: (key: string) => void;
  onSelect: (protocol: WorkspaceProtocol) => void;
  onAction: (action: "folderActions" | "protocolActions", path: string) => void;
  onDragFolder: (path: string | null) => void;
  onDropFolder: (path: string, placement: "before" | "inside" | "after") => void;
  labels: TranslationMessages["workspace"];
  disabled: boolean;
};

function TreeItems(props: TreeItemsProps) {
  const {
    nodes,
    depth,
    expanded,
    selectedPath,
    onToggle,
    onSelect,
    onAction,
    onDragFolder,
    onDropFolder,
    labels,
    disabled,
  } = props;
  const [dropTarget, setDropTarget] = useState<string>();
  return nodes.map((node) => {
    const isOpen = expanded.has(node.key);
    if (node.type === "folder") {
      return (
        <div key={node.key}>
          <div
            className="folder-row"
            data-drop={
              dropTarget?.startsWith(`${node.path}:`) ? dropTarget.split(":").at(-1) : undefined
            }
          >
            <button
              aria-expanded={isOpen}
              className="tree-item folder-item"
              title={node.path}
              onClick={() => onToggle(node.key)}
              style={{ paddingLeft: 14 + depth * 16 }}
              type="button"
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData("text/plain", node.path);
                event.dataTransfer.effectAllowed = "move";
                onDragFolder(node.path);
              }}
              onDragEnd={() => {
                onDragFolder(null);
                setDropTarget(undefined);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                const box = event.currentTarget.getBoundingClientRect();
                const ratio = (event.clientY - box.top) / box.height;
                setDropTarget(
                  `${node.path}:${ratio < 0.25 ? "before" : ratio > 0.75 ? "after" : "inside"}`,
                );
              }}
              onDragLeave={() => setDropTarget(undefined)}
              onDrop={(event) => {
                event.preventDefault();
                const box = event.currentTarget.getBoundingClientRect();
                const ratio = (event.clientY - box.top) / box.height;
                onDropFolder(
                  node.path,
                  ratio < 0.25 ? "before" : ratio > 0.75 ? "after" : "inside",
                );
                setDropTarget(undefined);
              }}
            >
              {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              {isOpen ? <FolderOpen size={15} /> : <Folder size={15} />}
              <span>{node.name}</span>
            </button>
            <div className="row-actions">
              <button
                type="button"
                disabled={disabled}
                title={labels.moreActions}
                aria-label={`${labels.moreActions}: ${node.name}`}
                aria-haspopup="dialog"
                onClick={() => onAction("folderActions", node.path)}
              >
                <DotsHorizontalIcon size={14} />
              </button>
            </div>
          </div>
          {isOpen && (
            <TreeItems
              {...props}
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
      <div className="protocol-row" key={node.key}>
        <button
          aria-current={selectedPath === node.path ? "page" : undefined}
          className={`tree-item protocol-item ${selectedPath === node.path ? "active" : ""}`}
          title={`${node.name}\n${node.path}`}
          onClick={() => node.protocol && onSelect(node.protocol)}
          style={{ paddingLeft: 32 + depth * 16 }}
          type="button"
        >
          <FileCode2 size={15} />
          <span>{props.showFileNames ? node.path.split("/").at(-1) : node.name}</span>
        </button>
        <div className="row-actions">
          <button
            type="button"
            disabled={disabled}
            title={labels.moreActions}
            aria-label={`${labels.moreActions}: ${node.name}`}
            aria-haspopup="dialog"
            onClick={() => onAction("protocolActions", node.path)}
          >
            <DotsHorizontalIcon size={14} />
          </button>
        </div>
      </div>
    );
  });
}

export default function App() {
  const [locale, setLocale] = useState<Locale>(detectInitialLocale);
  const [theme, setTheme] = useState<Theme>(detectInitialTheme);
  const [navigation, setNavigation] = useState<{ entries: Page[]; index: number }>({
    entries: ["schema"],
    index: 0,
  });
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_MIN_WIDTH);
  const [sidebarResizing, setSidebarResizing] = useState(false);
  const sidebarResizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceResult | null>(null);
  const [coreInfo, setCoreInfo] = useState<CoreInfo | null>(null);
  const [selectedProtocolPath, setSelectedProtocolPath] = useState<string>();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [projectCreateOpen, setProjectCreateOpen] = useState(false);
  const [treeSearchOpen, setTreeSearchOpen] = useState(false);
  const [treeSearch, setTreeSearch] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [designerView, setDesignerView] = useState<DesignerView>("code");
  const [protocolCheck, setProtocolCheck] = useState<ProtocolCheck>();
  const [protocolProblemsOpen, setProtocolProblemsOpen] = useState(false);
  const protocolEditorRef = useRef<HTMLTextAreaElement>(null);
  const [messageName, setMessageName] = useState("");
  const [messageFieldValues, setMessageFieldValues] = useState<Record<string, string>>({});
  const [messageEncodeResult, setMessageEncodeResult] = useState<MessageEncodeResult>();
  const [messageActionStatus, setMessageActionStatus] = useState("");
  const [debugInput, setDebugInput] = useState("");
  const debugContentRef = useRef("");
  const [debugFormatted, setDebugFormatted] = useState(false);
  const [debugResult, setDebugResult] = useState<InspectionResult>();
  const [debugBusy, setDebugBusy] = useState(false);
  const [debugAnnotations, setDebugAnnotations] = useState<DebugAnnotation[]>([]);
  const [debugToolRange, setDebugToolRange] = useState<DebugRange>(null);
  const [debugByteOffset, setDebugByteOffset] = useState<{ offset: number } | null>(null);
  const [debugHandoff, setDebugHandoff] = useState<{ seq: number; record: TcpRecord } | null>(null);
  const [indexMode, setIndexMode] = useState<"byte" | "offset">("byte");
  const [annotationSelection, setAnnotationSelection] = useState<{
    anchor: number;
    end: number;
    editing: boolean;
  } | null>(null);
  const annotationDialogRef = useRef<HTMLDialogElement>(null);
  const [annotationLabel, setAnnotationLabel] = useState("");
  const [annotationColor, setAnnotationColor] = useState(0);
  const [annotationError, setAnnotationError] = useState(false);
  const [structureSelection, setStructureSelection] = useState<{
    messageName: string;
    fieldName?: string;
  }>();
  const [fieldDisplayNameDraft, setFieldDisplayNameDraft] = useState("");
  const [schemaEditTarget, setSchemaEditTarget] = useState<SchemaEditTarget | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const knownSensitiveValues = useRef(new Set<string>());
  const sortedSensitiveValues = useRef<string[]>([]);
  const [focusSession, setFocusSession] = useState<{ id: string; seq: number }>();
  const [logError, setLogError] = useState("");
  const nextDiagnostic = useRef(0);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [recentProjects, setRecentProjects] = useState(readRecentProjects);
  const [createParent, setCreateParent] = useState("protocols");
  const projectMenuRef = useRef<HTMLDivElement>(null);
  const [treeDialog, setTreeDialog] = useState<{
    action:
      | "project"
      | "renameProtocol"
      | "deleteProtocol"
      | "projectActions"
      | "folderActions"
      | "protocolActions"
      | "create"
      | "delete"
      | "move"
      | "rename"
      | "renameProject"
      | "recent"
      | "removeProject";
    path: string;
  } | null>(null);
  const treeDialogRef = useRef<HTMLDialogElement>(null);
  const draggedFolder = useRef<string | null>(null);
  const translation = messages[locale];
  const page = navigation.entries[navigation.index];
  const project = workspace?.ok ? workspace.project : null;
  const isStartPage = page === "schema" && !project;
  const isProjectOverview = page === "schema" && !!project && !selectedProtocolPath;
  const isProtocolCode = page === "schema" && !!selectedProtocolPath && designerView === "code";
  const isMessageStudio = page === "schema" && !!selectedProtocolPath && designerView === "message";
  const hasProjectExplorer = isProjectOverview || isProtocolCode || isMessageStudio;
  const currentProtocolCheck =
    protocolCheck &&
    protocolCheck.path === selectedProtocolPath &&
    protocolCheck.content === draftContent
      ? protocolCheck.result
      : undefined;
  const projectTree = project
    ? buildTree(
        treeSearch
          ? {
              ...project,
              protocols: project.protocols.filter((protocol) =>
                `${protocol.name} ${protocol.path}`
                  .toLowerCase()
                  .includes(treeSearch.toLowerCase()),
              ),
            }
          : project,
      )
    : [];
  const redact = (value: string) => {
    for (const secret of sortedSensitiveValues.current) value = value.split(secret).join("•");
    return value;
  };
  const rememberSensitiveValues = (values: string[]) => {
    let changed = false;
    for (const value of values) {
      if (!value || knownSensitiveValues.current.has(value)) continue;
      knownSensitiveValues.current.add(value);
      changed = true;
    }
    if (changed) {
      sortedSensitiveValues.current = [...knownSensitiveValues.current].sort(
        (a, b) => b.length - a.length,
      );
      setDiagnostics((current) =>
        current.map((item) => ({
          ...item,
          context: redact(item.context),
          message: redact(item.message),
        })),
      );
    }
  };
  useEffect(() => {
    if (!project?.rootPath) return;
    let cancelled = false;
    void environments()
      .then((result) => {
        if (!cancelled && result.ok)
          rememberSensitiveValues(
            result.config.environments.flatMap((item) =>
              item.variables
                .filter((variable) => variable.sensitive)
                .map((variable) => variable.defaultValue),
            ),
          );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [project?.rootPath]);
  const selectedProtocol = project?.protocols.find(
    (protocol) => protocol.path === selectedProtocolPath,
  );
  const addDiagnostic = (
    page: Page,
    context: string,
    message: string,
    problem: boolean,
    session?: string,
    protocol?: string,
  ) => {
    const item: Diagnostic = {
      id: ++nextDiagnostic.current,
      time: Date.now(),
      page,
      context: redact(context).slice(0, 256),
      message: redact(message).slice(0, 1000),
      problem,
      session,
      protocol,
    };
    setDiagnostics((current) => [...current.slice(-499), item]);
  };
  useEffect(() => {
    if (errorMessage)
      addDiagnostic(
        page,
        selectedProtocolPath ?? project?.rootPath ?? "workspace",
        errorMessage,
        true,
        undefined,
        selectedProtocolPath,
      );
  }, [errorMessage]);
  useEffect(() => {
    if (debugResult && !debugResult.ok)
      addDiagnostic(
        "debug",
        selectedProtocolPath ?? "HEX",
        debugResult.error.message,
        true,
        undefined,
        selectedProtocolPath,
      );
  }, [debugResult]);
  useEffect(() => {
    if (messageEncodeResult && !messageEncodeResult.ok)
      addDiagnostic(
        "schema",
        selectedProtocolPath ?? "protocol",
        messageEncodeResult.error.message,
        true,
        undefined,
        selectedProtocolPath,
      );
  }, [messageEncodeResult]);
  const selectedMessage = selectedProtocol?.schema.messages.find(
    (message) => message.name === messageName,
  );
  const reusableStructureSelected = structureSelection?.messageName.startsWith("@") ?? false;
  const selectedStructureMessage = reusableStructureSelected
    ? selectedProtocol?.schema.structures?.find(
        (message) => `@${message.name}` === structureSelection?.messageName,
      )
    : selectedProtocol?.schema.messages.find(
        (message) => message.name === structureSelection?.messageName,
      );
  const selectedStructureField = structureSelection?.fieldName
    ? selectedStructureMessage?.fields.find((field) => field.name === structureSelection.fieldName)
    : undefined;
  const visibleMessageFields = selectedMessage
    ? expandInputFields(
        selectedMessage.fields,
        selectedProtocol?.schema.structures,
        messageFieldValues,
      )
    : [];
  const compactDebugInput = debugInput.replace(/\s+/g, "");
  const debugCharacterCount = compactDebugInput.length;
  const debugByteCount = Math.floor(debugCharacterCount / 2);
  const debugInvalidPosition = compactDebugInput.search(/[^0-9a-f]/i);
  const debugHasOddLength = debugCharacterCount > 0 && debugCharacterCount % 2 !== 0;
  const debugAnnotationSegments = debugResult?.ok
    ? buildDebugAnnotationSegments(debugAnnotations, debugResult.bytes.length)
    : [];
  const debugAnnotationSegmentByStart = new Map(
    debugAnnotationSegments.map((segment) => [segment.start, segment]),
  );
  const annotationPalette = ANNOTATION_COLORS[theme];
  const selectionStart = annotationSelection
    ? Math.min(annotationSelection.anchor, annotationSelection.end)
    : -1;
  const selectionEnd = annotationSelection
    ? Math.max(annotationSelection.anchor, annotationSelection.end)
    : -1;

  useEffect(() => {
    setAnnotationSelection(null);
  }, [debugResult, page]);

  useEffect(() => {
    const dialog = annotationDialogRef.current;
    if (annotationSelection?.editing && page === "debug" && debugResult?.ok) {
      if (dialog && !dialog.open) dialog.showModal();
    } else {
      dialog?.close();
    }
  }, [annotationSelection?.editing, page, debugResult]);

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
        ...(selectedStructureField.structRef
          ? [[locale === "zh-CN" ? "结构引用" : "Structure", selectedStructureField.structRef]]
          : []),
        ...(selectedStructureField.whenField
          ? [
              [
                locale === "zh-CN" ? "存在条件" : "Condition",
                `${selectedStructureField.whenField} = ${selectedStructureField.whenEquals}`,
              ],
            ]
          : []),
        ...(selectedStructureField.countFrom
          ? [
              [
                locale === "zh-CN" ? "动态数量" : "Dynamic count",
                `${selectedStructureField.countFrom} ≤ ${selectedStructureField.maxCount}`,
              ],
            ]
          : []),
        ...(selectedStructureField.type === "array"
          ? [
              [translation.structure.elementType, selectedStructureField.elementType ?? "—"],
              [translation.structure.count, selectedStructureField.count ?? "—"],
            ]
          : []),
        ...(selectedStructureField.enumValues?.length
          ? [
              [
                locale === "zh-CN" ? "枚举" : "Enum",
                selectedStructureField.enumValues
                  .map((item) => `${item.name}=${item.value}`)
                  .join(", "),
              ],
            ]
          : []),
        ...(selectedStructureField.bits?.length
          ? [
              [
                locale === "zh-CN" ? "位域" : "Bits",
                selectedStructureField.bits
                  .map((bit) => `${bit.name}=${bit.offset}:${bit.width}`)
                  .join(", "),
              ],
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

  useEffect(() => {
    if (treeDialog && !treeDialogRef.current?.open) treeDialogRef.current?.showModal();
    if (!treeDialog) treeDialogRef.current?.close();
  }, [treeDialog]);

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
    const opened = result.project;
    if (opened) {
      setRecentProjects((current) => rememberProject(current, opened));
    }
    const sameProject = opened?.rootPath === project?.rootPath;
    const path = opened?.protocols.find(
      (protocol) =>
        protocol.path === (preferredPath ?? (sameProject ? selectedProtocolPath : undefined)),
    )?.path;
    if (opened && !sameProject) {
      setSidebarWidth(Math.min(360, getSidebarMaxWidth()));
      setTreeSearch("");
    }
    setSelectedProtocolPath(path);
    const keys = new Set<string>();
    keys.add("folder:protocols");
    if (result.project) {
      collectExpandedKeys(buildTree(result.project), keys);
    }
    setExpanded(keys);
    return true;
  };

  useEffect(() => {
    storeRecentProjects(recentProjects);
  }, [recentProjects]);

  useEffect(() => {
    document.documentElement.lang = locale;
    storeLocale(locale);
  }, [locale]);

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    storeTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (!projectMenuOpen) {
      return;
    }
    const handlePointerDown = (event: globalThis.PointerEvent) => {
      if (!(event.target instanceof Node) || !projectMenuRef.current?.contains(event.target)) {
        setProjectMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setProjectMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [projectMenuOpen]);

  useEffect(() => {
    if (page === "schema") {
      return;
    }
    setProjectMenuOpen(false);
    setSidebarResizing(false);
    sidebarResizeRef.current = null;
  }, [page]);

  useEffect(() => {
    const handleResize = () => {
      setSidebarWidth((current) => Math.min(current, getSidebarMaxWidth()));
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

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
      const message = current.messageName.startsWith("@")
        ? selectedProtocol?.schema.structures?.find(
            (candidate) => `@${candidate.name}` === current.messageName,
          )
        : selectedProtocol?.schema.messages.find(
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
    if (nextPage !== "schema") {
      setProjectMenuOpen(false);
      setSidebarResizing(false);
      sidebarResizeRef.current = null;
    }
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

  const openTreeDialog = (action: NonNullable<typeof treeDialog>["action"], path = "protocols") => {
    setProjectMenuOpen(false);
    if (isDirty) {
      setErrorMessage(translation.structure.saveBlocked);
      return;
    }
    if (action === "project") setProjectCreateOpen(true);
    else setTreeDialog({ action, path });
    setErrorMessage(undefined);
  };

  const treeAction = (
    action: NonNullable<typeof treeDialog>["action"] | "createProtocol",
    path: string,
  ) => {
    if (busy || isDirty) {
      if (isDirty) setErrorMessage(translation.structure.saveBlocked);
      return;
    }
    if (action === "createProtocol") {
      setTreeDialog(null);
      setCreateParent(path);
      setCreateOpen(true);
    } else openTreeDialog(action, path);
  };

  const moveFolder = async (source: string, target: string, before = "") => {
    if (busy || isDirty) {
      if (isDirty) setErrorMessage(translation.structure.saveBlocked);
      return false;
    }
    const destination = `${target}/${source.split("/").at(-1)}`;
    const preferred = selectedProtocolPath?.startsWith(`${source}/`)
      ? destination + selectedProtocolPath.slice(source.length)
      : selectedProtocolPath;
    return run(() => changeFolder("move", source, target, before), preferred);
  };

  const dropFolder = (target: string, placement: "before" | "inside" | "after") => {
    const source = draggedFolder.current;
    draggedFolder.current = null;
    if (!source || source === target || !project?.folders.includes(source)) return;
    const parent = placement === "inside" ? target : target.slice(0, target.lastIndexOf("/"));
    const siblings = project.folders.filter(
      (folder) => folder !== source && folder.slice(0, folder.lastIndexOf("/")) === parent,
    );
    const before =
      placement === "before"
        ? target
        : placement === "after"
          ? (siblings[siblings.indexOf(target) + 1] ?? "")
          : "";
    void moveFolder(source, parent, before);
  };

  const submitTreeDialog = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!treeDialog || busy) return;
    const data = new FormData(event.currentTarget);
    const { action, path } = treeDialog;
    const name = String(data.get("name") ?? "").trim();
    if (
      (action === "project" || action === "create" || action === "rename") &&
      (!name || /[\\/<>:"|?*\u0000-\u001f]/.test(name) || name.endsWith("."))
    ) {
      setErrorMessage(translation.workspace.invalidName);
      return;
    }
    let ok = false;
    if (action === "project") ok = await run(() => createProject(name));
    if (action === "renameProject") ok = await run(() => renameProject(name), selectedProtocolPath);
    if (action === "rename") {
      const destination = `${path.slice(0, path.lastIndexOf("/"))}/${name}`;
      const preferred = selectedProtocolPath?.startsWith(`${path}/`)
        ? destination + selectedProtocolPath.slice(path.length)
        : selectedProtocolPath;
      ok = await run(() => changeFolder("rename", path, name), preferred);
    }
    if (action === "create")
      ok = await run(() => changeFolder("create", `${path}/${name}`), selectedProtocolPath);
    if (action === "delete")
      ok = await run(() => changeFolder("delete", path), selectedProtocolPath);
    if (action === "move")
      ok = await moveFolder(path, String(data.get("parent")), String(data.get("before") ?? ""));
    if (action === "renameProtocol")
      ok = await run(() => changeProtocols("rename", path, name), path);
    if (action === "deleteProtocol")
      ok = await run(() => changeProtocols("delete", path), selectedProtocolPath);
    if (action === "removeProject") {
      const root = project?.rootPath;
      ok = await run(closeProject);
      if (ok) setRecentProjects((items) => items.filter((item) => item.rootPath !== root));
    }
    if (ok) setTreeDialog(null);
  };

  const submitCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    if (busy || isDirty) return;
    const name = String(data.get("name") ?? "").trim();
    if (!name || /[\\/<>:"|?*\u0000-\u001f]/.test(name) || name.endsWith(".")) {
      setErrorMessage(translation.workspace.invalidName);
      return;
    }
    const relativePath = `${createParent === "protocols" ? "" : `${createParent.slice(10)}/`}${name}.protocol.yaml`;
    void run(
      () =>
        createProtocol({
          relativePath,
          name,
          displayName: name,
          version: "1.0",
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

  const saveSelectedProtocol = async () => {
    if (!selectedProtocol || busy) return;
    const path = selectedProtocol.path;
    const content = draftContent;
    setBusy(true);
    try {
      const result = await saveProtocol(path, content);
      setProtocolCheck({ path, content, result: result.ok ? { ok: true } : result });
      if (!result.ok) setProtocolProblemsOpen(true);
      if (result.ok) applyWorkspace(result, path);
      else setErrorMessage(undefined);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const validateSelectedProtocol = async () => {
    if (!selectedProtocol || busy) return;
    const path = selectedProtocol.path;
    const content = draftContent;
    setBusy(true);
    try {
      const result = await validateProtocol(path, content);
      setProtocolCheck({ path, content, result });
      setProtocolProblemsOpen(!result.ok);
    } catch (error) {
      setProtocolCheck({
        path,
        content,
        result: {
          ok: false,
          error: {
            code: "validation_failed",
            path,
            message: error instanceof Error ? error.message : String(error),
          },
        },
      });
      setProtocolProblemsOpen(true);
    } finally {
      setBusy(false);
    }
  };

  const saveSchemaEdit = async (request: SchemaEditRequest) => {
    if (busy || isDirty) return false;
    const ok = await run(() => editSchema(request), selectedProtocolPath);
    if (ok) {
      setStructureSelection(
        request.action === "deleteMessage" || request.action === "deleteStructure"
          ? undefined
          : {
              messageName: request.action.includes("Structure")
                ? `@${request.properties.name ?? request.messageName}`
                : request.action.endsWith("Message")
                  ? (request.properties.name ?? request.messageName)
                  : request.messageName,
              fieldName:
                request.action.includes("delete") ||
                request.action.endsWith("Message") ||
                (request.action.includes("Structure") && !request.action.includes("Field"))
                  ? undefined
                  : (request.properties.name ?? request.fieldName),
            },
      );
    }
    return ok;
  };

  const openSchemaEdit = (action: SchemaEditTarget["action"]) => {
    if (busy || isDirty) return;
    setErrorMessage(undefined);
    setSchemaEditTarget({
      action,
      message:
        action === "addMessage" || action === "addStructure" ? undefined : selectedStructureMessage,
      field:
        action === "addField" || action === "addStructureField"
          ? undefined
          : selectedStructureField,
    });
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

  const selectedMessageRequest = (): MessageEncodeRequest | null =>
    selectedProtocol && selectedMessage
      ? {
          relativePath: selectedProtocol.path,
          messageName: selectedMessage.name,
          fields: visibleMessageFields
            .filter((field) => !field.lengthOf && field.name !== selectedMessage.checksumTarget)
            .filter((field) => field.name !== selectedProtocol.schema.messageTypeField)
            .map((field) => ({
              name: field.name,
              value: messageFieldValues[field.name] ?? defaultMessageFieldValue(field),
            })),
        }
      : null;
  const encodeSelectedMessage = async () => {
    if (!selectedProtocol || !selectedMessage || isDirty) {
      return;
    }
    setBusy(true);
    try {
      const request = selectedMessageRequest()!;
      const variables = request.fields.some((field) => field.value.includes("{{"))
        ? sendValues((await activeVariables()).values, 1)
        : {};
      setMessageEncodeResult(
        await encodeProtocolMessage({
          ...request,
          fields: request.fields.map((field) => ({
            ...field,
            value: resolveValue(field.value, variables),
          })),
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

  const inspectDebugHex = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (debugCharacterCount === 0 || debugInvalidPosition >= 0 || debugHasOddLength) {
      return;
    }

    if (debugBusy) return;
    const content = debugContentRef.current;
    setDebugBusy(true);
    try {
      const result = await inspectHex(debugInput);
      if (debugContentRef.current !== content) return;
      setDebugResult(result);
      setDebugAnnotations([]);
      setAnnotationSelection(null);
      setAnnotationLabel("");
      setAnnotationError(false);
    } catch (error) {
      if (debugContentRef.current !== content) return;
      setDebugResult({
        ok: false,
        source: "browser-preview",
        error: {
          code: "bridge_error",
          message: error instanceof Error ? error.message : String(error),
          position: 0,
        },
      });
    } finally {
      setDebugBusy(false);
    }
  };

  const selectAnnotationCell = (index: number) => {
    if (annotationSelection?.editing) return;
    setAnnotationError(false);
    setAnnotationLabel("");
    setAnnotationSelection((current) =>
      current
        ? { ...current, end: index, editing: true }
        : { anchor: index, end: index, editing: false },
    );
  };

  const previewAnnotationCell = (index: number) => {
    setAnnotationSelection((current) =>
      current && !current.editing ? { ...current, end: index } : current,
    );
  };

  const addDebugAnnotation = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!debugResult?.ok || !annotationSelection?.editing) return;
    const start = selectionStart;
    const end = selectionEnd;
    const label = annotationLabel.trim();
    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 0 ||
      end < start ||
      end >= debugResult.byteCount ||
      !label ||
      !Number.isInteger(annotationColor) ||
      !annotationPalette[annotationColor] ||
      label.length > 160 ||
      debugAnnotations.length >= 1000
    ) {
      setAnnotationError(true);
      return;
    }
    setDebugAnnotations((current) => [
      ...current,
      { id: Date.now(), start, end, label, color: annotationColor },
    ]);
    setAnnotationSelection(null);
    setAnnotationLabel("");
    setAnnotationError(false);
  };

  const removeDebugAnnotation = (id: number) => {
    setDebugAnnotations((current) => current.filter((annotation) => annotation.id !== id));
  };

  const toggleDebugFormat = () => {
    setDebugInput((current) => {
      const compact = current.replace(/\s+/g, "");
      return debugFormatted ? compact : (compact.match(/.{1,2}/g)?.join(" ") ?? "");
    });
    setDebugFormatted((current) => !current);
  };

  const updateDebugInput = (nextValue: string) => {
    const content = nextValue.replace(/\s+/g, "").toUpperCase();
    setDebugInput(nextValue);
    if (!content) setDebugFormatted(false);
    if (content === debugContentRef.current) return;
    debugContentRef.current = content;
    setDebugResult(undefined);
    setDebugAnnotations([]);
    setAnnotationSelection(null);
    setAnnotationLabel("");
    setAnnotationError(false);
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

  useEffect(() => {
    setMessageEncodeResult(undefined);
    setMessageActionStatus("");
  }, [messageFieldValues]);

  const copyMessageHex = async () => {
    if (!messageEncodeResult?.ok || isDirty) return;
    try {
      await navigator.clipboard.writeText(messageEncodeResult.normalizedHex);
      setMessageActionStatus(translation.messageStudio.copied);
    } catch (error) {
      setMessageActionStatus(String(error));
    }
  };

  const exportSelectedMessage = async () => {
    if (!messageEncodeResult?.ok || isDirty || busy) return;
    try {
      const result = await exportMessageHex(messageEncodeResult.normalizedHex);
      if (!result.ok) setMessageActionStatus(result.error.message);
      else if (!result.cancelled)
        setMessageActionStatus(locale === "zh-CN" ? "HEX 已导出" : "HEX exported");
    } catch (error) {
      setMessageActionStatus(String(error));
    }
  };

  const [tcpDraft, setTcpDraft] = useState<TcpDraft | null>(null);
  const openHexInDebug = (hex: string, record?: TcpRecord) => {
    if (debugBusy) return;
    if (
      debugInput.trim() &&
      debugContentRef.current !== hex.replace(/\s/g, "") &&
      !window.confirm(translation.messageStudio.toDebugHint)
    )
      return;
    updateDebugInput(hex);
    setDebugFormatted(true);
    setDebugToolRange(null);
    setDebugByteOffset(null);
    setDebugHandoff((current) => (record ? { seq: (current?.seq ?? 0) + 1, record } : null));
    navigate("debug");
    if (record) {
      const content = hex.replace(/\s+/g, "").toUpperCase();
      void inspectHex(hex).then((result) => {
        if (debugContentRef.current === content) setDebugResult(result);
      });
    }
  };
  const openMessageInDebug = () => {
    if (messageEncodeResult?.ok && !isDirty) openHexInDebug(messageEncodeResult.normalizedHex);
  };

  const toggleExpanded = (key: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const startSidebarResize = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    sidebarResizeRef.current = { startX: event.clientX, startWidth: sidebarWidth };
    setSidebarResizing(true);
  };

  const updateSidebarResize = (event: PointerEvent<HTMLDivElement>) => {
    const start = sidebarResizeRef.current;
    if (!start) {
      return;
    }
    const nextWidth = start.startWidth + event.clientX - start.startX;
    setSidebarWidth(Math.min(getSidebarMaxWidth(), Math.max(SIDEBAR_MIN_WIDTH, nextWidth)));
  };

  const stopSidebarResize = (event: PointerEvent<HTMLDivElement>) => {
    sidebarResizeRef.current = null;
    setSidebarResizing(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const adjustSidebarWidth = (delta: number) => {
    setSidebarWidth((current) =>
      Math.min(getSidebarMaxWidth(), Math.max(SIDEBAR_MIN_WIDTH, current + delta)),
    );
  };

  const handleSidebarResizeKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      adjustSidebarWidth(-16);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      adjustSidebarWidth(16);
    } else if (event.key === "Home") {
      event.preventDefault();
      setSidebarWidth(SIDEBAR_MIN_WIDTH);
    } else if (event.key === "End") {
      event.preventDefault();
      setSidebarWidth(getSidebarMaxWidth());
    }
  };

  const startWindowDrag = (event: PointerEvent<HTMLElement>) => {
    if (event.button === 0 && event.target instanceof Element && !event.target.closest("button")) {
      void performWindowAction("drag");
    }
  };

  return (
    <div
      className={`app-shell ${isStartPage || hasProjectExplorer ? "startup-home" : ""} ${hasProjectExplorer ? "project-home" : ""} ${isProtocolCode ? `protocol-home ${protocolProblemsOpen ? "protocol-errors-open" : ""}` : ""} ${isMessageStudio ? "message-home" : ""}`}
    >
      <header className="titlebar" onPointerDown={startWindowDrag}>
        <div className="titlebar-brand">
          <img src="/iot-protocol-studio.svg" alt="" />
          <span>IoT Protocol Studio</span>
        </div>
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
        <span className="titlebar-project">{project?.name ?? translation.workspace.noProject}</span>
        <div aria-hidden="true" className="titlebar-drag-region" />
        <div className="window-controls">
          <button
            aria-label={translation.navigation.settings}
            title={translation.navigation.settings}
            className="window-control titlebar-settings"
            onClick={() => navigate("settings")}
            type="button"
          >
            <Settings size={20} />
          </button>
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

      <div className="workspace-layout">
        <aside aria-label={translation.navigation.title} className="navigation-rail">
          <button
            aria-current={page === "schema" ? "page" : undefined}
            aria-label={translation.navigation.schema}
            className={`nav-button schema-button ${page === "schema" ? "active" : ""}`}
            onClick={() => navigate("schema")}
            title={translation.navigation.schema}
            type="button"
          >
            <NavigationIcon
              name="schema"
              selected={page === "schema"}
              size={isStartPage || hasProjectExplorer ? 27 : 17}
            />
          </button>
          <button
            aria-current={page === "debug" ? "page" : undefined}
            aria-label={translation.navigation.debug}
            className={`nav-button debug-button ${page === "debug" ? "active" : ""}`}
            onClick={() => navigate("debug")}
            title={translation.navigation.debug}
            type="button"
          >
            <NavigationIcon
              name="debug"
              selected={page === "debug"}
              size={isStartPage || hasProjectExplorer ? 26 : 17}
            />
          </button>
          <button
            aria-current={page === "tcp" ? "page" : undefined}
            aria-label={locale === "zh-CN" ? "通信连接" : "Connections"}
            className={`nav-button tcp-button ${page === "tcp" ? "active" : ""}`}
            onClick={() => navigate("tcp")}
            title={locale === "zh-CN" ? "通信连接" : "Connections"}
            type="button"
          >
            <NavigationIcon
              name="tcp"
              selected={page === "tcp"}
              size={isStartPage || hasProjectExplorer ? 26 : 17}
            />
          </button>
          <button
            aria-current={page === "environments" ? "page" : undefined}
            aria-label={translation.navigation.environments}
            className={`nav-button ${page === "environments" ? "active" : ""}`}
            onClick={() => navigate("environments")}
            title={translation.navigation.environments}
            type="button"
          >
            <NavigationIcon
              name="environments"
              selected={page === "environments"}
              size={isStartPage || hasProjectExplorer ? 26 : 17}
            />
          </button>
          <button
            aria-current={page === "settings" ? "page" : undefined}
            aria-label={translation.navigation.settings}
            className={`nav-button settings-button ${page === "settings" ? "active" : ""}`}
            onClick={() => navigate("settings")}
            title={translation.navigation.settings}
            type="button"
          >
            <NavigationIcon
              name="settings"
              selected={page === "settings"}
              size={isStartPage || hasProjectExplorer ? 26 : 17}
            />
          </button>
        </aside>

        {page === "schema" && project && (
          <>
            <aside className="schema-sidebar" style={{ width: `${sidebarWidth}px` }}>
              <div className="sidebar-header">
                <span>
                  {hasProjectExplorer
                    ? locale === "zh-CN"
                      ? "项目目录"
                      : "Project explorer"
                    : translation.workspace.project}
                </span>
                <div className="project-tree-tools">
                  {hasProjectExplorer && (
                    <>
                      <button
                        type="button"
                        aria-label={locale === "zh-CN" ? "搜索项目目录" : "Search project tree"}
                        onClick={() => {
                          setTreeSearchOpen((value) => !value);
                          setTreeSearch("");
                        }}
                      >
                        <Search size={23} />
                      </button>
                      <button
                        type="button"
                        disabled={busy || isDirty}
                        aria-label={translation.workspace.createProtocol}
                        onClick={() => treeAction("createProtocol", "protocols")}
                      >
                        <Plus size={25} />
                      </button>
                    </>
                  )}
                  <div className="project-menu" ref={projectMenuRef}>
                    <button
                      aria-expanded={projectMenuOpen}
                      aria-haspopup="menu"
                      aria-label={translation.workspace.projectActions}
                      className="sidebar-menu-trigger"
                      onClick={() => setProjectMenuOpen((current) => !current)}
                      title={translation.workspace.projectActions}
                      type="button"
                    >
                      <DotsHorizontalIcon size={23} />
                    </button>
                    {projectMenuOpen && (
                      <div
                        aria-label={translation.workspace.projectActions}
                        className="project-menu-popover"
                        role="menu"
                      >
                        <button
                          disabled={busy}
                          onClick={() => {
                            setProjectMenuOpen(false);
                            if (isDirty) {
                              setErrorMessage(translation.structure.saveBlocked);
                              return;
                            }
                            openTreeDialog("recent");
                          }}
                          role="menuitem"
                          type="button"
                        >
                          <FolderOpen size={15} />
                          {translation.workspace.openProject}
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => openTreeDialog("project")}
                          role="menuitem"
                          type="button"
                        >
                          <SparklesIcon size={15} />
                          {translation.workspace.newProject}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              {hasProjectExplorer && treeSearchOpen && (
                <div className="project-tree-search">
                  <input
                    aria-label={locale === "zh-CN" ? "搜索协议" : "Search protocols"}
                    autoFocus
                    placeholder={
                      locale === "zh-CN" ? "搜索协议名称或路径…" : "Search name or path…"
                    }
                    value={treeSearch}
                    onChange={(event) => setTreeSearch(event.target.value)}
                  />
                </div>
              )}
              <div className="schema-tree">
                {busy && (
                  <div className="tree-state">
                    <LoaderCircle className="spin" size={16} />
                    {translation.workspace.loading}
                  </div>
                )}
                {!busy && project && (
                  <>
                    <div
                      className="project-title"
                      title={`${project.name}\n${translation.workspace.dropAtRoot}`}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault();
                        dropFolder("protocols", "inside");
                      }}
                    >
                      <FolderOpen size={15} />
                      <button
                        className="project-tree-identity"
                        disabled={busy}
                        type="button"
                        onClick={() => {
                          if (isDirty) {
                            setErrorMessage(translation.structure.saveBlocked);
                            return;
                          }
                          setSelectedProtocolPath(undefined);
                        }}
                      >
                        <span>{project.name}</span>
                        {hasProjectExplorer && (
                          <small title={project.rootPath}>{project.rootPath}</small>
                        )}
                      </button>
                      <span className="project-count">{project.protocols.length}</span>
                      <div className="row-actions project-row-actions">
                        <button
                          type="button"
                          disabled={busy || isDirty}
                          title={translation.workspace.moreActions}
                          aria-label={`${translation.workspace.moreActions}: ${project.name}`}
                          aria-haspopup="dialog"
                          onClick={() => openTreeDialog("projectActions")}
                        >
                          <DotsHorizontalIcon size={14} />
                        </button>
                      </div>
                    </div>
                    <TreeItems
                      showFileNames={hasProjectExplorer}
                      depth={0}
                      expanded={expanded}
                      nodes={
                        hasProjectExplorer
                          ? [
                              {
                                key: "folder:protocols",
                                name: "protocols",
                                path: "protocols",
                                type: "folder",
                                children: projectTree,
                              },
                            ]
                          : projectTree
                      }
                      onSelect={(protocol) => {
                        if (busy) return;
                        if (isDirty) {
                          setErrorMessage(translation.structure.saveBlocked);
                          return;
                        }
                        setSelectedProtocolPath(protocol.path);
                        navigate("schema");
                      }}
                      onToggle={toggleExpanded}
                      selectedPath={selectedProtocolPath}
                      onAction={treeAction}
                      onDragFolder={(path) => {
                        draggedFolder.current = path;
                      }}
                      onDropFolder={dropFolder}
                      labels={translation.workspace}
                      disabled={busy || isDirty}
                    />
                  </>
                )}
                {!busy && !project && (
                  <div className="tree-state">{translation.workspace.noProject}</div>
                )}
              </div>
            </aside>

            <div
              aria-label={translation.workspace.resizeSidebar}
              aria-valuemax={getSidebarMaxWidth()}
              aria-valuemin={SIDEBAR_MIN_WIDTH}
              aria-valuenow={sidebarWidth}
              className={`sidebar-resize-handle ${sidebarResizing ? "active" : ""}`}
              onKeyDown={handleSidebarResizeKeyDown}
              onPointerCancel={stopSidebarResize}
              onPointerDown={startSidebarResize}
              onPointerMove={updateSidebarResize}
              onPointerUp={stopSidebarResize}
              role="separator"
              tabIndex={0}
            />
          </>
        )}

        <section className="content-stage">
          <main
            className={`content-card ${
              isStartPage
                ? "start-page-card"
                : page === "environments"
                  ? "environment-page"
                  : page === "settings"
                    ? "settings-page"
                    : page === "debug"
                      ? "debug-page"
                      : page === "tcp"
                        ? "tcp-page"
                        : "schema-page"
            }`}
          >
            {errorMessage && (
              <div className="error-banner">
                <CircleAlert size={16} />
                <span>{redact(errorMessage)}</span>
                <button onClick={() => setErrorMessage(undefined)} type="button">
                  <X size={14} />
                </button>
              </div>
            )}
            <TcpWorkspace
              visible={page === "tcp"}
              locale={locale}
              protocols={project?.protocols ?? []}
              draft={tcpDraft}
              onDebug={(record) => openHexInDebug(record.hex, record)}
              focusSession={focusSession}
              onDiagnostic={(session, message, problem) =>
                addDiagnostic("tcp", session, message, problem, session)
              }
              redact={redact}
            />
            {page === "tcp" ? null : page === "environments" ? (
              <Environments
                key={project?.rootPath ?? ""}
                rootPath={project?.rootPath}
                locale={locale}
                onSensitiveValues={rememberSensitiveValues}
              />
            ) : page === "settings" ? (
              <>
                <header className="content-header">
                  <div className="content-heading-icon">
                    <DotsHorizontalIcon size={20} />
                  </div>
                  <div>
                    <span className="content-eyebrow">{translation.navigation.settings}</span>
                    <h1>{translation.settings.title}</h1>
                    <p>{translation.settings.description}</p>
                  </div>
                </header>
                <div className="settings-body">
                  <section className="settings-section" aria-labelledby="settings-theme-title">
                    <div className="settings-section-heading">
                      <div className="settings-section-icon">
                        <Palette size={17} />
                      </div>
                      <div>
                        <h2 id="settings-theme-title">{translation.settings.theme}</h2>
                        <p>{translation.settings.themeHint}</p>
                      </div>
                    </div>
                    <div
                      aria-label={translation.settings.theme}
                      className="settings-choice-row"
                      role="group"
                    >
                      <button
                        aria-pressed={theme === "dark"}
                        className={`settings-choice theme-choice dark-choice ${theme === "dark" ? "active" : ""}`}
                        onClick={() => setTheme("dark")}
                        type="button"
                      >
                        <Moon size={16} />
                        <span>{translation.settings.darkTheme}</span>
                      </button>
                      <button
                        aria-pressed={theme === "light"}
                        className={`settings-choice theme-choice light-choice ${theme === "light" ? "active" : ""}`}
                        onClick={() => setTheme("light")}
                        type="button"
                      >
                        <Sun size={16} />
                        <span>{translation.settings.lightTheme}</span>
                      </button>
                    </div>
                  </section>

                  <section className="settings-section" aria-labelledby="settings-language-title">
                    <div className="settings-section-heading">
                      <div className="settings-section-icon">
                        <Languages size={17} />
                      </div>
                      <div>
                        <h2 id="settings-language-title">{translation.settings.language}</h2>
                        <p>{translation.settings.languageHint}</p>
                      </div>
                    </div>
                    <div
                      aria-label={translation.settings.language}
                      className="settings-choice-row"
                      role="group"
                    >
                      <button
                        aria-pressed={locale === "zh-CN"}
                        className={`settings-choice language-choice ${locale === "zh-CN" ? "active" : ""}`}
                        onClick={() => setLocale("zh-CN")}
                        type="button"
                      >
                        <span>中文</span>
                      </button>
                      <button
                        aria-pressed={locale === "en-US"}
                        className={`settings-choice language-choice ${locale === "en-US" ? "active" : ""}`}
                        onClick={() => setLocale("en-US")}
                        type="button"
                      >
                        <span>English</span>
                      </button>
                    </div>
                  </section>

                  <section className="settings-section" aria-labelledby="settings-problems-title">
                    <div className="settings-section-heading">
                      <div className="settings-section-icon">
                        <CircleAlert size={17} />
                      </div>
                      <div>
                        <h2 id="settings-problems-title">
                          {locale === "zh-CN" ? "问题列表" : "Problems"} (
                          {diagnostics.filter((item) => item.problem).length})
                        </h2>
                        <p>
                          {locale === "zh-CN"
                            ? "协议、连接、编解码与文件错误；点击跳转到相关页面。"
                            : "Protocol, connection, codec and file errors. Select one to open its page."}
                        </p>
                      </div>
                    </div>
                    <div className="diagnostic-list">
                      {diagnostics
                        .filter((item) => item.problem)
                        .slice(-100)
                        .reverse()
                        .map((item) => (
                          <button
                            type="button"
                            key={item.id}
                            onClick={() => {
                              if (item.protocol) setSelectedProtocolPath(item.protocol);
                              if (item.session) setFocusSession({ id: item.session, seq: item.id });
                              navigate(item.page);
                            }}
                          >
                            <time>{new Date(item.time).toLocaleString(locale)}</time>
                            <strong>{redact(item.context)}</strong> {redact(item.message)}
                          </button>
                        ))}
                      {!diagnostics.some((item) => item.problem) && (
                        <p>{locale === "zh-CN" ? "暂无问题" : "No problems"}</p>
                      )}
                    </div>
                  </section>
                  <section className="settings-section" aria-labelledby="settings-log-title">
                    <div className="settings-section-heading">
                      <div className="settings-section-icon">
                        <ListTree size={17} />
                      </div>
                      <div>
                        <h2 id="settings-log-title">
                          {locale === "zh-CN" ? "诊断日志" : "Diagnostic log"}
                        </h2>
                        <p>
                          {locale === "zh-CN"
                            ? "仅本次运行，最多 500 条；与 TCP 收发记录分开。"
                            : "Current run only, up to 500 entries; separate from traffic."}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={!diagnostics.length}
                      onClick={() => {
                        setLogError("");
                        void logFile(
                          JSON.stringify(
                            {
                              format: "iotps-log-v1",
                              exportedAt: new Date().toISOString(),
                              entries: diagnostics.map((item) => ({
                                ...item,
                                context: redact(item.context),
                                message: redact(item.message),
                                session: item.session ? redact(item.session) : undefined,
                                protocol: item.protocol ? redact(item.protocol) : undefined,
                              })),
                            },
                            null,
                            2,
                          ),
                        )
                          .then((result) => {
                            if (!result.ok) {
                              setLogError(result.error.message);
                              addDiagnostic(
                                "settings",
                                "diagnostic export",
                                result.error.message,
                                true,
                              );
                            }
                          })
                          .catch((error) => {
                            setLogError(String(error));
                            addDiagnostic("settings", "diagnostic export", String(error), true);
                          });
                      }}
                    >
                      {locale === "zh-CN" ? "导出诊断日志" : "Export diagnostic log"}
                    </button>
                    {logError && (
                      <p role="alert" className="tcp-error">
                        {redact(logError)}
                      </p>
                    )}
                    <div className="diagnostic-list">
                      {diagnostics
                        .slice(-100)
                        .reverse()
                        .map((item) => (
                          <p key={item.id}>
                            <time>{new Date(item.time).toLocaleString(locale)}</time> ·{" "}
                            {redact(item.context)} · {redact(item.message)}
                          </p>
                        ))}
                    </div>
                  </section>
                  <section className="settings-section" aria-labelledby="settings-core-title">
                    <div className="settings-section-heading">
                      <div className="settings-section-icon">
                        <Cpu size={17} />
                      </div>
                      <div>
                        <h2 id="settings-core-title">{translation.settings.coreVersion}</h2>
                        <p>{translation.settings.coreSource}</p>
                      </div>
                    </div>
                    <div className="settings-core-value">
                      <strong>Core {coreInfo?.version ?? "..."}</strong>
                      <span>
                        {coreInfo?.source === "native-core"
                          ? translation.settings.nativeCore
                          : translation.settings.browserPreview}
                      </span>
                    </div>
                  </section>
                </div>
              </>
            ) : page === "debug" ? (
              <div className="debug-body">
                <form className="debug-input-panel" onSubmit={inspectDebugHex}>
                  <div className="debug-panel-heading">
                    <div>
                      <label htmlFor="debug-hex-input">{translation.debug.inputLabel}</label>
                    </div>
                    <button
                      aria-label={
                        debugFormatted ? translation.debug.unformat : translation.debug.format
                      }
                      aria-pressed={debugFormatted}
                      className={`debug-format-button ${debugFormatted ? "active" : ""}`}
                      onClick={toggleDebugFormat}
                      disabled={debugCharacterCount === 0}
                      title={debugFormatted ? translation.debug.unformat : translation.debug.format}
                      type="button"
                    >
                      <UnorderedListIcon size={15} />
                      <span>
                        {debugFormatted ? translation.debug.unformat : translation.debug.format}
                      </span>
                    </button>
                  </div>
                  <textarea
                    aria-invalid={debugInvalidPosition >= 0 || debugHasOddLength}
                    aria-describedby="debug-hex-hint"
                    id="debug-hex-input"
                    onChange={(event) => updateDebugInput(event.target.value)}
                    onKeyDown={(event) => {
                      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                        event.preventDefault();
                        event.currentTarget.form?.requestSubmit();
                      }
                    }}
                    placeholder={translation.debug.inputPlaceholder}
                    spellCheck={false}
                    value={debugInput}
                  />
                  <p
                    className={`debug-input-hint ${
                      debugInvalidPosition >= 0 || debugHasOddLength ? "error" : ""
                    }`}
                    id="debug-hex-hint"
                  >
                    {debugInvalidPosition >= 0
                      ? translation.debug.invalidCharacterHint
                      : debugHasOddLength
                        ? translation.debug.oddLengthHint
                        : translation.debug.shortcutHint}
                  </p>
                  <footer>
                    <span
                      aria-live="polite"
                      className={`debug-input-count ${
                        debugInvalidPosition >= 0 || debugHasOddLength ? "error" : ""
                      }`}
                    >
                      {debugCharacterCount} {translation.debug.characters}
                      {" · "}
                      {debugByteCount} {translation.debug.byteCount}
                    </span>
                    <button
                      className="primary debug-parse-button"
                      disabled={
                        debugBusy ||
                        debugCharacterCount === 0 ||
                        debugInvalidPosition >= 0 ||
                        debugHasOddLength
                      }
                      type="submit"
                    >
                      {debugBusy ? translation.debug.parsing : translation.debug.parse}
                    </button>
                  </footer>
                  <DebugTools
                    locale={locale}
                    input={debugInput}
                    result={debugResult}
                    annotations={debugAnnotations}
                    project={project}
                    dirty={isDirty}
                    byteOffset={debugByteOffset}
                    handoff={debugHandoff}
                    onRange={setDebugToolRange}
                    onInput={updateDebugInput}
                    onIssue={(context, message) =>
                      addDiagnostic(
                        "debug",
                        context || "debug",
                        message,
                        true,
                        undefined,
                        selectedProtocolPath,
                      )
                    }
                    onImport={(result, annotations) => {
                      debugContentRef.current = result.normalizedHex.replace(/\s/g, "");
                      setDebugInput(result.normalizedHex);
                      setDebugFormatted(true);
                      setDebugResult(result);
                      setDebugAnnotations(annotations);
                      setAnnotationSelection(null);
                      setAnnotationError(false);
                      setDebugToolRange(null);
                      setDebugByteOffset(null);
                    }}
                  />
                </form>

                <section aria-live="polite" className="debug-result-panel">
                  <header className="debug-panel-heading">
                    <div>
                      <span>{translation.debug.result}</span>
                    </div>
                  </header>
                  {!debugResult ? (
                    <div aria-hidden="true" className="debug-result-empty" />
                  ) : debugResult.ok ? (
                    <div className="debug-result-content">
                      <dialog
                        ref={annotationDialogRef}
                        className="debug-annotation-dialog"
                        aria-labelledby="debug-annotation-title"
                        onClose={() => setAnnotationSelection(null)}
                      >
                        <form className="debug-annotation-form" onSubmit={addDebugAnnotation}>
                          <strong id="debug-annotation-title">
                            {translation.debug.annotation} ·{" "}
                            {indexMode === "byte"
                              ? translation.debug.byte
                              : translation.debug.byteOffset}{" "}
                            {selectionStart + (indexMode === "byte" ? 1 : 0)}–
                            {selectionEnd + (indexMode === "byte" ? 1 : 0)}
                          </strong>
                          <label className="debug-annotation-label">
                            <span>{translation.debug.description}</span>
                            <input
                              autoFocus
                              required
                              aria-invalid={annotationError}
                              value={annotationLabel}
                              maxLength={160}
                              onChange={(event) => {
                                setAnnotationLabel(event.target.value);
                                setAnnotationError(false);
                              }}
                              placeholder={translation.debug.annotationLabelPlaceholder}
                            />
                          </label>
                          <fieldset className="debug-color-presets">
                            <legend>{translation.debug.annotationColor}</legend>
                            {annotationPalette.map((color, index) => (
                              <button
                                key={index}
                                type="button"
                                className="debug-color-swatch"
                                aria-label={`${translation.debug.annotationColor} ${index + 1}`}
                                aria-pressed={annotationColor === index}
                                title={color}
                                style={{ backgroundColor: color }}
                                onClick={() => setAnnotationColor(index)}
                              >
                                {annotationColor === index ? "✓" : ""}
                              </button>
                            ))}
                          </fieldset>
                          {annotationError && (
                            <p className="debug-annotation-error" role="alert">
                              {translation.debug.annotationError}
                            </p>
                          )}
                          <footer>
                            <button type="button" onClick={() => setAnnotationSelection(null)}>
                              {translation.create.cancel}
                            </button>
                            <button type="submit">{translation.editor.save}</button>
                          </footer>
                        </form>
                      </dialog>
                      <div
                        className="debug-table-wrap"
                        onKeyDown={(event) => {
                          if (event.key === "Escape") setAnnotationSelection(null);
                        }}
                      >
                        <table className="debug-byte-table">
                          <colgroup>
                            <col style={{ width: "20%" }} />
                            <col style={{ width: "15%" }} />
                            <col style={{ width: "15%" }} />
                            <col style={{ width: "15%" }} />
                            <col style={{ width: "35%" }} />
                          </colgroup>
                          <thead>
                            <tr>
                              <th scope="col">
                                <span className="debug-index-toggle">
                                  <button
                                    type="button"
                                    title={
                                      indexMode === "byte"
                                        ? translation.debug.byteOffset
                                        : translation.debug.byte
                                    }
                                    onClick={() =>
                                      setIndexMode(indexMode === "byte" ? "offset" : "byte")
                                    }
                                  >
                                    {indexMode === "byte"
                                      ? translation.debug.byte
                                      : translation.debug.byteOffset}
                                  </button>
                                </span>
                              </th>
                              <th scope="col">HEX</th>
                              <th scope="col">ASCII</th>
                              <th scope="col">{translation.debug.decimal}</th>
                              <th scope="col">{translation.debug.description}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {debugResult.bytes.map((byte, index) => {
                              const rowAnnotations = debugAnnotations.filter(
                                (item) => index >= item.start && index <= item.end,
                              );
                              const annotation = rowAnnotations[rowAnnotations.length - 1];
                              const segment = debugAnnotationSegmentByStart.get(index);
                              const selected = index >= selectionStart && index <= selectionEnd;
                              const color = annotation && annotationPalette[annotation.color];
                              return (
                                <tr
                                  key={index}
                                  id={`debug-byte-${index}`}
                                  className={
                                    debugToolRange &&
                                    index >= debugToolRange.start &&
                                    index <= debugToolRange.end
                                      ? "debug-tool-highlight"
                                      : ""
                                  }
                                  style={color ? { backgroundColor: `${color}22` } : undefined}
                                >
                                  <td className={`debug-byte-index ${selected ? "selected" : ""}`}>
                                    <button
                                      type="button"
                                      aria-pressed={selected}
                                      aria-label={`${indexMode === "byte" ? translation.debug.byte : translation.debug.byteOffset} ${index + (indexMode === "byte" ? 1 : 0)}`}
                                      onClick={() => selectAnnotationCell(index)}
                                      onPointerEnter={() => previewAnnotationCell(index)}
                                      onFocus={() => previewAnnotationCell(index)}
                                    >
                                      {index + (indexMode === "byte" ? 1 : 0)}
                                    </button>
                                  </td>
                                  <td>
                                    <button
                                      type="button"
                                      className="debug-hex-select"
                                      aria-label={`${locale === "zh-CN" ? "定位字节" : "Locate byte"} ${index}`}
                                      onClick={() => setDebugByteOffset({ offset: index })}
                                    >
                                      <code>
                                        {byte.toString(16).padStart(2, "0").toUpperCase()}
                                      </code>
                                    </button>
                                  </td>
                                  <td>
                                    <code>{debugResult.ascii[index] || "·"}</code>
                                  </td>
                                  <td>{byte}</td>
                                  {segment ? (
                                    <td
                                      className="debug-description"
                                      rowSpan={segment.end - segment.start + 1}
                                      style={{ borderLeft: `3px solid ${color}` }}
                                    >
                                      <span>{segment.annotation.label}</span>
                                      <button
                                        className="debug-annotation-remove"
                                        type="button"
                                        aria-label={`${translation.debug.removeAnnotation}: ${segment.annotation.label}`}
                                        onClick={() => removeDebugAnnotation(segment.annotation.id)}
                                      >
                                        <X size={11} />
                                      </button>
                                    </td>
                                  ) : !annotation ? (
                                    <td className="debug-description" />
                                  ) : null}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <div className="debug-result-error" role="alert">
                      <CircleAlert size={20} />
                      <div>
                        <strong>
                          [{debugResult.error.code}] {translation.debug.parseError}
                        </strong>
                        <p>{redact(debugResult.error.message)}</p>
                        <small>
                          {translation.debug.position}: {debugResult.error.position + 1}
                        </small>
                      </div>
                    </div>
                  )}
                </section>
              </div>
            ) : !project ? (
              <StartPage
                locale={locale}
                projects={recentProjects}
                busy={busy}
                onCreate={() => openTreeDialog("project")}
                onOpen={(path) => {
                  void run(() => openProject(path));
                }}
                onForget={(path) =>
                  setRecentProjects((items) => items.filter((item) => item.rootPath !== path))
                }
                onClear={() => setRecentProjects([])}
                onReveal={(path) => {
                  void revealProject(path).catch((error: unknown) =>
                    setErrorMessage(error instanceof Error ? error.message : String(error)),
                  );
                }}
              />
            ) : isProtocolCode && selectedProtocol ? (
              <ProtocolCodeEditor
                key={selectedProtocol.path}
                protocol={selectedProtocol}
                locale={locale}
                value={draftContent}
                dirty={isDirty}
                busy={busy}
                check={currentProtocolCheck}
                editorRef={protocolEditorRef}
                onChange={setDraftContent}
                onSave={() => void saveSelectedProtocol()}
                onValidate={() => void validateSelectedProtocol()}
                onView={setDesignerView}
                onActionError={setErrorMessage}
              />
            ) : isProjectOverview && project ? (
              <ProjectOverview
                key={project.rootPath}
                project={project}
                locale={locale}
                busy={busy}
                recent={recentProjects.find((item) => item.rootPath === project.rootPath)}
                onCreateProtocol={() => treeAction("createProtocol", "protocols")}
                onOpenProtocol={(protocol) => setSelectedProtocolPath(protocol.path)}
                onDeleteProtocol={(protocol) => openTreeDialog("deleteProtocol", protocol.path)}
                onReveal={() => {
                  void revealProject(project.rootPath).catch((error: unknown) =>
                    setErrorMessage(error instanceof Error ? error.message : String(error)),
                  );
                }}
                onSettings={() => openTreeDialog("projectActions")}
              />
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
                              <span>
                                <small>
                                  {locale === "zh-CN" ? "消息识别字段" : "Message type field"}
                                </small>
                                <strong>{selectedProtocol.schema.messageTypeField || "—"}</strong>
                              </span>
                            </div>
                            <div className="schema-edit-actions">
                              <button
                                type="button"
                                disabled={busy || isDirty}
                                onClick={() => openSchemaEdit("addMessage")}
                              >
                                {translation.structure.addMessage}
                              </button>
                              <button
                                type="button"
                                disabled={busy || isDirty || !selectedStructureMessage}
                                onClick={() =>
                                  openSchemaEdit(
                                    reusableStructureSelected ? "addStructureField" : "addField",
                                  )
                                }
                              >
                                {translation.structure.addField}
                              </button>
                              <button
                                type="button"
                                disabled={busy || isDirty}
                                onClick={() => openSchemaEdit("addStructure")}
                              >
                                {locale === "zh-CN" ? "新增结构" : "Add structure"}
                              </button>
                            </div>
                            {isDirty && (
                              <div className="structure-notice">
                                <CircleAlert size={14} />
                                {translation.structure.unsavedHint}
                              </div>
                            )}
                            {selectedProtocol.schema.messages.length === 0 &&
                            !selectedProtocol.schema.structures?.length ? (
                              <div className="structure-empty">
                                <ListTree size={24} />
                                <span>{translation.structure.empty}</span>
                              </div>
                            ) : (
                              <ul className="message-tree" role="tree">
                                {[
                                  ...selectedProtocol.schema.messages.map((message) => ({
                                    message,
                                    reusable: false,
                                  })),
                                  ...(selectedProtocol.schema.structures ?? []).map((message) => ({
                                    message,
                                    reusable: true,
                                  })),
                                ].map(({ message, reusable }) => {
                                  const selectionName = reusable
                                    ? `@${message.name}`
                                    : message.name;
                                  const messageSelected =
                                    selectedStructureMessage?.name === message.name &&
                                    reusableStructureSelected === reusable &&
                                    !structureSelection?.fieldName;
                                  return (
                                    <li
                                      aria-expanded="true"
                                      aria-selected={messageSelected}
                                      key={selectionName}
                                      role="treeitem"
                                    >
                                      <button
                                        className={`message-node ${messageSelected ? "selected" : ""}`}
                                        onClick={() =>
                                          setStructureSelection({ messageName: selectionName })
                                        }
                                        type="button"
                                      >
                                        <ChevronDown size={15} />
                                        <div>
                                          <strong>
                                            {reusable ? "▧ " : ""}
                                            {message.displayName || message.name}
                                          </strong>
                                          {message.displayName && <code>{message.name}</code>}
                                        </div>
                                        <span>
                                          {message.fields.length} {translation.structure.fields}
                                        </span>
                                        {!reusable && message.typeId && (
                                          <span>
                                            {translation.structure.typeId} {message.typeId}
                                          </span>
                                        )}
                                      </button>
                                      <ul role="group">
                                        {message.fields.map((field, fieldIndex) => {
                                          const fieldSelected =
                                            selectedStructureMessage?.name === message.name &&
                                            reusableStructureSelected === reusable &&
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
                                                    messageName: selectionName,
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
                                <div className="schema-edit-actions">
                                  <button
                                    type="button"
                                    disabled={busy || isDirty}
                                    onClick={() =>
                                      openSchemaEdit(
                                        reusableStructureSelected
                                          ? selectedStructureField
                                            ? "updateStructureField"
                                            : "updateStructure"
                                          : selectedStructureField
                                            ? "updateField"
                                            : "updateMessage",
                                      )
                                    }
                                  >
                                    {selectedStructureField
                                      ? translation.structure.editField
                                      : translation.structure.editMessage}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={busy || isDirty}
                                    onClick={() =>
                                      openSchemaEdit(
                                        reusableStructureSelected
                                          ? selectedStructureField
                                            ? "deleteStructureField"
                                            : "deleteStructure"
                                          : selectedStructureField
                                            ? "deleteField"
                                            : "deleteMessage",
                                      )
                                    }
                                  >
                                    {selectedStructureField
                                      ? translation.structure.deleteField
                                      : translation.structure.deleteMessage}
                                  </button>
                                  {selectedStructureField &&
                                    (["moveFieldUp", "moveFieldDown"] as const).map((action) => (
                                      <button
                                        key={action}
                                        type="button"
                                        disabled={
                                          busy ||
                                          isDirty ||
                                          selectedStructureMessage.fields.at(
                                            action === "moveFieldUp" ? 0 : -1,
                                          )?.name === selectedStructureField.name
                                        }
                                        onClick={() =>
                                          void saveSchemaEdit({
                                            relativePath: selectedProtocol.path,
                                            action: reusableStructureSelected
                                              ? action === "moveFieldUp"
                                                ? "moveStructureFieldUp"
                                                : "moveStructureFieldDown"
                                              : action,
                                            messageName: selectedStructureMessage.name,
                                            fieldName: selectedStructureField.name,
                                            properties: {},
                                          })
                                        }
                                      >
                                        {action === "moveFieldUp"
                                          ? translation.structure.moveUp
                                          : translation.structure.moveDown}
                                      </button>
                                    ))}
                                </div>
                                {selectedStructureField && !reusableStructureSelected && (
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
                          {!selectedMessage ? (
                            <div className="message-preview-empty">
                              <ListTree size={24} />
                              <strong>{translation.messageStudio.noMessage}</strong>
                              <button onClick={() => setDesignerView("code")}>
                                {translation.editor.code}
                              </button>
                            </div>
                          ) : (
                            <>
                              <MessageTemplates
                                key={`${project?.rootPath}:${selectedProtocol.path}:${selectedMessage.name}:${selectedProtocol.content}`}
                                protocol={selectedProtocol}
                                projectRoot={project?.rootPath ?? ""}
                                messageLabel={selectedMessage.displayName || selectedMessage.name}
                                fieldCount={visibleMessageFields.length}
                                onView={setDesignerView}
                                onCopy={() => void copyMessageHex()}
                                onExport={() => void exportSelectedMessage()}
                                canCopy={!!messageEncodeResult?.ok}
                                selector={
                                  <label className="message-selector">
                                    <span>{translation.messageStudio.selectMessage}</span>
                                    <select
                                      disabled={
                                        busy || selectedProtocol.schema.messages.length === 0
                                      }
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
                                }
                                message={selectedMessage.name}
                                fields={visibleMessageFields
                                  .filter(
                                    (field) =>
                                      !field.lengthOf &&
                                      field.name !== selectedMessage.checksumTarget &&
                                      field.name !== selectedProtocol.schema.messageTypeField,
                                  )
                                  .map((field) => ({
                                    name: field.name,
                                    value:
                                      messageFieldValues[field.name] ??
                                      defaultMessageFieldValue(field),
                                  }))}
                                busy={busy}
                                disabled={isDirty}
                                locale={locale}
                                onBusy={setBusy}
                                onLoad={(fields) =>
                                  setMessageFieldValues(
                                    Object.fromEntries(
                                      fields.map((field) => [field.name, field.value]),
                                    ),
                                  )
                                }
                              >
                                <div className="message-field-grid">
                                  <div className="message-field-row message-field-heading">
                                    <span>{translation.structure.name}</span>
                                    <span>{translation.structure.type}</span>
                                    <span>{translation.messageStudio.fieldValue}</span>
                                  </div>
                                  {visibleMessageFields.map((field) => {
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
                                        {field.lengthOf ||
                                        field.name === selectedMessage.checksumTarget ||
                                        field.name === selectedProtocol.schema.messageTypeField ? (
                                          <div className="message-derived-value">
                                            <strong>{translation.messageStudio.derived}</strong>
                                            <span>{translation.messageStudio.automatic}</span>
                                          </div>
                                        ) : field.bits?.length ? (
                                          <div className="message-value-input">
                                            <input
                                              disabled={busy}
                                              aria-label={`${translation.messageStudio.fieldValue}: ${field.name}`}
                                              value={
                                                messageFieldValues[field.name] ??
                                                defaultMessageFieldValue(field)
                                              }
                                              onChange={(event) =>
                                                setMessageFieldValues((current) => ({
                                                  ...current,
                                                  [field.name]: event.target.value,
                                                }))
                                              }
                                            />
                                            {field.bits.map((bit) => (
                                              <label className="message-bit-row" key={bit.name}>
                                                <span>
                                                  {bit.displayName || bit.name} · bit {bit.offset}–
                                                  {bit.offset + bit.width - 1}
                                                </span>
                                                {bit.width === 1 ? (
                                                  <input
                                                    type="checkbox"
                                                    disabled={busy}
                                                    checked={
                                                      bitPart(
                                                        messageFieldValues[field.name] ?? "0",
                                                        bit.offset,
                                                        1,
                                                      ) === "1"
                                                    }
                                                    onChange={(event) =>
                                                      setMessageFieldValues((current) => ({
                                                        ...current,
                                                        [field.name]: replaceBitPart(
                                                          current[field.name] ?? "0",
                                                          bit.offset,
                                                          1,
                                                          event.target.checked ? "1" : "0",
                                                        ),
                                                      }))
                                                    }
                                                  />
                                                ) : (
                                                  <input
                                                    type="number"
                                                    min="0"
                                                    max={(
                                                      (1n << BigInt(bit.width)) -
                                                      1n
                                                    ).toString()}
                                                    disabled={busy}
                                                    aria-label={`${bit.displayName || bit.name} (bit ${bit.offset}–${bit.offset + bit.width - 1})`}
                                                    value={bitPart(
                                                      messageFieldValues[field.name] ?? "0",
                                                      bit.offset,
                                                      bit.width,
                                                    )}
                                                    onChange={(event) =>
                                                      setMessageFieldValues((current) => ({
                                                        ...current,
                                                        [field.name]: replaceBitPart(
                                                          current[field.name] ?? "0",
                                                          bit.offset,
                                                          bit.width,
                                                          event.target.value,
                                                        ),
                                                      }))
                                                    }
                                                  />
                                                )}
                                              </label>
                                            ))}
                                          </div>
                                        ) : field.enumValues?.length ? (
                                          <label className="message-value-input">
                                            <select
                                              disabled={busy}
                                              aria-label={`${translation.messageStudio.fieldValue}: ${field.name}`}
                                              value={
                                                field.enumValues.some(
                                                  (item) =>
                                                    item.value === messageFieldValues[field.name],
                                                )
                                                  ? messageFieldValues[field.name]
                                                  : "__custom__"
                                              }
                                              onChange={(event) =>
                                                setMessageFieldValues((current) => ({
                                                  ...current,
                                                  [field.name]:
                                                    event.target.value === "__custom__"
                                                      ? ""
                                                      : event.target.value,
                                                }))
                                              }
                                            >
                                              {field.enumValues.map((item) => (
                                                <option key={item.name} value={item.value}>
                                                  {item.name} ({item.value})
                                                </option>
                                              ))}
                                              <option value="__custom__">
                                                {locale === "zh-CN" ? "自定义数值" : "Custom value"}
                                              </option>
                                            </select>
                                            {!field.enumValues.some(
                                              (item) =>
                                                item.value === messageFieldValues[field.name],
                                            ) && (
                                              <input
                                                disabled={busy}
                                                aria-label={`${translation.messageStudio.fieldValue}: ${field.name} (${locale === "zh-CN" ? "原始数值" : "raw value"})`}
                                                value={
                                                  messageFieldValues[field.name] ??
                                                  defaultMessageFieldValue(field)
                                                }
                                                onChange={(event) =>
                                                  setMessageFieldValues((current) => ({
                                                    ...current,
                                                    [field.name]: event.target.value,
                                                  }))
                                                }
                                              />
                                            )}
                                          </label>
                                        ) : (
                                          <label className="message-value-input">
                                            <input
                                              disabled={busy}
                                              aria-label={`${translation.messageStudio.fieldValue}: ${field.name}`}
                                              onChange={(event) =>
                                                setMessageFieldValues((current) => ({
                                                  ...current,
                                                  [field.name]: event.target.value,
                                                }))
                                              }
                                              placeholder={hint}
                                              value={
                                                messageFieldValues[field.name] ??
                                                defaultMessageFieldValue(field)
                                              }
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
                              </MessageTemplates>
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
        {isMessageStudio && (
          <MessageOutput
            result={messageEncodeResult}
            locale={locale}
            disabled={busy || isDirty}
            onCopy={() => void copyMessageHex()}
            onExport={() => void exportSelectedMessage()}
            onDebug={openMessageInDebug}
            debugDisabled={debugBusy}
            onConnection={() => {
              if (!messageEncodeResult?.ok) return;
              setTcpDraft({
                id: Date.now(),
                hex: messageEncodeResult.normalizedHex,
                message: selectedMessageRequest() ?? undefined,
              });
              navigate("tcp");
            }}
            status={redact(messageActionStatus)}
            onStatus={setMessageActionStatus}
            dynamic={
              selectedMessageRequest()?.fields.some((field) => field.value.includes("{{")) ?? false
            }
          />
        )}
        {isProtocolCode && selectedProtocol && (
          <ProtocolProblems
            locale={locale}
            protocol={selectedProtocol}
            check={currentProtocolCheck}
            expanded={protocolProblemsOpen}
            onToggle={() => setProtocolProblemsOpen((open) => !open)}
            onJump={() => {
              if (currentProtocolCheck && !currentProtocolCheck.ok)
                jumpToProtocolLine(
                  protocolEditorRef.current,
                  currentProtocolCheck.error.line,
                  currentProtocolCheck.error.column,
                );
            }}
          />
        )}
        {isProjectOverview && (
          <ProjectFooter
            locale={locale}
            projects={recentProjects}
            busy={busy}
            problems={diagnostics
              .filter((item) => item.problem)
              .map((item) => ({ ...item, message: redact(item.message) }))}
            onOpen={(path) => {
              void run(() => openProject(path));
            }}
            onVisit={(id) => {
              const item = diagnostics.find((item) => item.id === id);
              if (item) {
                navigate(item.page);
                if (item.protocol) setSelectedProtocolPath(item.protocol);
              }
            }}
          />
        )}
      </div>
      {projectCreateOpen && (
        <ProjectCreateDialog
          workspaceError={errorMessage && redact(errorMessage)}
          locale={locale}
          busy={busy}
          initialParent={project?.rootPath.replace(/[\\/][^\\/]+$/, "") ?? ""}
          onCreate={(name, parent) => run(() => createProject(name, parent))}
          onClose={() => setProjectCreateOpen(false)}
        />
      )}
      {schemaEditTarget && selectedProtocol && (
        <SchemaEditor
          key={`${schemaEditTarget.action}:${schemaEditTarget.message?.name}:${schemaEditTarget.field?.name}`}
          target={schemaEditTarget}
          protocolPath={selectedProtocol.path}
          structureNames={(selectedProtocol.schema.structures ?? []).map((item) => item.name)}
          locale={locale}
          busy={busy}
          error={errorMessage && redact(errorMessage)}
          onSave={saveSchemaEdit}
          onClose={() => setSchemaEditTarget(null)}
        />
      )}
      <dialog
        ref={treeDialogRef}
        className={`protocol-dialog tree-dialog ${treeDialog?.action.endsWith("Actions") ? "tree-actions-dialog" : ""}`}
        aria-labelledby="tree-dialog-title"
        onCancel={(event) => {
          if (busy) event.preventDefault();
        }}
        onClose={() => setTreeDialog(null)}
      >
        {treeDialog && (
          <form
            key={`${treeDialog.action}:${treeDialog.path}`}
            onSubmit={(event) => void submitTreeDialog(event)}
          >
            <h2 id="tree-dialog-title">
              {
                {
                  project: translation.workspace.newProject,
                  renameProtocol: translation.workspace.renameProtocol,
                  deleteProtocol: translation.workspace.deleteProtocol,
                  projectActions: translation.workspace.projectActions,
                  folderActions: translation.workspace.folderActions,
                  protocolActions: translation.workspace.moreActions,
                  create: translation.workspace.newFolder,
                  delete: translation.workspace.deleteFolder,
                  move: translation.workspace.moveFolder,
                  rename: translation.workspace.renameFolder,
                  renameProject: translation.workspace.renameProject,
                  recent: translation.workspace.recentProjects,
                  removeProject: translation.workspace.removeProject,
                }[treeDialog.action]
              }
            </h2>
            <p className="tree-dialog-path">
              {treeDialog.action === "project"
                ? translation.workspace.projectRoot
                : treeDialog.action === "removeProject" || treeDialog.action === "renameProject"
                  ? project?.rootPath
                  : treeDialog.action === "recent"
                    ? translation.workspace.recentHint
                    : treeDialog.path}
            </p>
            {treeDialog.action.endsWith("Actions") ? (
              <div className="tree-dialog-actions">
                {(treeDialog.action === "projectActions"
                  ? ([
                      ["create", translation.workspace.newFolder, FolderPlus],
                      ["createProtocol", translation.workspace.createProtocol, FilePlus2],
                      ["renameProject", translation.workspace.renameProject, Pencil],
                      ["removeProject", translation.workspace.removeProject, Trash2],
                    ] as const)
                  : treeDialog.action === "folderActions"
                    ? ([
                        ["create", translation.workspace.newFolder, FolderPlus],
                        ["createProtocol", translation.workspace.createProtocol, FilePlus2],
                        ["rename", translation.workspace.renameFolder, Pencil],
                        ["move", translation.workspace.moveFolder, ArrowRight],
                        ["delete", translation.workspace.deleteFolder, Trash2],
                      ] as const)
                    : ([
                        ["renameProtocol", translation.workspace.renameProtocol, Pencil],
                        ["deleteProtocol", translation.workspace.deleteProtocol, Trash2],
                      ] as const)
                ).map(([action, label, Icon]) => (
                  <button
                    key={action}
                    type="button"
                    disabled={busy}
                    onClick={() => treeAction(action, treeDialog.path)}
                  >
                    <Icon size={15} />
                    {label}
                  </button>
                ))}
                {treeDialog.action === "projectActions" && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(closeProject).then((ok) => {
                        if (ok) setTreeDialog(null);
                      })
                    }
                  >
                    <X size={15} />
                    {translation.workspace.closeProject}
                  </button>
                )}
              </div>
            ) : treeDialog.action === "recent" ? (
              <div className="recent-projects">
                <div className="history-actions">
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={busy}
                    onClick={() => openTreeDialog("project")}
                  >
                    <FolderPlus size={15} />
                    {translation.workspace.newProject}
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    disabled
                    title={translation.workspace.importHint}
                  >
                    <Import size={15} />
                    {translation.workspace.importProject}
                  </button>
                </div>
                <p className="history-import-hint">{translation.workspace.importHint}</p>
                {recentProjects.length === 0 && <p>{translation.workspace.noRecentProjects}</p>}
                {recentProjects.map((recent) => (
                  <div className="recent-project" key={recent.rootPath}>
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={busy}
                      title={recent.rootPath}
                      onClick={() => {
                        if (isDirty) {
                          setErrorMessage(translation.structure.saveBlocked);
                          return;
                        }
                        void run(() => openProject(recent.rootPath)).then((ok) => {
                          if (ok) setTreeDialog(null);
                        });
                      }}
                    >
                      <strong>{recent.name}</strong>
                      <small>{recent.rootPath}</small>
                    </button>
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={busy}
                      aria-label={`${translation.workspace.forgetRecentProject}: ${recent.name}`}
                      title={translation.workspace.forgetRecentProject}
                      onClick={() =>
                        setRecentProjects((current) =>
                          current.filter((item) => item.rootPath !== recent.rootPath),
                        )
                      }
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <>
                {["project", "create", "rename", "renameProject", "renameProtocol"].includes(
                  treeDialog.action,
                ) && (
                  <label>
                    {["renameProject", "renameProtocol"].includes(treeDialog.action)
                      ? translation.create.displayName
                      : translation.workspace.folderName}
                    <input
                      autoFocus
                      name="name"
                      required
                      maxLength={100}
                      disabled={busy}
                      defaultValue={
                        treeDialog.action === "renameProtocol"
                          ? project?.protocols.find((item) => item.path === treeDialog.path)?.name
                          : treeDialog.action === "renameProject"
                            ? project?.name
                            : treeDialog.action === "rename"
                              ? treeDialog.path.split("/").at(-1)
                              : ""
                      }
                    />
                  </label>
                )}
                {treeDialog.action === "renameProject" && (
                  <p>{translation.workspace.renameProjectHint}</p>
                )}
                {treeDialog.action === "renameProtocol" && (
                  <p>{translation.workspace.renameProtocolHint}</p>
                )}
                {treeDialog.action === "deleteProtocol" && (
                  <>
                    <p>{translation.workspace.deleteProtocolsHint}</p>
                    <ul className="delete-targets">
                      <li>{treeDialog.path}</li>
                    </ul>
                  </>
                )}
                {treeDialog.action === "move" && (
                  <label>
                    {translation.workspace.targetFolder}
                    <select name="parent" disabled={busy} defaultValue="protocols">
                      <option value="protocols">{project?.name}</option>
                      {(project?.folders ?? [])
                        .filter(
                          (folder) =>
                            folder !== treeDialog.path && !folder.startsWith(`${treeDialog.path}/`),
                        )
                        .map((folder) => (
                          <option key={folder} value={folder}>
                            {folder}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
                {treeDialog.action === "delete" && <p>{translation.workspace.deleteFolderHint}</p>}
                {treeDialog.action === "removeProject" && (
                  <p>{translation.workspace.removeProjectHint}</p>
                )}
              </>
            )}
            {errorMessage && <p role="alert">{redact(errorMessage)}</p>}
            <footer>
              <button
                type="button"
                className="secondary-button"
                disabled={busy}
                onClick={() => setTreeDialog(null)}
              >
                {translation.create.cancel}
              </button>
              {treeDialog.action !== "recent" && !treeDialog.action.endsWith("Actions") && (
                <button className="primary-button" type="submit" disabled={busy}>
                  {["rename", "renameProject", "renameProtocol"].includes(treeDialog.action)
                    ? translation.editor.save
                    : treeDialog.action === "deleteProtocol"
                      ? translation.workspace.deleteProtocol
                      : treeDialog.action === "delete"
                        ? translation.workspace.deleteFolder
                        : treeDialog.action === "removeProject"
                          ? translation.workspace.removeProject
                          : treeDialog.action === "move"
                            ? translation.workspace.moveFolder
                            : translation.create.submit}
                </button>
              )}
            </footer>
          </form>
        )}
      </dialog>
      {createOpen && (
        <div className="modal-backdrop">
          <form aria-modal="true" className="protocol-dialog" onSubmit={submitCreate} role="dialog">
            <header>
              <div>
                <span>{translation.workspace.project}</span>
                <h2>{translation.create.title}</h2>
              </div>
              <button
                disabled={busy}
                aria-label={translation.create.cancel}
                onClick={() => setCreateOpen(false)}
                type="button"
              >
                <X size={16} />
              </button>
            </header>
            <label>
              {translation.create.name}
              <input
                name="name"
                placeholder="acme-telemetry"
                required
                maxLength={100}
                disabled={busy}
                autoFocus
              />
            </label>
            <label>
              {translation.create.byteOrder}
              <select defaultValue="big" name="byteOrder" disabled={busy}>
                <option value="big">Big Endian</option>
                <option value="little">Little Endian</option>
              </select>
            </label>
            <label>
              {translation.create.description}
              <textarea name="description" rows={3} disabled={busy} />
            </label>
            {errorMessage && <p role="alert">{redact(errorMessage)}</p>}
            <footer>
              <button disabled={busy} onClick={() => setCreateOpen(false)} type="button">
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
