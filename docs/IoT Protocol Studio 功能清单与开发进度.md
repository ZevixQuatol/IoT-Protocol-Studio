# IoT Protocol Studio 功能清单与开发进度

> 清单版本：1.0  
> 更新日期：2026-08-28
> 功能基线：`IoT Protocol Studio 功能设计文档.md` v0.1  
> 当前程序版本：0.1.0  
> 当前目标平台：Windows x86_64  
> 用途：项目唯一功能树、进度看板和下一步开发入口

相关文档：[功能设计基线](<./IoT Protocol Studio 功能设计文档.md>) · [Protocol Schema v0.1](<./Protocol Schema v0.1.md>) · [固定 Field 布局](<./固定 Field 布局.md>) · [固定长度 String 与 Bytes](<./固定长度 String 与 Bytes.md>) · [Length Field](<./Length Field.md>) · [固定长度 Array](<./固定长度 Array.md>) · [Primitive Decode](<./Primitive Decode.md>) · [Primitive Encode](<./Primitive Encode.md>) · [Core 模块架构](<./Core 模块架构.md>) · [开发环境与构建](./开发环境与构建.md)

---

## 1. 如何使用这份清单

### 1.1 状态标记

| 标记 | 含义 | 判定规则 |
|---|---|---|
| `[x]` | 已完成 | 已有可运行实现，并且至少有自动测试或人工运行证据 |
| `[ ] 🚧` | 下一步 | 当前推荐最先实施的功能点 |
| `[ ] 🟡` | 部分完成 | 只有骨架、原型、部分算法或 UI 占位，尚未达到功能验收条件 |
| `[ ]` | 待开始 | 尚无有效实现 |
| `[ ] 🔒` | 后续阶段 | 已纳入产品范围，但不属于当前 MVP 优先级 |
| `[ ] ⛔` | 非产品范围 | 明确不属于 IoT Protocol Studio 核心边界 |

### 1.2 阶段标记

| 阶段 | 目标 |
|---|---|
| `M0` | 工程、Core、Web UI、Windows Host 的可运行基础 |
| `MVP` | 协议定义、编解码、组包、通信、收发解析的最小完整闭环 |
| `P2` | MQTT/WebSocket、高级模拟、脚本、捕获回放、测试套件 |
| `P3` | 压力测试、完整 CLI/CI、代码生成、文档生成、插件系统 |
| `Later` | AI 协议助手、未知协议推测及其他远期能力 |

### 1.3 维护规则

1. 任何功能开发完成后，都必须同步更新本清单。
2. UI 中出现按钮、标签或静态示例，不代表功能完成。
3. 只有 Core、Host、Web UI、CLI 和测试形成可验证链路后，才能标记 `[x]`。
4. 部分完成的父功能保持 `[ ] 🟡`，其下已完成的独立功能点可以标记 `[x]`。
5. 如果功能范围变化，先修改功能设计文档，再同步本清单。

---

## 2. 当前开发坐标

### 2.1 一眼看懂现在做到哪里

```mermaid
flowchart LR
    A["✅ M0：工程与 Windows 客户端基础"] --> B["✅ Core 五模块分层"]
    B --> C["✅ Protocol Schema v0.1 YAML 加载"]
    C --> D["✅ 固定长度 Primitive Decode"]
    D --> E["✅ 固定长度 Primitive Encode"]
    E --> F["✅ Field length / offset"]
    F --> G["✅ 固定长度 string / bytes"]
    G --> H["✅ 最小 Length Field"]
    H --> I["✅ 固定长度 Array"]
    I --> J["🚧 下一步：project.yaml + 最小项目目录"]
    J --> K["⬜ 新建 / 打开项目 + Protocol Designer"]
    K --> L["⬜ Message Studio + 真实 Transport + Debugger"]
    L --> M["⬜ 完整 Simulator + Test Runner"]
    M --> N["⬜ MVP 验收"]
```

### 2.2 当前结论

当前已经完成的是一个可运行的技术纵向切片：

```text
输入 HEX
  → React Web UI
  → Windows WebView Host Bridge
  → C++ Core
  → HEX 规范化 / ASCII / SUM8 / XOR8 / CRC16-MODBUS
  → Web UI 展示结果
```

当前还没有形成产品 MVP，因为以下关键链路尚未实现：

```text
Protocol Schema
  → 按字段 Decode
  → 修改结构化字段
  → Encode
  → 自动 Length / CRC
  → TCP / UDP / Serial 发送
  → 接收响应
  → 自动解析 / Timeline
```

Core 内部已经新增一条不依赖 GUI 的最小架构链路：

```text
Schema 领域模型
  → 固定长度 Primitive / UTF-8 string / bytes / Array Encode / Decode
  → Length Field Decode 校验 / Encode 自动回填
  → Simulator
  → Transport API 测试边界
```

Schema 纵向链路也已经打通：YAML 文件可以映射为领域模型，错误可以定位到文件、字段路径和源码行列，并可通过 `iotps schema validate <file>` 自动验证。完整 Codec 和真实 Transport 仍未完成。

### 2.3 已经可以使用的能力

- [x] 启动 Windows x86_64 桌面客户端。
- [x] 在中文和英文界面之间切换，并记住语言选择。
- [x] 输入带空格、逗号、冒号、横线、下划线或 `0x` 前缀的 HEX。
- [x] 查看规范化 HEX、字节偏移、十进制值和 ASCII 预览。
- [x] 计算 SUM8、XOR8 和 CRC16/MODBUS。
- [x] 查看空输入、非法字符和不完整字节错误。
- [x] 通过 CLI 执行 `iotps version`、`iotps inspect` 和 `iotps schema validate <file>`。
- [x] 通过真实 WebView2 烟雾测试验证 React 渲染和原生 Core Bridge。
- [x] 分别构建 Schema、Codec、Transport、Simulator、Testing 静态库目标。
- [x] 在 Core 中校验最小 Schema 领域对象，并完成 `uint8` 固定布局 Encode/Decode round-trip。
- [x] 通过测试验证 Simulator → Codec → Transport 发送链路和 Testing 基础断言。
- [x] 通过 `format` / `format-check` 统一检查 C++ 与 Web UI 代码格式。
- [x] Core API 统一使用 `Result<Value, ErrorType>`、`Status<ErrorType>` 和 `Error<Code>`。
- [x] 加载 Protocol Schema v0.1 YAML，映射为稳定领域模型并报告文件、路径和源码位置。
- [x] 使用 SmartSensor 示例与合法/非法向量复现 Schema 加载和校验结果。
- [x] 按 Schema 解码固定长度 bool、8/16/32/64 位整数和 float32/float64。
- [x] 应用 Protocol 默认字节序和 Field `endian` 覆盖，并返回字段字节范围。
- [x] 通过 Schema YAML、HEX 和 expected 三文件 golden vector 验证 Primitive Decode。
- [x] 将结构化 bool、整数和浮点字段按 Schema 重新编码为稳定 ByteBuffer。
- [x] 校验缺失、重复、额外字段、ScalarValue 类型和 Primitive 表示范围。
- [x] 通过 golden HEX 验证 Primitive Encode 和 Decode/Encode 双向 round-trip。
- [x] 从 YAML 映射 Field `length`/`offset`，并校验零长度、宽度冲突、重叠和溢出。
- [x] Decode/Encode 共用固定布局计划；Decode 跳过 gap，Encode 使用 `0x00` padding。
- [x] 通过含非连续字段的 golden vector 验证 FieldRange、字节序和双向 round-trip。
- [x] Decode/Encode 固定长度 UTF-8 `string`，短值右侧零填充，拒绝非法编码、内嵌 NUL、超长输入和非零终止后数据。
- [x] Decode/Encode 固定长度 `bytes`，保留内部零字节并严格校验输入长度。
- [x] 通过固定文本 golden vector 验证 YAML、UTF-8、bytes、gap、FieldRange 和双向 round-trip。
- [x] 从 YAML 映射单字段 `lengthOf`，校验无符号类型、目标、自引用和依赖循环。
- [x] Decode 校验 Length 声明值，Encode 按目标 wire 长度自动回填并支持前置/后置 Length Field。
- [x] 通过 Length Field golden vector 验证 Little Endian、gap 排除、FieldRange 和双向 round-trip。
- [x] 从 YAML 映射固定 Primitive Array 的 `elementType` 和固定 `count`，并校验非法组合与长度溢出。
- [x] Decode/Encode 固定 Primitive Array，严格校验元素数量、类型和表示范围。
- [x] 返回 Array 整体 `FieldRange` 和 `message.field[index]` 逐元素范围。
- [x] 通过固定 Array golden vector 验证字节序、显式 offset、`lengthOf` 自动回填和双向 round-trip。

