# Length Field

> 状态：最小单字段 `lengthOf` 已实现
> 更新日期：2026-08-27
> 适用入口：Protocol Schema v0.1、`FixedLayoutCodec`

相关文档：[Protocol Schema v0.1](<./Protocol Schema v0.1.md>) · [Primitive Decode](<./Primitive Decode.md>) · [Primitive Encode](<./Primitive Encode.md>) · [功能清单与开发进度](<./IoT Protocol Studio 功能清单与开发进度.md>)

## 1. 第一阶段范围

Length Field 是一个无符号整数字段，通过 `lengthOf` 引用同一 Message 中的一个目标 Field：

```yaml
fields:
  - name: bodyLength
    type: uint16
    endian: little
    lengthOf: body
  - name: body
    type: bytes
    length: 4
```

第一阶段只支持单个、固定 wire 宽度的目标 Field。它建立以下闭环：

```text
Schema lengthOf 引用
  → 校验类型、目标和依赖
  → Decode 比较声明值与目标 FieldRange.length
  → Encode 根据目标 wire 长度自动回填
  → golden HEX round-trip
```

连续范围、动态 `bytes`/`string`、Length 驱动 Array、Struct 范围、倍率/偏移单位和 Checksum Range 尚未实现。

## 2. 长度值语义

`lengthOf` 的值必须精确匹配同一 Message 中一个 Field 的稳定 `name`。长度值等于该目标 Field 的完整 wire 字节数，也就是目标的 `FieldRange.length`。

第一阶段明确排除以下内容：

- Length Field 自身的字节数。
- 目标字段前后的 header、trailer、terminator 或 checksum。
- 目标字段前后的显式 gap/padding。
- Message 中其他字段的字节数。

固定 `string` 的 wire 长度包含右侧 NUL padding，不是 UTF-8 文本的有效字符数或有效字节数。固定 `bytes` 使用 Schema 声明的完整 `length`。

例如：

```text
A5 | 04 00 | 00 | DE AD 00 FF | 5A
     length   gap      body
```

`bodyLength` 使用 Little Endian，值为 `4`。它不包含 `marker`、Length Field 自身、1 字节 gap 或 `trailer`。

## 3. Schema 规则

Length Field 必须满足：

1. 类型只能是 `uint8`、`uint16`、`uint32` 或 `uint64`。
2. `lengthOf` 必须引用同一 Message 中存在的 Field。
3. 不允许引用自身。
4. 多个 Length Field 形成的依赖图不得循环。
5. Length Field 和目标 Field 都继续使用既有 `length`、`offset`、重叠与溢出规则。

Length Field 可以位于目标字段之前或之后。Encode 先建立完整布局，再写入所有派生长度，因此后置 Length Field 不需要特殊 Schema 语法。

## 4. Encode 契约

`lengthOf` 字段是派生值：

- `StructuredMessage.fields` 可以省略该字段。
- 如果输入包含一次同名占位值，Codec 忽略占位值并写入重新计算的长度。
- 如果输入包含多个同名字段，仍返回 `duplicate_field`。
- 目标业务字段仍然必填并执行原有类型与长度校验。
- 计算结果无法装入 Length Field 类型时返回 `length_value_out_of_range`。
- Length Field 使用自己的 `endian`；省略时使用 Codec 的 Protocol 默认字节序。

这种规则保证 Message Studio、Simulator 或测试代码不会把陈旧的手工长度写入报文。

## 5. Decode 契约

Decode 正常解析并保留 Length Field 的 `FieldValue` 和 `FieldRange`，随后比较声明值与目标 Field 的 wire 长度：

- 相等时成功返回。
- 不相等时返回 `length_value_mismatch`，错误 path 指向 Length Field，offset 指向 Length Field 起点。
- 帧在目标字段结束前截断时返回既有 `insufficient_data`，path 指向第一个无法完整读取的目标字段。
- 目标字段存在但声明值错误时，不根据错误声明值扩展或缩短固定布局。

最后一条是第一阶段的重要边界：固定布局仍由 Schema 决定，报文中的 Length 值只用于一致性校验。动态消费范围将在动态 `bytes`、Array 或 Struct 阶段引入。

## 6. 诊断契约

Schema 诊断：

| 错误码 | 触发条件 | path |
|---|---|---|
| `length_field_type_unsupported` | Length Field 不是支持的无符号整数 | `messages[i].fields[j].lengthOf` |
| `length_field_target_not_found` | 目标名称不存在 | `messages[i].fields[j].lengthOf` |
| `length_field_self_reference` | 引用自身 | `messages[i].fields[j].lengthOf` |
| `length_field_dependency_cycle` | Length Field 依赖形成循环 | `messages[i].fields[j].lengthOf` |

Codec 诊断：

| 错误码 | 触发条件 | path |
|---|---|---|
| `length_value_mismatch` | Decode 声明值不等于目标 wire 长度 | `<message>.<length-field>` |
| `length_value_out_of_range` | Encode 计算值无法装入 Length Field 类型 | `<message>.<length-field>` |
| `insufficient_data` | 帧不足以容纳 Schema 规定的目标字段 | `<message>.<target-field>` |
| `invalid_layout` | 调用方绕过 Schema loader，传入非法引用、类型、自引用或循环 | `<message>.<length-field>` |

YAML loader 会把领域诊断关联到 `lengthOf` 节点的文件名、字节偏移、行号和列号。Core 继续返回非本地化技术 detail，Web UI 负责中英文文案。

## 7. 验证资产

独立 golden vector：

- `test/vectors/length-field-frame.schema.yaml`
- `test/vectors/length-field-frame.hex`
- `test/vectors/length-field-frame.expected`
- `test/integration/length_field_test.cpp`

自动测试覆盖：

- YAML `lengthOf` 加载和源码位置。
- 前置与后置 Length Field。
- Little Endian 自动回填。
- 输入省略派生字段和覆盖陈旧占位值。
- header、trailer 和 gap 排除规则。
- Decode 声明值不一致。
- 目标帧截断。
- 未知目标、非法类型、自引用和循环依赖。
- `uint8` 容量溢出。
- `Schema → Decode → Encode → golden HEX` round-trip。

## 8. 后续扩展

下一步进入 M02-F08 的固定长度 Array。后续动态能力应复用当前 `lengthOf` 依赖与诊断模型，逐步增加：

```text
固定 Array
  → Count/Length 驱动 Array
  → 动态 bytes/string
  → Struct 与连续范围
  → Condition
  → Checksum Range
```

增加连续范围时必须采用明确的结构化起止引用，不能让一个字符串表达式同时承担字段查找、算术和条件语义。
