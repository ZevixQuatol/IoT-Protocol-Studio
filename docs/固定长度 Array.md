# 固定长度 Array

> 状态：已实现
> 更新日期：2026-08-28
> 适用范围：Protocol Schema v0.1、Portable C++ Core、`FixedLayoutCodec`

相关文档：[Protocol Schema v0.1](<./Protocol Schema v0.1.md>) · [Core 模块架构](<./Core 模块架构.md>) · [固定 Field 布局](<./固定 Field 布局.md>) · [Length Field](<./Length Field.md>) · [功能清单与开发进度](<./IoT Protocol Studio 功能清单与开发进度.md>)

## 1. 目标和边界

固定长度 Array 用于描述元素类型和数量在 Schema 中都已确定的连续数组：

```yaml
- name: samples
  type: array
  elementType: uint16
  count: 3
  endian: little
```

第一阶段只支持固定宽度 Primitive 元素：

```text
bool / boolean
int8 / uint8
int16 / uint16
int32 / uint32
int64 / uint64
float32 / float64
```

本阶段不包含：

- Count Field 或 Length Field 驱动的动态数组。
- `string`、`bytes`、Array 或 Struct 元素。
- Struct、Struct Array 或多层容器嵌套。
- Condition 驱动的可选元素。
- 连续 Length Range 或动态校验范围。

## 2. Schema 契约

Array Field 使用三个核心属性：

| 属性 | 必填 | 规则 |
|---|---:|---|
| `type` | 是 | 必须为 `array` |
| `elementType` | 是 | 必须是上表中的固定宽度 Primitive |
| `count` | 是 | 无符号整数，必须大于 `0` |

Array 可以继续使用 Field 通用属性：

- `name` 和 `displayName`。
- `offset`，作用于整个数组的起始位置。
- `endian`，作用于数组中的每个元素；未声明时使用 Protocol 默认字节序。

Array 不允许声明 `length`。数组的 wire 长度由 Core 唯一计算：

```text
arrayWireLength = primitiveWidth(elementType) * count
```

这条规则避免 `length`、元素宽度和 `count` 出现三个互相冲突的事实源。乘法结果不得超出 `size_t` 表示范围。

非 Array Field 不允许携带 `elementType` 或 `count`。

## 3. C++ 值模型

Codec 公共值模型区分 Primitive、Array、文本和原始字节：

```cpp
using PrimitiveValue =
    std::variant<bool, std::int64_t, std::uint64_t, double>;

using ArrayValue = std::vector<PrimitiveValue>;

using ScalarValue = std::variant<bool,
                                 std::int64_t,
                                 std::uint64_t,
                                 double,
                                 std::string,
                                 ByteBuffer,
                                 ArrayValue>;
```

`uint8[]` 不与 `bytes` 合并：

- `bytes` 表示一段不解释元素语义的原始 `ByteBuffer`，长度必须精确匹配。
- `array<uint8>` 表示有固定元素数量、逐元素路径和逐元素类型校验的数值序列。

这种区分让 UI、错误定位和后续字段级编辑保持明确。

## 4. 固定布局和字节序

数组复用现有固定 Field 布局规则：

1. 省略 `offset` 时，数组紧接当前布局游标。
2. 显式 `offset` 大于当前游标时形成 gap。
3. `offset` 指向数组整体第一个元素的第一个字节。
4. 数组必须完整位于固定帧中，不允许与前一个 Field 重叠。
5. `offset + arrayWireLength` 不得溢出。

字节序按元素独立应用，而不是把整个数组当成一个大整数翻转：

```yaml
protocol:
  defaultByteOrder: little

fields:
  - name: samples
    type: array
    elementType: uint16
    count: 3
  - name: ratios
    type: array
    elementType: float32
    count: 2
    endian: big
```

这里 `samples` 的每个 `uint16` 使用 Little Endian，`ratios` 的每个 `float32` 使用 Big Endian。

## 5. Decode 契约

