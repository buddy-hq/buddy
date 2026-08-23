# Docs Cleanup Candidates

**Date:** 2026-08-22 · **Method:** 10 parallel audit agents over the reorganized tree (~430 tracked md files). Each candidate was read, date-checked (`git log --follow`), reference-counted repo-wide (excluding `vendor/`, `node_modules/`, self), and verified against live code where the claim depended on it (e.g., "plan shipped", "system deleted").

**Verdicts**
- **DELETE** — no unique value: regenerable machine output, tombstone, scratch, dead-end record.
- **ARCHIVE** — historical value only; move to `docs/archive/` preserving relative layout.

⚠️ **Policy conflict to resolve first:** `docs/README.md` currently says "Never delete tracked docs — supersede them into `archive/`." Either amend that rule when executing, or treat every DELETE below as an archive move instead.

---

## Tier 1 — DELETE (60 files, strongest first)

### Regenerable machine output (11)

| # | Path | Description | Reason |
|---|---|---|---|
| 1 | `docs/ops/site-audits/lighhouse.json` | Raw Lighthouse dump, ~1 MB localhost run (typo filename) | Regenerable point-in-time output; zero refs |
| 2 | `docs/ops/site-audits/lighthouse-build.json` | Raw Lighthouse dump, ~566 KB build preview | Same |
| 3 | `docs/ops/site-audits/lighthouse-hosted.json` | Raw Lighthouse dump, ~514 KB hosted site | Same |
| 4–5 | `docs/artifacts/benchmarks/pdf-resource-preparation-selective-ocr{,-scanned}-2026-07-01.json` | PDF OCR timing benchmarks | Machine output, evidence served, zero refs |
| 6–11 | `docs/features/release/pipeline/measurements/local-runner-macos-arm64-{comparison,current,optimized}-{28362694726,28363471815}.json` | Self-hosted runner benchmark runs | Regenerable via committed harness script |

### Tombstones, scratch, dead ends (14)

| # | Path | Description | Reason |
|---|---|---|---|
| 12 | `docs/guides/persona-authoring-guide.md` | 18-line pointer stub → v2 guide | Self-declared tombstone; zero genuine refs |
| 13 | `docs/guides/prompt-pipeline.md` | Stale twin of `prompt-guide.md` | Cites 3 deleted code paths; guide covers same ground with current paths |
| 14 | `docs/research/context-engineering/tools/tool-descriptions-audit.md` | Auto-generated token metrics (1357 lines) | Regenerable; invalidated by every vendor refresh |
| 15 | `docs/features/scqa.md` | Generic SCQA framework note (11 lines) | Scratch, zero refs |
| 16 | `docs/features/mermaid.md` | 9-line typo-ridden idea list | Superseded by real mermaid docs elsewhere |
| 17 | `docs/features/bench-mode/stale.md` | One-line dangling pointer to an out-of-scope doc | No unique value |
| 18 | `docs/artifacts/review/current.md` | JSON findings snapshot named "current" | Misleading name; findings shipped long ago |
| 19 | `docs/learning/library/quiz/log.md` | Fully checked-off work log (Apr 2026) | Done log; outcome captured in question-sets docs |
| 20 | `docs/learning/library/quiz/subagents.md` | Vendor-internals Q&A with rotting line numbers | One-time analysis |
| 21 | `docs/learning/commons/implementation-plan.md` | Standards ship checklist, 100% `[x]` | Finished checklist |
| 22 | `docs/learning/commons/knowledge-graph-compression-analysis.md` | zstd/gzip benchmark tables | Decision made & encoded in pipeline |
| 23 | `docs/learning/commons/knowledge-graph-mcp-analysis.md` | Why-not-hosted-MCP research | Conclusion absorbed into constitution/shipped design |
| 24 | `docs/ops/logs/upstream-fetch.2026-06-22.partial-dry-run.md` | Evaluation-only dry-run, nothing applied | Dead end; superseded by the real 07-10 run log |
| 25 | `docs/ops/releases/cutting-0.0.1.md` | 12-line raw prompt transcript of first release | Scratch; shipped long ago |

### Already-archived dead weight — `docs/archive/` (35 of 40)

Keep-as-history only: `buddy-core.spec.md`, `spec/{buddy-core-coverage,index}.md`, `prompt-caching-runtime-design.md`, `df1.md`. Everything else goes:

| # | Path | Description | Reason |
|---|---|---|---|
| 26–31 | `desktop-plugin-audit`, `title-bar`, `tauri-opencode-parity-audit`, `tauri-vs-context`, `desktop-sidecar-runtime-parity.*`, `desktop-sidecar-vendor-migration-report` | Tauri-era audits/migration reports | Describe deleted Tauri shell/sidecar systems |
| 32 | `frontend-e2e.spec.md` | Playwright scenario spec | No Playwright infra exists anywhere |
| 33 | `AGENTS.md` | "don't read this folder" guard | Contradicts new taxonomy |
| 34 | `todo.md` | 12-line running thread todo | Pure scratch |
| 35 | `learning-architecture-nested-list.md` | Raw file-tree listing | Regenerable draft scratch |
| 36 | `code-review-chat-error-handling.md` | Point-in-time PR review | Review scratch |
| 37 | `findings.md` | Review of uncommitted changes | Outcomes in git/test history |
| 38–39 | `2026-03-21-major-refactor-summary.md`, `2026-04-24-session-log.md` | Work logs | Duplicates of git history |
| 40 | `buddy-home-rollout-checklist.md` | Fully checked-off rollout checklist | Shipped feature |
| 41 | `spec/expectations.md` | Early stack expectations list | Duplicated by AGENTS.md/package.jsons |
| 42 | `storage-path.md` | SQLite-vs-JSON storage deep dive | Decision superseded by vendored db; cites dead files |
| 43 | `tool-path.md` | Pre-vendor 2-tool brainstorm | Self-flagged superseded |
| 44–45 | `opencode-sdk-hybrid-plan.md`, `opencode-coupling-guardrails.md` | SDK-adoption plans | Never adopted; superseded by `architecture/decoupling/` |
| 46 | `migration.md` | Copy-to-vendored migration record | Migration complete; policy now in AGENTS.md |
| 47–49 | `whatnext.md`, `what-next-2026-02-22.md`, `spec/what-next/what-next-2026-02-25.md` | Executed roadmaps | Every milestone built or dropped |
| 50 | `explortation-report.md` | Pre-landing exploration assessment | Implementation supersedes it |
| 51–52 | `modularity-assessment.md`, `persona-collapse-assessment.md` | Point-in-time code audits | Verdicts verifiable in code |
| 53 | `post-refactor-activity-direction.md` | Intent/activity system decisions | Those systems were later deleted |
| 54 | `buddy.report.2026-03-08.md` | Product critique pre-rewrite | Dated critique of replaced system |
| 55–56 | `ui-ux-polish-audit.md`, `ui-ux-polish-status.md` | 37-issue polish pass + tracker | Self-stamped historical; pass closed |
| 57 | `settings-current-structure.md` | Settings tab snapshot | Regenerable; predates Bench-era IA |
| 58 | `learner-store-architecture.md` | Learner-store design | Header defers to buddy-core spec; store removed |
| 59 | `codebuddy.md` | Pre-cutover teaching-mode overview | Self-marked historical duplicate |
| 60 | `buddy-user-guide.md` | 702-line product guide | Describes removed runtime axes (instructionalStrategy) |

---

## Tier 2 — ARCHIVE (move into `docs/archive/`, ~130 files)

### features/

| Rank band | Files | Reason |
|---|---|---|
| Finished plans/logs | `bench-mode/`: `unfaithful-implementaion`, both postmortems, `bench-refactor-review-remediation`, `bench-refactor-implementation-drift-audit`, `chat-scoped-workspace-restoration-plan`, `bench-workspace-file-synchronization-plan`, `unified-bench-ux-design`, `design.md` (pre-refactor, self-marked historical), `implementation-log.md`, `managed-objects-implementation-log.md`; `tabs/`: `implementation-plan.md`, `implementation-log.md` | Implemented plans, dated logs, superseded designs; authority delegated to `current-architecture.md` |
| Superseded feature docs | `html-widgets/design.md` (founding brief; feature shipped); `chemistry/renderer-only-implementation-plan.md` + `possible-bugs.md` (Ketcher removal done, all bugs closed); `pdf-parsing/legacy-liteparse-*` (dir itself says archived); `tool-renderers/init.md` ("Status: Done"); `release/github-actions-minutes.md`, `pipeline/design.md`, `logs/2026-06-29-*`, `measurements/local-runner-*-summary.md`; `onboarding/design.md` (v1 shipped) | Completed passes consumed by current docs |
| Scratch/duplicate restatements | `present-media/caveman.md`, `view-image/caveman.md` (dupes of maintained docs), `prompt-engineering/design.md` (links nonexistent file; superseded by shipped skills), `skills/candidates.md` + `hermes-skill-library-analysis.md` (consumed curation inputs) | No living guidance value |

### guides/ · reviews/ · skills-authoring/

| Files | Reason |
|---|---|
| `reviews/known-issues.md` (misnamed Obsidian snapshot), `reviews/known-issues.2026-07-31.md` (dated capsule) | Canonical tracker is `knownissues.md`; snapshots are time capsules |
| `skills-authoring/buddy-skill-creator-context.md` | Dormant 5-month workstream that never shipped; sole dir occupant |
| `guides/upstream-fetch.subagents.md` (chat byproduct), `foliate-integration-notes.md` (superseded by reader/foliate-gotchas), `theming-migration.md` (shipped), `refactor.md` (stale compaction block), `tool-descriptions-guide.md` (overlaps active create-buddy-tool skill) | Superseded or conversational residue |

