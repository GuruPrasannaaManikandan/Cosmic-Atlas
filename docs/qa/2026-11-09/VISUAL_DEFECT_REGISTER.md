# Visual / UI Defect Register (Chrome QA, 2026-11-09)

Severity follows the brief: P0 crash or data loss, P1 core navigation or WebGL failure, P2 major visual or functional defect, P3 cosmetic.
Browser: Chrome 156 (Playwright `channel=chrome`).
Zoom emulation: browser zoom z on a W×H window is tested as a CSS viewport of W/z × H/z at device pixel ratio z.

| ID | Sev | Screen / viewport | Steps | Expected | Actual (before) | Root cause | Fix (file) | Retest |
|---|---|---|---|---|---|---|---|---|
| QA-1 | **P2** | Explore header. 1366×768 at **150 % zoom** (911×512 CSS px); also 1280×720 at 125 % | Load, Explore | All navigation reachable | Header overflowed by 27 px. **"More" pushed off-screen**, so the primary actions were unreachable. | Primary actions collapse into "More" only at ≤860 px, but brand + search (min 150 px) + 4 primary buttons + audio + More need about 1000 px | Collapse breakpoint moved to ≤1000 px (`styles.css`) | Layout audit at 150 %: pass |
| QA-2 | **P2** | Phones at 125–150 % zoom (260–345 CSS px wide) | Load, Explore | Header fits; More visible | Header overflowed; at 260–287 px "More" was outside the viewport | (a) The search `<input>` kept its intrinsic minimum width. (b) `.topnav` could shrink below audio + More (72 px). | `.search input {min-width:0}`; at ≤480 px `.topnav {flex:none}` and the search takes the remaining width | Pass at 125 % and 150 % |
| QA-3 | P3 | 768×1024 at 125 %, 1024×768 at 150 % (683×512) | Explore with the Time Engine | Time bar and dock separate | 10 px overlap of time bar and dock | The reserved bottom space at ≤768 px was too small for a wrapped dock | `.timebar {bottom:132px}`, `--stack-time: 246px` (≤768) | Pass |
| QA-4 | P3 | Phones ≤345 CSS px with the inspector open | Select a planet | Inspector clear of the time bar | Inspector overlapped the time bar by 26–28 px | `--stack-time` at ≤560 px did not account for the wrapped time bar | `--stack-time: 226px` (≤560) | Pass |
| QA-5 | P3 | Objects panel, all widths | Click the "Solar" category tab | Tab fully visible and clickable | 5th tab clipped by the 280 px panel. Its centre was not clickable, and the horizontal scroll had no visible affordance. | `.cat-tabs {overflow-x:auto}` on a single row | Tabs wrap (`flex-wrap: wrap`) | Locator click: list filtered 182 → 166 buttons |
| QA-6 | P3 (test infra) | Short windows (≤512 px tall) | Open "More" | All tools reachable | Audit reported Help/Notes/Data unreachable | **Not a product defect**: the menu scrolls (`overflow-y:auto`, 532 px content in 390 px). The audit did not scroll. | Audit scrolls menu items into view (`layout_audit.py`) | Pass |

## Earlier pass (PR #2), for traceability

| ID | Sev | Defect | Fix |
|---|---|---|---|
| F-1 | P1 | "Could not download the 3D renderer". Opening the WebGL build without an HTTP server serving `Build/` → loader 404; `file://` hung at 0 % with no message. | WebGL template reports the URL and status, and handles `file://` and Unity errors |
| F-2 | P2 | Tilted planets spun about the wrong axis; placeholder spin rates | IAU body frames and prime meridian W(t) |
| F-3 | P2 | Uranus had no rings; Uranus/Neptune incomplete; Neptune's 1989 dark spot shown as current | Ice-giant shader, NSSDCA ring systems, epoch-tied storms |
| F-4 | P2 | `setCameraAt` looked away from its target (intro view) | Convention fixed |
| F-5 | P2 | Mars pole 1.3° off | IAU 2009 J2000 pole |

## Open (not fixed)

| ID | Sev | Item |
|---|---|---|
| O-1 | — | Journeys G/H (Surface Explore, artifact inspection) are **not implemented** in the product. |
| O-2 | P3 | Unity prototype caption: "α" missing in "Hα" (built-in font). |
| O-3 | P3 | Nebula interior: faint contour banding (Unity prototype). |
