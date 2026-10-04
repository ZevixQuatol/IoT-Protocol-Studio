# P05 HEX debug workbench design QA — 2026-10-03

final result: passed

## Reference and visual evidence

- Primary reference: `C:/Users/MaoEr/AppData/Local/Temp/codex-clipboard-b7332e2e-906d-4181-bfac-e5b72d0268c2.png`. Its top 1586×573 application frame was cropped from the composite board. Secondary boards show the related conversion/search/CRC dock.
- Evidence: `C:/Users/MaoEr/.codex/visualizations/2026/10/02/01a0fb0f-028a-7c92-befb-91290b10cfcf/`. `p05-comparison.png` compares reference and implementation at 1:1 density using the same supplied HEX input; `p05-detail-comparison.png` compares identical 1017×416 HEX/detail regions. Both combined inputs were visually inspected. Additional captures: `p05-dark.png`, `p05-light.png`, `p05-annotation-dialog.png`, `p05-decode-error.png`, `p05-tools-crc.png`, `p05-english-narrow.png`.
- Composition: compact input / paste / format / clear / protocol / message / parse toolbar; 16-column HEX grid with offsets and ASCII; concrete field table; selected field / raw-byte interpretation / annotation note. Opening the tool dock places HEX above selected details and field results, with tool navigation at right. Annotation editing uses a native modal with name, indexed color, byte range, note, cancel, save and delete.
- Retained explicit choices: existing titlebar and chip branding; rounded selected navigation without stripes; outline / filled icon pair; Bug debug and Radio communications; text-only parse button; no green focus outline on the HEX textarea. Dark/light tokens and the ten indexed annotation colors adapt automatically.
- Data differences are intentional: the supplied input contains **17 bytes**, although the reference labels 16 and its field offsets overlap. Production renders actual bytes, Core field spans and checksum status. The existing SensorLink verification schema has a 14-byte reply and float32 temperature, so valid protocol decoding was checked separately with that real schema. No mock physical scale, unit, threshold or invented partial decoded fields is inserted.

## Corrections and checks

- Fixed the low-contrast parse hover state, stale field details after import, inherited 10px HEX headers, and clipping in short windows. HEX rows and controls now use 13–14px text. Local scrolling keeps annotations, dense fields and tools reachable in narrow/short windows. The existing format-button class is retained for native navigation smoke checks.
- Browser verified via CUA: raw and protocol parsing, field-to-byte linking, native-order byte interpretation, forward/reverse annotation selection, ten colors, empty-name/out-of-bounds rejection, edit/cancel/delete, note export/import, formatting and reparse preserving annotations, changed input clearing stale results, checksum failure clearing fields, error-offset jump, illegal/odd HEX disabling parse, tool navigation and desktop-required feedback.
- Dark/light Chinese UI and 1000×720 English UI inspected; document width stays equal to viewport width. Browser warning/error log was empty. No remaining P0/P1/P2 visual defect. Retained branding, compact app typography, indexed palette and real-data differences are accepted deviations from the illustrations.
- Frontend TypeScript/Vite, focused Prettier and clang-format checks passed. Windows Release build passed. Focused CTest `desktop_ui_smoke|debug_unit|hex_unit|checksum_unit|codec|schema_loader` passed **7/7**; native bridge smoke also verifies field byte order and checksum absence. `node test/web/debug-view.test.mjs` checks signed/unsigned/endian/float interpretation and old/new annotation files. Existing browser contract scripts were updated for the new controls and syntax checked.
- `/test/project-preview.html?debug=1` is development-only and outside the production entry. Its fixed-schema decoder/file bridge verifies presentation and UI state, not native file persistence. Real decode/conversion/checksum algorithms remain in Core. Windows picker save/cancel/overwrite still needs manual desktop acceptance; the new optional annotation note retains version-1 compatibility.

---

# P04 message workbench design QA — 2026-10-03

final result: passed

## Visual evidence and accepted requirements

- Reference: `C:/Users/MaoEr/AppData/Local/Temp/codex-clipboard-3f49cd69-3535-450c-bc89-385ec40d4ce4.png`. The supplied references show the same overwrite-confirmation state.
- Evidence directory: `C:/Users/MaoEr/.codex/visualizations/2026/10/02/01a0fb0f-028a-7c92-befb-91290b10cfcf/`. `p04-comparison.png` contains reference and final capture in one input at 1586×992 per side, 1:1 density. `p04-dialog-comparison.png` compares the same 732×632 modal region. Both combined inputs were visually inspected.
- Layout: existing project explorer, central message workbench / tabs / selectors / field cards, right message and template inspector, bottom HEX / ASCII strip. Overwrite modal is 732×631 at x427 / y252.5; the reference is approximately x428 / y253 with the same width and height. It includes target details, warning, content rows, backup availability, cancel, save-as and overwrite actions.
- Typography and spacing: existing app font stack, 29px protocol title, 26px modal title, 15–16px confirmation text, compact inspector rows, monospace HEX bytes and offsets. Full source and focused comparison confirm readable hierarchy and matching section placement.
- Theme / assets: existing dark and light tokens, installed icons and retained chip logo. Selected navigation keeps the user's rounded background without stripes, outline / filled icon pair, distinct Bug debug icon and Radio communication icon. Schema remains the correct selected module. No new dependency or raster asset.
- Copy / data: production displays actual protocol, message, field defaults and `message-templates.yaml` location. The Core template model has no creator, dates, description, raw payload or backup support; the UI avoids invented values, explains that payload is generated from fields, and disables backup / sample code. Mock frame IDs, example folders and fictional frame bytes are not production data.

