---
name: commit-batch
description: "Plan and execute splitting a dirty git worktree into multiple logical commits. Use when asked to commit changes, split work into separate commits, stage changes safely, or clean up commit history before opening a PR; include a concrete commit plan (commit plan: intent, paths, message) and use non-interactive staging/patch techniques when needed."
---

Turn a mixed working tree into a small, reviewable stack of commits.

Process:

1. Inventory the current state.

   ```bash
   git status --porcelain=v1
   git diff
   git diff --staged
   git log -5 --oneline
   ```

2. Draft a commit plan.

   - Define commits by intent (feature/fix/refactor/docs/tests), not by file count.
   - Keep mechanical changes separate from behavioral changes (formatting, renames, generated files).
   - Isolate risky/noisy files into their own commit (lockfiles, vendored code, large auto-generated diffs).
   - Prefer a plan you can explain in `git log --oneline`.

3. Execute the plan, one commit at a time.

   ```bash
   git status --short

   # stage only the paths for this commit
   git add <paths>
   git add -u <paths>            # stage deletions/renames when needed
   git restore --staged <paths>  # back out accidental staging

   # verify exactly what will be committed
   git diff --staged

   git commit -m "<message>"
   ```

4. Split changes within a file without interactive staging (patch-to-index workflow).

   - Use this only when path-based batching is not enough.

   ```bash
   # start from a clean index for the file(s) you're splitting
   git restore --staged -- <path>

   # generate a patch of the hunks you want in the next commit
   git diff -- <path> > /tmp/commit-part.patch

   # edit /tmp/commit-part.patch to keep only the desired hunks
   git apply --cached /tmp/commit-part.patch

   git diff --staged -- <path>
   git commit -m "<message>"
   ```

5. Safety checks.

   - Do not commit secrets; watch for `.env*`, key files, tokens, and credentials.
   - If hooks/formatters modify files after a commit, stage those changes deliberately and commit them as their own follow-up unless you are explicitly amending.
   - End with a clean working tree (or a clear explanation of what remains and why).


## Commit Guidance


## Introduction

A diff shows what changed. A good commit message explains why it changed.
Make commits easy to scan in `git log --oneline` and useful later in `git blame`.

## The Seven Rules (Adapted For Conventional Commits)

1. Separate subject from body with a blank line
2. Limit the subject line to 50 characters (72 hard limit)
3. Capitalize the subject (the description part)
4. Do not end the subject with a period
5. Use the imperative mood in the subject
6. Wrap the body at 72 characters
7. Use the body to explain what and why, not how

### Subject Line Format

Use Conventional Commits and treat the whole first line as the subject:

```
type(scope): Subject
```

- `type` is lowercase
- `scope` is optional
- `Subject` is imperative and Capitalized
- No trailing period

### Imperative Mood Test

Your subject should complete:

```
If applied, this commit will <subject>
```

Good:

- `feat: Add items CRUD endpoints`

Bad:

- `feat: Added items CRUD endpoints`
- `feat: Adding items CRUD endpoints`

## Conventional Commits

Format:

```
type(scope): Subject
```

Types:

- feat: new feature
- fix: bug fix
- docs: documentation only
- refactor: refactor (no behavior change intended)
- test: tests
- chore: tooling, deps, repo hygiene
- style: formatting only (rare; avoid if it causes noise)

Examples:

- `chore: Setup monorepo tooling`
- `feat(api): Add items CRUD endpoints`
- `feat(ui): Add shadcn button component`
- `fix(ui): Generate Tailwind utilities for shared UI`
- `docs: Document dev commands`

## Batching And Staging Rules

Goal: each commit is one idea.

Rules:

- Never use `git add .`
- Batch by concern (not by file count)
- Prefer smaller, reviewable commits
- Put cleanup and deletions in their own commit

### Recommended Commit Order (Monorepo)

1. Root/workspace config
2. Backend/infrastructure
3. Shared libraries/packages
4. Apps that consume shared packages
5. Docs / internal skills
6. Cleanup

### Staging Workflow

For each commit:

```bash
git status --short
git diff

# stage only what belongs
git add <paths>

# sanity check
git diff --staged

git commit -m "type(scope): Subject"
```

Helpful commands:

```bash
git add -u                 # stage deletions/renames only
git restore --staged <p>   # unstage a path
```

## When To Use A Body

Add a body when it saves future you time:

- why the change exists
- behavior before vs after
- constraints/tradeoffs
- follow-ups

Template:

```
type(scope): Subject

Explain what changed and why.
Wrap at 72 characters.

Notes:
- side effects
- migration steps

Refs: #123
```

## Smell Checks

- If you cannot write a 50-72 char subject, the commit is too big.
- If the message says "updates" / "misc" / "wip", the commit is not one idea.
- If the body explains how, move that explanation to code/comments instead.