### 2.4 当前界面中尚未实现的占位功能

- [ ] Explorer 中的 `device.yaml` 还不能打开、编辑或保存。
- [ ] Messages、Connections、Tests 节点只是静态占位。
- [ ] Timeline、Problems 标签只是静态占位。
- [ ] 当前 HEX 表格不是协议字段解析结果，只是逐字节展示。
- [ ] 当前“解析”不是 Protocol Schema Decode。
- [ ] 当前没有项目、连接、发送、接收、模拟器或测试执行能力。

---

## 3. 接下来应该做什么

### 3.1 当前唯一首要任务：`project.yaml` + 最小项目目录结构

固定长度 Array 已完成：Schema 支持固定宽度 Primitive `elementType` 和固定 `count`；Codec 支持逐元素字节序、Decode/Encode、数组整体/元素范围、边界诊断和 `lengthOf` 组合。动态 Array、Struct 和嵌套容器仍留在后续动态 Schema 阶段。

下一个工作包进入 **M01-F02 项目目录和持久化**，先建立 Workspace 的 Core 基础：

- 定义最小 `project.yaml` 版本、项目标识、显示名称和协议文件引用契约。
- 定义普通文本项目的最小目录结构，第一阶段只创建真正需要的目录。
- 建立跨平台项目路径模型，不让 Win32 类型进入 Core。
- 加载并校验 `project.yaml`，返回稳定错误码、路径和源码位置。
- 为后续“新建项目 / 打开项目”提供无 GUI 的 Core API 和测试资产。
- 暂不实现最近项目、Explorer 全部文件操作、未保存提示或外部文件监听。

Workspace 基础第一阶段的完成标准：

```text
给定普通目录 + project.yaml
  → Core 识别并加载项目清单
  → 校验项目版本、标识和协议文件引用
  → 创建最小文本目录结构
  → 非法或缺失文件返回稳定诊断
  → Windows 路径测试通过且 Core API 保持跨平台
```

### 3.2 Schema 之后的执行顺序

1. **Primitive Decode**：固定长度基础类型和字节序，返回字段值与字节范围。✅
2. **Primitive Encode**：结构化字段值重新编码为字节流，建立 Decode/Encode round-trip。✅
3. **固定布局边界**：Field `length`/`offset`、重叠诊断和 padding。✅
4. **固定字符串和 bytes**：编码、固定长度、填充、截断和 FieldRange。✅
5. **Length Field**：单字段引用、Decode 校验、Encode 自动计算和依赖诊断。✅
6. **固定 Array**：固定宽度 Primitive 元素、固定 count、逐元素范围和 round-trip。✅
7. **Workspace**：先定义 `project.yaml` 和最小项目目录，再实现创建、打开、保存普通目录项目。
8. **Protocol Designer**：Schema 源码与可视化字段编辑器双向同步。
9. **Message Studio**：结构化表单组包、自动 Length/CRC 和报文模板。
10. **Transport 抽象 + TCP Client**：建立第一条真实收发链路。
11. **Debugger + Timeline**：统一展示 TX/RX、Raw HEX 和解析字段。
12. **Serial / TCP Server / UDP**：补齐 MVP Transport。
13. **动态 Schema 结构**：Count/Length 驱动 Array、Struct、Enum、BitField、Condition 和 Checksum Range。
14. **Basic Simulator + Basic Test Case**：完成无设备开发和自动验证。

---

## 4. 模块进度总览

| 模块 | 当前状态 | 阶段 | 当前说明 |
|---|---|---|---|
| M00 工程与平台基础 | 🟡 部分完成 | M0 | 模块分层、格式化、统一 Result/Error 和 Windows 基线可运行；静态分析、安装发布和其他平台未完成 |
| M01 Workspace 工作空间 | 🚧 下一步 | MVP | 只有静态 Explorer UI；下一步定义 `project.yaml` 和最小普通文本项目目录结构 |
| M02 Protocol Designer / Schema | 🟡 部分完成 | MVP | Protocol Schema v0.1 YAML、固定 Primitive/string/bytes/Array、Field `length`/`offset` 和最小 `lengthOf` 已完成；可视化设计器与动态结构未实现 |
| M03 Codec 编解码 | 🟡 部分完成 | MVP | 固定 Primitive/string/bytes/Array、最小 Length Field、非连续布局、padding、字节序和 round-trip 已完成；动态 Array、Struct/Condition 和 Checksum 尚未实现 |
| M04 HEX Studio | 🟡 部分完成 | MVP | 已完成基础 HEX 检查和三种校验计算 |
| M05 Transport 通信层 | 🟡 API 已建立 | MVP/P2 | 统一字节、生命周期、状态、事件和统计接口已建立；没有真实连接实现 |
| M06 Debugger / Timeline | ⬜ 待开始 | MVP | 只有 Console/Timeline 静态布局 |
| M07 Message Studio | ⬜ 待开始 | MVP | 尚无报文模板、表单组包和发送 |
| M08 Device Simulator | 🟡 骨架已建立 | MVP/P2 | 有最小配置、生命周期和 Codec→Transport 发送链路；没有行为 DSL 和 GUI |
| M09 Testing 测试中心 | 🟡 骨架已建立 | MVP/P2 | 有 Test Case/Step/Report 模型和基础断言；没有步骤执行器和 Test Suite |
| M10 Load Testing | 🔒 后续阶段 | P3 | 尚未开始 |
| M11 Capture / Replay / PCAP | 🔒 后续阶段 | P2 | 尚未开始 |
| M12 Script / Custom Codec | 🔒 后续阶段 | P2 | 尚未开始 |
| M13 Data Generator | ⬜ 待开始 | MVP/P2 | 尚未开始 |
| M14 Protocol Documentation | 🔒 后续阶段 | P3 | 尚未开始 |
| M15 Code Generator | 🔒 后续阶段 | P3 | 尚未开始 |
| M16 Plugin System | 🔒 后续阶段 | P3 | 尚未开始 |
| M17 系统与通用体验 | 🟡 部分完成 | M0/MVP | 中英双语、窗口和基础错误展示已完成 |
| M18 CLI / Automation / CI | 🟡 部分完成 | M0/P3 | 已有 `version`、原始 HEX `inspect` 和 Schema 文件校验；JSON/stdin/批量能力未完成 |
| M19 AI Protocol Assistant | 🔒 远期能力 | Later | 尚未开始，且只作为辅助能力 |

---

# 5. 完整功能树

## M00 工程与平台基础

### M00-F01 项目与目录基础

- [x] 建立 `core/`、`apps/`、`test/`、`docs/` 顶层结构。
- [x] 建立本地 Git 仓库和 `main` 分支。
- [x] 配置 GitHub `origin` 并让 `main` 跟踪 `origin/main`。
- [x] 建立根 CMake 工程。
- [x] 建立 Windows x86_64 CMake Configure/Build/Test Preset。
- [x] 将 Core、CLI、Windows Host、Web UI 和测试纳入构建。
- [x] 增加统一代码格式化配置。
- [ ] 增加静态分析配置。
- [ ] 增加可选 Sanitizer Preset。
- [ ] 增加 Linux/macOS 构建 Preset。
- [ ] 建立版本发布和 Changelog 规则。

### M00-F02 可移植 C++ Core 基础

- [x] Core 使用 C++20。
- [x] Core 公共头文件不依赖 Win32/WebView/React/JSON。
- [x] Core 可以构建为静态库。
- [x] Core 提供稳定错误码和结构化结果。
- [x] 建立 Core 模块分层：Schema、Codec、Transport API、Simulator、Testing。
- [x] 建立统一 Result/Error 类型。
- [ ] 建立可注入 Trace/Event Sink。
- [ ] 建立公共 API 兼容与版本策略。

### M00-F03 Web UI 基础

- [x] 建立 React + TypeScript + Vite 工程。
- [x] 建立 Explorer / Editor / Inspector / Console 工作台布局。
- [x] 支持独立浏览器预览。
- [x] 支持生产静态资源构建。
- [x] 支持中文/英文界面切换。
- [x] 首次运行按系统语言选择界面语言。
- [x] 使用 `localStorage` 保存语言选择。
- [ ] 建立正式的路由、状态管理和模块页面结构。
- [ ] 建立通用组件库和设计 Token。
- [ ] 建立 Web UI 单元测试和组件测试。
- [ ] 建立键盘导航和无障碍验收基线。