## Findings and corrections

- Initial dialog was too tall and vertically centered above the reference. Reduced section spacing and applied an overwrite-only offset at tall viewports; the final dialog matches the reference geometry. Short windows retain native centering and bounded scrolling.
- Initial inspector clipped its last action; tightened heading / row spacing. Chinese actions fit at the reference viewport; English inspector remains scrollable.
- Initial primary action was white on bright green. Dark theme uses dark text; light theme uses white on its darker accent. Light warning text now uses a darker ochre for contrast.
- Replaced stale “regenerate” loading notice with “Template loaded”, since it remained after encoding. Draft status uses a warning icon, and successful HEX export gets visible feedback.
- Inspected final dark / light workbench and dialog, English dialog, and 1000×720 English layout. At 1000px the inspector hides, toolbar / output actions remain accessible, document width equals viewport width, and all modal actions fit. No remaining P0/P1/P2 visual issue; P3 differences are retained titlebar / branding, flat background and installed icon shapes.

## Functional and native verification

- Development-only `/test/project-preview.html?protocol=1&message=1` uses mock bridges with valid Core schema v0.1. The fixture performs no real project or template file writes and is outside the production Vite entry. Its fixed-field encoder exists only for UI verification; production still delegates encoding and automatic fields to Core.
- Browser checked: message switching / empty template list, compatible load, incompatible load disabled, field edit clearing old output, encode success / out-of-range error, overwrite then re-load, cancel, save-as, duplicate-name confirmation, failed save retaining dialog, HEX / ASCII copy verified through clipboard, ASCII view, HEX export success feedback, output handoff into actual debug input and communication draft, and unsaved YAML blocking template writes / encoding. No communication was sent.
- Dark / light, Chinese / English, keyboard / small-window checks passed. Browser warning / error log returned no entries. Final browser screenshot evidence is in the directory above.
- Frontend TypeScript / Vite and focused formatting passed. Windows Release build passed; CTest `desktop_ui_smoke|schema_loader|workspace` passed 3/3. Existing Workspace tests exercise real template persistence / conflict / replace / load; WebView2 smoke now also rejects invalid HEX export actions before opening a picker.
- HEX export reuses the existing native file-dialog and atomic-write helper. Its full Windows picker save / cancel / overwrite workflow still needs manual desktop acceptance. Mocked export feedback does not establish native picker acceptance.
- No Core template-format changes, metadata persistence, backup implementation or sample-code generator were added. These remain separately scoped capabilities.

---

# P03 protocol code editor design QA — 2026-10-03

final result: passed

## Visual evidence and accepted requirements

- Saved reference: `C:/Users/MaoEr/AppData/Local/Temp/codex-clipboard-a225c65b-a046-4398-8ea1-39ed048e099a.png`; error reference: `C:/Users/MaoEr/AppData/Local/Temp/codex-clipboard-6fd4d949-cd87-43f5-9f90-036fce81c1cb.png`.
- Evidence directory: `C:/Users/MaoEr/.codex/visualizations/2026/10/02/01a0fb0f-028a-7c92-befb-91290b10cfcf/`. `p03-saved-comparison.png` and `p03-error-comparison.png` each contain source and capture side by side at 1586×992, 1:1 density; both combined inputs were visually inspected.
- Explicit user changes take precedence: selected navigation uses rounded backgrounds without stripes, outline / solid icons switch with selection, and debug uses Bug while communication uses Radio. The existing chip logo and the correct Schema navigation selection are retained.
- Layout: project explorer, code header and tabs, line-number gutter, saved protocol inspector / quick actions, collapsed problems; validation failure expands problems and removes the inspector to give the code more width. Tree selection remains on the actual YAML file. No fictional example / documentation files or mock frame IDs enter production.
- Typography: existing application font stack; title 29px; editor uses Cascadia Code / Consolas, saved 13px / 16px lines and failed 14px / 20px lines. The source's concrete YAML shape is illustrative; the fixture uses valid existing Core schema v0.1, so content, error line 38 and token distribution differ intentionally.
- Colors: existing dark / light theme tokens plus readable syntax colors; green saved / success, red dirty / failure / error row. Assets are existing application branding and installed icon libraries; no additional dependency or generated raster UI.
- Copy and actions: actual saved metadata, source path and current draft diagnostics. Structure / message tabs reuse their existing views. Export reuses the host SaveDialog; clipboard copies the current draft. Formatting, protocol documentation and sample directory are disabled until those capabilities exist.

