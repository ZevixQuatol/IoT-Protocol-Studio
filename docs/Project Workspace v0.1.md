# Project Workspace v0.1

> 状态：已实现  
> 更新日期：2026-08-28  
> 适用范围：Portable C++ Core、CLI 和普通文本项目目录

相关文档：[功能清单与开发进度](<./IoT Protocol Studio 功能清单与开发进度.md>) · [Protocol Schema v0.1](<./Protocol Schema v0.1.md>) · [Core 模块架构](<./Core 模块架构.md>)

## 1. 第一阶段范围

Workspace 第一阶段只解决一个问题：给定包含 `project.yaml` 的普通目录，Core 能加载项目元数据和项目引用的 Protocol Schema。

```text
项目目录
  → project.yaml
  → 校验项目版本、项目标识和协议相对路径
  → 加载 protocols/ 下的 Protocol Schema v0.1
  → 返回 Project 领域对象或稳定诊断
```

本阶段不创建最近项目数据库，不保存窗口布局，不监听外部文件变化，也不生成二进制索引文件。

## 2. 最小目录结构

```text
smart-sensor/
├── project.yaml
└── protocols/
    └── smart-sensor.protocol.yaml
```

第一阶段只要求 `project.yaml` 和实际引用到的 `protocols/` 文件。`messages/`、`connections/`、`environments/`、`simulators/`、`tests/`、`scripts/`、`captures/` 和项目内 `docs/` 在对应功能开始使用时再创建。

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

未知键作为未来扩展元数据忽略；当前加载器不承诺无损写回。

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
```

成功值 `Project` 包含：

- 规范化后的项目根目录。
- `ProjectManifest` 项目元数据和协议相对路径。
- 已加载的 `ProjectProtocol` 列表及其 `ProtocolSchema`。

API 使用 `std::filesystem::path`，不暴露 Win32、WebView2 或 GUI 类型。

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

## 8. 后续边界

以下能力不属于 v0.1 Workspace Core：

- `project.yaml` 写回和项目创建向导。
- Windows 目录选择器和 WebView Host Bridge。
- 最近项目、项目复制、导入、导出和归档。
- 外部文件监听、自动刷新和未保存修改提示。
- Explorer 新建、重命名、删除和拖放。
- `messages/`、`connections/` 等资源文件的加载契约。
