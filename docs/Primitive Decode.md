# Primitive Decode

> 状态：固定布局 Primitive、String、Bytes 与最小 Length Field Decode 已实现
> 更新日期：2026-08-27  
> 适用入口：`iotps/core/codec/codec.hpp`

相关文档：[Protocol Schema v0.1](<./Protocol Schema v0.1.md>) · [固定长度 String 与 Bytes](<./固定长度 String 与 Bytes.md>) · [Length Field](<./Length Field.md>) · [Core 模块架构](<./Core 模块架构.md>) · [功能清单与开发进度](<./IoT Protocol Studio 功能清单与开发进度.md>)

## 1. 范围

本阶段实现 `FixedLayoutCodec` 的固定长度 Primitive Decode：

```text
Protocol 默认字节序
  + MessageDefinition
  + ByteBuffer
  → 计算共享固定布局并按位置读取
  → Field endian 覆盖
  → ScalarValue
  → FieldRange
```

当前处理固定宽度 Primitive、显式 `length` 的固定 UTF-8 `string`/`bytes` 和引用单个固定 Field 的 `lengthOf`，并支持固定 `offset`。动态 string/bytes、连续 Length Range、BCD、timestamp、Enum、BitField、Array、Struct、Condition 和 Checksum 不在本阶段。

## 2. 公共 API

```cpp
DecodeResult decode(
    const schema::MessageDefinition& definition,
    std::span<const std::uint8_t> bytes,
    schema::ByteOrder default_byte_order = schema::ByteOrder::big_endian) const;
```

从完整 `ProtocolSchema` 调用时，应传入协议默认字节序：

```cpp
const auto decoded = codec.decode(
    message_definition,
    bytes,
    protocol_schema.protocol.default_byte_order);
```

第三个参数有 Big Endian 默认值，现有的两参数调用保持兼容。Codec 只接收真正需要的默认字节序，不持有整个 ProtocolSchema，也不负责选择 Message Type。

## 3. 类型映射

| Schema FieldType | 字节宽度 | ScalarValue 类型 | 说明 |
|---|---:|---|---|
| `bool` / `boolean` | 1 | `bool` | 只接受 `0` 或 `1` |
| `int8` | 1 | `std::int64_t` | 二进制补码符号扩展 |
| `uint8` | 1 | `std::uint64_t` | 无符号扩展 |
| `int16` | 2 | `std::int64_t` | 二进制补码符号扩展 |
| `uint16` | 2 | `std::uint64_t` | 无符号扩展 |
| `int32` | 4 | `std::int64_t` | 二进制补码符号扩展 |
| `uint32` | 4 | `std::uint64_t` | 无符号扩展 |
| `int64` | 8 | `std::int64_t` | 保留完整 64 位模式 |
| `uint64` | 8 | `std::uint64_t` | 保留完整 64 位模式 |
| `float32` | 4 | `double` | IEEE-754 binary32 转换为 double |
| `float64` | 8 | `double` | IEEE-754 binary64 |
| `string` | 显式 `length` | `std::string` | 首个 NUL 前的有效 UTF-8；其后只能是零 padding |
| `bytes` | 显式 `length` | `ByteBuffer` | 原样保留全部字节，包括 `0x00` |

有符号整数通过相同宽度的无符号位模式进行 `std::bit_cast`，避免依赖实现定义的越界整数转换。构建时静态要求平台的 `float`/`double` 分别为 4/8 字节且符合 IEC 559。

## 4. 字节序

有效字节序按以下优先级解析：

```text
Field endian
  > decode() 的 default_byte_order
  > API 默认 Big Endian
```

单字节类型不受字节序影响。多字节整数和浮点数使用相同的位模式读取逻辑，因此 Field 级覆盖对 `int16`、`uint32`、`float32`、`float64` 等类型行为一致。

当前 Schema 模型还没有 Message 级字节序覆盖；加入该属性时，应在调用 Codec 前解析成默认字节序，或显式扩展 Decode Context。

## 5. 输出

每个成功解码的字段产生：

```text
FieldValue
├── name
└── ScalarValue

FieldRange
├── path       <message>.<field>
├── offset     从 0 开始的字节偏移
└── length     字段实际消费的字节数
```

字段按 Schema 中的定义顺序读取，`FieldValue` 与 `FieldRange` 使用相同索引一一对应。省略 `offset` 时字段从当前游标开始；显式 `offset` 大于游标时，Decode 跳过中间的 padding。`FieldRange` 只覆盖字段自身，不覆盖 gap。固定 Primitive 的显式 `length` 必须等于类型自然宽度；固定 `string`/`bytes` 必须显式提供长度。

## 6. 错误契约

| 错误码 | 触发条件 | path | offset |
|---|---|---|---:|
| `insufficient_data` | 剩余字节不足以读取完整字段 | `<message>.<field>` | 字段起点 |
| `value_out_of_range` | bool 字节不是 `0` 或 `1` | `<message>.<field>` | 字段起点 |
| `invalid_string_encoding` | string 字段不是有效 UTF-8 | `<message>.<field>` | 字段起点 |
| `invalid_string_padding` | 首个 NUL 后出现非零字节 | `<message>.<field>` | 首个违规字节 |
| `length_value_mismatch` | Length 声明值不等于目标 Field 的 wire 长度 | `<message>.<length-field>` | Length Field 起点 |
| `unexpected_data` | 所有字段完成后仍有未消费字节 | `<message>` | 首个剩余字节 |
| `invalid_layout` | 手工构造的 MessageDefinition 包含缺失/零长度、宽度不匹配、溢出或重叠 | `<message>.<field>` | 非法字段起点 |

错误 `detail` 会说明期望宽度、剩余宽度、非法布尔值规则或尾随字节数量。Decode 返回第一个阻止稳定解析的错误。

## 7. Golden Vector

集成测试使用三个文件形成可复现向量：

- `test/vectors/primitive-frame.schema.yaml`
- `test/vectors/primitive-frame.hex`
- `test/vectors/primitive-frame.expected`

向量覆盖：

- Protocol 默认 Little Endian。
- Field 覆盖 Big Endian。
- 显式 `offset` 形成的非连续布局和 padding。
- bool、int8、uint16、int16、uint32、float32 和 float64。
- 正负数、跨字节值和字段范围。
- `Schema YAML → HEX → Decode → expected` 完整公共链路。

单元测试另外覆盖所有 8/16/32/64 位整数、Big/Little Endian、非法 bool、输入截断和尾随数据。

固定文本集成向量 `test/vectors/fixed-text-frame.*` 另外覆盖 UTF-8 中文、NUL padding、内部零 bytes、显式 gap 和精确 FieldRange。

Length Field 集成向量 `test/vectors/length-field-frame.*` 另外覆盖声明值校验、Little Endian、目标 Field wire 范围、显式 gap 和 Encode/Decode round-trip。

## 8. 后续阶段

固定长度 Primitive Encode 已完成，具体契约见 [Primitive Encode](<./Primitive Encode.md>)：

```text
StructuredMessage
  → ScalarValue 类型检查
  → 数值范围检查
  → 应用 Field/Protocol 字节序
  → ByteBuffer
  → Decode(Encode(Object)) == Object
```

固定长度 `string`/`bytes` 与最小 Length Field 契约已经完成，详见 [固定长度 String 与 Bytes](<./固定长度 String 与 Bytes.md>) 和 [Length Field](<./Length Field.md>)。下一阶段进入固定长度 Array，再扩展其他动态结构。
