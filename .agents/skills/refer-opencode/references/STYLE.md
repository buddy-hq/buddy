# Style Guide For OpenCode→Buddy Porting

This guide is about preserving runtime behavior from vendored OpenCode core without importing style noise.

## Primary Rule

Match runtime behavior first, style second.

Order of precedence:

1. Buddy repository style conventions and AGENTS instructions
2. Existing file-local style in Buddy
3. OpenCode style cues only when 1 and 2 are silent

## Porting Principles

- Port minimal, reviewable behavior changes.
- Avoid drive-by refactors when copying logic.
- Keep Buddy naming/module boundaries when possible.
- Keep OpenCode reference in commit/task notes, not as inline noise comments.

## What To Preserve From OpenCode

- tool/session/permission semantics
- edge-case handling that fixes real bugs
- proven guardrails (loop limits, truncation flow, permission checks)

## What Not To Copy Blindly

- OpenCode-only product assumptions
- OpenCode package topology (`server/*`, `app/*`) when Buddy differs
- stylistic micro-patterns that reduce Buddy readability in current files

## Buddy-Specific Constraints To Respect

- Preserve Buddy route/module naming for compatibility facades (`routes/*`, `index.ts`, adapter seams).
- Keep React/Vite/TanStack frontend assumptions (not Solid-specific patterns).
- Maintain existing imports and ESM resolution expectations in Buddy backend.

## Practical Editing Rules

- Keep diffs narrow to the active runtime seam being changed.
- If a dependency chain forces additional edits, document why in `sync-log.md`.
- Do not normalize semicolons/quotes/import order across unrelated lines.
- Avoid adding `any`; use narrowing or schema-backed typing.

## Verification Rules

- Core-runtime changes should include:
  - workflow from `opencore-pairity/sync-checklist.md`
- Add `sync-log.md` entry with upstream references and decision (`synced`, `partial-sync`, `deferred`).

Do not copy volatile command outputs or drift snapshots into this skill.
