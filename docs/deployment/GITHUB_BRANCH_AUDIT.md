# GitHub Branch Audit (2026-11-09)

- **Repository:** `GuruPrasannaaManikandan/Cosmic-Atlas`.
- **Local root:** `A:/NASA/PS-1 Abandoned but not Forgotten Storytelling about NASA's Discarded Equipment on the Moon and Mars`.
- **`gh auth status`:** logged in as `GuruPrasannaaManikandan` (keyring, https).
- **Fetch:** `git fetch --all --prune`.

## State found at the start of the audit (fresh from GitHub)

**`origin/main` = `7b8732a`** (PR #2 merged at 13:45 UTC). `main` then moved further during the consolidation (see the report).

| Branch | Tip | Behind / ahead of `main` | Unique commits | Unique files vs merge-base | PR | Recommendation |
|---|---|---|---|---|---|---|
| `main` | `7b8732a` | — | — | — | — | Production branch |
| `planetary-realism` | `4f44185` | 16 / 0 | none | 0 | #1 merged (`c6657eb`) | Fully integrated. Delete. |
| `phase1-stabilization` | `995f9d7` | 13 / 1 | `995f9d7` = "Merge PR #7 (main → phase1-stabilization)". Its tree is **identical** to `25dae11`, which is in `main`. | 0 | #5, #6, #7 merged | No unique work; its feature commit `2552afa` entered `main` via PR #1. Delete. |
| `feat/universal-realism-ui-travel` | `660e9e5` | 3 / 0 | none (`main`'s tree == its tip) | 0 | #2 merged (`7b8732a`) | Fully integrated. Delete. |
| `qa/chrome-full-audit` | `62dfb4c` | 3 / 3 | `42de777` fix(ui) layout at high zoom; `96d7588` QA harness and evidence; `62dfb4c` handoff doc | 43 | #3 open → `main` | Integrate (no conflicts: `git merge-tree` clean) |
| `fix/planet-occlusion` | `8504a14` | 3 / 5 | the 3 qa commits + `1341aac` fix(render) starfield occlusion + `8504a14` occlusion test and evidence | 88 (43 shared with qa) | #4 open, stacked on #3 | Integrate after #3 |
| *stash* `stash@{0}` on `feat/travel-overhaul` (`8504a14`) | — | — | **Uncommitted** Travel Mode overhaul (13 tracked files + 3 new files + evidence), stashed at 19:14 as "BACKUP before main branch consolidation" | — | none | Preserve: commit to a branch, PR, integrate after #4 |

### Pull requests (original states)

| PR | Head → base | State | Merge commit |
|---|---|---|---|
| #1 | `planetary-realism` → `main` | MERGED 2026-11-08 | `c6657eb` |
| #2 | `feat/universal-realism-ui-travel` → `main` | MERGED 13:45 | `7b8732a` |
| #3 | `qa/chrome-full-audit` → `main` | OPEN | — |
| #4 | `fix/planet-occlusion` → `qa/chrome-full-audit` | OPEN | — |
| #5 | `main` → `phase1-stabilization` | MERGED | `7717faa` |
| #6 | `phase1-stabilization` → `main` | MERGED | `25dae11` |
| #7 | `main` → `phase1-stabilization` | MERGED | `995f9d7` |
| #8 | `main` → `qa/chrome-full-audit` | CLOSED (not merged) | — |

## Duplicates, overlaps and dependencies

- **#5, #6 and #7** only moved existing commits between `main` and `phase1-stabilization`. They add no content; the trees are identical.
- **No duplicate implementations.** The work is one linear chain: #2 → #3 → #4 → overhaul. Each builds on the previous one.
  - `styles.css` is modified by #3 (zoom fixes) and by the overhaul (instruments, panels). The overhaul was written on top of #3, so they don't conflict.
  - `Scene.tsx` is modified by #2 (IAU frames), #4 (backdrop) and the overhaul. These are sequential, not competing.
- **Content that would have been lost by an incorrect merge:** the stashed overhaul (uncommitted; it existed only in the local stash).
- **Regression risk:** the overhaul changes default panel behaviour (on-demand Inspector). Tests were updated to the new contract and verified (journeys 40/40, smoke 12/12).
- **Merge order (dependency-aware):** #3 → #4 (retargeted to `main`) → overhaul PR.