## Findings and corrections

- Initial saved code density was too sparse at 22px; adjusted to 16px, with 20px in error state to match the supplied distinct states.
- Light-theme inspection found the legacy `.protocol-source` textarea background covering the syntax overlay. Removed that unnecessary class from the new editor instead of adding global overrides; recaptured both themes with visible code.
- The error row includes the native schema path as a second line. Increased the expanded footer to 128px so the full row fits; narrow tables scroll inside their own region.
- At 1000×720, document width equals viewport width, the inspector hides and toolbar actions remain available. English labels remain readable. Restored the explorer width after responsive checks.
- Final saved / failed comparisons and light captures show no remaining P0/P1/P2 visual issue. P3 differences: flat background, existing titlebar styling and minor icon / spacing variations; these preserve established application choices.

## Functional and native verification

- Development-only `/test/project-preview.html?protocol=1` uses mock bridges and `test/protocol-preview.yaml`; it performs no real project writes and is outside the production Vite entry. Browser acceptance covers editing, validation / failed save preserving drafts, corrected save and Ctrl+S, error-line jump, structure / code switching, copy, export dispatch, problem collapse, menu Escape, dark / light, English and responsive layout. Console warning / error check returned no entries.
- Frontend TypeScript / Vite build and focused formatting passed. The sample YAML also passed the real CLI schema validator.
- Windows Release build and CTest `desktop_ui_smoke|schema_loader|workspace`: 3/3 passed. The WebView2 smoke invokes the actual Core draft-validation bridge for valid YAML, unsupported `float128`, line 9, bad arity and oversize rejection; export rejects an unsupported open request before displaying a dialog.
- Draft validation calls Core Loader without writing files. Existing Workspace save validates before writing; the UI applies new workspace data only after success. Browser mocks establish UI behavior, while native checks establish real bridge / loader behavior.
- The Windows export picker and its complete save / cancel / overwrite interaction remain for manual desktop acceptance. The automated export check does not claim native picker acceptance.

---

# Project management and creation design QA — 2026-10-02

final result: passed

## Visual evidence and accepted requirements

- Project reference: `C:/Users/MaoEr/AppData/Local/Temp/codex-clipboard-078d1a84-877d-4527-a5e2-3e5bc00bf790.png`.
- Dialog reference: `C:/Users/MaoEr/AppData/Local/Temp/codex-clipboard-51c6cb64-5988-4f6b-9fe3-416dddbd0596.png`.
- Evidence directory: `C:/Users/MaoEr/.codex/visualizations/2026/10/02/01a0fb0f-028a-7c92-befb-91290b10cfcf/`. `project-comparison.png` and `project-create-comparison.png` each combine the original reference and implementation in the same comparison image. Both source and capture are 1586×992 at 1:1 density.
- The user's explicit prior changes override the reference: rounded navigation selection with no stripe; outline icons by default and solid icons when selected; Bug for debug and Radio for communication. Existing branding and the completed startup home are retained.
- Matched surfaces: explorer / center table / right inspector composition, section separators, project toolbar, bottom recent projects and problems, and the modal's name, location, destination preview and icon actions. Dark and light themes use existing application tokens.
- State differences are intentional: the fixture has two actual protocol records and no example files; production shows real workspace data. Counts represent protocol and message types, and the timestamp says last opened. Unimplemented sample import, templates and documentation controls are disabled. Mockup frame IDs and fictional warnings are omitted.

## Findings and corrections

- Initial capture: missing protocols root, small center typography, and clipped inspector quick links. Added the actual protocols hierarchy, increased table text to 16px and reduced inspector section spacing. Recaptured both themes; links fit at the reference viewport.
- Responsive capture: narrow problem columns wrapped their headings. Kept the problem table at a readable minimum width inside its scrolling region. At 1000×720, page width remains 1000px; the inspector hides and its primary actions remain in the toolbar.
- Error-state check: a previous invalid-name message masked a subsequent native directory error. Cleared local validation errors before submitting valid fields and verified invalid name → corrected name / invalid directory displays the directory error inside the dialog.
- Final combined visual comparisons were inspected after these corrections. No remaining P0/P1/P2 visual issues. P3 differences: library icon shapes, flat background, and minor font / spacing differences; these do not change the accepted interaction requirements.

## Functional and native verification

- Isolated development fixture: `apps/web-ui/test/project-preview.html`, served at port 5174. Its mock bridges perform no filesystem operations and it is outside the production Vite entry. Browser storage is isolated from the existing preview at port 5173.
- Browser checked: loaded project overview, directory search, selection and select all, protocol editing and return to overview, protocol creation, deletion confirmation / cancellation, empty project, project creation success and failure, folder selection, live destination preview, dark / light and Chinese / English. Console error inspection returned no entries.
- The preview's communication diagnostic is expected because the fixture has no native communication bridge. It demonstrates real diagnostic display rather than a fabricated warning.
- TypeScript, Vite / Windows Release build, formatting, workspace unit test and real WebView2 UI smoke passed. Native smoke checks the new directory selection argument contract and rejects relative project parent paths.
- The native folder picker and successful File Explorer opening have not undergone full manual desktop acceptance. Browser creation and folder selection checks use mocked bridges; they do not establish native picker acceptance.

