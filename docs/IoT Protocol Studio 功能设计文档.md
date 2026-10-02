# IoT Protocol Studio 功能设计文档

> Version: 0.1  
> Status: Draft  
> Type: Desktop App  
> Target: IoT / Embedded / Industrial Protocol Development & Testing

---

## 1. 产品概述

IoT Protocol Studio 是一款面向物联网、嵌入式、工业控制及设备通信开发场景的通用二进制协议开发与测试工具。

产品核心目标：

> 将「协议文档 + HEX 工具 + 串口助手 + Socket 工具 + 协议解析器 + 设备模拟器 + 自动化测试工具」整合为统一的 Protocol Workbench。

核心工作流：

```text
协议定义
   ↓
协议编码 / 解码
   ↓
通信连接
   ↓
数据收发
   ↓
协议解析
   ↓
设备模拟
   ↓
测试用例
   ↓
自动化测试 / 压力测试
   ↓
报告 / 文档 / 代码生成
```

---

# 2. 功能总览

```text
IoT Protocol Studio
│
├── 1. 工作空间 Workspace
│   ├── 项目管理
│   ├── 环境管理
│   ├── 变量管理
│   └── 工作区配置
│
├── 2. 协议设计 Protocol Designer
│   ├── 数据帧定义
│   ├── 字段定义
│   ├── 数据类型
│   ├── 字节序
│   ├── 位域
│   ├── 条件字段
│   ├── 动态长度
│   ├── 数组/结构体
│   ├── 枚举
│   ├── 校验算法
│   └── 协议版本
│
├── 3. 编解码 Codec
│   ├── HEX → Object
│   ├── Object → HEX
│   ├── 实时解析
│   ├── 字段高亮
│   └── 错误诊断
│
├── 4. HEX Studio
│   ├── HEX 编辑
│   ├── ASCII
│   ├── Binary
│   ├── Decimal
│   ├── 数据转换
│   ├── 字节序转换
│   └── 数据计算
│
├── 5. 通信 Transport
│   ├── Serial
│   ├── TCP Client
│   ├── TCP Server
│   ├── UDP
│   ├── WebSocket
│   ├── MQTT
│   └── BLE
│
├── 6. 调试器 Debugger
│   ├── 数据收发
│   ├── 请求/响应
│   ├── 数据过滤
│   ├── 时间线
│   ├── 原始数据
│   └── 解析结果
│
├── 7. 报文工作台 Message Studio
│   ├── 报文模板
│   ├── 表单组包
│   ├── 自动长度
│   ├── 自动校验
│   ├── 动态变量
│   └── 批量发送
│
├── 8. 设备模拟 Simulator
│   ├── 单设备
│   ├── 多设备
│   ├── 数据生成
│   ├── 行为模型
│   ├── 定时上报
│   ├── 请求响应
│   └── 故障模拟
│
├── 9. 测试中心 Testing
│   ├── Test Case
│   ├── Test Suite
│   ├── Assertion
│   ├── 参数化测试
│   ├── 边界测试
│   ├── 异常测试
│   └── 测试报告
│
├── 10. 性能测试 Load Testing
│   ├── 虚拟设备
│   ├── 并发连接
│   ├── TPS
│   ├── 流量统计
│   ├── 延迟
│   └── 错误率
│
├── 11. 数据捕获 Capture
│   ├── 会话记录
│   ├── 数据导入
│   ├── PCAP
│   ├── 数据回放
│   └── 协议分析
│
├── 12. 脚本 Script
│   ├── JavaScript
│   ├── Lua
│   ├── Pre-request
│   ├── Post-response
│   └── 自定义 Codec
│
├── 13. 数据生成 Generator
│   ├── Random
│   ├── Sequence
│   ├── Timestamp
│   ├── UUID
│   ├── Range
│   └── 自定义函数
│
├── 14. 协议文档 Documentation
│   ├── 自动生成协议文档
│   ├── 字段表
│   ├── 示例报文
│   └── Markdown/HTML 导出
│
├── 15. Code Generator
│   ├── C/C++
│   ├── Rust
│   ├── Go
│   ├── Java
│   ├── Python
│   └── Wireshark Lua
│
├── 16. 插件 Plugin
│   ├── Transport Plugin
│   ├── Protocol Plugin
│   ├── Codec Plugin
│   ├── Generator Plugin
│   └── UI Plugin
│
└── 17. 系统
    ├── 设置
    ├── 日志
    ├── 主题
    ├── 快捷键
    ├── 数据备份
    └── 更新
```

