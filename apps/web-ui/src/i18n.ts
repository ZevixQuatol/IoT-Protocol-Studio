export type Locale = "zh-CN" | "en-US";
export type Theme = "dark" | "light";

export type TranslationMessages = {
  navigation: {
    title: string;
    back: string;
    forward: string;
    schema: string;
    debug: string;
    settings: string;
  };
  window: { minimize: string; maximize: string; close: string };
  workspace: {
    project: string;
    projectActions: string;
    resizeSidebar: string;
    loading: string;
    noProject: string;
    openProject: string;
    openHint: string;
    closeProject: string;
    newProject: string;
    newProjectHint: string;
    createProtocol: string;
    projectRoot: string;
    selectProtocol: string;
    selectProtocolHint: string;
    physicalFile: string;
  };
  create: {
    title: string;
    relativePath: string;
    relativePathHint: string;
    name: string;
    displayName: string;
    version: string;
    byteOrder: string;
    description: string;
    cancel: string;
    submit: string;
  };
  editor: {
    view: string;
    code: string;
    visual: string;
    message: string;
    save: string;
    saved: string;
    unsaved: string;
    editingHint: string;
  };
  structure: {
    schemaVersion: string;
    protocolVersion: string;
    defaultByteOrder: string;
    messages: string;
    fields: string;
    typeId: string;
    offset: string;
    length: string;
    byteOrder: string;
    inherited: string;
    lengthOf: string;
    properties: string;
    selectHint: string;
    name: string;
    displayName: string;
    type: string;
    elementType: string;
    count: string;
    empty: string;
    unsavedHint: string;
    saveBlocked: string;
  };
  messageStudio: {
    title: string;
    selectMessage: string;
    fieldValue: string;
    encode: string;
    encodedPreview: string;
    byteCount: string;
    ascii: string;
    derived: string;
    automatic: string;
    bytesHint: string;
    arrayHint: string;
    noMessage: string;
    unsavedHint: string;
    emptyPreview: string;
  };
  debug: {
    title: string;
    hint: string;
    inputLabel: string;
    inputPlaceholder: string;
    inputHint: string;
    shortcutHint: string;
    format: string;
    unformat: string;
    oddLengthHint: string;
    invalidCharacterHint: string;
    parse: string;
    parsing: string;
    result: string;
    resultHint: string;
    normalizedHex: string;
    summary: string;
    byteCount: string;
    ascii: string;
    sum8: string;
    xor8: string;
    crc16Modbus: string;
    bytes: string;
    byteOffset: string;
    characters: string;
    emptyInput: string;
    parseError: string;
    position: string;
    decimal: string;
    annotation: string;
    annotationHint: string;
    annotations: string;
    startOffset: string;
    endOffset: string;
    annotationLabel: string;
    annotationLabelPlaceholder: string;
    annotationColor: string;
    addAnnotation: string;
    removeAnnotation: string;
    annotationError: string;
    nativeCore: string;
    browserPreview: string;
  };
  settings: {
    title: string;
    description: string;
    theme: string;
    themeHint: string;
    darkTheme: string;
    lightTheme: string;
    language: string;
    languageHint: string;
    coreVersion: string;
    coreSource: string;
    nativeCore: string;
    browserPreview: string;
  };
};

const STORAGE_KEY = "iotps.locale";
const THEME_STORAGE_KEY = "iotps.theme";