---

# Startup home design QA — 2026-10-02

final result: passed

Source visual truth: `C:/Users/MaoEr/AppData/Local/Temp/codex-clipboard-55d9b149-1b6d-49d7-b3d4-13e8c2806c33.png`.
Implementation evidence: `C:/Users/MaoEr/.codex/visualizations/2026/10/02/01a0fb0f-028a-7c92-befb-91290b10cfcf/startup-dark.png` and `startup-light.png` in the same directory.
Source and implementation dimensions: 1586×992 pixels; CSS viewport 1586×992; 1:1 density. State: no open project, four sample recent entries supplied only by a temporary verification fixture. Production uses actual stored projects.

## Findings and comparison history

- Initial light capture found an unnecessary vertical scrollbar and active navigation background from stylesheet ordering. Moved home CSS after base CSS and reduced action height / bottom padding. Recaptured dark and light: home card clientHeight and scrollHeight are both 926px; no document horizontal overflow.
- Full-view comparison opened source and dark implementation together in one tool input. Hero, rail, table columns / rows, separator positions and bottom shortcuts match the reference composition. Main separators are at approximately y=423, 490, 780 and 810. No remaining actionable P0/P1/P2 differences.
- Focused inspection of the titlebar, action group, project row icons and shortcut labels in the 1:1 captures found readable text and consistent alignment. Dark / light functional icons use theme colors; destructive actions retain a red semantic color.

## Required fidelity surfaces

- Typography: existing Segoe UI / Microsoft YaHei UI stack, 56px hero at the reference width, 27px subtitle, 21px section headings and 17px table. Existing installed fonts retained. English copy can make the bottom shortcut taller and scrolls within the main content.
- Layout: 66px home titlebar, 94px rail, 46px content left inset and 40px hero inset. 58px recent rows. At 900×700, shortcuts stack and content scrolls; window controls remain visible and document does not overflow horizontally.
- Colors: near-black teal background, restrained separators, green main action and red deletion; corresponding light tokens produce a pale background and dark icons. Flat application background deliberately preserves readability; the source's subtle background texture is a P3 difference.
- Assets: existing approved green chip logo retained instead of the mock's different logo. Existing Lucide library supplies standard icons. Brand asset remains crisp; no generated or placeholder graphics. Existing uncommitted Feather icon changes elsewhere preserved.
- Copy: source home headings and Chinese descriptions retained. P01-A is a reference frame label and is omitted from production. Actual project timestamps / names replace illustrative records; missing old timestamps show “—”. Sample import remains disabled with an explanatory title because the existing product has no implementation.

## Verification

- Browser: dark, light, English, 900×700, empty history, create dialog / mocked create-to-workspace, recent deletion / clear, directory shortcut, and failed opening retaining history. Console error / warning inspection returned no entries.
- Test fixtures were temporary, never included in production, and removed after verification; browser fixture storage is cleared on leaving the fixture.
- `node test/recent_projects_test.mjs`: legacy history, invalid timestamps, current timestamp, case-insensitive deduplication, persistence, damaged JSON and reveal Bridge success / failure checked.
- Release Windows Host build and real WebView2 startup smoke test passed. Native smoke checks home landmarks, sidebar absence, three window controls plus settings, history navigation, theme switching and invalid directory-reveal requests.
- Native directory picker / successful File Explorer opening and full manual desktop acceptance remain unperformed.

## Implementation checklist

- [x] Reuse the existing workspace / recent-project logic.
- [x] Match main layout and adapt both themes / icon colors.
- [x] Check empty / failure / responsive states.
- [x] Fix and recapture layout issues.
- [x] Build desktop package and verify native startup.

## Follow-up polish

P3: background texture and minor icon / font differences from the raster reference. Existing application branding and explicit disabled sample state are intentional product constraints.

---

# P06 debug tools design QA — 2026-10-03

final result: passed

- Full scope, reference paths, comparison dimensions, corrections, and validation boundaries are recorded in [P06 UI verification](docs/P06-UI验证.md).
- Reused P05 and existing Core bridges. The right dock contains tool navigation and conversion, search/replace, and CRC views. Opening the dock places HEX above selection details and decoded fields. Existing branding, navigation, and real Core data remain authoritative.
- Inspected final conversion/search/CRC at 1586×992, light mode at 1280×720, and Chinese/English narrow mode at 1000×720. Final screenshots are in `C:/Users/MaoEr/.codex/visualizations/2026/10/03/01a10243-a6a2-7f50-b2d2-f4331f46c86b/`.
- Corrected toolbar overlap, detail clipping, CRC parameter density, selection/field synchronization, primary-button hover contrast, and stale conversion output during tool switching. No unresolved P0/P1/P2 visual defect; existing titlebar, accent, icons, and flat background are retained P3 differences.
- TypeScript, targeted formatting, Windows Release build, P05 byte-view tests, and P06 browser regression passed. Seven focused Release CTests passed, including WebView2 smoke and real Core tool/checksum/codec tests. Fresh browser error/warning logs were empty.
- Browser fixtures verify presentation and bridge interaction. Manual native picker/clipboard and desktop end-to-end acceptance remain separate checks.


