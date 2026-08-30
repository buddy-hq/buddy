# Buddy docs refactor — execution record

Status: **accepted after information-loss restoration**
Date: 2026-08-30
Scope: every tracked file under `docs/`; the accepted change set is documentation-only and confined to `docs/**`

## Final accepted outcome

The working tree under `docs/` is the accepted result. Preservation and truth outrank file-count reduction.

| Measure | HEAD (`a5eb94fd9`) | Invalidated first pass | Accepted working tree |
|---|---:|---:|---:|
| Files | 360 tracked | 73 | **197** |
| Bytes | 18,322,783 | 268,671 | **2,698,100** |

Current counts (2026-08-30, this worktree):

- **197** files on disk under `docs/` (2,698,100 bytes).
- **178** original HEAD paths still present (**130** modified in place, **48** byte-identical to HEAD).
- **182** original HEAD paths deleted (`git diff --name-only --diff-filter=D -- docs`).
- **19** new canonical documents relative to HEAD.

Identity check: 178 survivors + 182 deletions = 360 HEAD paths; 178 survivors + 19 new files = 197 on-disk files.

The first execution that landed **73 files / 268,671 bytes** is **invalidated**. A post-pass review found material information loss. The concrete trigger was **annotations**: architecture, API, current-state, Calibre, and Obsidian were deleted or collapsed to an inadequate mention, while unique selector/re-anchoring, `@buddy/annotation-contract`, LevelDB/bounds, and external-system research were not in code. That failure changed the rubric: **git is recovery, not a license to discard unique active knowledge**; count and byte budgets no longer decide keep vs delete.

## Why the tree exists

Code, configuration, tests, and `packages/buddy/src/learning/shared/teaching-vocabulary.ts` remain authoritative for current structure and behavior. Docs earn their keep when they hold non-obvious intent, decisions, rejected approaches, evidence, incidents, constraints, open issues, or durable procedures.

The refactor still deletes documentation that merely remembers the codebase: completed plans, work logs, explorations, generated dumps, obsolete code maps, superseded designs with no remaining kernel, duplicate guides, and the old `docs/archive/` dump. It does **not** delete unique kernels merely because a first-pass appendix omitted them.

This record removes the former “never delete tracked docs” convention **and** the later complement-delete / 73-file target. Both were too crude: one accumulated noise, the other destroyed signal.

## Decision rubric (still in force)

Age alone is not a deletion reason. A young implementation log can be disposable; an old incident can remain valuable.

| Verdict | Standard |
|---|---|
| `DELETE` | Recoverable from current code or git **and** not unique active knowledge; completed plan/checklist/log; obsolete exploration; duplicate after a named merge; false code map; generic scratch; generated/regenerable output; or media with a canonical source elsewhere. |
| `MERGE` | Contains a small unique kernel, but not enough to justify a separate authority. Copy the named kernel, fix references, then delete the source. |
| `SHRINK` | Is the correct conceptual home but mixes durable knowledge with code narration, chronology, stale paths, or raw evidence. Keep the named unique sections; do not shrink past useful operational detail. |
| `UPDATE` | Remains authoritative but contains a limited number of stale claims or indexes. |
| `KEEP` | Compact, current, unique, and costly to rediscover from code or git. |

**Overrides that replaced the first-pass machinery:**

- Preservation of unique non-code knowledge outranks any file-count or byte target. The obsolete **71/73-file**, **≤350 KB**, and complement-delete rules are withdrawn.
- Git history is sufficient to *recover* a deleted file. It is **not** a justification for discarding unique active knowledge from the working tree.
- Wholesale restore from HEAD is not finished work if the restored prose still claims live truth that current code disproves. Label historical vs shipped vs proposed.
- The **106-source exception appendix** in the first proposal is inaccurate for the accepted tree and is not reproduced here. The deletion manifest below is the exhaustive list of original paths that remain gone.

## Multi-model workflow