---

# 3. Workspace 工作空间

## 3.1 项目

每个 Project 对应一个设备、产品或协议项目。

```text
Project
├── Protocols
├── Connections
├── Messages
├── Simulators
├── Tests
├── Scripts
├── Captures
├── Documents
└── Environments
```

支持：

- 新建项目
- 打开项目
- 最近项目
- 导入/导出项目
- 项目复制
- 项目模板
- 项目搜索
- 项目压缩归档

项目应能够保存为普通目录，方便 Git 管理。

---

# 4. Protocol Designer 协议设计器

这是整个产品最核心的模块。

## 4.1 协议结构

支持：

```text
Protocol
└── Message
    ├── Header
    ├── Body
    └── Footer
```

一个协议可以存在多个 Message Type：

```text
DeviceProtocol
├── Login
├── Heartbeat
├── Telemetry
├── Alarm
├── Command
└── CommandResponse
```

---

## 4.2 基础数据类型

支持：

```text
bool

int8
uint8

int16
uint16

int32
uint32

int64
uint64

float32
float64

char
string
bytes

BCD
timestamp
enum
bitfield
array
struct
```

---

## 4.3 字节序

支持：

```text
Big Endian
Little Endian
```

允许：

- 协议默认字节序
- Message 字节序
- Field 独立字节序

---

## 4.4 Field 字段

字段属性：

```text
name
displayName
type
length
offset
endian
default
description
unit
required
```

高级属性：

```text
scale
offsetValue
min
max
enum
condition
expression
encoding
```

例如：

```text
Raw Value:
01 02

uint16 LE:
0x0201

Scale:
0.1

Result:
51.3 °C
```

---

# 5. 动态协议结构

必须支持 IoT 私有协议常见动态结构。

## 5.1 Length Field

例如：

```text
AA 55
00 10
BODY...
CRC
```

允许定义：

```text
lengthOf: body
```

编码时自动计算。

---

## 5.2 Conditional Field

例如：

```text
if command == 0x03
    temperature
    humidity
```

---

## 5.3 Array

支持：

```text
Sensor[10]
```

以及：

```text
count
Sensor[count]
```

---

## 5.4 Nested Struct

例如：

```text
GPS
├── longitude
├── latitude
├── altitude
└── satellites
```

---

# 6. Bit Field

IoT 协议大量使用位状态。

例如：

```text
Status = 0x0D

00001101
```

定义：

```text
bit0 = online
bit1 = alarm
bit2 = charging
bit3 = gpsFixed
```

显示：

```text
Online       true
Alarm        false
Charging     true
GPS Fixed    true
```

---

# 7. Enum

例如：

```text
Command

0x01 Login
0x02 Heartbeat
0x03 Telemetry
0x04 Alarm
```

HEX：

```text
03
```

解析：

```text
Command
0x03
Telemetry
```

---

# 8. Checksum / CRC

内置：

```text
SUM8
SUM16

XOR

LRC

CRC8
CRC16
CRC32
```

CRC 参数支持：

```text
Polynomial
Initial Value
Reflect Input
Reflect Output
XOR Out
```

内置常见算法：

```text
CRC16/MODBUS
CRC16/CCITT
CRC16/XMODEM
CRC32
```

允许定义计算范围：

```text
CRC(
    from = Header,
    to = BodyEnd
)
```

---

# 9. Codec 编解码器

核心能力：

```text
Binary/HEX
      ↓
    Decode
      ↓
Structured Object
```

以及：

```text
Structured Object
      ↓
    Encode
      ↓
Binary/HEX
```

---

# 10. 可视化协议解析

输入：

```text
AA 55 01 0A 78 56 34 12 03 02 01 A8 C3
```

展示：

```text
AA 55 | Header
01    | Version
0A    | Length
78 56 34 12 | Device ID
03    | Command
02 01 | Temperature
A8 C3 | CRC
```

HEX 与字段树双向联动。

