---
name: buddy-pr-flow
description: Use when the Buddy worktree is very dirty with many unrelated changes and the user asks to raise PRs from it.
---

# Buddy PR flow

Use this workflow when the worktree contains many unrelated changes and the user asks to turn them into PRs.

Keep the original dirty worktree intact. Raise only PRs the user selects.

## PR boundaries

Each PR must leave the app working on its own. Keep coupled UI, backend, API/schema, generated SDK, state migrations, runtime wiring, and tests together when separating them would break compilation or behavior. A passing typecheck alone does not establish a safe split: check that callers, providers, and user flows still agree. Do not propose separate PRs that only work after both merge; combine those changes into one complete PR.

## Plan

1. Use `pr-splitter` to plan the dirty-worktree split.
2. Present the numbered candidates and their dependencies. Recommend GitHub's native stacked PRs when complete changes build on earlier candidates; explain the proposed bottom-to-top order. Keep independent changes as separate PRs. Related files alone do not establish a dependency.
3. Ask which actions the user wants for each candidate:
   - Raise a PR.
   - Request a review.
   - Create an explainer.
   - Hold for now.

## GitHub native stacked PRs

Use GitHub's first-class stack feature, not just PRs with chained base branches. It is in public preview; check the current [creation documentation](https://docs.github.com/en/pull-requests/how-tos/create-pull-requests/creating-stacked-pull-requests) and installed `gh stack --help` before using it.

- A stack is a linear chain in one repository: the bottom PR targets the trunk, usually `main`, and each later PR targets the branch immediately below it. Keep each layer's diff focused and retain logical commit batches.
- Stacking does not relax the PR boundaries above. Each prefix must leave the app working; keep coupled UI/backend/schema/runtime changes together in one layer. Verify each layer on its actual stack base and perform relevant visual checks before merging.
- Prefer the official `github/gh-stack` CLI extension. `gh stack init` can adopt existing branches in bottom-to-top order; `gh stack add` creates another layer, and `gh stack submit` pushes and registers the native stack. Existing PRs can be registered with `gh stack link` or the REST Stacks API. Preserve intentional titles/descriptions and attach every created PR to this chat.
- Verify GitHub's stack membership and order after creation. Chained base refs without registered stack metadata are not sufficient. Branch protections and Actions are evaluated against the trunk for every layer.
- When an earlier layer changes, cascade the rebase through later layers and inspect the resulting diffs. Use the installed CLI's rebase/sync commands or GitHub's **Rebase stack** action; do not blindly restore the dirty source over reviewed changes.
- Follow the current [merge documentation](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/merging-stacked-pull-requests). Native stacks do not support ordinary auto-merge. Once authorized and checks pass, use `gh stack merge` or the asynchronous stack merge API. Merging a layer includes every unmerged layer below it atomically; confirm the exact group, preserve the user's commit preference, and never include unrelated pre-existing PRs.
- Keep PR raising and stack management on the user's chosen execution path. A CI-watching subagent does not implicitly own extraction, stack creation, rebasing, or merging. Continue other authorized work while CI runs; do not block the critical path merely to watch checks.

## Raise a selected PR

1. Choose the execution path:
   - If unspecified, ask whether the user wants the critical path or a subagent.
   - If the subagent path was chosen without a model, ask which subagent/model to use.
2. Prepare the PR worktree:
   - Inspect `buddy`, `koala`, and `hippo` for branch, dirty state, and active use.
   - If one of the three is suitable and free, reuse it.
   - Otherwise, create a separate managed worktree from the correct base.
3. Extract the selected candidate:
   - On the critical path, do it yourself.
   - On the subagent path, delegate it to the chosen subagent.
4. Run all required checks in the PR worktree after implementation, including `bun fmt`. CI checks formatting.
5. Write the PR description in Minto Pyramid Principle order: put the main point (what the PR achieves and why) first, then logically grouped supporting changes, then evidence and verification.
6. Raise the PR:
   - On the critical path, do it yourself.
   - On the subagent path, have the chosen subagent do it.
7. Check CI:
   - If it fails, resolve the failure on the chosen path.
8. Report the PR status.
9. After the PR merges, shrink the dirty source tree:
   - Snapshot its dirty changes again.
   - Set those changes aside safely.
   - Rebase the source branch onto updated `main`.
   - Restore only changes that have not merged.
   - Check the remaining diff.
10. If this flow created a worktree, check whether its checkout remains in use after merge.
11. Delete that checkout when free.

## Review a selected candidate

1. Delegate a requested review to the chosen reviewer.
2. Fix issues found by that review.
3. Report the findings.
4. Update the split plan if a candidate's boundary changes.

## Explain a selected candidate

1. Use `pr-explainer` to create a requested page, even when the candidate has no PR yet.