1. **Seven Cursor inventory audits** partitioned all 360 tracked `docs/` paths and proposed KEEP / SHRINK / UPDATE / MERGE / DELETE. Session IDs:
   - `f829d010-5474-4aba-ba1b-f00ad6ea13e52`
   - `cb0897b2-c928-400a-9151-2d540b865b05`
   - `ce766edf-8c3b-4650-a465-976a79f9dba3`
   - `222ed9a7-fab5-4879-9a85-f92df29fee0b`
   - `4f8fc9ef-60c1-485a-9f89-47f5928702e0`
   - `f9b44143-e9e0-4171-9c0d-a1cf11d58d27`
   - `2eb6ea75-efa0-4846-90ba-8c5fe786d9aa`
2. **First execution** applied that proposal (complement-delete of every path not in the 106-source appendix) and produced 73 files / 268,671 bytes.
3. **Eight Gemini information-loss audits** (`/tmp/buddy-info-loss-q1.md` … `q8.md`) compared HEAD to that tree, preservation-biased. Annotations (queue 1) were the highest-risk trigger.
4. **Eight Gemini restorations** (`/tmp/buddy-info-restoration-q1.md` … `q8.md`) undeleted or expanded claimed kernels. Several restoration reports overstated completeness (byte-identical HEAD restore treated as “done”; condensed files claimed as full restores).
5. **Gemini quota exhausted** before an independent cross-review of those restorations, so that review did not run on Gemini.
6. **Eight Cursor Grok 4.6 medium cross-reviews** (`/tmp/buddy-info-cross-review-q1.md` … `q8.md`) compared each `LOSS_PRESENT` source to the claimed destination. Git history was not counted as preservation. Typical finding: unique text was back, but present-tense live-truth and duplicate authorities remained. Combined **FIX_REQUIRED** rows: q1=2, q2=10, q3=12, q4=3, q5=13, q6=11, q7=21, q8=3 (**75**).
7. **Eight Cursor correction passes** (`/tmp/buddy-info-fixes-q1.md` … `q8.md`) applied those FIX_REQUIRED items (historical banners, code-true open/resolved splits, pointer-not-duplicate authorities, link repair).
8. **Four focused Cursor acceptance spot-checks** (`/tmp/buddy-final-spotcheck-1.md` … `4.md`) each returned **FIX_REQUIRED** on remaining live-truth or link defects, with unique durable information already present.
9. **Four corresponding fix notes** (`/tmp/buddy-final-fixes-1.md` … `4.md`) closed the listed remaining defects in those scopes. No fifth independent ACCEPT document was written after the last fix batch.
10. **Eight Cursor Grok 4.6 xhigh final audits** repartitioned the exact 360-file HEAD inventory into eight non-overlapping 45-file queues. Six durable reports materialized; queues 4 and 7 were reconstructed from their checkpoints and follow-up audits.
11. A Gemini 3.7 Flash full-manifest pass was rejected as evidence because every queue returned an implausible zero-failure / 100%-confidence verdict and its adversarial second pass timed out. Gemini made no repository edits in that pass.
12. **Eight Luna Max validators** rechecked every known loss, stale restoration, and duplicate-authority finding under a stricter rule: only current root `docs/**` counts as documentation preservation. Code, package docs, skills, `AGENTS.md`, and git history could corroborate truth but could not substitute for missing documentation.
13. Residuals were repaired in disjoint scopes and independently rechecked. Final acceptance results: architecture/Bench all fixed; curriculum **97% PASS**; feature half A **96% PASS**; interfaces **98% PASS**; guides/standards/alignment **97% PASS**; ops/quiz/memory **98% PASS**; site/research tail **97% PASS**; feature half B **97% PASS**; final ten-path gap **98% PASS**.
14. The mechanical coverage ledger (`/tmp/luna-zero-loss-coverage-ledger.md`) recorded strict source + destination + post-repair evidence for **350/360 paths (97.22%)** before the final ten-path audit. The ten-path audit then examined the remaining paths, found one release-checklist loss, and independently accepted its repair at **98% confidence**. The resulting path coverage is **360/360**.

## What remains deleted (by category)

182 original paths are still deleted. They fall into:

| Category | Count | What was discarded |
|---:|---:|---|
| `docs/archive/` | 40 | Obsolete product maps, Tauri-era notes, completed checklists, and session logs; surviving kernels are in current architecture, feature, learner-memory, or operating docs. |
| `docs/artifacts/` | 29 | Raw OCR JSON, review logs, and completed plans. Unique UI, memory, Mermaid, file-browser, and routing kernels were copied into current root docs before source deletion. |
| `docs/research/` | 23 | External prompt dumps and CLI comparisons; durable learner-context and screen-size decisions were retained in root ADRs and guides. |
| Curriculum raw / agent / arch / superseded planning | 33 | CWSEI OCR dumps; `*.agent.md` / `*.arch.md` / build-strategy / crosswalk / `curriculum.intent.md`. Unique pedagogy tables remain in `principles.md` and surviving `*.intent.md` files. |
| `docs/learning/commons/` (non-kernel) | 4 | Development-flow and implementation logs; KG integration moved to `features/standards/intent.md`. |
| `docs/learning/library/` (after move) | 5 | Flashcards / question-set sources (now under `docs/features/`), quiz scratch logs. |
| Completed decoupling phase reports + README | 7 | Phase 1–8 implementation diaries; start-here paragraph merged into `about.md`. |
| Overlay review (replaced by ADR) | 1 | `buddy-opencode-config-overlay-architecture-review.md` → `architecture/decisions/opencode-config-overlay.md`. |
| Feature scratch, plan, fixtures, generated ignore | 7 | `bench-mode/stale.md`, browser fixtures, chemistry renderer plan, `scqa.md`, skills `reviews/generated/.gitignore`, pre-release checklist (moved). |
| Guides merged or obsolete | 10 | Command diaries merged into `guides/commands/agent-operating.md`; Foliate notes into `build-reader.md`; tool-description kernels into `guides/tool-authoring-guide.md`; `cut.md` moved under ops. |
| Ops diaries, dump JSON, moved incident | 17 | Routine upstream-fetch logs, Lighthouse JSON, vendor-parity checklist, buddy-help workflow; storage-incident log moved to `ops/releases/storage-cross-contamination-incident.md`. |
| Duplicate review novels | 4 | Extra known-issues files merged into `docs/reviews/knownissues.md`; cleanup-candidates list. |
| Skills-authoring source (after move) | 1 | `docs/skills-authoring/buddy-skill-creator-context.md` → `docs/learning/skills-authoring.md`. |
| Demo binary | 1 | `docs/demo/buddy-demo-live-electron.mp4`; canonical launch media is `packages/videos/`. |

**40+29+23+33+4+5+7+1+7+10+17+4+1+1 = 182.**

Empty untracked directories may still exist on disk (`docs/archive/`, `docs/artifacts/`, `docs/research/`, `docs/skills-authoring/`, curriculum `raw/`, etc.). Git does not track them.

## Deleted original HEAD paths (complete)

Generated with `git diff --name-only --diff-filter=D -- docs`. **182 paths.**

