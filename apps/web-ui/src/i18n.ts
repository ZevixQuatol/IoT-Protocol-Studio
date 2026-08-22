export type Locale = "zh-CN" | "en-US";

export type TranslationMessages = {
  language: {
    selector: string;
    chinese: string;
    english: string;
    switchToChinese: string;
    switchToEnglish: string;
  };
  status: {
    connecting: string;
    coreSession: string;
    ready: string;
    connected: string;
    nativeCpp: string;
    browserPreview: string;
    windows: string;
    browser: string;
  };
  actions: {
    reset: string;
    inspect: string;
  };
  explorer: {
    title: string;
    project: string;
    messages: string;
    connections: string;
    tests: string;
    core: string;
  };
  editor: {
    hexInspector: string;
    rawFrame: string;
    telemetrySample: string;
    unparsed: string;
    inputLabel: string;
    offset: string;
    hex: string;
    decimal: string;
    ascii: string;
    bytes: (count: number) => string;
  };
  inspector: {
    title: string;
    frameValid: string;
    awaitingInspection: string;
    corePipeline: string;
    length: string;
  };
  console: {
    console: string;
    timeline: string;
    problems: string;
    levels: Record<"info" | "success" | "error", string>;
  };
  errors: {
    emptyInput: string;
    invalidCharacter: string;
    incompleteByte: string;
    invalidRequest: string;
    bridgeError: string;
    unknown: string;
    offset: (position: number) => string;
  };
  logs: {
    workbenchInitialized: string;
    coreConnected: (version: string, source: string) => string;
    coreConnectionFailed: (detail?: string) => string;
    inspectionSucceeded: (byteCount: number, source: string) => string;
    inspectionFailed: (message: string, code: string, position: number) => string;
  };
};

const STORAGE_KEY = "iotps.locale";

export const messages: Record<Locale, TranslationMessages> = {
  "zh-CN": {
    language: {
      selector: "界面语言",
      chinese: "中文",
      english: "EN",
      switchToChinese: "切换为中文",
      switchToEnglish: "Switch to English",
    },
    status: {
      connecting: "正在连接",
      coreSession: "Core 会话",
      ready: "就绪",
      connected: "已连接",
      nativeCpp: "原生 C++",
      browserPreview: "浏览器预览",
      windows: "Windows",
      browser: "浏览器",
    },
    actions: {
      reset: "重置",
      inspect: "解析",
    },
    explorer: {
      title: "资源管理器",
      project: "智能传感器",
      messages: "报文",
      connections: "连接",
      tests: "测试",
      core: "核心",
    },
    editor: {
      hexInspector: "HEX 检查器",
      rawFrame: "原始报文",
      telemetrySample: "遥测报文示例",
      unparsed: "未解析",
      inputLabel: "十六进制报文输入",
      offset: "偏移",
      hex: "HEX",
      decimal: "十进制",
      ascii: "ASCII",
      bytes: (count) => `${count} 字节`,
    },
    inspector: {
      title: "检查器",
      frameValid: "报文有效",
      awaitingInspection: "等待解析",
      corePipeline: "Core 处理链路",
      length: "长度",
    },
    console: {
      console: "控制台",
      timeline: "时间线",
      problems: "问题",
      levels: {
        info: "信息",
        success: "成功",
        error: "错误",
      },
    },
    errors: {
      emptyInput: "HEX 输入不能为空",
      invalidCharacter: "HEX 输入包含非法字符",
      incompleteByte: "HEX 字节必须由两个十六进制字符组成",
      invalidRequest: "解析请求格式无效",
      bridgeError: "客户端桥接调用失败",
      unknown: "解析失败",
      offset: (position) => `偏移 ${position}`,
    },
    logs: {
      workbenchInitialized: "工作台已初始化",
      coreConnected: (version, source) => `Core ${version} 已通过${source}连接`,
      coreConnectionFailed: (detail) => `Core 连接失败${detail ? `：${detail}` : ""}`,
      inspectionSucceeded: (byteCount, source) => `已通过${source}解析 ${byteCount} 字节`,
      inspectionFailed: (message, code, position) => `${message}（${code}，偏移 ${position}）`,
    },
  },
  "en-US": {
    language: {
      selector: "Interface language",
      chinese: "中文",
      english: "EN",
      switchToChinese: "切换为中文",
      switchToEnglish: "Switch to English",
    },
    status: {
      connecting: "Connecting",
      coreSession: "Core session",
      ready: "Ready",
      connected: "Connected",
      nativeCpp: "Native C++",
      browserPreview: "Browser preview",
      windows: "Windows",
      browser: "Browser",
    },
    actions: {
      reset: "Reset",
      inspect: "Inspect",
    },
    explorer: {
      title: "EXPLORER",
      project: "SMART SENSOR",
      messages: "Messages",
      connections: "Connections",
      tests: "Tests",
      core: "CORE",
    },
    editor: {
      hexInspector: "HEX Inspector",
      rawFrame: "RAW FRAME",
      telemetrySample: "Telemetry sample",
      unparsed: "Unparsed",
      inputLabel: "Hexadecimal frame input",
      offset: "OFFSET",
      hex: "HEX",
      decimal: "DECIMAL",
      ascii: "ASCII",
      bytes: (count) => `${count} ${count === 1 ? "byte" : "bytes"}`,
    },
    inspector: {
      title: "INSPECTOR",
      frameValid: "Frame valid",
      awaitingInspection: "Awaiting inspection",
      corePipeline: "Core pipeline",
      length: "Length",
    },
    console: {
      console: "Console",
      timeline: "Timeline",
      problems: "Problems",
      levels: {
        info: "INFO",
        success: "SUCCESS",
        error: "ERROR",
      },
    },
    errors: {
      emptyInput: "Hexadecimal input is empty",
      invalidCharacter: "Invalid hexadecimal character",
      incompleteByte: "A hexadecimal byte must contain two digits",
      invalidRequest: "The inspection request is invalid",
      bridgeError: "The client bridge call failed",
      unknown: "Inspection failed",
      offset: (position) => `offset ${position}`,
    },
    logs: {
      workbenchInitialized: "Workbench initialized",
      coreConnected: (version, source) => `Core ${version} connected via ${source}`,
      coreConnectionFailed: (detail) => `Core connection failed${detail ? `: ${detail}` : ""}`,
      inspectionSucceeded: (byteCount, source) =>
        `Inspected ${byteCount} ${byteCount === 1 ? "byte" : "bytes"} with ${source}`,
      inspectionFailed: (message, code, position) => `${message} (${code} at offset ${position})`,
    },
  },
};

export function detectInitialLocale(): Locale {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "zh-CN" || stored === "en-US") {
      return stored;
    }
  } catch {
    // Browsers can disable storage. Locale detection still works without persistence.
  }

  return window.navigator.language.toLowerCase().startsWith("zh") ? "zh-CN" : "en-US";
}

export function storeLocale(locale: Locale): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // The selected locale remains valid for the current session when storage is unavailable.
  }
}

export function translateError(
  translation: TranslationMessages,
  code: string,
  fallback?: string,
): string {
  const knownErrors: Record<string, string> = {
    empty_input: translation.errors.emptyInput,
    invalid_character: translation.errors.invalidCharacter,
    incomplete_byte: translation.errors.incompleteByte,
    invalid_request: translation.errors.invalidRequest,
    bridge_error: translation.errors.bridgeError,
  };

  return knownErrors[code] ?? fallback ?? translation.errors.unknown;
}