export const messages: Record<Locale, TranslationMessages> = {
  "zh-CN": {
    navigation: {
      title: "主导航",
      back: "后退",
      forward: "前进",
      schema: "Schema",
      debug: "调试",
      settings: "设置",
    },
    window: { minimize: "最小化", maximize: "最大化或还原", close: "关闭" },
    workspace: {
      project: "项目",
      projectActions: "项目操作",
      resizeSidebar: "调整项目栏宽度",
      loading: "正在读取项目",
      noProject: "尚未打开项目",
      openProject: "打开项目",
      openHint: "选择包含 project.yaml 的目录。协议文件会由 C++ Workspace Core 校验。",
      closeProject: "关闭项目",
      newProject: "新建项目",
      newProjectHint: "项目创建向导尚未接入 Core。",
      createProtocol: "创建协议",
      projectRoot: "项目目录",
      selectProtocol: "请选择协议",
      selectProtocolHint: "从左侧真实目录树中选择一个协议文件。",
      physicalFile: "物理文件",
    },
    create: {
      title: "创建协议",
      relativePath: "协议相对路径",
      relativePathHint: "相对于 protocols/，可包含多级文件夹。",
      name: "协议名称",
      displayName: "显示名称",
      version: "版本",
      byteOrder: "默认字节序",
      description: "描述",
      cancel: "取消",
      submit: "创建",
    },
    editor: {
      view: "设计器视图",
      code: "代码",
      visual: "结构",
      message: "Message",
      save: "保存",
      saved: "已保存",
      unsaved: "未保存",
      editingHint: "保存前由 C++ Schema Loader 校验；校验失败不会覆盖原文件。",
    },
    structure: {
      schemaVersion: "Schema 版本",
      protocolVersion: "协议版本",
      defaultByteOrder: "默认字节序",
      messages: "消息",
      fields: "字段",
      typeId: "类型 ID",
      offset: "偏移",
      length: "长度",
      byteOrder: "字节序",
      inherited: "继承默认值",
      lengthOf: "长度目标",
      properties: "属性",
      selectHint: "选择 Message 或 Field 查看 Core 已解析的属性。",
      name: "名称",
      displayName: "显示名称",
      type: "类型",
      elementType: "元素类型",
      count: "数量",
      empty: "当前协议还没有 Message 定义。",
      unsavedHint: "结构视图显示最后一次成功保存并通过 Core 校验的 Schema。",
      saveBlocked: "请先保存或放弃 Code 视图中的修改。",
    },
    messageStudio: {
      title: "Message Studio",
      selectMessage: "选择 Message",
      fieldValue: "字段值",
      encode: "生成报文",
      encodedPreview: "Encode 预览",
      byteCount: "字节数",
      ascii: "ASCII",
      derived: "自动计算",
      automatic: "由 Core 根据 Schema 派生",
      bytesHint: "HEX 字节，以空格分隔",
      arrayHint: "数组元素，以逗号分隔",
      noMessage: "当前协议还没有可编码的 Message。",
      unsavedHint: "请先保存 Code 视图中的修改，再使用当前已校验的 Schema 编码。",
      emptyPreview: "填写字段值后生成规范化 HEX 报文。",
    },
    debug: {
      title: "HEX 调试",
      hint: "粘贴原始 HEX 数据，解析并查看规范化结果与校验值。",
      inputLabel: "原始 HEX",
      inputPlaceholder: "例如：AA 01 0F 7E",
      inputHint: "仅支持 HEX 文本，可使用空格分隔字节。",
      shortcutHint: "按 Ctrl/Cmd + Enter 解析",
      format: "格式化",
      unformat: "取消格式化",
      oddLengthHint: "HEX 字符数必须为偶数，两个字符组成一个字节。",
      invalidCharacterHint: "仅支持 0-9 和 A-F 的 HEX 字符。",
      parse: "解析 HEX",
      parsing: "正在解析",
      result: "解析结果",
      resultHint: "解析结果会显示在这里",
      normalizedHex: "规范化 HEX",
      byteCount: "字节数",
      ascii: "ASCII 预览",
      sum8: "SUM8",
      xor8: "XOR8",
      crc16Modbus: "CRC16/MODBUS",
      bytes: "字节明细",
      byteOffset: "偏移",
      characters: "字符",
      emptyInput: "等待输入 HEX",
      parseError: "HEX 解析失败",
      position: "位置",
      decimal: "十进制",
      summary: "解析摘要",
      annotation: "标注解析结果",
      annotationHint: "按偏移范围添加颜色标注",
      annotations: "已添加的标注",
      startOffset: "开始偏移",
      endOffset: "结束偏移",
      annotationLabel: "标注内容",
      annotationLabelPlaceholder: "例如：帧头",
      annotationColor: "颜色",
      addAnnotation: "添加标注",
      removeAnnotation: "移除标注",
      annotationError: "请输入有效范围和标注内容",
      nativeCore: "C++ Core",
      browserPreview: "浏览器预览",
    },
    settings: {
      title: "设置",
      description: "管理界面外观、语言和内核信息。",
      theme: "主题",
      themeHint: "选择适合当前工作环境的界面主题。",
      darkTheme: "暗色",
      lightTheme: "亮色",
      language: "界面语言",
      languageHint: "切换 Web UI 的中英文显示。",
      coreVersion: "内核版本",
      coreSource: "运行来源",
      nativeCore: "C++ Core",
      browserPreview: "浏览器预览",
    },
  },
  "en-US": {
    navigation: {
      title: "Primary navigation",
      back: "Back",
      forward: "Forward",
      schema: "Schema",
      debug: "Debug",
      settings: "Settings",
    },
    window: { minimize: "Minimize", maximize: "Maximize or restore", close: "Close" },
    workspace: {
      project: "PROJECT",
      projectActions: "Project actions",
      resizeSidebar: "Resize project sidebar",
      loading: "Loading project",
      noProject: "No project is open",
      openProject: "Open project",
      openHint:
        "Choose a directory containing project.yaml. Protocol files are validated by the C++ Workspace Core.",
      closeProject: "Close project",
      newProject: "New project",
      newProjectHint: "The project creation wizard is not connected to Core yet.",
      createProtocol: "Create protocol",
      projectRoot: "Project root",
      selectProtocol: "Select a protocol",
      selectProtocolHint: "Choose a protocol file from the physical tree on the left.",
      physicalFile: "Physical file",
    },
    create: {
      title: "Create protocol",
      relativePath: "Protocol relative path",
      relativePathHint: "Relative to protocols/; nested folders are supported.",
      name: "Protocol name",
      displayName: "Display name",
      version: "Version",
      byteOrder: "Default byte order",
      description: "Description",
      cancel: "Cancel",
      submit: "Create",
    },
    editor: {
      view: "Designer view",
      code: "Code",
      visual: "Structure",
      message: "Message",
      save: "Save",
      saved: "Saved",
      unsaved: "Unsaved",
      editingHint:
        "The C++ Schema Loader validates before save; invalid YAML never replaces the original file.",
    },
    structure: {
      schemaVersion: "Schema version",
      protocolVersion: "Protocol version",
      defaultByteOrder: "Default byte order",
      messages: "Messages",
      fields: "Fields",
      typeId: "Type ID",
      offset: "Offset",
      length: "Length",
      byteOrder: "Byte order",
      inherited: "Inherited default",
      lengthOf: "Length target",
      properties: "Properties",
      selectHint: "Select a Message or Field to inspect Core-parsed properties.",
      name: "Name",
      displayName: "Display name",
      type: "Type",
      elementType: "Element type",
      count: "Count",
      empty: "This protocol has no Message definitions yet.",
      unsavedHint: "Structure shows the last successfully saved and Core-validated Schema.",
      saveBlocked: "Save or discard the Code view changes first.",
    },
    messageStudio: {
      title: "Message Studio",
      selectMessage: "Select Message",
      fieldValue: "Field value",
      encode: "Encode message",
      encodedPreview: "Encode preview",
      byteCount: "Bytes",
      ascii: "ASCII",
      derived: "Derived",
      automatic: "Derived by Core from the Schema",
      bytesHint: "HEX bytes separated by spaces",
      arrayHint: "Array elements separated by commas",
      noMessage: "This protocol has no Message that can be encoded yet.",
      unsavedHint: "Save the Code view changes before encoding with the last validated Schema.",
      emptyPreview: "Enter field values and generate a normalized HEX frame.",
    },
    debug: {
      title: "HEX Debug",
      hint: "Paste raw HEX data to inspect its normalized form and checksums.",
      inputLabel: "Raw HEX",
      inputPlaceholder: "Example: AA 01 0F 7E",
      inputHint: "HEX text only; spaces may separate bytes.",
      shortcutHint: "Press Ctrl/Cmd + Enter to inspect",
      format: "Format",
      unformat: "Unformat",
      oddLengthHint: "HEX character count must be even; two characters form one byte.",
      invalidCharacterHint: "Only HEX characters 0-9 and A-F are supported.",
      parse: "Inspect HEX",
      parsing: "Inspecting",
      result: "Inspection result",
      resultHint: "The parsed result will appear here",
      normalizedHex: "Normalized HEX",
      byteCount: "Bytes",
      ascii: "ASCII preview",
      sum8: "SUM8",
      xor8: "XOR8",
      crc16Modbus: "CRC16/MODBUS",
      bytes: "Byte details",
      byteOffset: "Offset",
      characters: "characters",
      emptyInput: "Waiting for HEX input",
      parseError: "HEX inspection failed",
      position: "Position",
      decimal: "Decimal",
      summary: "Inspection summary",
      annotation: "Annotate result",
      annotationHint: "Add a color label for an offset range",
      annotations: "Added annotations",
      startOffset: "Start offset",
      endOffset: "End offset",
      annotationLabel: "Label",
      annotationLabelPlaceholder: "e.g. Frame header",
      annotationColor: "Color",
      addAnnotation: "Add annotation",
      removeAnnotation: "Remove annotation",
      annotationError: "Enter a valid range and label",
      nativeCore: "C++ Core",
      browserPreview: "Browser preview",
    },
    settings: {
      title: "Settings",
      description: "Manage the interface theme, language, and core information.",
      theme: "Theme",
      themeHint: "Choose the interface theme that fits your workspace.",
      darkTheme: "Dark",
      lightTheme: "Light",
      language: "Interface language",
      languageHint: "Switch the Web UI between Chinese and English.",
      coreVersion: "Core version",
      coreSource: "Runtime source",
      nativeCore: "C++ Core",
      browserPreview: "Browser preview",
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
    // Storage can be disabled; the system locale is enough for this session.
  }
  return window.navigator.language.toLowerCase().startsWith("zh") ? "zh-CN" : "en-US";
}

export function storeLocale(locale: Locale): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // The selected locale remains active for this session.
  }
}