Decode 按 Schema 顺序读取 `count` 个元素，并返回有序 `ArrayValue`：

```text
34 12 02 01 FF FF
  → uint16[3], little endian
  → [4660, 258, 65535]
```

Decode 同时返回两层范围：

```text
sample.samples      @2+6
sample.samples[0]   @2+2
sample.samples[1]   @4+2
sample.samples[2]   @6+2
```

- `field_ranges` 保存数组整体的 `FieldRange`。
- `element_ranges` 保存每个元素的路径、偏移和宽度。

输入不足以覆盖整个数组时，返回数组 Field 路径上的 `insufficient_data`。`bool` 元素只接受 wire 值 `0` 或 `1`，非法元素返回带索引路径的 `value_out_of_range`，例如 `sample.flags[1]`。

## 6. Encode 契约

Encode 要求 Array Field 的输入值是 `ArrayValue`，并严格执行：

1. 元素数量必须与 Schema `count` 完全一致。
2. 每个元素的 `PrimitiveValue` 分支必须与 `elementType` 对应。
3. 整数值必须位于目标位宽的表示范围内。
4. 有限 `double` 编码为 `float32` 时不得超出 `float` 表示范围。
5. 每个元素独立应用 Field 或 Protocol 字节序。

数量不一致返回 `array_count_mismatch`；元素类型或数值错误使用带索引的路径，例如 `sample.samples[2]`。

## 7. 与 Length Field 组合

`lengthOf` 可以引用固定 Array，值等于数组的完整 wire 长度：

```yaml
- name: samplesLength
  type: uint8
  lengthOf: samples
- name: samples
  type: array
  elementType: uint16
  count: 3
```

`samplesLength` 的派生值为：

```text
2 bytes * 3 = 6
```

Decode 校验声明值是否为 `6`；Encode 可以省略 `samplesLength` 输入，由 Codec 自动回填。该长度只包含数组 Field 的完整 wire 字节，不包含 Length Field 自身或数组前的 gap。

## 8. 稳定错误契约

Schema 诊断：

| 错误码 | 含义 |
|---|---|
| `array_element_type_required` | Array 缺少 `elementType` |
| `array_element_type_unsupported` | 元素类型不是固定宽度 Primitive |
| `array_count_required` | Array 缺少 `count` |
| `array_count_zero` | `count` 为 `0` |
| `array_length_overflow` | 元素宽度乘以 `count` 溢出 |
| `array_length_not_allowed` | Array 同时声明了 `length` |
| `array_metadata_not_allowed` | 非 Array Field 声明了 `elementType` 或 `count` |

Codec 诊断：

| 错误码 | 典型场景 |
|---|---|
| `invalid_layout` | 调用方绕过 Schema 校验，直接构造非法 Array 布局 |
| `type_mismatch` | Field 不是 `ArrayValue`，或某个元素值类型错误 |
| `array_count_mismatch` | 输入元素数量与 `count` 不一致 |
| `value_out_of_range` | 整数溢出、float32 溢出或非法 bool 元素 |
| `insufficient_data` | 输入字节不足以覆盖完整数组 |

错误路径优先定位到最具体对象：布局和截断使用 Field 路径，元素类型和值错误使用 `message.field[index]`。

## 9. 验证资产

Golden vector：

```text
test/vectors/fixed-array-frame.schema.yaml
test/vectors/fixed-array-frame.hex
test/vectors/fixed-array-frame.expected
```

自动测试：

```text
test/unit/schema_test.cpp
test/unit/schema_loader_test.cpp
test/unit/codec_test.cpp
test/integration/fixed_array_test.cpp
```

验证范围包括 YAML 映射、Schema 诊断、固定 `count`、整数和浮点数组、Protocol 默认字节序、Field 字节序覆盖、显式 `offset`、数组整体范围、元素范围、`lengthOf` 组合、Decode/Encode round-trip、数量/类型/范围错误、非法 bool、截断和非法布局。