### M00-F04 Windows Desktop Host

- [x] 建立 Windows x86_64 原生 Host。
- [x] 使用 WebView2 承载共享 Web UI。
- [x] 支持 `IOTPS_WEB_UI_URL` 加载 Vite 开发服务器。
- [x] 使用受限虚拟 HTTPS 主机加载发布静态资源。
- [x] 处理 Web UI 资源缺失提示。
- [x] 暴露平台、架构和 Core 版本信息。
- [x] 暴露原生 HEX 检查 Bridge。
- [x] 建立真实 WebView UI 烟雾测试。
- [ ] 设计通用的命令/事件 Bridge，而不是继续添加零散全局函数。
- [ ] 增加 Bridge 请求 ID、错误结构、取消和超时机制。
- [ ] 增加 Host 日志和诊断文件。
- [ ] 增加单实例、文件关联和启动参数处理。
- [ ] 增加原生文件/目录选择器。
- [ ] 增加安装包、卸载、签名和升级流程。
- [ ] 明确 WebView2 Evergreen 或 Fixed Version 发布策略。

### M00-F05 工程测试基础

- [x] HEX 解析单元测试。
- [x] Checksum/CRC 单元测试。
- [x] 通用 Result/Error 单元测试。
- [x] Engine 测试向量集成测试。
- [x] Windows WebView UI 烟雾测试。
- [x] 可选 libFuzzer 入口。
- [ ] 建立测试覆盖率报告。
- [ ] 建立跨配置 Debug/Release 自动验证脚本。
- [ ] 建立前端交互测试。
- [ ] 建立安装产物启动测试。

---

## M01 Workspace 工作空间

### M01-F01 项目生命周期

- [ ] 新建项目。
- [ ] 打开项目。
- [ ] 关闭项目。
- [ ] 最近项目列表。
- [ ] 项目复制。
- [ ] 项目搜索。
- [ ] 导入项目。
- [ ] 导出项目。
- [ ] 项目压缩归档。
- [ ] 项目模板。

### M01-F02 项目目录和持久化

- [ ] 🚧 定义 `project.yaml`，并建立最小普通文本项目目录结构。
- [ ] 创建 `protocols/` 目录。
- [ ] 创建 `messages/` 目录。
- [ ] 创建 `connections/` 目录。
- [ ] 创建 `environments/` 目录。
- [ ] 创建 `simulators/` 目录。
- [ ] 创建 `tests/` 目录。
- [ ] 创建 `scripts/` 目录。
- [ ] 创建 `captures/` 目录。
- [ ] 创建项目内 `docs/` 目录。
- [ ] 使用普通文本文件保存全部项目数据。
- [ ] 支持外部编辑器修改后的文件刷新。
- [ ] 支持未保存修改提示。
- [ ] 支持项目文件 Git 管理，不生成不必要的二进制状态文件。

### M01-F03 Explorer

- [ ] 🟡 当前静态项目树布局。
- [ ] 按项目内容动态生成树。
- [ ] 新建/重命名/删除项目资源。
- [ ] 双击打开编辑器。
- [ ] 资源上下文菜单。
- [ ] 文件变更状态和错误标记。
- [ ] 拖放和排序。

### M01-F04 Environment 环境

- [ ] 新建、编辑、复制和删除环境。
- [ ] Development/Production 等环境一键切换。
- [ ] 环境变量值覆盖。
- [ ] 当前激活环境展示。
- [ ] 环境导入/导出。
- [ ] 环境变更对 Message/Connection/Simulator 实时生效。

### M01-F05 Variables 变量系统

- [ ] 支持 `{{name}}` 引用语法。
- [ ] Global 作用域。
- [ ] Workspace 作用域。
- [ ] Project 作用域。
- [ ] Environment 作用域。
- [ ] Simulator 作用域。
- [ ] Session 作用域。
- [ ] Message 作用域。
- [ ] 定义作用域覆盖优先级。
- [ ] 变量预览和来源追踪。
- [ ] 未定义变量诊断。
- [ ] Secret Variable 脱敏和安全存储。

### M01-F06 工作区配置

- [ ] 保存面板布局和打开的编辑器。
- [ ] 保存最近连接和运行配置。
- [ ] 工作区级编码、字节序和显示偏好。
- [ ] 工作区级搜索索引。
- [ ] 工作区配置迁移和版本兼容。

---

## M02 Protocol Designer / Protocol Schema

### M02-F01 Protocol Schema v0.1

- [x] 定义 Schema 版本字段。
- [x] 定义 Protocol 元数据：名称、显示名、版本、描述、默认字节序。
- [x] 定义 Message 元数据和唯一标识。
- [x] 定义 Field 领域模型。
- [x] 定义 Checksum 领域模型。
- [x] 确定 YAML 解析依赖：Rapid YAML `v0.16.0`，固定 URL 和 SHA-256。
- [x] 实现 YAML 字符串和文件加载。
- [x] 实现 C++ 领域对象基础 Schema 校验。
- [x] 实现稳定错误码和领域对象路径。
- [x] 实现 YAML 路径、文件位置和源码诊断位置。
- [x] 创建 SmartSensor 示例 Schema。
- [x] 创建合法/非法 Schema 测试向量。
- [x] 增加 `iotps schema validate <file>` 和成功/失败退出码测试。
- [x] 定义 Schema 升级和向后兼容规则。

### M02-F02 协议和报文结构

- [ ] 一个 Protocol 包含多个 Message Type。
- [ ] Message 支持 Header / Body / Footer 逻辑分区。
- [ ] 支持 Login、Heartbeat、Telemetry、Alarm、Command 等自定义报文。
- [ ] 支持消息类型识别字段和匹配规则。
- [ ] 支持固定头、固定值和 Magic Bytes。
- [ ] 支持协议级、Message 级、Field 级默认配置继承。

### M02-F03 基础数据类型

- [x] `bool`。
- [x] `int8` / `uint8`。
- [x] `int16` / `uint16`。
- [x] `int32` / `uint32`。
- [x] `int64` / `uint64`。
- [x] `float32` / `float64`。
- [ ] `char`。
- [x] 固定长度 UTF-8 `string`。
- [x] 固定长度 `bytes`。
- [ ] `BCD`。
- [ ] `timestamp`。
- [ ] `enum`。
- [ ] `bitfield`。
- [ ] 🟡 `array`：固定长度 Primitive Array 已完成，动态 Array 未实现。
- [ ] `struct`。

### M02-F04 Field 基础属性

- [x] `name`。
- [x] `displayName`。
- [x] `type`。
- [x] `length`：固定 Primitive 可省略或显式声明自然宽度。
- [x] `offset`：支持连续布局和显式 gap。
- [x] `endian`。
- [ ] `default`。
- [ ] `description`。
- [ ] `unit`。
- [ ] `required`。
- [ ] 固定值/常量约束。

### M02-F05 Field 高级属性

- [ ] `scale`。
- [ ] `offsetValue`。
- [ ] `min` / `max`。
- [ ] `enum` 引用。
- [ ] `condition`。
- [ ] `expression`。
- [ ] `encoding`。
- [ ] 自定义显示格式。

### M02-F06 字节序

- [x] Big Endian。
- [x] Little Endian。
- [x] 协议默认字节序。
- [ ] Message 字节序覆盖。
- [x] Field 独立字节序覆盖。
- [ ] 字节序配置冲突诊断。

### M02-F07 动态长度和条件字段

- [x] `lengthOf` 单字段引用、Decode 校验和 Encode 自动计算。
- [x] Length 字段包含/排除规则：只计算目标 Field wire 长度，不包含 Length Field、header/trailer/checksum 或 gap。
- [x] 固定长度验证：Primitive、string 和 bytes 已覆盖。
- [ ] 动态 Body 长度。
- [ ] 条件字段表达式。
- [ ] 条件字段 Decode 跳过和 Encode 选择。
- [ ] 条件依赖循环检测。

### M02-F08 Array / Struct

- [x] 固定长度数组：支持固定宽度 Primitive 元素和固定 `count`。
- [ ] Count 字段驱动数组。
- [ ] Length 驱动数组。
- [ ] 嵌套 Struct。
- [ ] Struct 数组。
- [ ] 多层嵌套偏移计算。
- [ ] 🟡 数组越界和长度不一致诊断：固定 Array 的溢出、截断和数量诊断已完成，动态 Array 未实现。

