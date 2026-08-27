# 固定长度 String 与 Bytes

> 状态：已实现  
> 更新日期：2026-08-27  
> 适用范围：Protocol Schema v0.1、`FixedLayoutCodec`

相关文档：[Protocol Schema v0.1](<./Protocol Schema v0.1.md>) · [固定 Field 布局](<./固定 Field 布局.md>) · [Primitive Decode](<./Primitive Decode.md>) · [Primitive Encode](<./Primitive Encode.md>) · [功能清单与开发进度](<./IoT Protocol Studio 功能清单与开发进度.md>)

## 1. 范围

本阶段只实现显式 `length` 的固定长度 `string` 和 `bytes`：

```text
Schema YAML + Field length / offset
  → 固定布局计划
  → string ↔ std::string ↔ UTF-8 wire bytes
  → bytes ↔ ByteBuffer
  → FieldRange
```

Length 驱动的动态 string/bytes、其他文本编码、可配置 terminator、可配置 padding、截断模式和未知字节保留不在本阶段。后续已完成的最小 `lengthOf` 可以引用这里定义的固定 string/bytes，并计算其完整 wire 长度，详见 [Length Field](<./Length Field.md>)。

## 2. Schema 契约

```yaml
fields:
  - name: label
    type: string
    length: 8
  - name: payload
    type: bytes
    length: 4
    offset: 10
```

- `string` 和 `bytes` 必须显式声明 `length`。
- `length` 必须大于 0。
- `length` 参与现有 offset、gap、重叠、溢出和固定帧长度计算。
- 缺失长度返回 `SchemaErrorCode::field_length_required`，YAML loader 将源码位置定位到该 Field 的 `type` 节点。
- 调用方绕过 Schema loader 时，Codec 返回 `CodecErrorCode::invalid_layout`。
- `endian` 不影响 `string` 和 `bytes`；字段字节按 wire 顺序直接复制。

## 3. String Wire 契约

### 3.1 Encode

`ScalarValue` 必须保存 `std::string`，内容必须是有效 UTF-8：

1. `length` 表示 UTF-8 编码后的 wire 字节数，不表示 Unicode 字符数。
2. 输入不得包含内嵌 NUL，即 `U+0000`。
3. 编码后字节数大于 `length` 时返回 `value_out_of_range`，不静默截断。
4. 编码后字节数等于 `length` 时直接写入，不强制追加终止符。
5. 编码后字节数小于 `length` 时，右侧剩余字节全部填充 `0x00`。

例如 `温度` 的 UTF-8 长度是 6 字节，写入 `length: 8` 后为：

```text
E6 B8 A9 E5 BA A6 00 00
```

### 3.2 Decode

1. 在字段范围内查找首个 `0x00`。
2. 存在 NUL 时，NUL 之前的字节是文本，NUL 及其后必须全部为零 padding。
3. 不存在 NUL 时，整个字段范围都是文本。
4. 文本字节必须是严格有效的 UTF-8。
5. Decode 返回不含 NUL 和 padding 的 `std::string`。

首个 NUL 后出现非零字节会返回 `invalid_string_padding`。非法 UTF-8 会返回 `invalid_string_encoding`。这组规则使短字符串只有一种规范编码，避免将隐藏数据留在字符串 padding 中。

## 4. Bytes Wire 契约

- `ScalarValue` 必须保存 `ByteBuffer`。
- Encode 要求 `ByteBuffer::size() == Field.length`。
- 长度不一致返回 `value_out_of_range`，不自动补零、不截断。
- Decode 原样复制字段范围内的全部字节，包括任意位置的 `0x00`。
- `bytes` 没有 terminator、字符编码或去 padding 语义。

如果业务协议需要可变长度 bytes，必须由后续 Length Field 或动态结构显式定义，不能依靠固定 bytes 的隐式补齐猜测有效长度。

## 5. 错误契约

| 错误码 | 条件 | offset |
|---|---|---:|
| `field_length_required` | Schema 中 `string/bytes` 缺少 `length` | Schema path |
| `invalid_layout` | 直接构造的固定 `string/bytes` 缺少长度 | 字段起点 |
| `type_mismatch` | string 未使用 `std::string`，或 bytes 未使用 `ByteBuffer` | 字段起点 |
| `value_out_of_range` | UTF-8 字节数超长，或 bytes 长度不等于字段长度 | 字段起点 |
| `invalid_string_encoding` | Encode 输入含 NUL/非法 UTF-8，或 Decode 得到非法 UTF-8 | 字段起点 |
| `invalid_string_padding` | Decode 时首个 NUL 后存在非零字节 | 首个违规字节 |

Core 的 `detail` 保持非本地化技术文本；Web UI 后续根据错误码生成中英文文案。

## 6. Round-trip 边界

规范帧满足：

```text
Decode(Encode(Object)) == Object
Encode(Decode(CanonicalBytes)) == CanonicalBytes
```

字符串 Decode 会去除 NUL padding，所以再次 Encode 会生成规范的右侧零填充。gap 仍沿用固定布局规则：Decode 接受任意 gap 字节，Encode 将 gap 规范化为 `0x00`。

## 7. 验证资产

- `test/unit/schema_test.cpp`：必填长度、固定文本/bytes 布局重叠。
- `test/unit/schema_loader_test.cpp`：YAML 中 string 缺失长度。
- `test/unit/codec_test.cpp`：UTF-8、NUL、padding、超长、类型和 bytes 精确长度。
- `test/vectors/fixed-text-frame.*`：UTF-8 中文、零填充、内部零 bytes、显式 gap、FieldRange 和双向 round-trip。
- `test/integration/fixed_text_test.cpp`：完整 YAML → Decode → expected → Encode → HEX 链路。

## 8. 下一阶段

下一阶段只设计并实现最小 Length Field：明确长度字段引用、包含/排除范围、Decode 校验、Encode 自动计算和布局阶段依赖。Struct、Array、Condition 和 Checksum Range 在 Length Field 契约稳定后再进入。
