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
  

#### Code Diff Verification (Required for Logic Changes)

When splitting files (not just moving them), a typecheck/lint pass is **not enough**. The review must also:

1. Get original file content: `git show HEAD:<path>`
2. Reconstruct original by combining new files
3. Diff against original — every constant, function, type, and hook logic must be identical
4. Report pass/fail per item

This step is required because typecheck only proves syntactic validity, not behavioral preservation.


#### Tailwind and Compoenent Verification
1. verify UI components are the same.
2. Verify all tailwind classes and styles are the same.
3. Verify the whole component tree remains consistent.


### 3. Fix
If review finds issues, dispatch a fix subagent for that specific problem only.

Repeat Do → Review → Fix until review passes.

## What to Check Before Dispatching

- [ ] Know the exact target structure before writing the prompt
- [ ] Know which files need import updates
- [ ] Know which files are deleted vs moved
- [ ] Know if logic is changing (triggers Code Diff Verification requirement)
