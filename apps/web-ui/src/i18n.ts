export type Locale = "zh-CN" | "en-US";
export type Theme = "dark" | "light";

export type TranslationMessages = {
  navigation: {
    title: string;
    back: string;
    forward: string;
    schema: string;
    debug: string;
    environments: string;
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
    createProtocol: string;
    projectRoot: string;
    selectProtocol: string;
    selectProtocolHint: string;
    physicalFile: string;
    newFolder: string;
    deleteFolder: string;
    moveFolder: string;
    renameFolder: string;
    renameProject: string;
    renameProjectHint: string;
    recentProjects: string;
    recentHint: string;
    noRecentProjects: string;
    forgetRecentProject: string;
    clearRecentProjects: string;
    folderActions: string;
    folderName: string;
    invalidName: string;
    targetFolder: string;
    removeProject: string;
    removeProjectHint: string;
    deleteFolderHint: string;
    renameProtocol: string;
    deleteProtocol: string;
    moreActions: string;
    selectAll: string;
    deleteSelected: string;
    renameProtocolHint: string;
    deleteProtocolsHint: string;
    importProject: string;
    importHint: string;
    dropAtRoot: string;
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
    addMessage: string;
    editMessage: string;
    deleteMessage: string;
    addField: string;
    editField: string;
    deleteField: string;
    moveUp: string;
    moveDown: string;
    deleteHint: string;
    editHint: string;
    optional: string;
    automaticLayout: string;
    naturalLength: string;
    none: string;
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
    templates: string;
    templateName: string;
    saveTemplate: string;
    loadTemplate: string;
    replaceTemplate: string;
    deleteTemplate: string;
    chooseTemplate: string;
    templateSaved: string;
    templateLoaded: string;
    templateDeleted: string;
    templateHint: string;
    incompatible: string;
    templateConflict: string;
    confirmTemplate: string;
    copyHex: string;
    copied: string;
    toDebug: string;
    toDebugHint: string;
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
    shortcutHint: string;
    format: string;
    unformat: string;
    oddLengthHint: string;
    invalidCharacterHint: string;
    parse: string;
    parsing: string;
    result: string;
    normalizedHex: string;
    byteCount: string;
    ascii: string;
    bytes: string;
    byteOffset: string;
    byte: string;
    description: string;
    characters: string;
    emptyInput: string;
    parseError: string;
    position: string;
    decimal: string;
    annotation: string;
    startOffset: string;
    endOffset: string;
    annotationLabel: string;
    annotationLabelPlaceholder: string;
    annotationColor: string;
    addAnnotation: string;
    removeAnnotation: string;
    annotationError: string;
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
      schema: "协议工作区",
      debug: "调试",
      environments: "环境与变量",
      settings: "设置",
    },
    window: { minimize: "最小化", maximize: "最大化或还原", close: "关闭" },
    workspace: {
      project: "项目",
      projectActions: "项目操作",
      renameProtocol: "重命名协议",
      deleteProtocol: "删除协议",
      moreActions: "更多操作",
      selectAll: "全选",
      deleteSelected: "删除所选",
      renameProtocolHint: "仅修改显示名称，文件路径和模板关联保持不变。",
      deleteProtocolsHint: "将删除以下协议文件并更新项目清单，请确认所选内容。",
      importProject: "导入项目",
      importHint: "导入入口预留，导入功能开放后，项目将自动加入此列表。",

      resizeSidebar: "调整项目栏宽度",
      loading: "正在读取项目",
      noProject: "尚未打开项目",
      openProject: "打开项目",
      openHint: "选择包含 project.yaml 的目录。协议文件会由 C++ Workspace Core 校验。",
      closeProject: "关闭项目",
      newProject: "新建项目",
      createProtocol: "创建协议",
      projectRoot: "项目目录",
      selectProtocol: "请选择协议",
      selectProtocolHint: "从左侧真实目录树中选择一个协议文件。",
      physicalFile: "物理文件",
      newFolder: "新建文件夹",
      deleteFolder: "删除文件夹",
      moveFolder: "移动文件夹",
      renameFolder: "重命名文件夹",
      renameProject: "重命名项目",
      renameProjectHint: "修改项目显示名称，项目标识和磁盘目录保持原值。",
      recentProjects: "打开项目",
      recentHint: "保留最近打开的 10 个项目；移除记录不会删除磁盘文件。",
      noRecentProjects: "暂无最近项目。",
      forgetRecentProject: "移除最近记录",
      clearRecentProjects: "清空最近记录",
      folderActions: "文件夹操作",
      folderName: "名称",
      invalidName: "请输入有效名称，不可包含路径分隔符或以句点结尾。",
      targetFolder: "目标文件夹",
      removeProject: "移除项目",
      removeProjectHint: "关闭项目并从历史列表移除，磁盘文件将保留。",
      deleteFolderHint: "仅可删除空文件夹，请先清理文件夹中的所有内容。",
      dropAtRoot: "拖到这里移至项目根级；拖到文件夹上下边缘排序，中间移入。",
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
      message: "报文",
      save: "保存",
      saved: "已保存",
      unsaved: "未保存",
      editingHint: "保存前由 C++ Schema Loader 校验；校验失败不会覆盖原文件。",
    },
    structure: {
      addMessage: "新增消息",
      editMessage: "编辑消息",
      deleteMessage: "删除消息",
      addField: "新增字段",
      editField: "编辑字段",
      deleteField: "删除字段",
      moveUp: "上移",
      moveDown: "下移",
      deleteHint: "确认删除所选内容？保存后立即生效：",
      editHint:
        "保存后更新协议文件。字段偏移留空时连续排列；被长度字段引用的字段需先解除引用才能删除。",
      optional: "可选",
      automaticLayout: "自动排列",
      naturalLength: "类型默认长度",
      none: "无",
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
      selectHint: "选择消息或字段查看已解析的属性。",
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
      templates: "报文模板",
      templateName: "模板名称",
      saveTemplate: "保存为新模板",
      loadTemplate: "加载模板",
      replaceTemplate: "覆盖模板",
      deleteTemplate: "删除模板",
      chooseTemplate: "选择当前消息的模板",
      templateSaved: "模板已保存到项目",
      templateLoaded: "模板已加载，请重新生成报文",
      templateDeleted: "模板已删除",
      templateHint: "模板保存当前字段输入，可保留草稿；加载后由生成报文操作校验数值。",
      incompatible: "字段定义已变化，请保存新模板",
      templateConflict: "名称已存在，请更换名称或使用覆盖模板",
      confirmTemplate: "确认执行此操作？",
      copyHex: "复制 HEX",
      copied: "HEX 已复制",
      toDebug: "在调试页打开",
      toDebugHint: "将替换调试页当前报文并清除已有结果和标注。",
      title: "Message Studio",
      selectMessage: "选择消息",
      fieldValue: "字段值",
      encode: "生成报文",
      encodedPreview: "Encode 预览",
      byteCount: "字节数",
      ascii: "ASCII",
      derived: "自动计算",
      automatic: "由 Core 根据 Schema 派生",
      bytesHint: "HEX 字节，以空格分隔",
      arrayHint: "数组元素，以逗号分隔",
      noMessage: "当前协议还没有可编码的消息。",
      unsavedHint: "请先保存 Code 视图中的修改，再使用当前已校验的 Schema 编码。",
      emptyPreview: "填写字段值后生成规范化 HEX 报文。",
    },
    debug: {
      title: "HEX 调试",
      hint: "粘贴原始 HEX 数据，解析并查看规范化结果与校验值。",
      inputLabel: "原始 HEX",
      inputPlaceholder: "例如：AA 01 0F 7E",
      shortcutHint: "按 Ctrl/Cmd + Enter 解析",
      format: "格式化",
      unformat: "取消格式化",
      oddLengthHint: "HEX 字符数必须为偶数，两个字符组成一个字节。",
      invalidCharacterHint: "仅支持 0-9 和 A-F 的 HEX 字符。",
      parse: "解析",
      parsing: "正在解析",
      result: "解析结果",
      normalizedHex: "规范化 HEX",
      byteCount: "字节数",
      ascii: "ASCII 预览",
      bytes: "字节明细",
      byteOffset: "偏移",
      byte: "字节",
      description: "描述",
      characters: "字符",
      emptyInput: "等待输入 HEX",
      parseError: "HEX 解析失败",
      position: "位置",
      decimal: "十进制",
      annotation: "标注解析结果",
      startOffset: "开始偏移",
      endOffset: "结束偏移",
      annotationLabel: "标注内容",
      annotationLabelPlaceholder: "例如：帧头",
      annotationColor: "颜色",
      addAnnotation: "添加标注",
      removeAnnotation: "移除标注",
      annotationError: "请输入有效范围和标注内容",
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
      environments: "Environments",
      settings: "Settings",
    },
    window: { minimize: "Minimize", maximize: "Maximize or restore", close: "Close" },
    workspace: {
      project: "PROJECT",
      projectActions: "Project actions",
      renameProtocol: "Rename protocol",
      deleteProtocol: "Delete protocol",
      moreActions: "More actions",
      selectAll: "Select all",
      deleteSelected: "Delete selected",
      renameProtocolHint: "Change the display name; keep the file path and template associations.",
      deleteProtocolsHint:
        "Delete the following protocol files and update the project manifest. Review your selection.",
      importProject: "Import project",
      importHint: "Import is coming later. Imported projects will appear in this list.",

      resizeSidebar: "Resize project sidebar",
      loading: "Loading project",
      noProject: "No project is open",
      openProject: "Open project",
      openHint:
        "Choose a directory containing project.yaml. Protocol files are validated by the C++ Workspace Core.",
      closeProject: "Close project",
      newProject: "New project",
      createProtocol: "Create protocol",
      projectRoot: "Project root",
      selectProtocol: "Select a protocol",
      selectProtocolHint: "Choose a protocol file from the physical tree on the left.",
      physicalFile: "Physical file",
      newFolder: "New folder",
      deleteFolder: "Delete folder",
      moveFolder: "Move folder",
      renameFolder: "Rename folder",
      renameProject: "Rename project",
      renameProjectHint: "Change the display name. The project ID and directory stay the same.",
      recentProjects: "Open project",
      recentHint: "The last 10 projects opened. Removing an entry keeps its files on disk.",
      noRecentProjects: "No recent projects yet.",
      forgetRecentProject: "Remove recent entry",
      clearRecentProjects: "Clear recent entries",
      folderActions: "Folder actions",
      folderName: "Name",
      invalidName: "Enter a valid name without path separators or a trailing period.",
      targetFolder: "Target folder",
      removeProject: "Remove project",
      removeProjectHint: "Close this project and remove it from history; keep its files on disk.",
      deleteFolderHint: "Only empty folders can be deleted. Clear all contents first.",
      dropAtRoot:
        "Drop here to move to the project root; drop on folder edges to reorder or the center to move inside.",
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
      addMessage: "Add message",
      editMessage: "Edit message",
      deleteMessage: "Delete message",
      addField: "Add field",
      editField: "Edit field",
      deleteField: "Delete field",
      moveUp: "Move up",
      moveDown: "Move down",
      deleteHint: "Delete the selected content? This change is saved immediately:",
      editHint:
        "Saving updates the protocol file. Leave offset blank for sequential layout. Remove length references before deleting their target field.",
      optional: "Optional",
      automaticLayout: "Sequential",
      naturalLength: "Type default",
      none: "None",
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
      templates: "Message templates",
      templateName: "Template name",
      saveTemplate: "Save new template",
      loadTemplate: "Load template",
      replaceTemplate: "Replace template",
      deleteTemplate: "Delete template",
      chooseTemplate: "Choose a template for this message",
      templateSaved: "Template saved in project",
      templateLoaded: "Template loaded; encode to refresh the preview",
      templateDeleted: "Template deleted",
      templateHint:
        "Templates save current field inputs, including drafts. Encode validates values after loading.",
      incompatible: "Field definitions changed; save a new template",
      templateConflict: "Name already exists; use another name or Replace template",
      confirmTemplate: "Confirm this operation?",
      copyHex: "Copy HEX",
      copied: "HEX copied",
      toDebug: "Open in Debug",
      toDebugHint: "This replaces the current Debug input and clears its results and annotations.",
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
      shortcutHint: "Press Ctrl/Cmd + Enter to inspect",
      format: "Format",
      unformat: "Unformat",
      oddLengthHint: "HEX character count must be even; two characters form one byte.",
      invalidCharacterHint: "Only HEX characters 0-9 and A-F are supported.",
      parse: "Inspect",
      parsing: "Inspecting",
      result: "Inspection result",
      normalizedHex: "Normalized HEX",
      byteCount: "Bytes",
      ascii: "ASCII preview",
      bytes: "Byte details",
      byteOffset: "Offset",
      byte: "Byte",
      description: "Description",
      characters: "characters",
      emptyInput: "Waiting for HEX input",
      parseError: "HEX inspection failed",
      position: "Position",
      decimal: "Decimal",
      annotation: "Annotate result",
      startOffset: "Start offset",
      endOffset: "End offset",
      annotationLabel: "Label",
      annotationLabelPlaceholder: "e.g. Frame header",
      annotationColor: "Color",
      addAnnotation: "Add annotation",
      removeAnnotation: "Remove annotation",
      annotationError: "Enter a valid range and label",
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
    // Storage can be disabled; keep the default light theme for this session.
  }
  return "light";
}

export function storeTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // The selected theme remains active for this session.
  }
}

const chineseWorkspaceErrors: Record<string, string> = {
  invalid_folder_path: "文件夹路径无效：不允许越界、链接目录或移动到自身及其子目录",
  folder_not_empty: "文件夹中还有内容，请清理后再删除",
  workspace_operation_failed: "文件操作失败，请检查重名、目录权限或文件是否被占用",
  native_host_required: "此操作需要 Windows 桌面客户端",
  project_not_open: "请先打开项目",
  invalid_request: "请求参数无效",
  invalid_byte_order: "默认字节序无效",
  directory_picker_failed: "无法打开项目目录选择器",
  project_directory_not_found: "项目目录不存在",
  invalid_project_directory: "保存位置必须是已存在的绝对目录路径",
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
