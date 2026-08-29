# Project Workspace v0.1

> 状态：已实现  
> 更新日期：2026-08-29  
> 适用范围：Portable C++ Core、CLI 和普通文本项目目录

相关文档：[功能清单与开发进度](<./IoT Protocol Studio 功能清单与开发进度.md>) · [Protocol Schema v0.1](<./Protocol Schema v0.1.md>) · [Core 模块架构](<./Core 模块架构.md>)

## 1. 第一阶段范围

Workspace Core 当前解决两个问题：加载包含 `project.yaml` 的普通目录，以及在 `protocols/` 下创建嵌套 Protocol Schema 并写回项目引用。

```text
项目目录
  → project.yaml
  → 校验项目版本、项目标识和协议相对路径
  → 加载 protocols/ 下的 Protocol Schema v0.1
  → 返回 Project 领域对象或稳定诊断

Protocol 元数据 + protocols/ 下的相对路径
  → 校验路径和最小 Protocol Schema
  → 创建嵌套目录和 Schema 文件
  → 写回 project.yaml
  → 重新加载并验证 Project
```

本阶段不创建完整 Project、不建立最近项目数据库、不保存窗口布局、不监听外部文件变化，也不生成二进制索引文件。

## 2. 最小目录结构

```text
smart-sensor/
├── project.yaml
└── protocols/
    ├── smart-sensor.protocol.yaml
    └── vendors/
        └── acme/
            └── telemetry.protocol.yaml
```

只要求 `project.yaml` 和实际引用到的 `protocols/` 文件。创建 API 会按需创建 `protocols/` 及其嵌套目录；`messages/`、`connections/`、`environments/`、`simulators/`、`tests/`、`scripts/`、`captures/` 和项目内 `docs/` 在对应功能开始使用时再创建。

所有项目数据都是 UTF-8 普通文本，可以直接由外部编辑器修改并纳入 Git。Core 当前只读取文件，不写入隐藏状态或二进制缓存。

## 3. project.yaml

```yaml
schemaVersion: "0.1"
project:
  name: smart-sensor-studio
  displayName: Smart Sensor Studio
  version: "1.0"
  description: Smart sensor protocol workspace
protocols:
  - protocols/smart-sensor.protocol.yaml
```

| 路径 | 必填 | 类型 | 规则 |
|---|---:|---|---|
| `schemaVersion` | 是 | string | 当前只接受精确值 `0.1` |
| `project` | 是 | mapping | 项目元数据 |
| `project.name` | 是 | string | 非空稳定项目标识 |
| `project.displayName` | 否 | string | 面向用户的显示名称 |
| `project.version` | 否 | string | 项目自身版本 |
| `project.description` | 否 | string | 项目说明 |
| `protocols` | 是 | sequence | Protocol Schema 文件路径，可以为空 |

未知键作为未来扩展元数据忽略。创建 Protocol 时通过 Rapid YAML 保留未知节点并追加引用，但会规范化 YAML 排版，注释和原始格式不保证无损保留。

## 4. 协议路径规则

`protocols` 中的每个路径必须满足：

- 使用 `/` 分隔，不能使用平台专属的 `\`。
- 必须是相对路径。
- 规范化后必须位于项目的 `protocols/` 目录内。
- 不能使用 `..` 逃逸项目目录。
- 不能重复引用同一个规范化路径。
- 符号链接解析后的真实路径仍必须位于项目目录内。
- 目标文件必须能由 Protocol Schema v0.1 加载和校验。

这些规则使同一个 `project.yaml` 可以在 Windows、Linux 和 macOS 之间直接共享。

## 5. Core API

公共入口：

```cpp
#include "iotps/core/workspace/workspace.hpp"

auto result = iotps::core::workspace::load_project(project_directory);

auto created = iotps::core::workspace::create_protocol(
    project_directory,
    {
        .relative_path = "vendors/acme/telemetry.protocol.yaml",
        .protocol = {
            .name = "acme-telemetry",
            .display_name = "ACME Telemetry",
            .version = "1.0",
        },
    });
```

成功值 `Project` 包含：

- 规范化后的项目根目录。
- `ProjectManifest` 项目元数据和协议相对路径。
- 已加载的 `ProjectProtocol` 列表及其 `ProtocolSchema`。

API 使用 `std::filesystem::path`，不暴露 Win32、WebView2 或 GUI 类型。

`ProtocolCreateRequest::relative_path` 相对于项目 `protocols/` 目录，统一使用 `/`。创建结果是重新加载并验证后的完整 `Project`；新 Protocol 初始包含元数据、默认字节序和空 `messages` 映射。API 不覆盖已有文件，不重复添加引用，并在写回失败或回读失败时恢复原 `project.yaml`、删除本次创建的协议文件。

## 6. 稳定错误码

```text
project_directory_not_found
project_manifest_open_failed
project_manifest_read_failed
yaml_parse_error
yaml_root_mapping_required
yaml_required_node_missing
yaml_node_type_mismatch
schema_version_required
unsupported_schema_version
project_name_required
protocol_path_empty
protocol_path_not_portable
protocol_path_outside_project
duplicate_protocol_path
protocol_file_load_failed
protocol_schema_invalid
protocol_not_referenced
protocol_file_already_exists
protocol_directory_create_failed
protocol_file_write_failed
project_manifest_write_failed
```

项目清单自身的 YAML 错误包含 `project.yaml` 文件名、领域路径、字节偏移和源码行列。Protocol Schema 错误转换为 Workspace 错误时保留底层 Schema 错误码、原因和源码位置。

## 7. CLI 验证

```powershell
iotps project validate .\test\vectors\project\smart-sensor
```

成功输出：

```text
Project valid: smart-sensor-studio
Protocols: 1
```

成功返回 `0`，项目或协议错误返回 `1`，命令用法错误返回 `2`。

## 8. Protocol YAML 安全更新

`update_protocol(projectDirectory, relativePath, yaml)` 只允许更新 `project.yaml` 已引用且仍位于项目目录内的 Protocol。候选内容先由 Schema Loader 建立完整领域模型；失败时返回 `protocol_schema_invalid`、领域路径和源码行列，磁盘原文件不变。

校验成功后，Core 在目标文件同目录写入 `.iotps.tmp`，将原文件改名为 `.iotps.bak`，再替换目标并调用 `load_project()` 回读整个项目。回读失败时恢复备份；成功后删除备份。残留临时文件不会被覆盖，而是返回 `protocol_file_write_failed` 供用户处理。未被清单引用的路径返回 `protocol_not_referenced`。

## 9. 后续边界

以下能力仍不属于 v0.1 Workspace Core：

- 完整 Project 创建、Protocol 重命名/删除和任意 Schema 结构写回。
- Windows 目录选择器和 WebView Host Bridge 属于 `apps/desktop-win` 平台层；现已复用 Workspace Core 实现项目打开、读取、Protocol 创建、编辑保存和关闭。
- 最近项目、项目复制、导入、导出和归档。
- 外部文件监听、自动刷新和未保存修改提示。
- Explorer GUI 已支持真实嵌套树、Protocol 新建和 YAML 源码编辑；重命名、删除和拖放仍未实现。
- `messages/`、`connections/` 等资源文件的加载契约。