---

# P08 TCP 服务端界面验证 — 2026-10-04

final result: passed

## 参考与证据

- 主参考：用户第 5 张图片，原路径 `C:/Users/MaoEr/AppData/Local/Temp/codex-clipboard-660c12a6-1cd7-41e6-a41f-84f1d2b9f5b4.png`。
- 留存参考：`out/p08-qa/reference.png`；最终实现：`out/p08-qa/server.png`；无客户端状态：`out/p08-qa/empty.png`；详情局部：`out/p08-qa/detail.png`；客户端 / 记录局部：`out/p08-qa/clients-records.png`。
- 浏览器：Codex 内置浏览器；主图参考及实现均为 1586 × 992 像素，CSS viewport 为 1586 × 992，1:1 密度，无缩放。主图状态为暗色、监听中、三个连接、一个历史离线连接、选中 StatusReply，并高亮 temperature 字段。
- 来源与实现截图在同一个工具输入中打开比较。另保存右侧详情与客户端 / 记录区域局部截图，检查字段、HEX 高亮、地址、表格文字和操作按钮。
- 预览入口：`http://127.0.0.1:5173/test/server-preview.html`。预览数据只存在独立测试 fixture 中，生产界面读取原生 TCP bridge 与 Core 解析结果。

## 对照结果

- 字体与排版：复用产品 Inter / Segoe UI / Microsoft YaHei UI 与 Cascadia Code / Consolas 等宽栈；配置、标签、消息表和字段表沿用现有通信组件尺寸。
- 布局与节奏：上方监听与协议 / 分帧配置，左侧客户端，中间收发记录，底部发送与队列，右侧详情自配置区顶部延伸到底部。主视口无页面横向溢出；详情和记录内部滚动。
- 颜色：复用通信界面灰绿深色背景、细边界、绿色选择 / 成功状态与蓝色方向。亮色主题使用现有主题变量，浏览器检查了亮色主界面。
- 图标 / 素材：复用已有品牌芯片与 Feather 图标；界面没有新增栅格图片资产，无需生成素材。
- 文案 / 数据：显示真实连接标识、地址、解析状态、字段范围与排队字节数，不复制参考图的计数、持续时间、协议样例或 CRC 数值。

## 对照迭代

1. 首轮发现客户端地址换行、详情面板从记录区开始，校验区需要额外滚动。修正客户端地址单行显示及 title，右侧详情跨越配置 / 记录 / 发送区。
2. 后续发现共享样式覆盖了根布局的 grid。提高 P08 根选择器优先级，同时为窄窗口选择器保留同一优先级；重新截图确认三栏恢复。
3. 收发工具栏的文件操作占用记录空间。将 P08 导入 / 导出入口放入“筛选与文件工具”，保留所有功能；复查单行基础筛选与记录密度。
4. 最终截图：没有剩余 P0 / P1 / P2 布局或交互问题。

## 交互验证

- 切换服务端、开始监听、停止监听入口；客户端选择会同步发送目标。
- 客户端 + RX 方向 + FRAME 类型组合筛选正确；不匹配搜索显示空状态。RX 筛选包含接收的完整 FRAME，FRAME 方向选项仍保留。
- 选中字段高亮对应 HEX；HEX / ASCII、字段解析、原始数据切换；上一条 / 下一条切换。
- UTF-8 `hello` 经原有发送流程转换为 `68 65 6c 6c 6f`，发送到选定的 C02。
- 断开弹窗取消后连接保留；确认后客户端移入历史离线区域。
- 无客户端时显示等待连接，发送禁用。
- 1280 × 800 与 1024 × 768：无页面横向溢出；1024 宽时详情移到下方，纵向内容可滚动。
- 控制台 error 检查为空。

## 保留的产品边界

- 左侧保留当前通信页的会话管理入口，未替换成参考图中的项目树；会话名称与数量来自真实状态。
- 实际服务端连接上限仍为 16，不复制部分图片中的 100。
- 发送队列显示 native snapshot 的 `queued` 字节数与当前定时 / 批量任务进度。Core 没有返回任务列表 / 下一次发送时间，界面不编造这些内容。
- 校验区域显示 Core 返回的通过 / 失败 / 未执行状态。Core 没有提供校验算法、计算值和报文值的独立元数据，界面不硬编码 CRC16-Modbus 或重复字段值。
- 原有模板 / Message Studio、变量、定时 / 批量、关联、时间线、历史回放保持现有范围；本次未新增广播、无限循环或客户端群组。
- 以上浏览器数据为测试 fixture。真实多客户端、物理设备和跨主机人工验收没有在本次浏览器测试中执行。

## 工程验证

