# Design QA — Schema workspace redesign

- Source visual: `C:\Users\MaoEr\AppData\Local\Temp\codex-clipboard-2bb8bf5e-1f73-48ed-b80e-3f0438bbe862.png`
- Implementation: `http://127.0.0.1:4173/` (in-app Browser screenshot captured from tab 5)
- Viewport: source 1283×808; implementation 1280×800 at 1× density
- State: Schema tab active, sidebar expanded, `环境传感器` selected

## Full-page comparison

The source and implementation were reviewed together in one comparison input. The implementation intentionally replaces the source's branded native header, secondary command row, inspector, and console with the requested compact custom titlebar, physical Schema tree, and single content card. The dark palette and restrained teal selection treatment remain visually consistent with the source.

No clipping, horizontal overflow, accidental whitespace, fake assets, or mismatched control states were found at 1280×800. A separate 960×640 pass also stayed within the viewport.

## Focused comparison

| Region | Result |
| --- | --- |
| Topbar | Back, forward, Schema, and settings appear in the requested order; Schema is selected by default. Native minimize, maximize/restore, and close controls remain on the right. The non-client white top edge was removed in the native window. |
| Sidebar | Uses the same `#101820` chrome color as the topbar, reads as one continuous surface, supports collapse/expand, and renders nested physical folders without a depth limit. |
| Content | Fills the remaining area with a differentiated `#151e27` surface and only a 16 px top-right radius. Selected protocol content and physical path are legible without competing panels. |

## Interaction and runtime checks

- Settings opens its placeholder page; back returns to Schema; forward history is enabled by the same navigation model.
- Sidebar collapse/restore, folder collapse/expand, and protocol selection were exercised in the in-app Browser.
- Native minimize, maximize/restore, close, custom hit-test resize frame, and physical workspace bridge were exercised by the desktop smoke test and native app check.
- Fresh browser console: Vite connection and React development info only; no errors or warnings.
- Debug CTest: 20/20 passed. Release CTest: 20/20 passed.

## Iteration history

1. Initial native comparison exposed a pale non-client line at the top edge.
2. The window was changed to full-client rendering with explicit resize hit testing and maximized-work-area handling.
3. Native and browser comparisons were repeated; no P1/P2 visual issues remained.

final result: passed
