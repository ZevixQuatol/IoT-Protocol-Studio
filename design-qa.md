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