- 修改文件的 Prettier 检查、TypeScript、Vite build 通过。
- Windows x86_64 Release build 通过，打包 Web UI 与最新 dist 的入口 SHA-256 一致。
- Release CTest 27 / 27 通过，包括原生桌面 UI 与 TCP 冒烟测试。
- 2026-10-04 最终工具栏及发送按钮调整后重新构建 Release，原生桌面 UI 冒烟测试再次通过；最终打包入口和 dist 的 SHA-256 均为 `1dd10a094afbe8e325ff548d35cc4ea9ade8ec338bad53154939e57cdc8c1d84`。
- 原有未提交的 P06 / P07 及共享工作台修改保留。P08 在共享 TcpWorkbench 上继续修改，无法安全分离为独立完整提交，本次不强行暂存或提交混合内容。

---

# P07 TCP 客户端界面验证 — 2026-10-04

final result: passed

- 完整参考、截图、对照修正、交互及验证边界见 [P07 UI 验证](docs/P07-UI验证.md)。
- 根据用户第 3 张主图实现会话侧栏、连接 / 协议 / 分帧配置、记录与发送主体、右侧报文详情和实际状态栏，复用原有通信 / Core 能力。
- 最终 1586 × 992 深色主图与参考同批比较；检查浅色英文、1000 × 760、900 × 700 和未连接空状态。修正地址宽度、发送格式间距、英文配置换行及窄窗口记录高度。
- 字段整行选择与对应 HEX 高亮、发送 / 定时 / 批量 / 变量、筛选、时间线和离线回放已用独立 browser fixture 验证。生产界面使用真实 bridge 数据；不写入截图样例。
- TypeScript / Vite、相关格式检查、Windows Release 构建及两个原生桌面 / TCP 冒烟测试通过。新建浏览器页面 error / warning 为空。
- 没有剩余 P0 / P1 / P2 布局缺陷；现有品牌与标题栏保留。实物设备、跨主机和原生选择器的人工验收仍需单独执行。

---

# P09 串口界面验证 — 2026-10-04

final result: passed

- 参考图、最终截图、对照修正、交互结果和验收边界见 [P09 UI 验证](docs/P09-UI验证.md)。
- 完成串口参数与协议 / 分帧、收发记录、右侧详情、底部发送和状态栏；核对已打开 / 占用 / 中断三种状态。保留既有品牌、导航、真实 Core 数据与变量 / 定时 / 批量逻辑。
- 1586 × 634 同尺寸参考与实现合并检查；1600 × 1000 深色完整布局、浅色英文 1000 × 720、800 × 700 窄窗口检查。修复发送区裁切、配置区密度及窄窗口区块重叠。
- 方向 / 搜索、字段 HEX 联动、暂停恢复、快捷发送、UTF-8 字节数、自动清空、中断保留与重试通过真实组件 + browser fixture 验证。无当前控制台 error。
- 工程格式、TypeScript / Vite、Windows Release 构建及 Release CTest 27/27 通过。实物串口对、占用、拔插和真实 CRC 仍需独立人工验收。
- 无剩余 P0 / P1 / P2 缺陷；会话、统计和字段均使用当前数据，未复制参考图的虚构内容。共享脏工作区保留，本次不强行提交混合改动。

---

# P10 UDP 界面验证 — 2026-10-04

final result: passed

- 参考与实现并排截图、三种模式、交互验证、工程检查及数据边界见 [P10 UI 验证](docs/P10-design-qa.md)。
- 完成 UDP 配置 / 协议、收发记录、底部发送及右侧完整详情布局；复用实际 Core / Bridge 和已保存消息模板，数据报独立解码。
- 检查暗色 1586 × 625 单播 / 广播 / 组播、浅色中英文、900px / 640px 窗口；修复配置与发送区裁切、表格密度、组播网卡宽度和窄窗口区块重叠。
- 筛选、统计、字段 HEX 联动、模板 / UTF-8 快捷发送、定时 / 批量、成功清空、旧端点保留及失败状态通过 browser fixture 验证。当前控制台无 error。
- 最终 TypeScript / Vite、格式、Windows Release 构建和 Release CTest 27/27 通过。跨主机、物理设备、组播路由与原生文件选择器人工验收单独保留。
- 无剩余阻断操作的 P0 / P1 / P2 界面缺陷；共享并行工作区保留，本次未强行提交混合内容。


---

# P12 历史记录 / PCAP 导入 / 回放 — 2026-10-04

final result: passed

- 完整参考、合并对照、修正、交互和验收边界见 [P12 design QA](docs/P12-design-qa.md)。
- 已实现只读历史来源栏、组合筛选与详情，PCAP 导入 / 结果 / 诊断，离线与目标发送回放的三栏布局。
- 保留原有品牌、导航和 Core 权威数据；文件桥提供实际文件名与原始大小，不复制设计图中的样例计数。
- 修复 HEX / ASCII 挤压、主要按钮 hover、回放 HEX 列宽、当前位置滚动、浅色语义色、日期输入重置、停止后的旧任务更新，以及换文件时的旧筛选。最终没有未解决 P0 / P1 / P2。
- P12 格式、TypeScript / Vite、archive 校验、Windows Debug 构建通过，桌面 UI / TCP / capture CTest 3 / 3 通过。最终 UI smoke 再次通过。浏览器 error / warning 为空。
- 浏览器使用独立 fixture；原生选择器和真实设备人工验收没有执行。共享文件的其他未提交修改保留，未混合暂存或提交。