### M02-F09 Enum / BitField

- [ ] Enum 名称和值定义。
- [ ] Enum 未知值保留和显示。
- [ ] Enum 重复值诊断。
- [ ] BitField 位范围定义。
- [ ] 单 bit 布尔状态。
- [ ] 多 bit 数值和枚举。
- [ ] BitField 重叠和越界诊断。
- [ ] BitField 可视化编辑。

### M02-F10 Checksum 定义

- [x] Core 独立函数支持 SUM8、XOR8、CRC16/MODBUS 全数据计算。
- [ ] Schema 中声明 Checksum 字段。
- [ ] SUM16。
- [ ] LRC。
- [ ] CRC8。
- [ ] CRC16/CCITT。
- [ ] CRC16/XMODEM。
- [ ] CRC32。
- [ ] 自定义 Polynomial、Initial Value、RefIn、RefOut、XOR Out。
- [ ] 定义 Header 到 BodyEnd 等计算范围。
- [ ] 校验字段包含/排除规则。
- [ ] Decode 校验和验证。
- [ ] Encode 自动写入校验值。
- [ ] Checksum 范围无效诊断。

### M02-F11 协议版本

- [ ] 协议版本元数据。
- [ ] 多版本 Message 定义。
- [ ] 版本识别规则。
- [ ] 向后兼容检查。
- [ ] 协议差异比较。
- [ ] 协议升级破坏性变更提示。

### M02-F12 Visual + Code 双向编辑

- [ ] YAML Schema 源码编辑器。
- [ ] 可视化字段树。
- [ ] 属性检查器。
- [ ] 添加/删除/复制/移动字段。
- [ ] 拖放排序。
- [ ] GUI 修改实时更新 Schema。
- [ ] Schema 修改实时更新 GUI。
- [ ] 语法高亮和自动补全。
- [ ] 跳转到错误位置。
- [ ] 撤销/重做。

### M02-F13 Problems 协议诊断

- [ ] 未知字段引用。
- [ ] Length 引用错误。
- [ ] 🟡 字段重叠：Core 诊断已完成，Problems 面板未实现。
- [ ] 🟡 固定 offset 冲突：Core 诊断已完成，Problems 面板未实现。
- [ ] Enum 重复值。
- [ ] CRC 范围无效。
- [ ] 条件循环依赖。
- [ ] 不可达字段。
- [ ] Error/Warning 分级。
- [ ] Problems 面板和双击定位。

---

## M03 Codec 编解码

### M03-F01 原始 HEX / ByteBuffer 基础

- [x] HEX 文本解析为 ByteBuffer。
- [x] ByteBuffer 格式化为规范化 HEX。
- [x] ASCII 预览。
- [x] 非法字符位置报告。
- [x] 不完整字节报告。
- [x] 空输入报告。

### M03-F02 Schema Decode：HEX → Object

- [ ] 按 Message Schema 选择报文类型。
- [x] 按字段顺序和固定 `offset` 读取字节，并跳过 gap。
- [x] Decode bool、8/16/32/64 位有符号和无符号整数、float32/float64。
- [x] Decode 固定长度 UTF-8 字符串和 bytes。
- [ ] Decode BCD、timestamp。
- [x] 应用 Protocol 默认与 Field 覆盖的 Big/Little Endian。
- [ ] 应用 scale 和 offsetValue。
- [ ] Decode Enum 和 BitField。
- [ ] 🟡 Decode Struct 和 Array：固定 Primitive Array 已完成，Struct 和动态 Array 未实现。
- [ ] Decode Conditional Field。
- [ ] 🟡 验证 Length 和 Checksum：Length Field 已完成，Checksum Field 尚未接入 Codec。
- [ ] 🟡 返回结构化字段树：固定 Primitive 返回一层字段列表，嵌套结构尚未实现。
- [x] 返回每个已解析字段的 byte offset/length span。
- [ ] 保留未知和未消费字节。

### M03-F03 Schema Encode：Object → HEX

- [x] 接收结构化字段值的 Core API。
- [ ] 🟡 校验 required、type、min/max：已校验缺失、重复、额外字段、ScalarValue 类型和 Primitive 表示范围；Schema `min`/`max` 尚未建模。
- [ ] 反向应用 scale 和 offsetValue。
- [x] Encode bool、8/16/32/64 位有符号和无符号整数、float32/float64，并应用 Protocol 默认与 Field 覆盖字节序。
- [x] Encode 固定长度 UTF-8 string 和 bytes，并校验编码、padding 与精确长度。
- [x] 按固定 `offset` 写入字段，并以 `0x00` 填充 gap。
- [ ] Encode Enum 和 BitField。
- [ ] 🟡 Encode Struct 和 Array：固定 Primitive Array 已完成，Struct 和动态 Array 未实现。
- [ ] Encode Conditional Field。
- [x] 自动计算 Length。
- [ ] 自动计算 Checksum。
- [ ] 🟡 生成 ByteBuffer 和规范化 HEX：当前生成 ByteBuffer，未接入 HEX 输出。
- [ ] 返回 Encode 字段到字节范围映射。

### M03-F04 Round-trip 和兼容性

- [x] 固定长度 Primitive `Decode(Encode(Object)) == Object`。
- [x] 固定长度 Primitive 对规范零 padding 帧满足 `Encode(Decode(Bytes)) == Bytes`；非零 gap 会规范化为零。
- [x] Primitive Decode/Encode golden vector 测试。
- [ ] 🟡 边界值测试：覆盖 bool、负数、截断、尾随数据、整数越界和 float32 溢出；完整类型最小/最大矩阵待补齐。
- [x] Primitive Decode/Encode 不同字节序测试。
- [x] 非连续固定布局和 padding round-trip 测试。
- [x] 固定 UTF-8 string/bytes golden vector 和 round-trip 测试。
- [ ] 🟡 动态结构组合测试：固定 Array 与 Length Field 组合已覆盖，动态容器未实现。
- [ ] 协议版本兼容测试。

### M03-F05 实时解析和可视化联动

- [ ] 输入 HEX 时防抖实时 Decode。
- [ ] 点击字段高亮对应 HEX。
- [ ] 点击 HEX 定位所属字段。
- [ ] 字段树显示 Raw/Value/Display Value/Unit。
- [ ] 无法识别报文时展示候选原因。
- [ ] 部分报文和流式数据解析。

### M03-F06 Codec 错误诊断

- [x] 数据不足。
- [x] 多余数据。
- [ ] 固定头不匹配。
- [ ] Length 不匹配。
- [ ] Checksum 错误。
- [x] 类型转换错误。
- [ ] 条件表达式错误。
- [ ] 数组长度错误。
- [x] 错误包含 Message/Field Path、Byte Offset 和稳定错误码。

---

## M04 HEX Studio

### M04-F01 HEX 编辑器

- [x] 输入和编辑 HEX 文本。
- [x] 支持常见分隔符和 `0x` 前缀。
- [x] 规范化大写 HEX。
- [x] 显示数据长度。
- [x] 显示字节 Offset。
- [ ] 选择字节范围。
- [ ] 插入、删除和覆盖模式。
- [ ] 数据查找。
- [ ] 数据替换。
- [ ] 从文件导入二进制/HEX。
- [ ] 导出二进制/HEX。
- [ ] 大数据虚拟滚动和性能优化。

### M04-F02 显示模式

- [x] HEX 表格。
- [x] ASCII 预览。
- [x] Decimal 逐字节显示。
- [ ] Binary 逐字节/位显示。
- [ ] 多列宽和分组设置。
- [ ] 地址基址设置。

### M04-F03 数据转换

- [ ] HEX ↔ ASCII。
- [ ] HEX ↔ Base64。
- [ ] HEX ↔ Binary。
- [ ] HEX ↔ Decimal。
- [ ] HEX ↔ UTF-8。
- [ ] 文本编码选择。
- [ ] 转换结果复制和替换。

### M04-F04 数值解释

- [ ] int/uint 解释。
- [ ] float/double 解释。
- [ ] BCD 解释。
- [ ] timestamp 解释。
- [ ] Big/Little Endian 切换。
- [ ] 选择范围实时计算。

### M04-F05 数据运算