点击字段：

```text
Temperature
```

HEX：

```text
02 01
^^^^^
```

同步高亮。

点击 HEX 字节时反向定位所属字段。

---

# 11. HEX Studio

提供独立 HEX 数据工作台。

显示模式：

```text
HEX
ASCII
Binary
Decimal
```

数据转换：

```text
HEX ↔ ASCII
HEX ↔ Base64
HEX ↔ Binary
HEX ↔ Decimal
HEX ↔ UTF-8
```

数值转换：

```text
int
uint
float
double
BCD
timestamp
```

支持：

- 字节序转换
- 位运算
- XOR
- AND
- OR
- SHIFT
- 数据长度
- Offset
- 数据查找
- 数据替换

---

# 12. Transport 通信层

Transport 与 Protocol 完全解耦。

```text
Protocol
    ↓
Codec
    ↓
Transport
```

---

## 12.1 Serial

支持：

```text
RS232
RS485
UART
```

参数：

```text
Port
Baud Rate
Data Bits
Stop Bits
Parity
Flow Control
```

---

## 12.2 TCP Client

支持：

- Host / Port
- 自动重连
- KeepAlive
- HEX 发送
- 定时发送
- SSL/TLS

---

## 12.3 TCP Server

支持：

- 多客户端
- Client Session
- Client ID
- 在线连接管理
- 单独发送
- 广播

---

## 12.4 UDP

支持：

```text
UDP Client
UDP Server
Broadcast
Multicast
```

---

## 12.5 WebSocket

支持：

```text
ws
wss
```

---

## 12.6 MQTT

支持：

```text
MQTT 3.1.1
MQTT 5
```

功能：

- Broker
- Topic
- Subscribe
- Publish
- QoS
- Retain
- TLS
- Username/Password

Payload 可以绑定 Protocol Codec。

---

## 12.7 BLE

支持：

```text
Device Scan
Connect
Service
Characteristic
Read
Write
Notify
```

---

# 13. Message Studio 报文工作台

类似 Postman Request。

每个 Message 可以保存。

例如：

```text
Login Request

Device ID:
[ 12345678 ]

Firmware:
[ 1.2.0 ]

Device Type:
[ Sensor ]

             [ Encode ]
             [ Send ]
```

自动生成：

```text
AA 55 01 0A ...
```

支持：

- 自动 Length
- 自动 CRC
- 默认值
- 枚举选择
- Bit Field UI
- Timestamp
- 动态变量

---

# 14. Variables 变量系统

支持：

```text
{{deviceId}}
{{timestamp}}
{{random}}
{{sequence}}
{{token}}
```

作用域：

```text
Global
Workspace
Project
Environment
Simulator
Session
Message
```

---

# 15. Environment 环境

类似 Postman Environment。

例如：

```text
Development

server = 192.168.1.10
port = 9000
deviceId = 100001
```

Production：

```text
server = iot.example.com
port = 9000
```

一键切换环境。

---

# 16. Debugger 调试器

统一显示：

```text
TIME
DIRECTION
CONNECTION
SIZE
TYPE
DATA
STATUS
```

方向：

```text
TX →
RX ←
```

每条记录可以查看：

```text
Raw HEX
Parsed
ASCII
Binary
Metadata
Timestamp
```

---

# 17. Message Timeline

类似 Wireshark Timeline：

```text
10:21:01.012 Device → Server Login
10:21:01.034 Server → Device LoginACK
10:21:05.001 Device → Server Heartbeat
10:21:10.003 Device → Server Telemetry
```

支持：

- 搜索
- Direction Filter
- Message Type Filter
- Device Filter
- Connection Filter
- 时间范围

---

# 18. Device Simulator

设备模拟器是核心模块之一。

## 18.1 单设备模拟

例如：

```text
Device ID
100001

Protocol
SmartSensor V1

Connection
TCP

Server
192.168.1.10:9000
```

---

# 19. Device State

设备具有状态：

```text
offline
connecting
online
sleep
alarm
error
```

状态可以影响设备行为。

---

# 20. Behavior 行为模型

例如：

```text
ON CONNECT
    SEND Login

WAIT LoginACK

EVERY 30s
    SEND Heartbeat

EVERY 10s
    SEND Telemetry
```