### learning/

| Files | Reason |
|---|---|
| All 8 `.arch.md` + all 8 `.agent.md` + `build-strategy.md` + `crosswalk.md` | Explicit "Historical reference, not runtime contract" banners; describe abandoned learner-store runtime |
| `library/quiz/quiz.md`, `quiz/perseus-data-model.md` | Build-time specs for shipped question sets; cite nonexistent paths |
| `commons/development-flow.md`, `knowledge-graph-integration.md`, `knowledge-graph-data-summary.md` | Executed plans / stale provenance; feature shipped differently (`features/standards`) |

Keep: curriculum intent layer + principles + raw CWSEI corpus (implementation-backed via goal-writer), library flashcards/question-sets/resource designs.

### research/context-engineering/ (nearly all)

| Files | Reason |
|---|---|
| Prompt-design chain: `almost-ready`, `strom-updated`, `learner-context`, `core.md`(delete-grade subset) | Doctrine migrated into `personas/prompts/` + live pipeline |
| Third-party snapshots: both `codex-memory-system*`, `codex-system-prompt`, `opencode-system-prompt`, all four comparison docs, `vendor-codex-prompt-pipelines` | Fast-moving external products; conclusions applied |
| Tools audits: `opencode-tools-audit`, `tool-rendering-audit` (already flagged stale by `bench-mode/stale.md`) | Regenerable against vendored source |

Keep: `pipeline.md` (documents live pipeline — consider relocating to architecture/), `top-level-system-prompt-change-triggers.md` (unique cache-contract answer).

### ops/

| Files | Reason |
|---|---|
| `releases/cut-release.algo.md` (self-superseded by v2), `upstream-fetch-audit.md`, `buddy-mac-release-analysis`, `desktop-electron-vendor-parity-checklist.md` ([x] complete) | Consumed planning records |
| Old fetch run logs: `releases/logs/` ×5 (Mar–Apr), `logs/upstream-fetch.{05-18,05-24,06-08}` | Findings folded into current algo/v2 ledger |
| `launch/pre-launch-risk-inventory.md`, `bug-audit/2026-07-13/hardening-reassessment.md` + all 10 `launch-NN-*.bugs.md` | Campaign concluded; dispositions live in retained `combined.md` |
| `launch/linkedin-launch-post.md`, `buddy-help/{research,workflow}.md` | Published/one-shot effort records (skill shipped into packages/buddy) |
| `site-audits/{core-web-vitals,performance,seo}-audit.md`, `audit-checklist.md`, `audit-questions.md` | Point-in-time marketing-site measurements |

Keep: `bug-audit/combined.md` (live index w/ open blockers), both launch-video files (active pipeline), newest fetch logs (07-10, 08-12).

### artifacts/

Effectively the whole tree — every plan verified shipped against code:

| Files | Reason |
|---|---|
| All 19 `plans/*.md` (intent removal, dynamic-tool suite, memory redesign, tanstack, tool-ui suite, mermaidv2, monaco, sdk-cleanup, settings, arch-simplification…) | Outcomes verified in code; finished checklists |
| `review/{2026-04-03,2026-04-22-1,test-review-log}.md` | Dated review logs |
| `using-opencode-js-sdk/` ×3 | Path not taken (vendored subtree chosen) |
| `learner-context-memory-audit.md` | Audit of shipped memory redesign |

---

## Decisions needed from you before executing

1. **Amend the no-delete rule?** Tier 1 assumes yes; otherwise all 60 become archive moves.
2. **Promote `buddy-core.spec.md` out of archive?** ~19 live curriculum docs still cite it as authority.
3. **`buddy-help/skill-style-guide.md`**: agent recommends relocating to `skills-authoring/` (reusable craft guide) rather than archiving.
4. **`managed-objects-design.md`** (3.9k lines): keep-but-trim stale sections vs archive whole.
5. **`whiteboard/design.md:1`** references nonexistent `message.md` — drop the line during this pass.
6. **`memory-optimization/`** is exited-per-own-status-doc (only Windows packaging proof remains); its AGENTS.md has stale `log/` pointers; `docs/README.md` calls it "active". Update both if you confirm exit.
7. Still deferred (destructive bin pass): untracking `features/skills/reviews/generated/` (6.6 MB) and `demo/*.mp4` (10 MB).

**Totals:** 60 delete + ~130 archive ≈ 190 of ~430 tracked docs retired; ~4 MB JSON reclaimed immediately, more after the binary pass.