1. `docs/architecture/decisions/buddy-opencode-config-overlay-architecture-review.md`
2. `docs/architecture/decoupling/README.md`
3. `docs/architecture/decoupling/migration-plan.md`
4. `docs/architecture/decoupling/phase-1-implementation.md`
5. `docs/architecture/decoupling/phase-2-implementation.md`
6. `docs/architecture/decoupling/phase-3-implementation.md`
7. `docs/architecture/decoupling/phase-4-5-implementation.md`
8. `docs/architecture/decoupling/phase-6-7-8-implementation.md`
9. `docs/archive/2026-03-21-major-refactor-summary.md`
10. `docs/archive/2026-04-24-session-log.md`
11. `docs/archive/AGENTS.md`
12. `docs/archive/buddy-core.spec.md`
13. `docs/archive/buddy-home-rollout-checklist.md`
14. `docs/archive/buddy-user-guide.md`
15. `docs/archive/buddy.report.2026-03-08.md`
16. `docs/archive/code-review-chat-error-handling.md`
17. `docs/archive/codebuddy.md`
18. `docs/archive/desktop-plugin-audit.md`
19. `docs/archive/desktop-sidecar-runtime-parity.2026-03-05.md`
20. `docs/archive/desktop-sidecar-vendor-migration-report.md`
21. `docs/archive/df1.md`
22. `docs/archive/explortation-report.md`
23. `docs/archive/findings.md`
24. `docs/archive/frontend-e2e.spec.md`
25. `docs/archive/learner-store-architecture.md`
26. `docs/archive/learning-architecture-nested-list.md`
27. `docs/archive/migration.md`
28. `docs/archive/modularity-assessment.md`
29. `docs/archive/opencode-coupling-guardrails.md`
30. `docs/archive/opencode-sdk-hybrid-plan.md`
31. `docs/archive/persona-collapse-assessment.md`
32. `docs/archive/post-refactor-activity-direction.md`
33. `docs/archive/prompt-caching-runtime-design.md`
34. `docs/archive/settings-current-structure.md`
35. `docs/archive/spec/buddy-core-coverage.md`
36. `docs/archive/spec/expectations.md`
37. `docs/archive/spec/index.md`
38. `docs/archive/spec/what-next/what-next-2026-02-25.md`
39. `docs/archive/storage-path.md`
40. `docs/archive/tauri-opencode-parity-audit.md`
41. `docs/archive/tauri-vs-context.md`
42. `docs/archive/title-bar.md`
43. `docs/archive/todo.md`
44. `docs/archive/tool-path.md`
45. `docs/archive/ui-ux-polish-audit.md`
46. `docs/archive/ui-ux-polish-status.md`
47. `docs/archive/what-next-2026-02-22.md`
48. `docs/archive/whatnext.md`
49. `docs/artifacts/benchmarks/pdf-resource-preparation-selective-ocr-2026-07-01.json`
50. `docs/artifacts/benchmarks/pdf-resource-preparation-selective-ocr-scanned-2026-07-01.json`
51. `docs/artifacts/learner-context-memory-audit.md`
52. `docs/artifacts/plans/arch-simplification-plan.md`
53. `docs/artifacts/plans/dynamic-tool-addition-plan.md`
54. `docs/artifacts/plans/dynamic-tool-buddy-metadata-ui-final-plan.md`
55. `docs/artifacts/plans/dynamic-tool-buddy-metadata-ui-plan-feedback.md`
56. `docs/artifacts/plans/dynamic-tool-buddy-metadata-ui-plan.md`
57. `docs/artifacts/plans/dynamic-tool-session-live-patch-hypothesis.md`
58. `docs/artifacts/plans/file-explorer-monaco-implementation-plan.md`
59. `docs/artifacts/plans/intent-dynamic-tool-migration-notes.md`
60. `docs/artifacts/plans/intent-removal-plan.md`
61. `docs/artifacts/plans/learner-context-memory-redesign.md`
62. `docs/artifacts/plans/learner-memory-codex-aligned-pipeline-checklist.md`
63. `docs/artifacts/plans/mermaidv2.md`
64. `docs/artifacts/plans/sdk-api-cleanup-plan.md`
65. `docs/artifacts/plans/settings-architecture-end-state-plan.md`
66. `docs/artifacts/plans/tanstack-query-router-integration-plan.md`
67. `docs/artifacts/plans/tool-system-end-state-checklist.md`
68. `docs/artifacts/plans/tool-ui-display-api-plan.md`
69. `docs/artifacts/plans/tool-ui-final-frontend-blueprint.md`
70. `docs/artifacts/plans/tool-ui-summary-api-proposal.md`
71. `docs/artifacts/review/2026-04-03.md`
72. `docs/artifacts/review/2026-04-22-1.md`
73. `docs/artifacts/review/current.md`
74. `docs/artifacts/review/test-review-log.md`
75. `docs/artifacts/using-opencode-js-sdk/opencode-sdk-migration-guide-2026-02-26.md`
76. `docs/artifacts/using-opencode-js-sdk/opencode-sdk-replacement-audit.md`
77. `docs/artifacts/using-opencode-js-sdk/sdk-migration-feasibility.md`
78. `docs/demo/buddy-demo-live-electron.mp4`
79. `docs/features/bench-mode/stale.md`
80. `docs/features/browser/fixtures/download.txt`
81. `docs/features/browser/fixtures/index.html`
82. `docs/features/chemistry/renderer-only-implementation-plan.md`
83. `docs/features/release/pre-release-checklist.md`
84. `docs/features/scqa.md`
85. `docs/features/skills/reviews/generated/.gitignore`
86. `docs/guides/commands/codex-subagents.md`
87. `docs/guides/commands/cut.md`
88. `docs/guides/commands/inSync.md`
89. `docs/guides/commands/refactor.md`
90. `docs/guides/commands/review-loop.md`
91. `docs/guides/commands/review.md`
92. `docs/guides/commands/wave-2.md`
93. `docs/guides/foliate-integration-notes.md`
94. `docs/guides/refactor.md`
95. `docs/guides/tool-descriptions-guide.md`
96. `docs/learning/commons/development-flow.md`
97. `docs/learning/commons/implementation-plan.md`
98. `docs/learning/commons/knowledge-graph-compression-analysis.md`
99. `docs/learning/commons/knowledge-graph-integration.md`
100. `docs/learning/curriculum/alignment.agent.md`
101. `docs/learning/curriculum/alignment.arch.md`
102. `docs/learning/curriculum/assessment.agent.md`
103. `docs/learning/curriculum/assessment.arch.md`
104. `docs/learning/curriculum/build-strategy.md`
105. `docs/learning/curriculum/crosswalk.md`
106. `docs/learning/curriculum/curriculum.agent.md`
107. `docs/learning/curriculum/curriculum.arch.md`
108. `docs/learning/curriculum/curriculum.intent.md`
109. `docs/learning/curriculum/feedback.agent.md`
110. `docs/learning/curriculum/feedback.arch.md`
111. `docs/learning/curriculum/goals.agent.md`
112. `docs/learning/curriculum/goals.arch.md`
113. `docs/learning/curriculum/practice.agent.md`
114. `docs/learning/curriculum/practice.arch.md`
115. `docs/learning/curriculum/progress.agent.md`
116. `docs/learning/curriculum/progress.arch.md`
117. `docs/learning/curriculum/raw/carl-wieman-science-education-initiative-request-for-proposals.txt`
118. `docs/learning/curriculum/raw/course-scale-learning-goals.txt`
119. `docs/learning/curriculum/raw/coursetransformationguide-cwsei-cu-sei.txt`
120. `docs/learning/curriculum/raw/cpsc-learning-goals.txt`
121. `docs/learning/curriculum/raw/creating-and-using-effective-learning-goals.txt`
122. `docs/learning/curriculum/raw/creating-good-homework-problems-and-grading-them.txt`
123. `docs/learning/curriculum/raw/cwsei-teaching-practices-inventory.txt`
124. `docs/learning/curriculum/raw/good-examples-of-learning-goals-at-ubc-and-cu.txt`
125. `docs/learning/curriculum/raw/how-people-learn-implications-for-teac.txt`
126. `docs/learning/curriculum/raw/how-to-develop-learning-goals-for-an-established-course-the-computer-science-model1.txt`
127. `docs/learning/curriculum/raw/learning-goals-for-ubc-phys-250-introduction-to-modern-physics-summer-2009.txt`
128. `docs/learning/curriculum/raw/role-play-a-glimpse-into-the-process-of-creating-learning-goals-developed-oct-2008-beth-simon-and-steve-wolfman-for-the-ubc-cwsei.txt`
129. `docs/learning/curriculum/raw/tracking-changing-learning-goals-long-version.txt`
130. `docs/learning/curriculum/raw/what-key-elements-must-we-preserve-to-sustain-the-use-of-evidence-based-teaching-methods-and-drive-further-improvement-of-science-education-at-ubc.txt`
131. `docs/learning/curriculum/sequencing.agent.md`
132. `docs/learning/curriculum/sequencing.arch.md`
133. `docs/learning/library/flashcards.md`
134. `docs/learning/library/question-sets-implementation-details.md`
135. `docs/learning/library/question-sets-product-direction.md`
136. `docs/learning/library/quiz/log.md`
137. `docs/learning/library/quiz/quiz.md`
138. `docs/ops/launch/buddy-help/workflow.md`
139. `docs/ops/logs/upstream-fetch.2026-05-18.md`
140. `docs/ops/logs/upstream-fetch.2026-05-24.md`
141. `docs/ops/logs/upstream-fetch.2026-06-08.md`
142. `docs/ops/logs/upstream-fetch.2026-06-22.partial-dry-run.md`
143. `docs/ops/logs/upstream-fetch.2026-08-12.md`
144. `docs/ops/releases/desktop-electron-vendor-parity-checklist.md`
145. `docs/ops/releases/logs/storage-cross-contamination-incident.2026-07-05.md`
146. `docs/ops/releases/logs/upstream-fetch.2026-03-05.md`
147. `docs/ops/releases/logs/upstream-fetch.2026-03-20.md`
148. `docs/ops/releases/logs/upstream-fetch.2026-04-01.md`
149. `docs/ops/releases/logs/upstream-fetch.2026-04-21.md`
150. `docs/ops/releases/logs/vendor-opencode-delta-2026-04-01.md`
151. `docs/ops/releases/upstream-fetch-audit.md`
152. `docs/ops/site-audits/lighhouse.json`
153. `docs/ops/site-audits/lighthouse-build.json`
154. `docs/ops/site-audits/lighthouse-hosted.json`
155. `docs/research/context-engineering/buddy-prompt-engineering/buddy-prompt-almost-ready.md`
156. `docs/research/context-engineering/buddy-prompt-engineering/buddy-prompt-storm.md`
157. `docs/research/context-engineering/buddy-prompt-engineering/buddy-prompt-strom-updated.md`
158. `docs/research/context-engineering/buddy-prompt-engineering/core.md`
159. `docs/research/context-engineering/buddy-prompt-engineering/learner-context.md`
160. `docs/research/context-engineering/buddy-prompt-engineering/pipeline.md`
161. `docs/research/context-engineering/buddy-prompt-engineering/vendor-codex-prompt-pipelines.md`
162. `docs/research/context-engineering/codex-opencode-comparison.md`
163. `docs/research/context-engineering/codex-system-prompt.md`
164. `docs/research/context-engineering/codex-vs-opencode-matrix.md`
165. `docs/research/context-engineering/complete-prompt-comparison.md`
166. `docs/research/context-engineering/gemini-cli-prompt-comparison.md`
167. `docs/research/context-engineering/memories/codex-memory-system.codex.md`
168. `docs/research/context-engineering/memories/codex-memory-system.md`
169. `docs/research/context-engineering/opencode-system-prompt.md`
170. `docs/research/context-engineering/tools/opencode-tools-audit.md`
171. `docs/research/context-engineering/tools/tool-descriptions-audit.md`
172. `docs/research/context-engineering/tools/tool-list.md`
173. `docs/research/context-engineering/tools/tool-rendering-audit.md`
174. `docs/research/context-engineering/top-level-system-prompt-change-triggers.md`
175. `docs/research/llm-wiki/README.md`
176. `docs/research/notebooklm/research.md`
177. `docs/research/screen-sizes.md`
178. `docs/reviews/cleanup-candidates-2026-08-22.md`
179. `docs/reviews/known-issues.2026-07-31.md`
180. `docs/reviews/known-issues.md`
181. `docs/reviews/known-issues.misc.md`
182. `docs/skills-authoring/buddy-skill-creator-context.md`

## Final validation standard

The accepted tree meets the requested 95% confidence bar through independent, evidence-backed review rather than a claim of mathematical certainty:

- Exact HEAD inventory coverage: **360/360** original files.
- Final strict mechanical coverage before the last gap pass: **350/360 (97.22%)** with source, destination, and post-repair evidence.
- Remaining gap pass: **10/10** inspected; nine accepted/disposable and one release-checklist loss repaired and independently accepted at **98% confidence**.
- Every residual repair group received an independent read-only acceptance result between **96% and 98%**.
- Only files under `docs/**` belong to the final commit. Package docs, code comments, root `AGENTS.md`, `skills-lock.json`, and installed skills are excluded.

This establishes high confidence that unique architectural rationale, product contracts, algorithms, constraints, evidence, open risks, and operational lessons from the 360-file baseline remain represented in the current root documentation tree. It is not a literal proof that no human could ever identify another useful sentence.