形成：

```text
Connect
   ↓
Login
   ↓
Login ACK
   ↓
Online
   ↓
Heartbeat
   ↓
Telemetry
```

---

# 21. 数据生成器

支持：

```text
Random
Sequence
Range
Timestamp
UUID
List
Expression
Script
```

例如：

```text
temperature = random(20,35)

humidity = random(40,80)

battery = decrease(100,0,0.01)
```

---

# 22. 批量设备模拟

例如：

```text
Device Count
10000

Device ID
10000000 + index
```

运行：

```text
Device00001
Device00002
Device00003
...
Device10000
```

支持：

- 分批上线
- 随机上线
- 随机离线
- 定时上报
- 随机数据
- 独立状态

---

# 23. 故障模拟

支持模拟：

```text
CRC Error
Invalid Length
Invalid Header
Random Bytes
Packet Loss
Duplicate Packet
Delay
Timeout
Disconnect
Reconnect
Malformed Packet
```

用于测试服务端健壮性。

---

# 24. Test Case

测试用例结构：

```text
Setup
 ↓
Connect
 ↓
Send
 ↓
Receive
 ↓
Decode
 ↓
Assert
 ↓
Cleanup
```

---

# 25. Assertion

支持：

```text
equals
notEquals

greaterThan
lessThan

contains

matches

exists

length

responseTime
```

例如：

```text
response.command == 0x81

response.status == 0

response.deviceId == request.deviceId
```

---

# 26. Test Suite

组织：

```text
Login Tests

├── Normal Login
├── Invalid Device
├── Wrong CRC
├── Invalid Length
├── Duplicate Login
└── Timeout
```

支持：

```text
Run Test
Run Suite
Run All
```

---

# 27. 参数化测试

例如：

```text
temperature:

-40
-20
0
20
100
125
```

自动生成多个测试。

---

# 28. Load Testing

压力测试：

```text
Virtual Devices
10000

Ramp Up
100 device/s

Duration
30 min

Upload Interval
5 sec
```

---

# 29. 性能指标

实时统计：

```text
Connections

Messages/sec

Bytes/sec

Latency

P50
P90
P95
P99

Errors

Timeout

Reconnect
```

---

# 30. Capture

允许记录所有通信。

保存：

```text
Timestamp
Direction
Connection
Raw Data
Parsed Data
```

---

# 31. Replay

捕获的数据可以：

```text
Capture
   ↓
Replay
   ↓
Server
```

支持：

```text
Original Timing
2x
5x
10x
Maximum Speed
```

---

# 32. PCAP

支持：

```text
Import PCAP
```

提取：

```text
TCP Payload
UDP Payload
```

交给 Protocol Codec 解析。

后期支持：

```text
Export PCAP
```

---

# 33. Script Engine

建议第一阶段只内置 JavaScript。

生命周期：

```text
Before Encode

After Encode

Before Send

After Receive

Before Decode

After Decode
```

例如：

```javascript
context.temperature = Math.random() * 20 + 20;
```

---

# 34. Custom Codec

允许脚本处理特殊协议：

```text
encode()
decode()
```

解决 DSL 无法表达的复杂协议。

---

# 35. Protocol Documentation

根据 Protocol Schema 自动生成协议文档。

内容：

```text
Protocol
Message Types
Frame Structure
Field Description
Enum
Bit Field
Checksum
Examples
```

导出：

```text
Markdown
HTML
PDF
```

---

# 36. Code Generator

根据协议 Schema 自动生成编解码代码。

第一阶段建议支持：

```text
C
C++
Rust
Go
Java
Python
```

例如生成：

```text
encodeTelemetry()

decodeTelemetry()
```

---

# 37. Wireshark Dissector Generator

根据协议 Schema：

```text
Protocol Schema
      ↓
Generator
      ↓
Wireshark Lua Dissector
```

使用户可以直接使用 Wireshark 解析自定义协议。

---

# 38. Protocol Schema

协议定义必须使用文本格式保存。

推荐：

```text
YAML
```

例如：

