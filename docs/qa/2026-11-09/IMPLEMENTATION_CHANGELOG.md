# Implementation Changelog (QA pass, 2026-11-09)

Branch `qa/chrome-full-audit` (stacked on PR #2 `feat/universal-realism-ui-travel`).

## Product changes

| File | Change | Reason |
|---|---|---|
| `frontend/src/ui/styles.css` | Primary actions collapse into "More" at ≤1000 px (was ≤860 px) | QA-1: header overflow at 150 % zoom; "More" off-screen |
| same | `.search input {min-width:0; width:100%}`; at ≤480 px `.topnav {flex:none}` and `.search {flex:1 1 0; min-width:0}` | QA-2: narrow-phone header overflow |
| same | ≤768 px: `.timebar {bottom:132px}`, `--stack-time: 246px`; ≤560 px: `--stack-time: 226px` | QA-3/QA-4: bottom-stack overlaps |
| same | `.cat-tabs {flex-wrap:wrap; overflow-x:visible}` | QA-5: clipped "Solar" tab |

No TypeScript, Unity or backend code changed in this pass. The PR #2 changes (WebGL template diagnostics, IAU planet frames, Uranus/Neptune, camera fix) are listed in `docs/foundation/FOUNDATION_STABILIZATION_REPORT.md`.

## Test tooling added or extended

| Script | Purpose |
|---|---|
| `scripts/e2e/qa_chrome_audit.py` | Real-Chrome feature inventory (click every control, record the effect) and journeys A–J with error injection |
| `scripts/e2e/qa_inventory_reverify.py` | Actionability-aware re-check of inventory rows that showed no effect |
| `scripts/e2e/perf_scenarios.py` | 60 s scenario performance runs and heap soak in headed Chrome |
| `scripts/e2e/layout_audit.py` | Adds 430×932, `--zoom` (browser-zoom emulation), `--channel chrome/msedge`, `--viewports`; scrolls the More menu before the reachability check |
| `scripts/e2e/unity_webgl_load_paths.py` | Adds hard refresh (cache disabled), clean-profile case and `--channel` |

## Decisions

- **G/H journeys (Surface Explore, artifact inspection)** and **mission data validation:** reported as not implemented. Their specification (the Mission Archaeology Master Prompt) is not available, and the previous instruction froze mission work until PR #2 is accepted.
- **Cosmic Events / Academy dialog semantics** (`role=dialog`, Escape to close): noted as P3, not changed, to keep this pass to verified defects.

## Remaining work

1. Owner review and merge of PR #2, then of this PR.
2. Brotli-compressed Unity WebGL size and hosting headers.
3. Travel QA gaps: throttle-gear HUD, collision/proximity warning, nav-map marker vs ship position.
4. Mission phase (Surface Explore vertical slice), once its specification is provided.
