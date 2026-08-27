# 固定 Field 布局

> 状态：已实现  
> 更新日期：2026-08-27  
> 适用范围：Protocol Schema v0.1、`FixedLayoutCodec`

相关文档：[Protocol Schema v0.1](<./Protocol Schema v0.1.md>) · [Primitive Decode](<./Primitive Decode.md>) · [Primitive Encode](<./Primitive Encode.md>) · [功能清单与开发进度](<./IoT Protocol Studio 功能清单与开发进度.md>)

## 1. 目标

固定布局把 Field 定义顺序转换为唯一的 wire range，让 Schema、Decode 和 Encode 对字段位置与帧长度使用同一套规则：

```text
FieldDefinition[]
  → Layout Plan
  → Field offset + length
  → gap/padding
  → frame size
```

当前只支持自然宽度固定的 Primitive：bool、8/16/32/64 位整数、float32 和 float64。`string`、`bytes` 和动态结构将在后续阶段接入同一布局边界。

## 2. Schema 示例

```yaml
fields:
  - name: header
    type: uint8
    length: 1
    offset: 0
  - name: value
    type: uint16
    length: 2
    offset: 2
```

布局结果：

```text
byte 0     header
byte 1     gap/padding
byte 2..3  value
frame size 4
```

## 3. 布局规则

布局按 Field 定义顺序计算，并维护一个从 0 开始的 `cursor`：

1. `length` 省略时，固定 Primitive 使用类型自然宽度。
2. 显式 `length` 必须大于 0，并且必须等于 Primitive 自然宽度。
3. `offset` 省略时，字段起点等于当前 `cursor`。
4. 显式 `offset == cursor` 表示连续布局。
5. 显式 `offset > cursor` 表示字段前存在 gap。
6. 显式 `offset < cursor` 返回字段布局重叠诊断。
7. `offset + length` 不得发生 `std::size_t` 算术溢出。
8. 每个字段完成后，`cursor = offset + length`。
9. 所有字段完成后的 `cursor` 是固定帧长度。

该规则不允许通过调整 `length` 改变整数或浮点类型的 wire 宽度。可变宽度和 Length Field 属于后续动态布局能力。

## 4. Decode 契约

- Decode 只读取每个字段自己的 `[offset, offset + length)` 范围。
- gap 中的字节不解析、不要求为零，也不产生 `FieldValue`。
- `FieldRange` 精确记录字段自身范围，不包含 padding。
- 输入不足以覆盖某个字段时返回 `insufficient_data`，错误偏移为该字段起点。
- 输入长度大于固定帧长度时返回 `unexpected_data`，错误偏移为固定帧结束位置。

## 5. Encode 契约

- Encode 先建立完整布局计划，再创建固定帧。
- 整个输出帧初始填充为 `0x00`，因此所有 gap 都稳定编码为零。
- 字段按布局计划写入自己的范围，输入字段顺序不影响 wire 顺序。
- 缺失、重复、类型不匹配或数值越界的错误偏移使用该字段规划后的 wire 起点。
- Schema 外的额外字段没有 wire range，错误偏移使用固定帧结束位置。

因此，含非零 gap 的输入在 Decode 后再次 Encode 会被规范化为零 padding；字段值保持一致，但原始 gap 字节不会无损保留。

## 6. 防御性校验

YAML loader 建立领域模型后由 Schema validator 返回：

| SchemaErrorCode | 条件 |
|---|---|
| `field_length_zero` | 显式 `length == 0` |
| `field_length_mismatch` | 固定 Primitive 的 `length` 不等于自然宽度 |
| `field_offset_overflow` | `offset + length` 溢出 |
| `field_layout_overlap` | 字段起点小于当前布局游标 |

调用方可以绕过 YAML loader，直接构造 `MessageDefinition`。因此 Codec 在 Encode 和 Decode 前还会独立建立布局计划，并对同类非法定义返回 `CodecErrorCode::invalid_layout`，防止越界读写。

## 7. 验证资产

- `test/unit/schema_test.cpp`：零长度、宽度不匹配、重叠和溢出。
- `test/unit/schema_loader_test.cpp`：YAML 映射、非法无符号整数和重叠源码位置。
- `test/unit/codec_test.cpp`：显式 gap、补零、FieldRange、尾随数据和手工非法布局。
- `test/vectors/primitive-frame.*`：Protocol Little Endian、Field Big Endian、显式 gap 和 Decode/Encode round-trip。

## 8. 后续边界

下一阶段将固定长度 `string`/`bytes` 接入布局计划，并单独明确文本编码、填充、终止符和超长输入策略。在这些规则稳定后，再实现 Length Field、Array、Struct 和 Condition 等动态布局。
