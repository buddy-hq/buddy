# Refactor Workflow

## Guiding Principle
Use subagents as the work force. Stay as orchestrator. Never do work yourself unless trivial (e.g., a single `git mv`).

---

## Cycle: Do → Review → Fix

Repeat until clean.

### 1. Do
Dispatch a `general` subagent with:
- Exact target file/folder structure (before and after)
- List of specific steps to execute
- Rules: use `git mv` for moves, no logic changes, update all imports, run typecheck/lint at end
- Deliverable: list of files moved, files with import updates, typecheck/lint result

### 2. Review
Dispatch a second `general` subagent to verify:
- Structure matches target
- All imports updated correctly
- Typecheck passes
- Lint passes
- **No dangling references to old paths** (grep for old import patterns)

### 3. Fix
If review finds issues, dispatch a fix subagent for that specific problem only.

Repeat Do → Review → Fix until review passes.

---

## Code Diff Verification (Required for Logic Changes)

When splitting files (not just moving them), a typecheck/lint pass is **not enough**. The review must also:

1. Get original file content: `git show HEAD:<path>`
2. Reconstruct original by combining new files
3. Diff against original — every constant, function, type, and hook logic must be identical
4. Report pass/fail per item

This step is required because typecheck only proves syntactic validity, not behavioral preservation.

---

## Structure Conventions

### `components/chat/` organization

```
chat/
  parts/           # Renders a single MessagePart (text, reasoning, tool, file)
  sections/        # Orchestrators — compose parts into complete message turns
  shared/          # UI primitives not tied to a MessagePart type
```

- **parts/** — single-purpose part renderers (one component per file)
- **sections/** — compound components that own a message turn (user-section, assistant-section)
- **shared/** — reusable primitives (hooks, utils, dividers, error cards)



### Folder vs File

- If components are tightly coupled and would exceed ~150 lines together → use a folder with `index.ts` as the manifest
- Otherwise → single component per file

---

## Import Rules

- Always update imports when moving files
- Use relative paths (`../shared/` not aliases)
- `parts/index.ts` — barrel export for part subsystem only (no sections, no shared)
- `sections/` and `shared/` — no index.ts barrel exports (import directly from files)

---

## What to Check Before Dispatching

- [ ] Know the exact target structure before writing the prompt
- [ ] Know which files need import updates
- [ ] Know which files are deleted vs moved
- [ ] Know if logic is changing (triggers Code Diff Verification requirement)
