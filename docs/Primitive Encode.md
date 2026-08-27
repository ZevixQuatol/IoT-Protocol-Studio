# Primitive Encode

> 状态：固定布局基础类型 Encode 与显式 Field 布局已实现  
> 更新日期：2026-08-27  
> 适用入口：`iotps/core/codec/codec.hpp`

相关文档：[Protocol Schema v0.1](<./Protocol Schema v0.1.md>) · [Primitive Decode](<./Primitive Decode.md>) · [Core 模块架构](<./Core 模块架构.md>) · [功能清单与开发进度](<./IoT Protocol Studio 功能清单与开发进度.md>)

## 1. 范围

本阶段实现 `FixedLayoutCodec` 的固定长度 Primitive Encode：

```text
Protocol 默认字节序
  + MessageDefinition
  + StructuredMessage
  → 校验 Message 和字段集合
  → 校验 ScalarValue 类型与表示范围
  → 共享固定布局 + Field endian 覆盖
  → ByteBuffer
```

当前只编码固定宽度基础类型，并支持固定 `length`/`offset`。字符串、动态 bytes、BCD、timestamp、Enum、BitField、Array、Struct、Condition、Length 自动计算和 Checksum 自动计算不在本阶段。

## 2. 公共 API

```cpp
EncodeResult encode(
    const schema::MessageDefinition& definition,
    const StructuredMessage& message,
    schema::ByteOrder default_byte_order = schema::ByteOrder::big_endian) const;
```

从完整 `ProtocolSchema` 调用时，应传入协议默认字节序：

```cpp
const auto encoded = codec.encode(
    message_definition,
    structured_message,
    protocol_schema.protocol.default_byte_order);
```

第三个参数具有 Big Endian 默认值，现有两参数调用保持兼容。Codec 不持有完整 `ProtocolSchema`，也不负责选择 Message Type。

## 3. Message 和字段匹配

编码前执行以下约束：

1. `StructuredMessage.message_name` 必须等于 `MessageDefinition.name`。
2. Schema 中的每个字段都必须在 `StructuredMessage.fields` 中出现一次。
3. 同名字段出现多次时返回 `duplicate_field`，不采用第一个或最后一个值。
4. Schema 未定义的额外字段返回 `unexpected_field`，不静默丢弃。
5. 输入字段可以采用任意顺序，输出字节始终按照 Schema 字段顺序生成。

错误的 `offset` 表示字段规划后的 wire 起点；额外字段没有自己的 wire offset，因此使用合法固定帧结束位置。

固定布局在写入字段前统一计算。省略 Field `offset` 时使用当前游标；显式 `offset` 大于当前游标时产生 gap，并用 `0x00` 填充。固定 Primitive 的 `length` 省略时使用类型自然宽度，显式值必须与自然宽度一致。Encode 与 Decode 共用同一套布局计划，因此帧长度、字段位置和 padding 规则不会分叉。

## 4. 类型映射和范围

| Schema FieldType | 要求的 ScalarValue 类型 | 字节宽度 | 校验规则 |
|---|---|---:|---|
| `bool` / `boolean` | `bool` | 1 | `false → 0`，`true → 1` |
| `int8` | `std::int64_t` | 1 | `INT8_MIN...INT8_MAX` |
| `uint8` | `std::uint64_t` | 1 | `0...UINT8_MAX` |
| `int16` | `std::int64_t` | 2 | `INT16_MIN...INT16_MAX` |
| `uint16` | `std::uint64_t` | 2 | `0...UINT16_MAX` |
| `int32` | `std::int64_t` | 4 | `INT32_MIN...INT32_MAX` |
| `uint32` | `std::uint64_t` | 4 | `0...UINT32_MAX` |
| `int64` | `std::int64_t` | 8 | 完整 64 位有符号范围 |
| `uint64` | `std::uint64_t` | 8 | 完整 64 位无符号范围 |
| `float32` | `double` | 4 | 有限值超出 binary32 最大范围时拒绝 |
| `float64` | `double` | 8 | 保留 binary64 位模式 |