- [x] 全数据 SUM8。
- [x] 全数据 XOR8。
- [x] 全数据 CRC16/MODBUS。
- [ ] 选择范围计算。
- [ ] AND / OR / XOR。
- [ ] SHIFT。
- [ ] 字节序反转。
- [ ] 自定义 CRC 参数计算器。

---

## M05 Transport 通信层

### M05-F01 Transport 抽象

- [x] 定义与 Protocol/Codec 解耦的 Transport 接口。
- [x] 统一 open/close/send 生命周期，receive 通过事件交付。
- [x] 统一连接状态和错误码。
- [x] 统一事件 Sink 和 `data_received` 事件模型。
- [ ] 统一取消机制。
- [ ] 统一连接配置序列化。
- [x] 统一统计信息接口。
- [ ] 🟡 Mock/Loopback Transport：集成测试有边界替身，尚无可复用 Core 实现。

### M05-F02 Serial `[MVP]`

- [ ] 端口枚举和刷新。
- [ ] RS232 / RS485 / UART 场景。
- [ ] Baud Rate。
- [ ] Data Bits。
- [ ] Stop Bits。
- [ ] Parity。
- [ ] Flow Control。
- [ ] 打开/关闭串口。
- [ ] 异步发送/接收。
- [ ] 断开和错误恢复。

### M05-F03 TCP Client `[MVP]`

- [ ] Host / Port。
- [ ] DNS 和 IP 地址。
- [ ] Connect/Disconnect。
- [ ] 异步发送/接收。
- [ ] 自动重连和退避。
- [ ] KeepAlive。
- [ ] 连接超时。
- [ ] HEX 发送。
- [ ] 定时发送。
- [ ] SSL/TLS。
- [ ] 证书配置和验证策略。

### M05-F04 TCP Server `[MVP]`

- [ ] Listen Address / Port。
- [ ] 多客户端接受。
- [ ] Client Session。
- [ ] Client ID 和远端地址。
- [ ] 在线连接管理。
- [ ] 对单个客户端发送。
- [ ] 广播。
- [ ] 客户端断开和清理。
- [ ] TLS Server。

### M05-F05 UDP `[MVP]`

- [ ] UDP Client。
- [ ] UDP Server。
- [ ] Broadcast。
- [ ] Multicast Join/Leave。
- [ ] Datagram 边界保留。
- [ ] 远端地址和端口记录。

### M05-F06 WebSocket `[P2]`

- [ ] 🔒 `ws`。
- [ ] 🔒 `wss`。
- [ ] 🔒 Header 和子协议。
- [ ] 🔒 Binary/Text Frame。
- [ ] 🔒 Ping/Pong 和自动重连。

### M05-F07 MQTT `[P2]`

- [ ] 🔒 MQTT 3.1.1。
- [ ] 🔒 MQTT 5。
- [ ] 🔒 Broker 配置。
- [ ] 🔒 Username/Password/TLS。
- [ ] 🔒 Topic Subscribe。
- [ ] 🔒 Topic Publish。
- [ ] 🔒 QoS 0/1/2。
- [ ] 🔒 Retain。
- [ ] 🔒 Payload 绑定 Protocol Codec。

### M05-F08 BLE `[P2/Later]`

- [ ] 🔒 Device Scan。
- [ ] 🔒 Connect/Disconnect。
- [ ] 🔒 Service/Characteristic 浏览。
- [ ] 🔒 Read/Write。
- [ ] 🔒 Notify。
- [ ] 🔒 平台权限和适配。

---

## M06 Debugger / Message Timeline

### M06-F01 收发记录

- [ ] 记录每一条 TX/RX。
- [ ] 记录高精度 Timestamp。
- [ ] 记录 Direction。
- [ ] 记录 Connection 和 Session。
- [ ] 记录 Size。
- [ ] 记录识别出的 Message Type。
- [ ] 记录 Status 和 Error。
- [ ] 对 TCP 字节流执行帧边界处理。

### M06-F02 记录详情

- [ ] Raw HEX。
- [ ] Parsed 字段树。
- [ ] ASCII。
- [ ] Binary。
- [ ] Metadata。
- [ ] 时间戳和耗时。
- [ ] 复制、导出和重新发送。
- [ ] 跳转到对应 Message Schema。

### M06-F03 Timeline

- [ ] 🟡 当前 Timeline 标签布局。
- [ ] 按时间排序展示事件。
- [ ] TX/RX 方向视觉区分。
- [ ] Request/Response 关联。
- [ ] 搜索。
- [ ] Direction Filter。
- [ ] Message Type Filter。
- [ ] Device Filter。
- [ ] Connection Filter。
- [ ] 时间范围过滤。
- [ ] 暂停、继续和自动滚动。

### M06-F04 调试发送

- [ ] 手动发送 Raw HEX。
- [ ] 选择已保存 Message 发送。
- [ ] 批量发送。
- [ ] 定时发送。
- [ ] 发送前预览 Encode 结果。
- [ ] 发送失败和重试提示。

### M06-F05 Console / Problems

- [x] 基础 Console UI 和 Core 操作日志。
- [x] 中英文日志渲染。
- [ ] Console 分级过滤。
- [ ] 模块过滤。
- [ ] 时间过滤。
- [ ] 日志导出。
- [ ] Problems 与 Schema/Codec/Transport 错误统一展示。

---

## M07 Message Studio 报文工作台

### M07-F01 Message 模板

- [ ] 新建、保存、复制和删除 Message。
- [ ] 选择 Protocol 和 Message Type。
- [ ] Message 名称、描述和标签。
- [ ] 默认连接绑定。
- [ ] 报文模板导入/导出。

### M07-F02 表单组包

- [ ] 根据 Schema 自动生成字段表单。
- [ ] 基础类型输入控件。
- [ ] Enum 下拉选择。
- [ ] BitField 编辑器。
- [ ] Array/Struct 嵌套表单。
- [ ] Timestamp 编辑。
- [ ] bytes/HEX 编辑。
- [ ] required/min/max 即时校验。
- [ ] 字段描述和单位展示。

### M07-F03 自动编码

- [ ] 默认值填充。
- [ ] 动态变量替换。
- [ ] 自动 Length。
- [ ] 自动 Checksum。
- [ ] 实时 HEX 预览。
- [ ] 字段与 HEX 双向高亮。
- [ ] Encode 错误定位。

### M07-F04 发送和响应

- [ ] 选择 Connection。
- [ ] Encode。
- [ ] Send。
- [ ] 等待响应。
- [ ] 自动 Decode 响应。
- [ ] 响应历史。
- [ ] 重复发送。
- [ ] 批量发送。

---

## M08 Device Simulator

### M08-F01 单设备模拟 `[MVP]`

- [ ] Simulator 配置保存。
- [x] Device ID 配置模型。
- [ ] 🟡 Protocol 绑定：当前保存标识并注入 Message Codec。
- [ ] 🟡 Connection 绑定：当前保存标识并注入 Transport。
- [ ] 🟡 启动、停止、重启：当前有同步 start/stop，无 restart。
- [ ] 连接和运行状态展示。
- [ ] 单设备日志和 Timeline。

### M08-F02 Device State `[MVP]`

- [x] offline。
- [ ] connecting。
- [x] online。
- [ ] sleep。
- [ ] alarm。
- [x] error。
- [ ] 🟡 状态变量和状态转换：当前覆盖 starting/online/stopping/offline/error 最小链路。
- [ ] 状态影响行为执行。

### M08-F03 Behavior 行为模型 `[MVP/P2]`

- [ ] ON CONNECT。
- [ ] 🟡 SEND Message：当前支持 Codec 编码后交给 Transport。
- [ ] WAIT Message/Condition。
- [ ] EVERY interval。
- [ ] DELAY。
- [ ] IF/ELSE。
- [ ] 状态转换。
- [ ] 请求响应规则。
- [ ] 超时和重试。
- [ ] 行为可视化或文本 DSL。

### M08-F04 多设备模拟 `[P2]`

- [ ] 🔒 Device Count。
- [ ] 🔒 Device ID + index 模板。
- [ ] 🔒 分批上线。
- [ ] 🔒 随机上线/离线。
- [ ] 🔒 独立设备状态。
- [ ] 🔒 独立变量和序列号。
- [ ] 🔒 资源和连接上限控制。

### M08-F05 故障模拟 `[P2]`

- [ ] 🔒 CRC Error。
- [ ] 🔒 Invalid Length。
- [ ] 🔒 Invalid Header。
- [ ] 🔒 Random Bytes。
- [ ] 🔒 Packet Loss。
- [ ] 🔒 Duplicate Packet。
- [ ] 🔒 Delay / Timeout。
- [ ] 🔒 Disconnect / Reconnect。
- [ ] 🔒 Malformed Packet。