<!-- P13 environment QA -->
# P13 环境与变量界面验收记录

日期：2026-10-04

## 当前结论

final result: passed

P13 已完成参考 UI 调整，前端构建、Windows 桌面构建与 Core/原生桥接测试通过。主界面、创建/复制/重命名、变量编辑与校验、筛选、敏感值、深浅色、窄窗口、无项目和错误恢复已完成浏览器检查。应用内删除确认、取消、Escape、删除失败保留以及切换项目提示已在最终构建中补验，最终完整与局部对照已检查。当前没有未解决的 P1/P2 视觉或交互问题。

## 视觉目标和证据

- 主参考：`C:/Users/MaoEr/AppData/Local/Temp/codex-clipboard-c5ce7f27-9a14-42a3-90cd-66cd28d7bf94.png`，取上方 1586 × 674 像素主界面。
- 状态参考：`C:/Users/MaoEr/AppData/Local/Temp/codex-clipboard-d6fe8d66-3862-46ce-885d-737b7fc06a21.png` 的环境弹窗、校验失败和未打开项目状态。
- 浏览器预览：`http://127.0.0.1:5182/test/environment-preview.html`，使用项目自己的 React 页面与构建产物，配置桥接为浏览器 fixture。
- 初次主界面：`output/p13/main-before-refine.png`；完整合并对照：`output/p13/comparison-initial.png`。
- 调整后主界面：`output/p13/main.png`；完整合并对照：`output/p13/comparison-final.png`；字段局部对照：`output/p13/comparison-fields.png`。
- 创建环境、校验失败、浅色、窄窗口、无项目截图分别在 `output/p13/create.png`、`validation.png`、`light.png`、`narrow.png`、`no-project.png`。
- 应用内删除确认、删除失败和未保存修改提示截图分别在 `output/p13/delete-confirm.png`、`delete-error.png`、`switch-confirm.png`。
- 主界面参考与实现均为 1586 × 674 CSS/图像像素，1:1 比较；浅色和无项目为 1280 × 720；窄窗口为 850 × 720。浏览器截图不包含浏览器标签栏。

## 比较与修正记录

1. 初次合并对照发现 [P2] 主界面的垂直间距使说明卡片和保存栏落到参考视口以外。压缩环境头部、表格行间距、说明卡片与区块间距，调整页面内边距。调整后的 1586 × 674 主界面滚动高度与客户区高度相同，保存栏完整可见；后续增加底部保存栏的粘性定位，使校验错误增加行高时仍能使用保存/放弃操作。
2. 初次对照发现 [P2] 内容区域仍沿用蓝灰色背景、绿色操作按钮偏青。为 P13 添加局部深绿黑面板、边框和绿色操作色，不修改已经批准的品牌与全局导航样式。
3. 浅色检查发现 [P2] 主要按钮文字与绿色背景的对比度不足 4.5。浅色操作色改为 `#167d40`，文字改为白色，计算对比度为 5.20。
4. [P1] 旧原生删除确认框曾阻塞浏览器验证。改用应用内 `<dialog>`，删除与放弃修改仍需用户确认，失败时保留弹窗和错误提示。浏览器控制恢复后，取消、Escape、确认删除、失败保留和切换项目提示均通过。
5. [P2] `showModal()` 覆盖了 React 的自动焦点，使确认窗最初聚焦关闭图标。改为弹窗打开后显式聚焦取消按钮；最终构建已确认默认焦点为“取消”。

## 必查视觉项目

- 字体与层级：沿用项目字体栈及中文系统字体；标题、标签、说明、等宽变量语法保持层级，字段与备注可辨认。字段局部合并对照检查了类型、默认值、必填/敏感和说明内容。
- 布局与间距：当前项目/环境侧栏、三项配置视图、环境操作、紧凑变量表格及三项说明卡片按主参考组织。窄窗口侧栏变为两列，表格单独横向滚动，页面没有横向溢出。
- 颜色与状态：深绿黑面板、绿色当前环境和操作、蓝色说明、红色错误；浅色拥有单独面板与语义颜色。
- 图标与素材：使用既有品牌和 Feather 图标库。参考没有需要新增的照片或插画，未生成替代品牌图。
- 文案与内容：显示真实项目、环境、变量、描述和备注；示例数据仅在测试 fixture 中。帮助展示解析器实际支持的 `{{random}}`、`{{sequence}}`、`{{timestamp}}`，时间戳单位是毫秒。未添加解析器不支持的参数、日期函数或占位导入/导出按钮。

全局品牌、导航宽度与导航图标采用已经批准的应用样式，作为明确的产品约束保留。参考中的项目名称、路径、变量数量不作为生产数据写入。

