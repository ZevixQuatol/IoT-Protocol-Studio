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

export type WorkspaceField = {
  name: string;
  displayName: string;
  type: string;
  offset: string;
  length: string | null;
  byteOrder: "big" | "little";
  byteOrderInherited: boolean;
  lengthOf: string | null;
  elementType: string | null;
  count: string | null;
};

export type WorkspaceMessage = {
  name: string;
  displayName: string;
  typeId: string | null;
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
    messages: WorkspaceMessage[];
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

export type MessageEncodeField = {
  name: string;
  value: string;
};

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
    iotpsCoreInfo?: () => Promise<CoreInfo>;
    iotpsInspectHex?: (input: string) => Promise<InspectionResult>;
    iotpsWindowAction?: (action: WindowAction) => Promise<{ ok: boolean }>;
    iotpsWorkspaceCurrent?: () => Promise<WorkspaceResult>;
    iotpsWorkspaceOpen?: () => Promise<WorkspaceResult>;
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
    iotpsEncodeProtocolMessage?: (
      relativePath: string,
      messageName: string,
      ...fieldArguments: string[]
    ) => Promise<MessageEncodeResult>;
    iotpsWorkspaceClose?: () => Promise<WorkspaceResult>;
  }
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

export async function openProject(): Promise<WorkspaceResult> {
  return window.iotpsWorkspaceOpen ? window.iotpsWorkspaceOpen() : nativeRequired();
}

export async function createProject(name: string): Promise<WorkspaceResult> {
  return window.iotpsWorkspaceCreate ? window.iotpsWorkspaceCreate(name) : nativeRequired();
}

export async function changeFolder(
  action: "create" | "delete" | "move",
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