---

## M09 Testing 测试中心

> 本模块指用户创建的协议/设备测试，不是项目源代码的单元测试。

### M09-F01 Basic Test Case `[MVP]`

- [x] Core Test Case、Test Step、Step Result、Test Report 领域模型。
- [ ] 新建、保存、复制和删除 Test Case。
- [ ] Setup。
- [ ] Connect。
- [ ] Send。
- [ ] Receive。
- [ ] Decode。
- [ ] Assert。
- [ ] Cleanup。
- [ ] 单步运行和整体运行。
- [ ] 超时、取消和失败清理。

### M09-F02 Assertion `[MVP]`

- [x] equals / notEquals Core 求值。
- [ ] greaterThan / lessThan。
- [ ] contains。
- [ ] matches。
- [ ] exists。
- [ ] length。
- [ ] responseTime。
- [ ] Request/Response 字段关联断言。
- [x] 断言失败结果包含 Expected/Actual 和字段路径。

### M09-F03 Test Suite `[P2]`

- [ ] 🔒 Test Case 分组。
- [ ] 🔒 Run Test。
- [ ] 🔒 Run Suite。
- [ ] 🔒 Run All。
- [ ] 🔒 Suite 级 Setup/Cleanup。
- [ ] 🔒 失败继续/停止策略。

### M09-F04 参数化和边界测试 `[P2]`

- [ ] 🔒 数据集参数化。
- [ ] 🔒 CSV/JSON 数据导入。
- [ ] 🔒 min/max 边界自动生成。
- [ ] 🔒 非法值和异常报文生成。
- [ ] 🔒 组合测试和用例数量控制。

### M09-F05 测试结果和报告

- [x] Core 报告汇总 Passed/Failed/Skipped。
- [ ] 步骤耗时。
- [ ] 请求和响应证据。
- [ ] 断言详情。
- [ ] Console/Test Results 面板。
- [ ] HTML/JSON/JUnit 报告。
- [ ] 历史运行比较。

### M09-F06 当前代码测试基础

- [x] Core 单元测试。
- [x] Golden vector 集成测试。
- [x] WebView UI 烟雾测试。
- [x] 可选 Fuzz 入口。
- [x] Schema 领域模型和基础校验单元测试。
- [x] 固定长度 Primitive/string/bytes Encode/Decode、大小端、数值/长度范围和错误诊断单元测试。
- [x] Schema YAML → HEX → Primitive Decode → expected golden vector 集成测试。
- [x] Schema YAML → Decode → Primitive Encode → golden HEX → Decode round-trip 集成测试。
- [x] Simulator → Codec → Transport 集成测试。
- [x] Protocol Schema YAML/文件加载、源码位置和 CLI 成功/失败测试。
- [x] Testing 断言和报告单元测试。
- [ ] Schema/Codec/Transport/Simulator 的完整系统化测试矩阵。

---

## M10 Load Testing `[P3]`

### M10-F01 场景配置

- [ ] 🔒 Virtual Devices。
- [ ] 🔒 Ramp Up / Ramp Down。
- [ ] 🔒 Duration。
- [ ] 🔒 Upload Interval。
- [ ] 🔒 Connection/Message 行为模型复用。
- [ ] 🔒 目标和安全限制。

### M10-F02 运行控制

- [ ] 🔒 Start/Pause/Stop。
- [ ] 🔒 分布式或多进程执行评估。
- [ ] 🔒 资源占用保护。
- [ ] 🔒 失败阈值自动停止。

### M10-F03 实时指标

- [ ] 🔒 Connections。
- [ ] 🔒 Messages/sec。
- [ ] 🔒 Bytes/sec。
- [ ] 🔒 Latency。
- [ ] 🔒 P50/P90/P95/P99。
- [ ] 🔒 Errors/Timeout/Reconnect。
- [ ] 🔒 趋势图和阶段标记。

### M10-F04 报告

- [ ] 🔒 场景和环境快照。
- [ ] 🔒 指标汇总。
- [ ] 🔒 错误分布。
- [ ] 🔒 CSV/JSON/HTML 导出。
- [ ] 🔒 多次运行对比。

---

## M11 Capture / Replay / PCAP `[P2]`

### M11-F01 Capture

- [ ] 🔒 记录 Timestamp、Direction、Connection。
- [ ] 🔒 记录 Raw Data。
- [ ] 🔒 记录 Parsed Data。
- [ ] 🔒 Capture 开始、暂停和停止。
- [ ] 🔒 Capture 文件保存和加载。
- [ ] 🔒 大文件分段和索引。

### M11-F02 Replay

- [ ] 🔒 选择 Capture 记录。
- [ ] 🔒 Original Timing。
- [ ] 🔒 2x/5x/10x。
- [ ] 🔒 Maximum Speed。
- [ ] 🔒 选择目标 Connection。
- [ ] 🔒 重放方向和过滤。
- [ ] 🔒 重放结果和错误统计。

### M11-F03 PCAP

- [ ] 🔒 Import PCAP。
- [ ] 🔒 提取 TCP Payload。
- [ ] 🔒 提取 UDP Payload。
- [ ] 🔒 TCP Stream 重组。
- [ ] 🔒 绑定 Protocol Codec。
- [ ] 🔒 后期 Export PCAP。

---

## M12 Script Engine / Custom Codec `[P2]`

### M12-F01 JavaScript Engine

- [ ] 🔒 选择嵌入式 JavaScript Runtime。
- [ ] 🔒 脚本文件加载和编译。
- [ ] 🔒 `context` API。
- [ ] 🔒 变量、Message、Connection 访问边界。
- [ ] 🔒 超时、取消和资源限制。
- [ ] 🔒 异常和堆栈诊断。
- [ ] 🔒 沙箱和危险能力限制。

### M12-F02 生命周期钩子

- [ ] 🔒 Before Encode。
- [ ] 🔒 After Encode。
- [ ] 🔒 Before Send。
- [ ] 🔒 After Receive。
- [ ] 🔒 Before Decode。
- [ ] 🔒 After Decode。

### M12-F03 Custom Codec

- [ ] 🔒 自定义 `encode()`。
- [ ] 🔒 自定义 `decode()`。
- [ ] 🔒 与 Schema Codec 的选择和组合。
- [ ] 🔒 输入/输出类型契约。
- [ ] 🔒 测试和调试工具。

---

## M13 Data Generator

### M13-F01 内置生成器 `[MVP/P2]`

- [ ] Random。
- [ ] Sequence。
- [ ] Range。
- [ ] Timestamp。
- [ ] UUID。
- [ ] List。
- [ ] Expression。
- [ ] Script。
- [ ] Decrease/Increase 等状态生成器。

### M13-F02 生成器作用域

- [ ] Message 字段绑定。
- [ ] Simulator 设备独立状态。
- [ ] Test 参数绑定。
- [ ] 可复现随机种子。
- [ ] 生成器预览。
- [ ] 自定义函数注册。

---

## M14 Protocol Documentation `[P3]`

### M14-F01 文档内容生成

- [ ] 🔒 Protocol 概述。
- [ ] 🔒 Message Types。
- [ ] 🔒 Frame Structure。
- [ ] 🔒 Field Description。
- [ ] 🔒 Enum。
- [ ] 🔒 Bit Field。
- [ ] 🔒 Checksum。
- [ ] 🔒 示例报文和解析结果。

### M14-F02 导出

- [ ] 🔒 Markdown。
- [ ] 🔒 HTML。
- [ ] 🔒 PDF。
- [ ] 🔒 主题和模板。
- [ ] 🔒 文档版本和生成元数据。

---

## M15 Code Generator `[P3]`

### M15-F01 编解码代码生成

- [ ] 🔒 C。
- [ ] 🔒 C++。
- [ ] 🔒 Rust。
- [ ] 🔒 Go。
- [ ] 🔒 Java。
- [ ] 🔒 Python。
- [ ] 🔒 类型定义、Encode、Decode 和错误处理。
- [ ] 🔒 生成代码测试向量。
- [ ] 🔒 命名、包名和风格配置。

### M15-F02 Wireshark Dissector Generator

- [ ] 🔒 生成 Wireshark Lua Dissector。
- [ ] 🔒 Message Type 分派。
- [ ] 🔒 字段树和显示值。
- [ ] 🔒 TCP 重组提示。
- [ ] 🔒 示例 PCAP/HEX 验证。

