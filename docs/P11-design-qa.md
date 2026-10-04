# P11 关联与时间线 UI 验证

日期：2026-10-04

## 实现

- 沿用当前通信会话和 Core `correlateTraffic`，将旧的折叠表单和文字事件表改为规则摘要、筛选统计、关联表、时间轴及双报文详情。
- 规则摘要显示协议、请求消息、响应消息、匹配字段、方向、范围和超时；编辑弹窗提供真实协议/消息/字段候选，支持校验、失败保留草稿、取消与停用。Core 当前仅支持一组请求/响应关联字段；没有将参考图中的 sequence/deviceId 标签解释为新增复合键。
- 关联表显示请求/响应时间、耗时、关联字段值、设备标识、消息、长度及全部 Core 状态。按状态、连接、文本、时间筛选；统计来自实际返回行。筛选仅改变展示，完整保留帧继续用于 Core 分析。
- 时间线按设备或逐条关联分组，使用真实时间位置绘制请求、响应、关联线和超时截止点；支持请求/响应/连线显示开关、1–4× 缩放、键盘选择及事件列表。无关联规则时仍显示原始记录；SYS、原始块和无法关联的记录不会从事件列表中丢失。
- 详情同时显示请求与响应、记录编号、真实 HEX、字段值/类型/字节范围、匹配字段对比及上一条/下一条。缺失的请求/响应保留明确空态。记录定位切换至原始记录页，并清除隐藏目标的记录筛选。
- 保留已批准的导航图标和主题规则，支持中英文、深浅主题及紧凑窗口。历史页复用 P11 时隐藏多余的通用报文详情栏。

## 文件

- `apps/web-ui/src/TrafficCorrelation.tsx`
- `apps/web-ui/src/CorrelationDetail.tsx`
- `apps/web-ui/src/TrafficTimeline.tsx`
- `apps/web-ui/src/correlationView.tsx`
- `apps/web-ui/src/traffic-analysis.css`
- `apps/web-ui/src/TcpWorkbench.tsx`：关联报文的原始记录跳转。
- `apps/web-ui/test/analysis-preview.html`、`analysis-fixture.js`：开发环境模拟 Bridge，仅用于浏览器验收，不进入生产入口。
- `test/web/p11-ui.js`：交互回归。

## 验证结果

- TypeScript 类型检查、P11 文件 Prettier 检查、前端生产构建通过。
- Windows x86_64 Release 构建通过，静态 `web-ui` 已复制到 EXE 同级目录。
- Release CTest：27/27，通过原生 WebView2/Bridge 冒烟、TCP 实际收发、关联单元测试等现有测试。关联/TCP 定向检查另通过 3/3。
- 浏览器模拟 Bridge 回归通过：Core 状态与耗时、双报文、下一条、超时空态、状态/设备/时间筛选保留 Core 输入、失败规则草稿、异步取消、时间轴选择/缩放/显示开关、历史与实时记录跳转、关闭规则后的原始时间线、无规则搜索、分析不发包。
- 目视检查深色/中文、浅色/英文、1580×1000、1280×900、900×900；图表与表格在局部滚动，窄屏详情移至下方。截图位于 `out/qa/p11/`：`correlation.png`、`timeline.png`、`correlation-live.png`、`timeline-live.png` 及浅色/窄屏截图。

## 验收边界

浏览器截图使用明确隔离的模拟数据；生产仍从 Core 与保留记录读取。CTest 验证现有原生链路，未完成人工桌面 P11 操作或真实设备联调。构建基于当前共享工作区，不代表干净提交源码的发布验证。

本轮保留工作区内 P07–P12 等其他任务修改。共享 `TcpWorkbench.tsx` 的变化交错，未将其他任务内容混合暂存或提交。
