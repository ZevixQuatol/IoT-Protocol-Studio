export type Locale = "zh-CN" | "en-US";

export type TranslationMessages = {
  navigation: { title: string; back: string; forward: string; schema: string; settings: string };
  window: { minimize: string; maximize: string; close: string };
  workspace: {
    project: string;
    collapseSidebar: string;
    expandSidebar: string;
    loading: string;
    noProject: string;
    openProject: string;
    openHint: string;
    closeProject: string;
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
  };
  settings: { title: string; language: string; languageHint: string };
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
    window: { minimize: "最小化", maximize: "最大化或还原", close: "关闭" },
    workspace: {
      project: "项目",
      collapseSidebar: "收起项目列表",
      expandSidebar: "展开项目列表",
      loading: "正在读取项目",
      noProject: "尚未打开项目",
      openProject: "打开项目",
      openHint: "选择包含 project.yaml 的目录。协议文件会由 C++ Workspace Core 校验。",
      closeProject: "关闭项目",
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
    },
    settings: {
      title: "设置",
      language: "界面语言",
      languageHint: "切换 Web UI 的中英文显示。",
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
    window: { minimize: "Minimize", maximize: "Maximize or restore", close: "Close" },
    workspace: {
      project: "PROJECT",
      collapseSidebar: "Collapse project list",
      expandSidebar: "Expand project list",
      loading: "Loading project",
      noProject: "No project is open",
      openProject: "Open project",
      openHint:
        "Choose a directory containing project.yaml. Protocol files are validated by the C++ Workspace Core.",
      closeProject: "Close project",
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
    },
    settings: {
      title: "Settings",
      language: "Interface language",
      languageHint: "Switch the Web UI between Chinese and English.",
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
