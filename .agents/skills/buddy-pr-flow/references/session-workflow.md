# Session workflow reference

Probationary; unlinked. Respect authorization per action.

## Scope and split

- Own-chat PRs only. Never fix/merge unrelated pre-existing GitHub PRs.
- Fresh batch: inventory again; old numbering/reviews may be stale.
- Read `to-review` and intake/handoff documents; reconcile against actual diff. Verify claims against evidence.
- Snapshot tracked/untracked work; retain recoverable backup. Track ownership, holds, dependencies, drift.
- Split by complete user behavior. Coupled UI/backend/schema/SDK/migrations/runtime/tests travel together; every prefix works.
- Recommend safest first. Hold incomplete work explicitly, when requested. Keep Easel, skills, local bookkeeping out unless selected.

## Explain and review

- Use pr-splitter for boundaries; pr-explainer for HTML. Top-down: user outcome → before/after → expected behavior → concise in-app checks. Remove shipped candidates from remaining overview.
- Exact reviewer input: base/snapshot, paths/hunks, approved intent, tests, exclusions. Reviewers need no worktrees. Read-only; avoid source drift.
- Sol: GPT-6.1; extra-high: xhigh. Batch minor changes when requested.
- Significant unaccepted findings: stop; report trigger, impact, evidence, location. Do not silently fix when user requested findings. If first blocker is N+1, raise only clean 1–N. Explicitly accepted findings: log, proceed unchanged.

## Execute

- Follow chosen critical path. Parent handles stacks; Luna handles predictable isolated PR/CI work with explicit paths and boundaries. Never trust Luna to discover the split.
- Inspect Buddy/Koala/Hippo; reuse free checkout or create one managed worktree. Preserve active editors.
- Extract selected scope only. Logical commit batches; never one mixed bulk commit. Inspect staged scope/dependencies.
- Focused package-script tests; isolated state. Required root lint, then sequential typecheck. Format completed selected work in PR checkout; verify formatter changes.
- PR descriptions: outcome/why first, evidence. Attach every created PR.
- Independent changes ordinarily separate; requested/needed stacks: GitHub native registration, verified membership/order, trunk protections, complete layers. Check current docs/CLI. Ordinary auto-merge unsupported; automatically watch then stack-merge approved clean prefix when green. Preserve commit batches.

## Follow through

- Improve recursively: diagnose friction, distinguish fixable CI/tool/workflow bugs from platform peculiarities. Report bugs and offer a fix unless already authorized; fix, verify, then reassess instead of normalizing workarounds. Record peculiarities and proven practices here; later condense into the skill only when approved. Strict main checks require rebasing independent PRs after merges; canceled duplicate contexts can block native stacks.
- Continue useful critical-path work while CI runs. Concrete progress; status questions do not stop work. No unsolicited hourly automation.
- After merge: snapshot source again; shrink merged diff/rebase without disrupting active editing. Preserve newer changes; metadata-only alignment when safe, otherwise coordinate.
- Archive own free worktrees; delete own merged branches; retain recovery snapshots. Leave others' checkouts alone.
- Preview release: authorized checkpoint, clean detached worktree; verify result; report included/excluded changes; clean up.
- Computer tests: explicit approval, temporary homes, batched journeys/checkpoint updates, screenshot paths, issue list; fix/retest loops within scope.
- Delegation: max two Sol/Opus experts; check remaining usage. Opus 5.5 High complex, Medium narrow, through use-cursor; bug context/screenshots, freedom to solve. Reuse promptly; avoid cache-expired redispatch. At 2% remaining, handoff with exact test-resume point and stop.