## 已验证的行为

- 新建环境支持名称、描述、从现有环境复制变量；重复环境名禁止提交。
- 复制环境、重命名与环境切换经 fixture 桥接保存；变量备注保存并在切换回来后保留。
- 必填、数字、布尔、保留变量名的即时校验；保存被阻止；定位按钮聚焦第一个错误字段。
- 变量名/备注搜索与类型筛选；筛选后全选和批量删除使用原始索引；放弃修改恢复四个变量。
- 敏感变量默认为密码输入，可显式显示/隐藏；关闭弹窗支持 Escape。
- 未打开项目状态的打开项目按钮能够进入项目页面。
- 保存失败保留已编辑默认值；加载失败禁止新建和保存，避免覆盖损坏配置。
- 删除测试复制环境后，它从环境列表移除，当前环境回到 Development；取消和 Escape 不删除环境。
- 删除保存失败时，弹窗继续显示 Core 错误，环境及变量仍保留；取消后可继续编辑。
- 未保存修改时，切换项目打开应用内确认窗；取消后默认值 45 仍保留，确认后提示关闭并进入已有打开项目流程。fixture 返回同一项目，未据此声称真实文件选择器或跨项目切换已人工验收。
- 校验错误出现时，1586 × 674 视口中保存栏底部为 663，仍可操作；页面宽度与视口相等。浅色主按钮实际颜色为 `rgb(22, 125, 64)`，文字为白色。
- 已检查的最终浏览器控制台没有应用错误。

## 构建与 Core 验证

- TypeScript 检查与 Vite 生产构建通过。构建仍提示现有主包超过 500 kB。
- Windows Debug 桌面构建通过。
- `iotps_workspace_unit_test` 通过：环境/变量描述的 UTF-8 YAML 往返、旧文件可读、超长描述拒绝写入且保留原文件、敏感与必填标记保持。
- `iotps_desktop_ui_smoke_test` 通过：旧 `save` 参数格式仍可用，新 `save_v2` 描述字段保存后重新打开可读；不完整请求拒绝。
- 最终相关 CTest：2/2 通过，桌面 smoke 2.88 秒，Core 单元测试 1.48 秒。

浏览器 fixture 不进行项目文件或设备操作；真实 YAML 读写由 Core 临时项目测试和 WebView2 原生桥接 smoke 测试覆盖。未将浏览器模拟等同于原生文件选择器人工验收。

## 验证边界

截图与浏览器交互采用本地 fixture；Core/桥接测试采用临时项目验证真实 YAML 往返。未测试真实设备或手工操作原生项目文件选择器。现有 Vite 主包超过 500 kB 的构建提示仍存在。

<!-- End P13 environment QA -->


---

# P14 外观与语言 / 问题 / 诊断日志 — 2026-10-04

final result: passed

- 完整参考、截图对比、修正和验证边界见 [P14 design QA](docs/P14-design-qa.md)。
- 现有设置入口实现三页；主题 / 语言 / 显示偏好自动保存，问题与日志支持组合筛选、分页、详情、实际 HEX 片段和上下文定位。
- 1586 × 510 外观同尺寸对比；1366 × 768、760 × 600、浅色英文及导出取消 / 失败分支已核对。关键操作可访问，表格和详情区域内部滚动；无剩余 P0 / P1 / P2 布局缺陷。
- TypeScript、P14 格式 / 单元检查、Vite 与 Windows Debug / Release 构建通过；Debug CTest 27/27，最终 Release 原生 UI / TCP 冒烟 2/2 通过。最终静态 fixture 控制台 error / warning 为空。
- 使用真实组件与独立样例回调验证浏览器行为；生产仍使用实际运行诊断。系统保存选择器、真实设备及多屏 DPI 完整人工验收没有执行。共享工作区其他修改保留。

---

# P15 独立通信窗口 — 2026-10-04

final result: passed within the recorded verification scope

- 详情展开、详情收起与关闭确认按三张参考调整；完整差异、截图和验证边界见 [P15 design QA](docs/P15-design-qa.md)。
- 新增自定义标题栏、紧凑配置 / 记录 / 详情 / 发送布局和详情收起侧栏；复用现有会话、Core 解析数据及发送能力。
- 修正 800 × 600 浅色英文下配置控件重叠及发送区压缩；内容可滚动，页面无横向溢出。1509 × 1042 三种状态截图位于 `out/p15-qa`。
- 关闭确认准确提示当前队列、草稿及记录清理；已保存文件保留。原生 WM_CLOSE / Alt+F4 继续合并回主窗口并保留连接。
- TypeScript / Vite / Windows Release 构建与相关格式检查通过；完整 Release CTest 27/27。原生 WebView2 / TCP 冒烟扩展覆盖分离接收、详情切换、取消及确认关闭。
- 浏览器 fixture 只验证视觉状态；窗口拖动、最大化 / 最小化及多屏 DPI 人工验收保留。其他页面的并行工作区修改未混合提交。
