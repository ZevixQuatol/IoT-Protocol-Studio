export type CoreInfo = {
  product: string;
  version: string;
  platform: string;
  architecture: string;
  source: "native-core" | "browser-preview";
};

export type InspectionSuccess = {
  ok: true;
  source: "native-core" | "browser-preview";
  normalizedHex: string;
  ascii: string;
  byteCount: number;
  bytes: number[];
  sum8: number;
  xor8: number;
  crc16Modbus: number;
};

export type InspectionFailure = {
  ok: false;
  source: "native-core" | "browser-preview";
  error: {
    code: string;
    message: string;
    position: number;
  };
};

export type InspectionResult = InspectionSuccess | InspectionFailure;

export type WindowAction = "drag" | "minimize" | "maximize" | "close";

export type TcpRecord = {
  id: number;
  time: number;
  direction: "TX" | "RX" | "FRAME" | "SYS";
  peer: number;
  address: string;
  hex: string;
  size: number;
  detail: string;
  parsed?: {
    protocolPath: string;
    messageName: string;
    status: "ok" | "error" | "unmatched";
    checksum: "none" | "pass" | "fail" | "";
    error: string;
    fields: DebugField[];
  };
};
export type TcpSnapshot = {
  ok: true;
  state: "closed" | "opening" | "open" | "faulted";
  server: boolean;
  host: string;
  port: number;
  error: string;
  sent: number;
  received: number;
  queued: number;
  dropped: number;
  retries: number;
  protocolPath: string;
  messageName: string;
  cursor: number;
  peers: { id: number; address: string }[];
  records: TcpRecord[];
};
type TcpResult =
  TcpSnapshot | { ok: true } | { ok: false; error: { code: string; message: string } };
export async function tcpCommand(
  session: string,
  action: string,
  ...args: string[]
): Promise<TcpResult> {
  return window.iotpsTcp
    ? window.iotpsTcp(session, action, ...args)
    : {
        ok: false,
        error: {
          code: "native_host_required",
          message: "TCP requires the desktop app / TCP 通信需要桌面客户端",
        },
      };
}

export type WorkspaceField = {
  name: string;
  displayName: string;
  type: string;
  offset: string;
  length: string | null;
  declaredOffset: string | null;
  declaredLength: string | null;
  byteOrder: "big" | "little";
  byteOrderInherited: boolean;
  lengthOf: string | null;
  elementType: string | null;
  count: string | null;
  enumValues?: { name: string; value: string }[];
  bits?: { name: string; displayName: string; offset: number; width: number }[];
  structRef?: string | null;
  whenField?: string | null;
  whenEquals?: string | null;
  countFrom?: string | null;
  maxCount?: string | null;
};

export type WorkspaceMessage = {
  name: string;
  displayName: string;
  typeId: string | null;
  checksumTarget: string | null;
  fields: WorkspaceField[];
};

export type WorkspaceProtocol = {
  name: string;
  path: string;
  content: string;
  schema: {
    version: string;
    protocolVersion: string;
    defaultByteOrder: "big" | "little";
    messageTypeField: string;
    messages: WorkspaceMessage[];
    structures?: WorkspaceMessage[];
  };
};

export type WorkspaceProject = {
  name: string;
  description: string;
  rootPath: string;
  folders: string[];
  protocols: WorkspaceProtocol[];
};

export type WorkspaceResult =
  | {
      ok: true;
      source: "native-workspace" | "browser-preview";
      cancelled: boolean;
      project: WorkspaceProject | null;
    }
  | {
      ok: false;
      source: "native-workspace" | "browser-preview";
      error: { code: string; message: string; path: string; line?: number; column?: number };
    };

export type ProtocolCreateRequest = {
  relativePath: string;
  name: string;
  displayName: string;
  version: string;
  description: string;
  byteOrder: "big" | "little";
};

export type FieldDisplayNameUpdateRequest = {
  relativePath: string;
  messageName: string;
  fieldName: string;
  displayName: string;
};

export type SchemaEditAction =
  | "addMessage"
  | "updateMessage"
  | "deleteMessage"
  | "addField"
  | "updateField"
  | "deleteField"
  | "moveFieldUp"
  | "moveFieldDown"
  | "addStructure"
  | "updateStructure"
  | "deleteStructure"
  | "addStructureField"
  | "updateStructureField"
  | "deleteStructureField"
  | "moveStructureFieldUp"
  | "moveStructureFieldDown";
export type SchemaEditRequest = {
  relativePath: string;
  action: SchemaEditAction;
  messageName: string;
  fieldName: string;
  properties: Record<string, string>;
};

