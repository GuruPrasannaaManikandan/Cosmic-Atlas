# Git / Render Handoff (2026-11-09)

| Item | State |
|---|---|
| `origin/main` | `c6657eb`, unchanged. **Nothing was merged.** |
| PR #2 | `feat/universal-realism-ui-travel` → `main`, **open, awaiting owner review**. Contents: M0 audit, M1 UI/Travel repair, M2 Unity rendering and validation, WebGL download-failure fix, IAU planet frames, Uranus/Neptune. |
| PR #3 | `qa/chrome-full-audit` → `feat/universal-realism-ui-travel` (**stacked on #2**), open. Contents: the CSS layout fixes QA-1…QA-5 and the real-Chrome QA tooling and evidence. Commits `42de777` (fix) and `96d7588` (QA), plus this handoff note. |
| CI | The repository has **no GitHub Actions workflows**, so the PRs have no automated checks. All validation was run locally (see `END_TO_END_TEST_REPORT.md`). |
| Merge order | 1. Review and merge #2 into `main`. 2. Retarget #3 to `main` (GitHub offers this when #2's branch merges) and merge it. |
| Render | `render.yaml` sets no branch, so both services (`cosmic-atlas`, `cosmic-atlas-api`) auto-deploy on commits to the **default branch `main`**. There are no preview environments. **Pushing feature branches did not deploy anything.** Merging #2 or #3 will trigger the production deploys. |
| Render config | Not modified. |
| Rollback | Each merge is a single merge commit. To roll back, revert the merge commit on `main` (Render redeploys the previous state), or redeploy the earlier commit from the Render dashboard. |
| Deployment state | **Not deployed.** Nothing has reached `main`, so the live site is unchanged. After an authorised merge, verify `/api/health` and the browser journeys on the deployed URL. |