有符号整数先检查目标类型范围，再转换为同宽无符号位模式。`float32` 按 IEC 559 转换为 binary32；NaN 和正负 Infinity 可以编码，有限值溢出返回 `value_out_of_range`。`float64` 直接保留 `double` 的 binary64 位模式。

Codec 不进行隐式跨类别转换。例如，`uint16` 必须使用 `std::uint64_t`，传入数值相同的 `std::int64_t` 仍返回 `type_mismatch`。这样可以在 GUI、CLI 或文件映射层尽早暴露类型错误。

## 5. 字节序

有效字节序按以下优先级解析：

```text
Field endian
  > encode() 的 default_byte_order
  > API 默认 Big Endian
```

单字节类型不受字节序影响。整数和浮点数共用位模式写入逻辑，因此 Field 覆盖对所有多字节 Primitive 一致生效。

当前 Schema 模型还没有 Message 级字节序覆盖；加入该属性时，应在调用 Codec 前解析成默认字节序，或显式扩展 Encode Context。

## 6. 错误契约

| 错误码 | 触发条件 | path | offset |
|---|---|---|---:|
| `message_name_mismatch` | StructuredMessage 与 MessageDefinition 名称不同 | `messageName` | 0 |
| `missing_field` | Schema 必填字段不存在 | `<message>.<field>` | 规划后的字段起点 |
| `duplicate_field` | Schema 字段在输入对象中出现多次 | `<message>.<field>` | 规划后的字段起点 |
| `unexpected_field` | 输入对象包含 Schema 未定义字段 | `<message>.<field>` | 固定帧结束位置 |
| `type_mismatch` | ScalarValue variant 类型与 FieldType 不一致 | `<message>.<field>` | 规划后的字段起点 |
| `value_out_of_range` | 整数或有限 float32 超出目标表示范围 | `<message>.<field>` | 规划后的字段起点 |
| `unsupported_field_type` | Field 不是已支持的固定宽度 Primitive | `<message>.<field>` | 规划时的当前游标 |
| `invalid_layout` | 手工构造的 MessageDefinition 包含零长度、宽度不匹配、溢出或重叠 | `<message>.<field>` | 非法字段起点 |

`detail` 使用稳定的非本地化技术文本说明缺失、重复、额外字段、期望的 ScalarValue 类型或目标数值范围。Web UI 仍应根据错误码和结构化字段生成中英文用户文案。

## 7. Golden Vector 和 Round-trip

Primitive Encode 复用以下 golden vector：

- `test/vectors/primitive-frame.schema.yaml`
- `test/vectors/primitive-frame.hex`
- `test/vectors/primitive-frame.expected`

集成测试执行：

```text
Schema YAML + golden HEX
  → Decode
  → StructuredMessage
  → Encode
  → 与 golden HEX 逐字节相等
  → 再次 Decode
  → 字段名称、ScalarValue 与原对象相等
```

这条链路同时覆盖 Protocol 默认 Little Endian、Field Big Endian 覆盖、显式 gap、零 padding、bool、整数、浮点、正负数和跨字节值。单元测试另外覆盖类型错误、缺失/重复/额外字段、整数越界、float32 溢出和不支持类型。

`Encode(Decode(Bytes)) == Bytes` 只对使用零 padding 的规范帧成立。Decode 接受 gap 中的任意字节，但不会把 padding 保存到 `StructuredMessage`；再次 Encode 时这些字节会被规范化为 `0x00`。如果后续产品需要原始 padding 无损回放，应单独在 Decode 结果中保留未解析区间，而不是把 padding 伪装成业务 Field。

## 8. 后续阶段

固定布局的 Field `length` 和 `offset` 已完成：

```text
Schema YAML
  → Field length / offset
  → 重叠和溢出诊断
  → Decode 按固定位置读取
  → Encode 按固定位置写入
  → padding 与 FieldRange
```

下一阶段扩展固定长度 `string`/`bytes`，明确编码、填充和截断规则；随后再实现 Length Field、Struct、Array、Enum、BitField、Condition 和 Checksum Range。