export type MessageEncodeField = {
  name: string;
  value: string;
};

export type MessageTemplate = { name: string; compatible: boolean; fields: MessageEncodeField[] };
export type TemplateAction = "list" | "load" | "save" | "replace" | "delete";
export type MessageTemplateResult =
  | { ok: true; templates: MessageTemplate[] }
  | { ok: false; error: { code: string; message: string; path: string } };

export async function messageTemplates(
  action: TemplateAction,
  path: string,
  message: string,
  name = "",
  fields: MessageEncodeField[] = [],
): Promise<MessageTemplateResult> {
  return window.iotpsMessageTemplates
    ? window.iotpsMessageTemplates(
        action,
        path,
        message,
        name,
        ...fields.flatMap((field) => [field.name, field.value]),
      )
    : {
        ok: false,
        error: {
          code: "native_host_required",
          message: "Open the desktop app to use project templates.",
          path: "",
        },
      };
}

export type EnvironmentVariable = {
  name: string;
  type: "string" | "number" | "boolean";
  defaultValue: string;
  required: boolean;
};
export type EnvironmentConfig = {
  active: string;
  environments: { name: string; variables: EnvironmentVariable[] }[];
};
export type EnvironmentResult =
  | { ok: true; config: EnvironmentConfig }
  | { ok: false; error: { code: string; message: string; path: string } };

export async function environments(config?: EnvironmentConfig): Promise<EnvironmentResult> {
  return window.iotpsEnvironments
    ? window.iotpsEnvironments(
        ...(config
          ? [
              "save",
              config.active,
              String(config.environments.length),
              ...config.environments.flatMap((environment) => [
                environment.name,
                String(environment.variables.length),
                ...environment.variables.flatMap((variable) => [
                  variable.name,
                  variable.type,
                  variable.defaultValue,
                  String(variable.required),
                ]),
              ]),
            ]
          : ["load"]),
      )
    : {
        ok: false,
        error: {
          code: "native_host_required",
          message: "Open the desktop app to manage environments.",
          path: "",
        },
      };
}

export type MessageEncodeRequest = {
  relativePath: string;
  messageName: string;
  fields: MessageEncodeField[];
};

export type MessageEncodeResult =
  | {
      ok: true;
      source: "native-core" | "browser-preview";
      normalizedHex: string;
      ascii: string;
      byteCount: number;
    }
  | {
      ok: false;
      source: "native-core" | "browser-preview";
      error: {
        code: string;
        message: string;
        path: string;
        offset?: number;
      };
    };

declare global {
  interface Window {
    iotpsTcp?: (session: string, action: string, ...args: string[]) => Promise<TcpResult>;
    iotpsWorkspaceProtocols?: (action: string, ...args: string[]) => Promise<WorkspaceResult>;
    iotpsMessageTemplates?: (
      action: string,
      path: string,
      message: string,
      name: string,
      ...fields: string[]
    ) => Promise<MessageTemplateResult>;
    iotpsEnvironments?: (...args: string[]) => Promise<EnvironmentResult>;
    iotpsDebugTool?: (operation: string, ...args: string[]) => Promise<DebugToolResult>;
    iotpsDebugDecode?: (
      protocol: string,
      message: string,
      hex: string,
    ) => Promise<DebugDecodeResult>;
    iotpsDebugFile?: (action: string, content: string) => Promise<DebugFileResult>;
    iotpsTrafficFile?: (action: string, content: string) => Promise<DebugFileResult>;
    iotpsLogFile?: (action: string, content: string) => Promise<DebugFileResult>;
    iotpsCoreInfo?: () => Promise<CoreInfo>;
    iotpsInspectHex?: (input: string) => Promise<InspectionResult>;
    iotpsWindowAction?: (action: WindowAction) => Promise<{ ok: boolean }>;
    iotpsWorkspaceCurrent?: () => Promise<WorkspaceResult>;
    iotpsWorkspaceOpen?: (path?: string) => Promise<WorkspaceResult>;
    iotpsWorkspaceRename?: (name: string) => Promise<WorkspaceResult>;
    iotpsWorkspaceCreate?: (name: string) => Promise<WorkspaceResult>;
    iotpsWorkspaceChangeFolder?: (
      action: string,
      path: string,
      targetParent: string,
      before: string,
    ) => Promise<WorkspaceResult>;
    iotpsWorkspaceCreateProtocol?: (
      relativePath: string,
      name: string,
      displayName: string,
      version: string,
      description: string,
      byteOrder: "big" | "little",
    ) => Promise<WorkspaceResult>;
    iotpsWorkspaceSaveProtocol?: (
      relativePath: string,
      content: string,
    ) => Promise<WorkspaceResult>;
    iotpsWorkspaceUpdateFieldDisplayName?: (
      relativePath: string,
      messageName: string,
      fieldName: string,
      displayName: string,
    ) => Promise<WorkspaceResult>;
    iotpsWorkspaceEditSchema?: (
      path: string,
      action: string,
      message: string,
      field: string,
      ...properties: string[]
    ) => Promise<WorkspaceResult>;
    iotpsEncodeProtocolMessage?: (
      relativePath: string,
      messageName: string,
      ...fieldArguments: string[]
    ) => Promise<MessageEncodeResult>;
    iotpsWorkspaceClose?: () => Promise<WorkspaceResult>;
  }
}