---

## M16 Plugin System `[P3]`

### M16-F01 插件基础

- [ ] 🔒 插件清单和版本。
- [ ] 🔒 插件发现、加载和卸载。
- [ ] 🔒 API/ABI 兼容策略。
- [ ] 🔒 权限和能力声明。
- [ ] 🔒 崩溃隔离和错误诊断。
- [ ] 🔒 插件开发 SDK 和示例。

### M16-F02 插件类型

- [ ] 🔒 Transport Plugin。
- [ ] 🔒 Protocol Plugin。
- [ ] 🔒 Codec Plugin。
- [ ] 🔒 Checksum Plugin。
- [ ] 🔒 Generator Plugin。
- [ ] 🔒 Importer Plugin。
- [ ] 🔒 Exporter Plugin。
- [ ] 🔒 UI Plugin 可行性和安全边界评估。

### M16-F03 插件管理

- [ ] 🔒 本地安装和禁用。
- [ ] 🔒 版本和依赖检查。
- [ ] 🔒 签名和来源提示。
- [ ] 🔒 插件配置。
- [ ] 🔒 插件日志。

---

## M17 系统与通用体验

### M17-F01 设置

- [ ] 全局设置页面。
- [ ] 编辑器设置。
- [ ] HEX 显示设置。
- [ ] Transport 默认设置。
- [ ] 数据目录设置。
- [ ] 设置导入/导出。
- [ ] 设置版本迁移。

### M17-F02 语言和主题

- [x] 中文界面。
- [x] 英文界面。
- [x] 系统语言自动选择。
- [x] 手动语言切换和持久化。
- [x] 当前深色主题基础。
- [ ] 浅色主题。
- [ ] 跟随系统主题。
- [ ] 完整主题 Token 和扩展主题。

### M17-F03 快捷键和命令

- [x] `Ctrl/Cmd + Enter` 执行当前 HEX 解析。
- [ ] 快捷键设置和冲突检测。
- [ ] Command Palette：`Ctrl + Shift + P`。
- [ ] Connect TCP 命令。
- [ ] Run Test 命令。
- [ ] Start Simulator 命令。
- [ ] Decode HEX 命令。
- [ ] Calculate CRC 命令。
- [ ] Generate Code 命令。

### M17-F04 全局搜索

- [ ] `Ctrl + P` 快捷入口。
- [ ] 搜索 Protocol。
- [ ] 搜索 Message。
- [ ] 搜索 Field。
- [ ] 搜索 Test。
- [ ] 搜索 Simulator。
- [ ] 搜索 Script。
- [ ] 搜索 Capture。
- [ ] 模糊匹配和快速跳转。

### M17-F05 日志

- [x] 当前 Web UI 基础操作日志。
- [ ] TRACE/DEBUG/INFO/WARN/ERROR。
- [ ] Core/Host/Web UI 统一关联 ID。
- [ ] 日志过滤、模块过滤和时间过滤。
- [ ] 日志文件轮转。
- [ ] 日志导出。
- [ ] 敏感字段脱敏。

### M17-F06 数据安全

- [ ] Secret Variable 类型。
- [ ] Password/Token/Certificate/Private Key 脱敏。
- [ ] 使用系统安全存储保存秘密。
- [ ] 导出项目时秘密排除策略。
- [ ] 日志和错误中的秘密清理。
- [ ] TLS 证书和私钥权限边界。

### M17-F07 备份和恢复

- [ ] 项目备份。
- [ ] 设置备份。
- [ ] 自动恢复未保存内容。
- [ ] 损坏项目诊断。
- [ ] 导入前预览和冲突处理。

### M17-F08 更新和发布

- [x] Windows Release 目录产物可以运行。
- [x] 发布 Web UI 可离线加载。
- [ ] Windows 安装包。
- [ ] 代码签名。
- [ ] 自动更新或离线更新包。
- [ ] WebView2 Runtime 打包/检测策略。
- [ ] 升级失败回滚。
- [ ] Release Notes。

### M17-F09 跨平台

- [x] Core 当前代码保持平台无关。
- [x] Windows x86_64 客户端。
- [ ] Windows ARM64 构建和 Host 验证。
- [ ] macOS x86_64/ARM64 Host。
- [ ] Linux x86_64/ARM64 Host。
- [ ] UOS/Kylin/国产 CPU 和 WebView 可用性验证。
- [ ] 平台能力矩阵和降级提示。

---

## M18 CLI / Automation / CI

### M18-F01 当前 CLI 基础

- [x] `iotps version`。
- [x] `iotps inspect <hex>`。
- [x] `iotps schema validate <file>`。
- [x] 成功、输入错误和命令错误退出码。
- [ ] JSON 输出模式。
- [ ] 从文件/stdin 读取输入。
- [ ] 统一诊断格式。

### M18-F02 Schema 和 Codec CLI

- [x] `iotps schema validate <protocol.yaml>`。
- [ ] `iotps decode <protocol.yaml> <data.hex>`。
- [ ] `iotps encode <protocol.yaml> <message.json>`。
- [ ] Message Type 指定或自动识别。
- [ ] 字段表和 JSON 输出。
- [ ] Round-trip 命令。

### M18-F03 自动化命令

- [ ] `iotps test <path>`。
- [ ] `iotps simulate <simulator.yaml>`。
- [ ] `iotps loadtest <loadtest.yaml>`。
- [ ] `iotps replay <capture>`。
- [ ] `iotps generate`。
- [ ] 机器可读报告和稳定退出码。

### M18-F04 CI/CD 集成

- [ ] GitHub Actions 示例。
- [ ] GitLab CI 示例。
- [ ] Jenkins 示例。
- [ ] JUnit/JSON 报告。
- [ ] Headless 运行。
- [ ] CI 中的秘密和环境变量约定。

---

## M19 AI Protocol Assistant `[Later]`

### M19-F01 协议文档辅助

- [ ] 🔒 导入 PDF/Word/Markdown。
- [ ] 🔒 提取协议结构候选。
- [ ] 🔒 生成 Protocol Schema 草稿。
- [ ] 🔒 展示来源和不确定性。
- [ ] 🔒 人工逐项确认后才能保存。

### M19-F02 HEX 样本辅助分析

- [ ] 🔒 多样本聚类和差异比较。
- [ ] 🔒 推测 Header。
- [ ] 🔒 推测 Length。
- [ ] 🔒 推测 Message Type。
- [ ] 🔒 推测 Checksum。
- [ ] 🔒 生成候选字段范围。
- [ ] 🔒 结论必须由用户确认，不能自动覆盖 Schema。

---

## 6. MVP 验收树

只有以下整条链路全部完成，才能宣布 MVP 完成：

- [ ] 创建或打开一个普通目录项目。
- [ ] 使用 GUI 或 YAML 定义 Protocol Schema。
- [ ] 定义 Primitive、Struct、Array、Enum、BitField、Endian、Length 和 CRC。
- [ ] 输入一条 HEX 并按 Schema 自动 Decode。
- [ ] 显示字段树，字段与 HEX 双向高亮。
- [ ] 修改结构化字段值。
- [ ] 自动 Encode 为新报文。
- [ ] 自动更新 Length 和 CRC。
- [ ] 配置 Serial、TCP Client、TCP Server 或 UDP 连接。
- [ ] 发送编码后的报文。
- [ ] 接收响应并自动识别 Message Type。
- [ ] 自动 Decode 响应。
- [ ] 在 Debugger/Timeline 中查看 TX/RX、Raw HEX 和 Parsed Fields。
- [ ] 使用 Environment 和 Variables 切换运行参数。
- [ ] 使用 Basic Simulator 模拟至少一个设备行为。
- [ ] 使用 Basic Test Case 执行 Connect/Send/Receive/Decode/Assert/Cleanup。
- [ ] Windows x86_64 Release 构建、安装和核心链路测试通过。
- [ ] 关键错误有稳定错误码、可定位诊断和中英双语提示。

---

## 7. 产品边界：明确不做什么

- [ ] ⛔ 设备资产管理平台。
- [ ] ⛔ 完整 IoT 云平台。
- [ ] ⛔ 数字孪生平台。
- [ ] ⛔ BI 数据分析平台。
- [ ] ⛔ 时序数据库。
- [ ] ⛔ OTA 平台。
- [ ] ⛔ 通用规则引擎平台。
- [ ] ⛔ 大型 SCADA/HMI。

