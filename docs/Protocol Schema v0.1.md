# Protocol Schema v0.1

> 状态：已实现的基础格式  
> 更新日期：2026-08-28
> 适用入口：C++ Core、`iotps schema validate`

相关文档：[Core 模块架构](<./Core 模块架构.md>) · [固定长度 String 与 Bytes](<./固定长度 String 与 Bytes.md>) · [Length Field](<./Length Field.md>) · [固定长度 Array](<./固定长度 Array.md>) · [功能清单与开发进度](<./IoT Protocol Studio 功能清单与开发进度.md>) · [SmartSensor 示例](./examples/SmartSensor.protocol.yaml)

## 1. 目标和边界

Protocol Schema 是协议定义的 Single Source of Truth。v0.1 首先建立一条可验证的基础链路：

```text
YAML 文件
  → 语法和节点类型检查
  → ProtocolSchema C++ 领域模型
  → 领域规则校验
  → 稳定错误码、字段路径和源码位置
```

v0.1 当前覆盖 Protocol、Message、基础 Field、固定 `length`/`offset`、固定长度 `string`/`bytes`、最小单字段 `lengthOf`、固定长度 Primitive Array 和 Checksum 的最小模型。Workspace 可以根据 Protocol 元数据生成一个空 `messages` 的最小 Schema；任意 Schema 结构的无损写回、连续 Length Range、动态目标、动态 Array、Struct、Enum、BitField、Condition 和动态校验范围仍不在本阶段。

## 2. YAML 依赖