type DebugFailure = {
  ok: false;
  error: { code: string; message: string; path?: string; offset?: number };
};
export type DebugField = {
  name: string;
  displayName: string;
  type: string;
  value: string;
  offset: number;
  length: number;
  enumName?: string;
  bits?: {
    name: string;
    displayName: string;
    value: string;
    offset: number;
    length: number;
    bitOffset: number;
    width: number;
  }[];
};
export type DebugToolResult =
  { ok: true; text: string; hex: string; matches: number[] } | DebugFailure;
export type DebugDecodeResult =
  | { ok: true; fields: DebugField[]; ranges?: { path: string; offset: number; length: number }[] }
  | DebugFailure;
export type DebugFileResult = { ok: true; cancelled: boolean; content: string } | DebugFailure;
const debugNativeRequired: DebugFailure = {
  ok: false,
  error: { code: "native_host_required", message: "This action requires the Windows desktop host" },
};
export async function debugTool(operation: string, ...args: string[]): Promise<DebugToolResult> {
  return window.iotpsDebugTool ? window.iotpsDebugTool(operation, ...args) : debugNativeRequired;
}
export async function debugDecode(
  protocol: string,
  message: string,
  hex: string,
): Promise<DebugDecodeResult> {
  return window.iotpsDebugDecode
    ? window.iotpsDebugDecode(protocol, message, hex)
    : debugNativeRequired;
}
export async function debugFile(action: string, content = ""): Promise<DebugFileResult> {
  return window.iotpsDebugFile ? window.iotpsDebugFile(action, content) : debugNativeRequired;
}
export async function trafficFile(action: string, content = ""): Promise<DebugFileResult> {
  return window.iotpsTrafficFile ? window.iotpsTrafficFile(action, content) : debugNativeRequired;
}
export async function logFile(content: string): Promise<DebugFileResult> {
  return window.iotpsLogFile ? window.iotpsLogFile("save", content) : debugNativeRequired;
}

const browserWorkspace: WorkspaceResult = {
  ok: true,
  source: "browser-preview",
  cancelled: false,
  project: null,
};

const nativeRequired = (): WorkspaceResult => ({
  ok: false,
  source: "browser-preview",
  error: {
    code: "native_host_required",
    message: "This action requires the Windows desktop host",
    path: "",
  },
});

const separators = /[\s,:_-]/g;

function crc16Modbus(bytes: number[]): number {
  let crc = 0xffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) !== 0 ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
    }
  }
  return crc & 0xffff;
}

function inspectInBrowser(input: string): InspectionResult {
  const compact = input.replace(/0x/gi, "").replace(separators, "");
  if (compact.length === 0) {
    return {
      ok: false,
      source: "browser-preview",
      error: { code: "empty_input", message: "Hexadecimal input is empty", position: 0 },
    };
  }
  if (/[^0-9a-f]/i.test(compact)) {
    const position = compact.search(/[^0-9a-f]/i);
    return {
      ok: false,
      source: "browser-preview",
      error: { code: "invalid_character", message: "Invalid hexadecimal character", position },
    };
  }
  if (compact.length % 2 !== 0) {
    return {
      ok: false,
      source: "browser-preview",
      error: {
        code: "incomplete_byte",
        message: "A hexadecimal byte must contain two digits",
        position: compact.length - 1,
      },
    };
  }

  const bytes = Array.from({ length: compact.length / 2 }, (_, index) =>
    Number.parseInt(compact.slice(index * 2, index * 2 + 2), 16),
  );
  const normalizedHex = bytes
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join(" ")
    .toUpperCase();
  const ascii = bytes
    .map((byte) => (byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : "."))
    .join("");

  return {
    ok: true,
    source: "browser-preview",
    normalizedHex,
    ascii,
    byteCount: bytes.length,
    bytes,
    sum8: bytes.reduce((sum, byte) => (sum + byte) & 0xff, 0),
    xor8: bytes.reduce((value, byte) => value ^ byte, 0),
    crc16Modbus: crc16Modbus(bytes),
  };
}