产品始终聚焦：

```text
协议设计 → 编解码 → 通信 → 调试 → 模拟 → 测试
```

Protocol Schema 始终是 Single Source of Truth，并最终驱动：

```text
HEX Parser
Message Builder
Device Simulator
Test Runner
Documentation
Code Generator
Wireshark Dissector
CLI
CI/CD
```

---

## 8. 已完成里程碑记录

### 2026-08-16：M0 首个纵向切片

- 本地提交：`356df80 feat: bootstrap core and Windows x64 client`
- 完成 C++ Core、CLI、React Web UI、Windows Host、HEX 检查和基础测试。

### 2026-08-16：Web UI 中英双语

- 本地提交：`5bc72ec feat: add bilingual web UI`
- 完成自动语言选择、手动切换、持久化和错误码翻译。

### 2026-08-18：Windows 发布版黑屏修复

- 本地提交：`83e8dfb fix: load packaged UI from virtual host`
- 完成 WebView2 虚拟 HTTPS 主机加载和真实桌面 UI 烟雾测试。

### 2026-08-22：Core 五模块分层

- 本地提交：见包含本记录的 `feat: establish layered core modules` 提交。
- 将 Core 拆分为 Schema、Codec、Transport、Simulator、Testing 独立 CMake 目标，并保留 `iotps::core` 聚合 Facade。
- 完成 Schema v0.1 C++ 领域模型与基础校验、`uint8` 固定布局 Codec、Transport API、Simulator 最小发送链路、Testing 基础断言和报告。
- Debug 全量构建成功，新增模块测试后全部 8 个 CTest 通过。

### 2026-08-22：统一格式化与 Result/Error

- 本地提交：见包含本记录的 `build: standardize formatting and core results` 提交。
- 建立 EditorConfig、clang-format、Prettier 以及 CMake `format`/`format-check` 目标。
- 建立 C++20 `Result<Value, ErrorType>`、`Status<ErrorType>` 和 `Error<Code>`，迁移 HEX、Engine、Schema、Codec、Transport、Simulator、CLI 和桌面 Bridge。
- 保持各模块强类型错误码和现有 WebView Bridge 返回协议，不引入跨模块巨型错误枚举。

### 2026-08-22：Protocol Schema v0.1 YAML 加载

- 本地提交：见包含本记录的 `feat: load Protocol Schema YAML` 提交。
- 固定引入 Rapid YAML `v0.16.0`，并保持第三方类型不进入 Core 公共 API。
- 完成 YAML 字符串/文件加载、严格节点与枚举检查、领域模型映射以及文件、路径、行列诊断。
- 增加 SmartSensor 示例、合法/非法测试向量和 `iotps schema validate <file>` 成功/失败链路。
- 固化 Schema v0.1 格式和兼容规则，下一步进入 Primitive Decode。

### 2026-08-22：固定长度 Primitive Decode

- 本地提交：见包含本记录的 `feat: decode fixed-width primitives` 提交。
- `FixedLayoutCodec` 支持 bool、8/16/32/64 位整数、float32 和 float64，并统一输出 `ScalarValue`。
- 支持 Protocol 默认 Big/Little Endian 和 Field `endian` 覆盖，保留精确 `FieldRange`。
- 对非法 bool、输入截断、不支持类型和尾随数据返回稳定错误码、字段路径、偏移和原因。
- 新增 Schema YAML、HEX、expected 三文件 golden vector，下一步进入 Primitive Encode。

### 2026-08-22：固定长度 Primitive Encode

- 本地提交：见包含本记录的 `feat: encode fixed-width primitives` 提交。
- `FixedLayoutCodec` 对 bool、8/16/32/64 位整数、float32 和 float64 提供与 Decode 对称的 Encode。
- 支持 Protocol 默认 Big/Little Endian 和 Field `endian` 覆盖，并严格校验缺失、重复、额外字段、ScalarValue 类型和数值表示范围。
- 新增 `duplicate_field`、`unexpected_field` 错误码及稳定路径、输出偏移和原因。
- `DeviceSimulator::send()` 可以透传 Protocol 默认字节序，Little Endian 多字节发送链路已经验证。
- 复用 Schema YAML、HEX、expected golden vector，完成 `Decode → Encode → golden HEX → Decode` 双向 round-trip；下一步进入固定 Field `length`/`offset`。

### 2026-08-27：固定 Field length / offset

- 本地提交：见包含本记录的 `feat: support fixed field layouts` 提交。
- `FieldDefinition` 和 Protocol Schema v0.1 YAML 已支持可选 `length`/`offset`。
- 省略 `offset` 时使用当前布局游标；显式 offset 可形成 gap，Decode 跳过 gap，Encode 使用 `0x00` padding。
- Schema 校验覆盖零长度、Primitive 自然宽度冲突、`offset + length` 溢出和字段重叠，并保留 YAML 源码位置。
- Encode/Decode 共用内部布局计划；直接构造非法 `MessageDefinition` 时返回 `invalid_layout`，避免绕过 Schema 校验。
- Primitive golden vector 已加入非连续字段，并继续覆盖 Protocol/Field 字节序和双向 round-trip；下一步进入固定长度 `string`/`bytes`。

### 2026-08-27：固定长度 String / Bytes

- 本地提交：见包含本记录的 `feat: support fixed strings and bytes` 提交。
- 固定 `string`/`bytes` 必须显式声明非零 `length`，并复用 Field `offset`、gap、重叠和溢出规则。
- `string` 第一阶段固定为 UTF-8；短值右侧以 `0x00` 填充，Decode 去除 NUL padding，超长、内嵌 NUL、非法 UTF-8 和非零终止后数据均返回稳定诊断。
- 固定 `bytes` 使用 `ByteBuffer`，Encode 必须精确匹配 Field length，不自动补零或截断；Decode 原样保留内部零字节。
- 新增固定文本 golden vector，覆盖中文 UTF-8、padding、bytes、显式 gap、FieldRange 和双向 round-trip；下一步进入 Length Field。

### 2026-08-27：最小 Length Field

- 本地提交：见包含本记录的 `feat: support length fields` 提交。
- `FieldDefinition` 和 Protocol Schema v0.1 YAML 已支持可选 `lengthOf`，第一阶段引用同一 Message 中一个固定 wire Field。
- Length Field 只允许 `uint8`/`uint16`/`uint32`/`uint64`，Schema 诊断覆盖未知目标、自引用和循环依赖，并保留 YAML 源码位置。
- Decode 校验声明值与目标 `FieldRange.length`；Encode 允许省略派生字段并自动回填，支持前置/后置 Length Field 和 Field/Protocol 字节序。
- 长度只包含目标 Field，不包含 Length Field 自身、header、trailer、checksum 或 gap；固定 string 包含完整 NUL padding。
- 新增独立 Length Field golden vector，覆盖 Little Endian、显式 gap、容量溢出、帧截断、FieldRange 和双向 round-trip；下一步进入固定长度 Array。

### 2026-08-28：固定长度 Array

- 本地提交：见包含本记录的 `feat: support fixed primitive arrays` 提交。
- Schema/YAML 支持 `type: array`、固定宽度 Primitive `elementType` 和大于零的固定 `count`；数组禁止声明 `length`。
- Array wire 长度由元素自然宽度乘以 `count` 计算，复用 Field `offset`、Protocol 默认字节序和 Field 字节序覆盖。
- Codec 使用独立 `ArrayValue`，支持有序 Decode/Encode、严格数量/类型/范围校验、数组整体 `FieldRange` 和逐元素范围。
- 新增固定 Array golden vector，覆盖整数/浮点数组、显式 offset、逐元素字节序、`lengthOf` 声明校验/自动回填和双向 round-trip。
- 边界测试覆盖缺失/非法元素类型、缺失/零 count、长度溢出、非法 `length`、绕过 Schema 的非法布局、非法 bool、输入截断和元素数量不一致；下一步进入 Workspace `project.yaml`。

---

## 9. 下一次更新入口

下次开始开发时，直接从以下功能点继续：

> **M01-F02：定义 `project.yaml`，建立最小普通文本项目目录结构和跨平台 Workspace Core 加载/校验基础**

完成一个功能点后：

1. 在对应条目前标记 `[x]`。
2. 在“当前开发坐标”更新下一步。
3. 在“模块进度总览”更新状态。
4. 在“已完成里程碑记录”追加日期、结果和提交号。