Core 私有使用 [Rapid YAML](https://github.com/biojppm/rapidyaml) `v0.16.0`，通过 CMake `FetchContent` 下载固定版本，并校验归档 SHA-256：

```text
ad4337d468c5f5d8624651bdc2900f7fe601c83fc3cff669dc972bf8634af4e9
```

选择依据：

- C++20 可直接集成，不要求在系统中预装 YAML 动态库。
- 支持解析节点的文件名、字节偏移、行号和列号。
- 依赖只链接到 `iotps_schema` 的私有实现，不暴露在 `core/include/` 公共头文件中。
- 版本、下载地址和哈希固定，构建输入可以复现。

Rapid YAML 使用 MIT License。升级依赖时必须同时更新版本、归档哈希，并执行 Debug/Release 全量测试。

## 3. 完整示例

```yaml
schemaVersion: "0.1"
protocol:
  name: smart-sensor
  displayName: Smart Sensor
  version: "1.0"
  description: Smart temperature sensor protocol
  defaultByteOrder: little
messages:
  telemetry:
    displayName: Telemetry
    typeId: 1
    fields:
      - name: command
        displayName: Command
        type: uint8
        length: 1
        offset: 0
      - name: temperature
        displayName: Temperature
        type: int16
        endian: little
        length: 2
        offset: 2
      - name: payloadLength
        type: uint8
        lengthOf: payload
      - name: payload
        type: bytes
        length: 4
      - name: checksum
        type: uint16
    checksum:
      name: checksum
      algorithm: crc16-modbus
      targetField: checksum
```

报文名称是 `messages` 映射的键；字段名称位于字段对象的 `name` 属性中。映射保持 YAML 中的定义顺序。

## 4. 节点定义

### 4.1 根节点

| 属性 | 类型 | 必填 | 规则 |
|---|---|---:|---|
| `schemaVersion` | scalar | 是 | 当前只接受字符串 `"0.1"` |
| `protocol` | mapping | 是 | Protocol 元数据 |
| `messages` | mapping | 是 | 键为 Message 名称；允许空映射 |

### 4.2 Protocol

| 属性 | 类型 | 必填 | 默认值或规则 |
|---|---|---:|---|
| `name` | scalar | 是 | 非空稳定标识 |
| `displayName` | scalar | 否 | 空字符串 |
| `version` | scalar | 是 | 非空协议业务版本；与 `schemaVersion` 含义不同 |
| `description` | scalar | 否 | 空字符串 |
| `defaultByteOrder` | scalar | 否 | `big`；可选值见下文 |

### 4.3 Message

| 属性 | 类型 | 必填 | 默认值或规则 |
|---|---|---:|---|
| 映射键 | scalar | 是 | Message 名称，在同一 Protocol 内唯一 |
| `displayName` | scalar | 否 | 空字符串 |
| `typeId` | unsigned integer scalar | 否 | 如果存在，在同一 Protocol 内唯一 |
| `fields` | sequence | 是 | Field 列表；允许空序列 |
| `checksum` | mapping | 否 | Checksum 定义 |

### 4.4 Field

| 属性 | 类型 | 必填 | 默认值或规则 |
|---|---|---:|---|
| `name` | scalar | 是 | 在同一 Message 内非空且唯一 |
| `displayName` | scalar | 否 | 空字符串 |
| `type` | scalar | 是 | 可选值见下文 |
| `endian` | scalar | 否 | 未设置时由 Codec 使用 Protocol 默认字节序 |
| `length` | unsigned integer scalar | 条件必填 | 固定 Primitive 默认使用类型自然宽度；显式值必须匹配自然宽度；固定 `string`/`bytes` 必须显式提供大于 0 的字节长度 |
| `offset` | unsigned integer scalar | 否 | 默认使用前一字段结束位置；显式值不得小于当前布局游标 |
| `lengthOf` | scalar | 否 | 将当前 Field 定义为派生 Length Field；必须使用无符号整数并引用同一 Message 中的一个 Field |
| `elementType` | scalar | Array 必填 | `type: array` 时必须是固定宽度 Primitive；其他 Field 禁止声明 |
| `count` | unsigned integer scalar | Array 必填 | `type: array` 时必须大于 `0`；其他 Field 禁止声明 |

固定布局按 Field 定义顺序计算。省略 `offset` 时字段紧接当前游标；显式 `offset` 大于当前游标时形成 gap。Decode 跳过 gap，Encode 使用 `0x00` 填充，字段的 `FieldRange` 不包含 padding。`offset + length` 不得溢出，最后一个字段的结束位置就是固定帧长度，帧后仍有字节时 Codec 返回尾随数据错误。固定 `string` 的 `length` 是 UTF-8 wire 字节数，短值右侧使用 NUL padding；固定 `bytes` 的 Encode 输入必须与 `length` 精确相等。完整文本契约见 [固定长度 String 与 Bytes](<./固定长度 String 与 Bytes.md>)。

`lengthOf` 第一阶段只引用一个固定 wire Field，值等于目标 `FieldRange.length`，不包含 Length Field 自身、header、trailer、checksum 或字段间 gap。Length Field 可前置或后置，只能使用 `uint8`/`uint16`/`uint32`/`uint64`，不得引用自身或形成依赖循环。完整契约见 [Length Field](<./Length Field.md>)。

固定 Array 使用 `type: array`、固定宽度 Primitive `elementType` 和大于零的固定 `count`。Array 不允许声明 `length`，wire 长度由 `primitiveWidth(elementType) * count` 唯一计算；`offset` 作用于数组整体，`endian` 逐元素应用。`lengthOf` 引用 Array 时得到数组完整 wire 长度。完整契约见 [固定长度 Array](<./固定长度 Array.md>)。

### 4.5 Checksum

| 属性 | 类型 | 必填 | 规则 |
|---|---|---:|---|
| `name` | scalar | 是 | Checksum 定义名称 |
| `algorithm` | scalar | 是 | 可选值见下文 |
| `targetField` | scalar | 是 | 必须引用当前 Message 中存在的 Field |

## 5. 枚举值

字节序：

```text
big
little
```

Field 类型：

```text
bool / boolean
int8 / uint8
int16 / uint16
int32 / uint32
int64 / uint64
float32 / float64
bytes / string
array
```

Checksum 算法：

```text
sum8
xor8
crc16-modbus
custom
```

枚举值区分大小写。未知值会被拒绝，不会静默回退到默认值。

## 6. 公共 C++ API

公共头文件：`iotps/core/schema/schema.hpp`、`iotps/core/schema/loader.hpp`

```cpp
SchemaLoadResult load_yaml(std::string_view yaml,
                           std::string source_name = "<memory>");

SchemaLoadResult load_yaml_file(const std::filesystem::path& path);

std::optional<std::size_t> wire_size(const FieldDefinition& field);
std::string_view to_string(ByteOrder byte_order);
std::string_view to_string(FieldType type);
```

加载成功值是 `ProtocolSchema`，失败值是 `SchemaDiagnostic`。`wire_size()` 按 Schema 固定布局规则返回 Field 有效 wire 长度，供 Codec 之外的只读展示复用；两个 `to_string()` 输出稳定的 YAML 枚举名。公共 API 不暴露 Rapid YAML 类型。

## 7. 诊断契约

每个加载错误至少包含：

- 稳定 `SchemaErrorCode`。
- YAML 路径或领域路径，例如 `messages.telemetry.fields[0].type`。
- 可读原因。
- 能够定位到 YAML 节点时，包含文件名、从 1 开始的行号和列号，以及从 0 开始的字节偏移。

诊断分为四类：

| 类别 | 示例错误码 |
|---|---|
| 文件 I/O | `file_open_failed`、`file_read_failed` |
| YAML 语法/形状 | `yaml_parse_error`、`yaml_required_node_missing`、`yaml_node_type_mismatch` |
| YAML 标量映射 | `yaml_invalid_scalar`、`yaml_unknown_field_type`、`yaml_unknown_byte_order` |
| 领域规则 | `unsupported_schema_version`、`duplicate_message_type_id`、`field_length_required`、`field_length_zero`、`field_length_mismatch`、`field_offset_overflow`、`field_layout_overlap`、`length_field_target_not_found`、`length_field_dependency_cycle`、`array_element_type_required`、`array_element_type_unsupported`、`array_count_required`、`array_count_zero`、`array_length_overflow`、`array_length_not_allowed`、`array_metadata_not_allowed`、`checksum_field_not_found` |

加载器只返回第一个阻止建立稳定领域模型的错误。后续 Protocol Designer 的 Problems 功能可以在模型建立成功后扩展为多诊断展示。

Windows Protocol Designer 保存源码时复用同一个 `load_yaml()`，不会在 TypeScript 中建立第二套 YAML 规则。候选 YAML 校验失败时保留原文件，并把稳定错误码、领域路径和 1-based 行列返回 Web UI；校验成功后由 Workspace Core 原子替换并重新加载项目。

## 8. CLI

```powershell
iotps schema validate .\docs\examples\SmartSensor.protocol.yaml
```

合法文件输出：

```text
Schema valid: smart-sensor 1.0
Messages: 1
```

退出码：

| 退出码 | 含义 |
|---:|---|
| `0` | 文件加载和 Schema 校验成功 |
| `1` | 文件、YAML 或 Schema 校验失败 |
| `2` | 命令用法错误 |

## 9. v0.1 兼容规则

1. `schemaVersion` 是格式版本，当前实现只接受精确值 `"0.1"`；其他版本返回 `unsupported_schema_version`。
2. v0.1 内允许增加未知键，加载器会忽略这些键，以便附加工具元数据；未知键当前不会保存到 C++ 领域模型，也不能依赖加载后无损写回。
3. 已知键的类型、必填性和枚举值是严格契约。改变节点类型、删除必填键或使用未知枚举值属于不兼容修改。
4. 增加可选键和新的可选语义可以保持 `0.1`；增加必填键、改变已有含义或改变数据结构必须提升 Schema 版本。
5. 当前不执行自动迁移。未来引入 `0.2` 时，应保留独立的 `0.1 → 0.2` 迁移器，并以原文件备份、显式确认和 golden vectors 验证迁移结果。
6. Protocol 的 `version` 是用户协议版本，不控制 Schema 文件解析兼容性。

## 10. 验证资产

- 用户示例：`docs/examples/SmartSensor.protocol.yaml`。
- 合法向量：`test/vectors/smart-sensor.yaml`。
- 非法向量：`test/vectors/invalid-schema.yaml`。
- 单元测试：合法映射、固定 `length`/`offset`、固定 string/bytes 必填长度、固定 Array 元素类型和 `count`、YAML 语法错误、节点形状、必填字段、非法标量、未知枚举、重复 Type ID、非法长度、布局重叠、溢出、文件加载和源码位置。
- 固定布局向量：`test/vectors/primitive-frame.schema.yaml`，覆盖显式 gap、Protocol 默认字节序、Field 字节序覆盖和 Encode/Decode round-trip。
- 固定文本向量：`test/vectors/fixed-text-frame.schema.yaml`，覆盖 UTF-8 string、NUL padding、固定 bytes、显式 gap 和 Encode/Decode round-trip。
- Length Field 向量：`test/vectors/length-field-frame.schema.yaml`，覆盖单字段引用、自动回填、Decode 校验、Little Endian、显式 gap 和 Encode/Decode round-trip。
- 固定 Array 向量：`test/vectors/fixed-array-frame.schema.yaml`，覆盖 Primitive Array、固定 `count`、逐元素字节序、显式 gap、元素范围、`lengthOf` 和 Encode/Decode round-trip。
- CLI 测试：合法向量成功、非法向量失败。