export function detectInitialTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "dark" || stored === "light") {
      return stored;
    }
  } catch {
    // Storage can be disabled; keep the dark theme for this session.
  }
  return "dark";
}

export function storeTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // The selected theme remains active for this session.
  }
}

const chineseWorkspaceErrors: Record<string, string> = {
  native_host_required: "此操作需要 Windows 桌面客户端",
  project_not_open: "请先打开项目",
  invalid_request: "请求参数无效",
  invalid_byte_order: "默认字节序无效",
  directory_picker_failed: "无法打开项目目录选择器",
  project_directory_not_found: "项目目录不存在",
  project_manifest_open_failed: "无法打开 project.yaml",
  project_manifest_read_failed: "无法读取 project.yaml",
  yaml_parse_error: "YAML 语法错误",
  yaml_root_mapping_required: "YAML 根节点必须是映射",
  yaml_required_node_missing: "缺少必填 YAML 节点",
  yaml_node_type_mismatch: "YAML 节点类型不正确",
  schema_version_required: "缺少 Schema 版本",
  unsupported_schema_version: "不支持此 Schema 版本",
  project_name_required: "缺少项目名称",
  protocol_path_empty: "协议路径不能为空",
  protocol_path_not_portable: "协议路径不是跨平台路径",
  protocol_path_outside_project: "协议路径超出项目目录",
  duplicate_protocol_path: "协议路径已存在",
  protocol_file_load_failed: "无法加载协议文件",
  protocol_schema_invalid: "协议 Schema 无效",
  protocol_not_referenced: "协议未被 project.yaml 引用",
  protocol_message_not_found: "目标 Message 不存在",
  protocol_field_not_found: "目标 Field 不存在",
  protocol_file_already_exists: "协议文件已经存在",
  protocol_directory_create_failed: "无法创建协议目录",
  protocol_file_write_failed: "无法写入协议文件",
  project_manifest_write_failed: "无法写回 project.yaml",
  protocol_file_read_failed: "无法读取协议文件",
};

export function translateWorkspaceError(locale: Locale, code: string, fallback: string): string {
  return locale === "zh-CN"
    ? (chineseWorkspaceErrors[code] ?? `项目操作失败：${fallback}`)
    : fallback;
}