```yaml
protocol:
  name: SmartSensor
  version: 1

messages:

  telemetry:

    fields:

      - name: header
        type: uint16
        value: 0xAA55
        endian: big

      - name: length
        type: uint16
        endian: big

      - name: deviceId
        type: uint32
        endian: little

      - name: temperature
        type: int16
        endian: little
        scale: 0.1
        unit: °C
```

GUI Protocol Designer 实际操作的就是这份 Schema。

因此：

```text
GUI
 ↕
Protocol Schema
 ↕
Codec Engine
```

---

# 39. 项目文件结构

推荐：

```text
my-device/
│
├── project.yaml
│
├── protocols/
│   └── device.yaml
│
├── messages/
│   ├── login.yaml
│   └── telemetry.yaml
│
├── connections/
│
├── environments/
│
├── simulators/
│
├── tests/
│
├── scripts/
│
├── captures/
│
└── docs/
```

整个项目可以：

```bash
git init
```

直接进入版本管理。

---

# 40. Plugin System

插件类型：

```text
Transport Plugin

Protocol Plugin

Codec Plugin

Checksum Plugin

Generator Plugin

Importer Plugin

Exporter Plugin
```

未来可以形成插件生态。

---

# 41. CLI

桌面应用之外提供：

```text
iotps
```

例如：

```bash
iotps decode protocol.yaml data.hex

iotps encode protocol.yaml telemetry.json

iotps test ./tests

iotps simulate simulator.yaml

iotps loadtest loadtest.yaml
```

便于 CI/CD。

---

# 42. 自动化 / CI

例如：

```bash
iotps test
```

返回：

```text
Tests: 120

Passed: 118
Failed: 2

Exit Code: 1
```

可以集成：

```text
GitHub Actions

GitLab CI

Jenkins
```

---

# 43. UI 信息架构

主界面建议：

```text
┌────────────────────────────────────────────────────────────┐
│ Project        Environment        Connection       RUN     │
├───────────┬──────────────────────────────┬─────────────────┤
│           │                              │                 │
│ Explorer  │          Editor              │    Inspector    │
│           │                              │                 │
│ Protocol  │ HEX / Message / Protocol     │ Parsed Fields   │
│ Messages  │                              │                 │
│ Simulator │                              │                 │
│ Tests     │                              │                 │
│ Capture   │                              │                 │
│           │                              │                 │
├───────────┴──────────────────────────────┴─────────────────┤
│ TX/RX | Console | Timeline | Test Results | Problems       │
└────────────────────────────────────────────────────────────┘
```

整体交互可以参考：

```text
VS Code
+
Postman
+
Wireshark
+
010 Editor
```

而不是传统串口助手。

---

# 44. 全局搜索

支持搜索：

```text
Protocol

Message

Field

Test

Simulator

Script

Capture
```

快捷入口建议：

```text
Ctrl + P
```

---

# 45. Command Palette

类似 VS Code：

```text
Ctrl + Shift + P
```

例如：

```text
> Connect TCP

> Run Test

> Start Simulator

> Decode HEX

> Calculate CRC

> Generate Code
```

---

# 46. Problems

统一显示协议错误：

```text
ERROR
Length field references unknown field

WARNING
Enum value duplicated

ERROR
CRC range invalid

WARNING
Field overlaps previous field
```

---

# 47. 数据安全

敏感变量：

```text
Password
Token
Certificate
Private Key
```

支持：

```text
Secret Variable
```

默认不明文展示。

---

# 48. 日志

日志等级：

```text
TRACE
DEBUG
INFO
WARN
ERROR
```

支持：

- 日志过滤
- 日志导出
- 模块过滤
- 时间过滤

---

# 49. 第一阶段 MVP

不要第一版就实现全部功能。

MVP 建议只做：

```text
Workspace

Protocol Designer
├── Primitive Type
├── Struct
├── Array
├── Enum
├── BitField
├── Endian
├── Length
└── CRC

Codec
├── Encode
└── Decode

HEX Studio

Transport
├── Serial
├── TCP Client
├── TCP Server
└── UDP

Message Studio

Debugger

Timeline

Basic Simulator

Basic Test Case

Environment

Variables
```

MVP 核心闭环：

```text
定义协议
    ↓
输入 HEX
    ↓
自动解析
    ↓
修改字段
    ↓
自动组包
    ↓
TCP / UDP / Serial 发送
    ↓
接收响应
    ↓
自动解析
```

