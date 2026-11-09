# Branch Consolidation Report (2026-11-09)

## What happened, in order (UTC)

| Time | Event | By |
|---|---|---|
| 12:58–13:00 | PRs #5, #6, #7: `main` ↔ `phase1-stabilization` (no new content) | Owner |
| 13:45 | PR #2 merged → `main` `7b8732a` | Owner |
| 13:44 (19:14 local) | Uncommitted Travel overhaul stashed: "BACKUP before main branch consolidation" | Owner |
| 13:47 | PR #3 merged → `a260739`; PR #4 retargeted to `main` and merged → `8daa9e4` | Owner (while the audit was in progress) |
| this session | Stash **applied** (not popped) onto its base `8504a14`; full verification battery run on that exact tree; committed as `9abefe8` on `feat/travel-overhaul`; pushed | Claude |
| this session | `git merge-tree origin/main feat/travel-overhaul`: clean. `main`'s tree == `8504a14`, so the overhaul diff is exactly its 55 files. | Claude |
| this session | PR #9 `feat/travel-overhaul` → `main` created; GitGuardian check passed; **merged → `b409f93`** (merge commit) | Claude |

## Verification of the final tree before merging (Chrome 156 + local)

The tree verified is identical to `b409f93`'s tree:
- `tsc` pass, Vitest 141/141, Vite build pass, backend pytest 12/12;
- `travel_overhaul_check` 30/30, `travel_controls` 18/18, app smoke 12/12, journeys 40/40;
- layout audit at 100/150 % PASS, occlusion PASS.

## Result

- **Final `main`:** `b409f93fd24f635fbcc3dea0ea4ca5f379878606` (Merge PR #9).
- **All intended work is reachable from `origin/main`:**
  - #1 `c6657eb`, #2 `7b8732a`, #3 `a260739`, #4 `8daa9e4`, #9 `b409f93`;
  - every feature commit (`git branch -r --merged origin/main` listed every feature branch).
- **Conflicts:** none. Every merge was checked with `git merge-tree` first. No force push, no history rewrite, no `reset --hard`.
- **Preserved:** the stashed overhaul, which would otherwise have stayed local only. It is now in `main`. The stash entry itself is kept locally as a backup (`git stash list`); it can be dropped.
- **Open PRs with intended work:** none.

## Branches deleted (remote and local)

Each was verified first: tip reachable from `origin/main`, 0 unique files against the merge-base. Local branches were deleted with the safe `git branch -d`.

| Branch | Last tip | Evidence |
|---|---|---|
| `planetary-realism` | `4f44185` | 0 commits / 0 files not in `main` (PR #1) |
| `phase1-stabilization` | `995f9d7` | Its only non-`main` commit is the PR #7 merge, whose tree is identical to `25dae11` (in `main`) |
| `feat/universal-realism-ui-travel` | `660e9e5` | 0 / 0 (PR #2) |
| `qa/chrome-full-audit` | `62dfb4c` | 0 / 0 (PR #3) |
| `fix/planet-occlusion` | `8504a14` | 0 / 0 (PR #4) |
| `feat/travel-overhaul` | `9abefe8` | 0 / 0 (PR #9) |

**Final branch structure:** only `main` (`git branch -a` → `main`, `origin/main`). The local working tree is clean (only the untracked local `.claude/` launch config).

## Workflow from now on

1. Start from an updated `main`: `git switch main && git pull --ff-only`.
2. One feature branch per independent task: `git switch -c feat/<task>`.
3. Implement; run Vitest, `tsc`, the Vite build, pytest and the relevant `scripts/e2e/*` in Chrome.
4. Review `git diff`; commit; push the branch.
5. Open a PR → `main` (`gh pr create --base main`). Never stack PRs on other feature branches unless the dependency is written in the PR body.
6. Resolve conflicts on the branch (merge `main` in, never force-push shared history); merge with a merge commit.
7. Verify the Render deploy: the live bundle hash must equal a local build of `main` (`scripts/e2e/live_site_check.py`).
8. Delete the branch only after step 7, and only if `git branch -r --merged origin/main` lists it.
9. Never stash someone else's in-progress work without committing it to a branch: a stash is local only.