export async function getCoreInfo(): Promise<CoreInfo> {
  if (window.iotpsCoreInfo) {
    return window.iotpsCoreInfo();
  }
  return {
    product: "IoT Protocol Studio",
    version: "0.1.0",
    platform: "Web preview",
    architecture: "browser",
    source: "browser-preview",
  };
}

export async function inspectHex(input: string): Promise<InspectionResult> {
  if (window.iotpsInspectHex) {
    return window.iotpsInspectHex(input);
  }
  return inspectInBrowser(input);
}

export async function performWindowAction(action: WindowAction): Promise<void> {
  await window.iotpsWindowAction?.(action);
}

export async function getCurrentProject(): Promise<WorkspaceResult> {
  return window.iotpsWorkspaceCurrent ? window.iotpsWorkspaceCurrent() : browserWorkspace;
}

export async function openProject(path = ""): Promise<WorkspaceResult> {
  return window.iotpsWorkspaceOpen ? window.iotpsWorkspaceOpen(path) : nativeRequired();
}

export async function renameProject(name: string): Promise<WorkspaceResult> {
  return window.iotpsWorkspaceRename ? window.iotpsWorkspaceRename(name) : nativeRequired();
}

export async function changeProtocols(
  action: "rename" | "delete",
  ...args: string[]
): Promise<WorkspaceResult> {
  return window.iotpsWorkspaceProtocols
    ? window.iotpsWorkspaceProtocols(action, ...args)
    : nativeRequired();
}

export async function editSchema(request: SchemaEditRequest): Promise<WorkspaceResult> {
  return window.iotpsWorkspaceEditSchema
    ? window.iotpsWorkspaceEditSchema(
        request.relativePath,
        request.action,
        request.messageName,
        request.fieldName,
        ...Object.entries(request.properties).flat(),
      )
    : nativeRequired();
}

export async function createProject(name: string): Promise<WorkspaceResult> {
  return window.iotpsWorkspaceCreate ? window.iotpsWorkspaceCreate(name) : nativeRequired();
}

export async function changeFolder(
  action: "create" | "delete" | "move" | "rename",
  path: string,
  targetParent = "protocols",
  before = "",
): Promise<WorkspaceResult> {
  return window.iotpsWorkspaceChangeFolder
    ? window.iotpsWorkspaceChangeFolder(action, path, targetParent, before)
    : nativeRequired();
}

export async function createProtocol(request: ProtocolCreateRequest): Promise<WorkspaceResult> {
  return window.iotpsWorkspaceCreateProtocol
    ? window.iotpsWorkspaceCreateProtocol(
        request.relativePath,
        request.name,
        request.displayName,
        request.version,
        request.description,
        request.byteOrder,
      )
    : nativeRequired();
}

export async function saveProtocol(
  relativePath: string,
  content: string,
): Promise<WorkspaceResult> {
  return window.iotpsWorkspaceSaveProtocol
    ? window.iotpsWorkspaceSaveProtocol(relativePath, content)
    : nativeRequired();
}

export async function updateFieldDisplayName(
  request: FieldDisplayNameUpdateRequest,
): Promise<WorkspaceResult> {
  return window.iotpsWorkspaceUpdateFieldDisplayName
    ? window.iotpsWorkspaceUpdateFieldDisplayName(
        request.relativePath,
        request.messageName,
        request.fieldName,
        request.displayName,
      )
    : nativeRequired();
}

export async function encodeProtocolMessage(
  request: MessageEncodeRequest,
): Promise<MessageEncodeResult> {
  if (!window.iotpsEncodeProtocolMessage) {
    return {
      ok: false,
      source: "browser-preview",
      error: {
        code: "native_host_required",
        message: "Message encoding requires the Windows desktop host",
        path: request.messageName,
      },
    };
  }
  const fieldArguments = request.fields.flatMap((field) => [field.name, field.value]);
  return window.iotpsEncodeProtocolMessage(
    request.relativePath,
    request.messageName,
    ...fieldArguments,
  );
}

export async function closeProject(): Promise<WorkspaceResult> {
  return window.iotpsWorkspaceClose ? window.iotpsWorkspaceClose() : browserWorkspace;
}
