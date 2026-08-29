export type Locale = "zh-CN" | "en-US";

export type TranslationMessages = {
  navigation: {
    title: string;
    back: string;
    forward: string;
    schema: string;
    settings: string;
  };
  window: {
    minimize: string;
    maximize: string;
    close: string;
  };
  workspace: {
    schemas: string;
    collapseSidebar: string;
    expandSidebar: string;
    collapseTree: string;
    expandTree: string;
    loading: string;
    empty: string;
    unavailable: string;
    cacheRoot: string;
    noSelection: string;
    selectProtocol: string;
    selectProtocolHint: string;
    physicalFile: string;
  };
  settings: {
    title: string;
    empty: string;
    cacheHint: string;
  };
};

const STORAGE_KEY = "iotps.locale";

export const messages: Record<Locale, TranslationMessages> = {
  "zh-CN": {
    navigation: {
      title: "主导航",
      back: "后退",
      forward: "前进",
      schema: "Schema",
      settings: "设置",
    },
    window: {
      minimize: "最小化",
      maximize: "最大化或还原",
      close: "关闭",
    },
    workspace: {
      schemas: "SCHEMAS",
      collapseSidebar: "收起 Schema 列表",
      expandSidebar: "展开 Schema 列表",
      collapseTree: "收起 Schema",
      expandTree: "展开 Schema",
      loading: "正在加载磁盘结构",
      empty: "尚无 Schema",
      unavailable: "不可用",
      cacheRoot: "缓存目录",
      noSelection: "Schema",
      selectProtocol: "请选择协议",
      selectProtocolHint: "从左侧磁盘树中选择一个协议文件查看内容。",
      physicalFile: "物理文件",
    },
    settings: {
      title: "设置",
      empty: "设置内容将在后续补充。",
      cacheHint: "后续将在此管理 Schema 缓存文件的存放位置。",
    },
  },
  "en-US": {
    navigation: {
      title: "Primary navigation",
      back: "Back",
      forward: "Forward",
      schema: "Schema",
      settings: "Settings",
    },
    window: {
      minimize: "Minimize",
      maximize: "Maximize or restore",
      close: "Close",
    },
    workspace: {
      schemas: "SCHEMAS",
      collapseSidebar: "Collapse Schema list",
      expandSidebar: "Expand Schema list",
      collapseTree: "Collapse Schema",
      expandTree: "Expand Schema",
      loading: "Loading physical workspace",
      empty: "No schemas yet",
      unavailable: "Unavailable",
      cacheRoot: "Cache root",
      noSelection: "Schema",
      selectProtocol: "Select a protocol",
      selectProtocolHint: "Choose a protocol file from the physical tree on the left.",
      physicalFile: "Physical file",
    },
    settings: {
      title: "Settings",
      empty: "Settings will be added in a future update.",
      cacheHint: "The Schema cache location will be managed here later.",
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
    // Storage can be disabled; system locale remains enough for this session.
  }

  return window.navigator.language.toLowerCase().startsWith("zh") ? "zh-CN" : "en-US";
}

export function storeLocale(locale: Locale): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // The selected locale remains valid for this session.
  }
}