只要这个闭环体验足够好，产品已经具有独立使用价值。

---

# 50. 第二阶段

增加：

```text
MQTT

WebSocket

高级 Simulator

批量设备

Test Suite

Script Engine

Capture

Replay

PCAP Import
```

---

# 51. 第三阶段

增加：

```text
Load Testing

CLI

CI/CD

Code Generator

Wireshark Generator

Protocol Documentation

Plugin System
```

---

# 52. 后续高级能力

后续可以考虑 AI Protocol Assistant。

输入：

```text
协议 PDF / Word / Markdown
```

AI 尝试生成：

```text
Protocol Schema
```

形成：

```text
协议文档
   ↓
AI
   ↓
Protocol Schema
   ↓
人工确认
   ↓
Codec
   ↓
直接测试
```

还可以支持：

```text
HEX Sample
     ↓
AI Analyze
     ↓
Potential Frame Structure
```

辅助分析未知协议：

```text
AA55 0012 01 ...
AA55 0014 02 ...
AA55 0012 01 ...
```

自动推测：

```text
0-1   Header
2-3   Possible Length
4     Possible Message Type
...
N-2   Possible CRC
```

AI 只负责辅助推测，最终协议定义由用户确认。

---

# 53. 产品边界

产品核心定位：

> Protocol Development & Testing Workbench

重点解决：

```text
协议怎么定义？

HEX 到底代表什么？

这个字段为什么解析错误？

怎么生成正确报文？

怎么把报文发送给设备？

设备返回的数据是什么意思？

没有真实设备怎么开发服务器？

服务器能不能扛住 10000 台设备？

协议升级后有没有破坏兼容性？
```

不建议将产品扩展成完整 IoT Platform。

以下能力不属于核心范围：

```text
设备资产管理平台

IoT 云平台

数字孪生平台

BI 数据分析

时序数据库

OTA 平台

规则引擎平台

大型 SCADA/HMI
```

保持产品聚焦于：

**协议设计 → 编解码 → 通信 → 调试 → 模拟 → 测试。**

---

# 54. 产品核心竞争力

最终应该形成五个核心能力：

```text
                Protocol Schema
                      │
          ┌───────────┼───────────┐
          ↓           ↓           ↓
        Codec      Simulator     Tests
          │           │           │
          └───────────┼───────────┘
                      ↓
                  Transport
```

其中 **Protocol Schema 是整个产品的 Single Source of Truth**。

一份协议定义可以同时驱动：

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

这也是产品与普通：

```text
串口助手
Socket 调试工具
HEX Viewer
```

最本质的区别。

---

# 55. 产品设计原则

1. **Schema First**  
   所有功能围绕统一 Protocol Schema 构建。

2. **Transport Independent**  
   协议与 TCP、UDP、Serial 等传输层解耦。

3. **Bidirectional**  
   所有协议必须同时支持 Decode 与 Encode。

4. **Visual + Code**  
   GUI 和 Schema 源码双向同步。

5. **Developer Friendly**  
   项目文件文本化，可 Git 管理。

6. **Automation First**  
   GUI 能完成的核心测试能力，应逐步开放给 CLI。

7. **Extensible**  
   非标准协议通过 Script / Plugin 扩展。

8. **Observable**  
   所有收发数据都能够追踪到 Raw HEX、字段解析和时间线。

---

# 56. 最终产品形态

```text
                  IoT Protocol Studio
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
     DESIGN             DEBUG             TEST
        │                 │                 │
 Protocol Designer   Message Studio     Test Runner
 HEX Studio          Transport          Simulator
 Codec               Timeline           Load Test
        │                 │                 │
        └─────────────────┼─────────────────┘
                          │
                    Protocol Schema
                          │
          ┌───────────────┼───────────────┐
          │               │               │
         CLI          Code Generator   Documentation
          │               │               │
          └───────────────┼───────────────┘
                          │
                       CI/CD
```

产品最终目标：

> **成为二进制设备协议领域的 Postman。**

用户不再需要在协议文档、计算器、CRC 网站、串口助手、Socket 工具、Wireshark、脚本和 Excel 之间反复切换，而是在一个项目中完成协议从设计到验证的完整生命周期。