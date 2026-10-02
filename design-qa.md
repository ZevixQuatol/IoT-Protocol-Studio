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
