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

export type WorkspaceProtocol = {
  name: string;
  path: string;
  content: string;
};

export type WorkspaceSchema = {
  id: string;
  name: string;
  description: string;
  protocols: WorkspaceProtocol[];
};

export type WorkspaceCatalog =
  | {
      ok: true;
      source: "native-workspace" | "browser-preview";
      cacheRoot: string;
      schemas: WorkspaceSchema[];
    }
  | {
      ok: false;
      source: "native-workspace";
      error: { message: string };
    };

declare global {
  interface Window {
    iotpsCoreInfo?: () => Promise<CoreInfo>;
    iotpsInspectHex?: (input: string) => Promise<InspectionResult>;
    iotpsWindowAction?: (action: WindowAction) => Promise<{ ok: boolean }>;
    iotpsWorkspaceCatalog?: () => Promise<WorkspaceCatalog>;
  }
}

const browserWorkspace: WorkspaceCatalog = {
  ok: true,
  source: "browser-preview",
  cacheRoot: "Browser preview / schemas",
  schemas: [
    {
      id: "smart-sensor",
      name: "智能传感器",
      description: "环境传感器与 Modbus 网关协议",
      protocols: [
        {
          name: "环境传感器",
          path: "protocols/sensors/environment/environment-sensor.protocol.yaml",
          content: `schemaVersion: "0.1"
protocol:
  name: environment-sensor
  displayName: 环境传感器
  version: "1.0"
  defaultByteOrder: little
messages:
  telemetry:
    typeId: 1
    fields:
      - name: temperature
        type: int16
      - name: humidity
        type: uint16
`,
        },
        {
          name: "Modbus 网关",
          path: "protocols/gateways/modbus/modbus-gateway.protocol.yaml",
          content: `schemaVersion: "0.1"
protocol:
  name: modbus-gateway
  displayName: Modbus 网关
  version: "1.0"
  defaultByteOrder: big
messages:
  status:
    typeId: 2
    fields:
      - name: address
        type: uint8
      - name: online
        type: bool
`,
        },
      ],
    },
  ],
};

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

export async function getWorkspaceCatalog(): Promise<WorkspaceCatalog> {
  return window.iotpsWorkspaceCatalog ? window.iotpsWorkspaceCatalog() : browserWorkspace;
}
