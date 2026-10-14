# Orchestrating Codex Sol/Luna agents

How this migration is run: one Claude orchestrator plans, briefs, reviews and integrates; Codex CLI agents (Sol and Luna models) do the reading and editing. Written 2026-10-08 during the OpenCode v2 migration. The flow is reusable for any large multi-workstream change in this repo.

## Roles

| Role | Who | Does |
|---|---|---|
| Orchestrator | Claude (main session) | Architecture and seam decisions, workstream split and file ownership, briefs, review of every result, integration fixes, `STATUS.md`/`LOG.md`, final `bun lint` + `bun typecheck`. Stays out of bulk edits. |
| Complex worker | Sol `gpt-6.1-sol`, effort `xhigh` | Opus-level: multi-file redesigns, new seams, cross-layer work. |
| Scoped worker | Sol `gpt-6.1-sol`, effort `high` | Sonnet-level: well-specified, bounded tasks (tooling, mechanical refactors, focused research). |
| Minor worker | Luna `gpt-6-luna`, effort `max` | Haiku-level: very small edits, short lookups. |
| Fallback | Claude Opus / Sonnet / Haiku subagents | Only when Sol is not working well or produces buggy code. |
| Reviewer | Sol (`high` or `xhigh`) | Independent review of a finished workstream's diff when the orchestrator wants a second pass. |

## Caps

- At most **6 OpenAI agents at once**: up to 3 Sol xhigh, 2 Sol high, 3 Luna. The user can raise this for a one-off burst; record it in `LOG.md` when that happens.
- Claude fallback caps: 1 Opus, 2 Sonnet, 3 Haiku.
- Free slots may be used for read-only exploratory research that later workstreams will need. This is optional, not a target.

## Accounts and limits

Three Codex accounts, from the `coinit` function in `~/.zshrc`:

| # | `CODEX_HOME` |
|---|---|
| 1 | `~/.codex` |
| 2 | `~/.codex-t3/account-3` |
| 3 | `~/.codex-t3/nush` |

Each account's `config.toml` already sets `model = "gpt-6.1-sol"`, `approval_policy = "never"`, `sandbox_mode = "danger-full-access"`. Always run agents in bypass mode anyway (`--dangerously-bypass-approvals-and-sandbox`, built into the launcher) so a run never stalls waiting for a permission prompt, whatever an account's config says.

- Spread concurrent agents across accounts. Put the heaviest new run on the account with the least load.
- Usage is metered per account in a 5-hour window and a 7-day window. A run that dies on a usage limit is not dead for good: rerun it on another account, or after that account's reset time. Check `stderr.log` / `events.jsonl` for the limit error.
- Sanity-check all three accounts with a cheap run before a big launch, e.g. `printf 'Reply with the single word OK.' > ping.md` and launch it at effort `low` on each account.
- A run killed by the limit fails with `turn.failed` "You've hit your usage limit ... try again at HH:MM". Resume it on the same account after that time with `codex exec resume <thread_id>` so it keeps its context (`resume.sh` below), and retry once a minute while the window is still closed (`resume-retry.sh`): the reset happens some seconds after the stated minute. A long background `sleep` until the reset time, followed by the resume, keeps this hands-off.
- Several heavy xhigh runs can drain all three 5-hour windows within the same half hour. Stagger a large burst, or expect a pause until the windows reset.

Resume launchers, next to `run.sh`:

```zsh
# resume.sh <account> <name> <effort> <prompt.md> [model]
acct=$1 name=$2 effort=$3 prompt=$4 model=${5:-gpt-6.1-sol}
homes=("$HOME/.codex" "$HOME/.codex-t3/account-3" "$HOME/.codex-t3/nush")
home=${homes[$acct]}
out=${0:A:h}/runs/$name
tid=$(grep -o '"thread_id":"[^"]*"' $out/meta | head -1 | cut -d'"' -f4)
n=$(( $(ls $out | grep -c '^events-r') + 1 ))
print -r -- "resume$n account=$acct effort=$effort model=$model thread=$tid started=$(date +%H:%M:%S)" >> $out/meta
cd /Users/prashantbhudwal/Code/buddies/v2-upgrade
CODEX_HOME=$home codex exec resume --dangerously-bypass-approvals-and-sandbox -m $model -c "model_reasoning_effort=\"$effort\"" --json -o $out/last.md $tid - < $prompt > $out/events-r$n.jsonl 2> $out/stderr-r$n.log
code=$?
print -r -- "resume$n exit=$code finished=$(date +%H:%M:%S)" >> $out/meta
exit $code
```

`resume-retry.sh` takes the same arguments: it calls `resume.sh` up to 20 times, sleeping 60 s after each attempt that fails with the usage-limit error and fewer than 12 event lines.

## Launcher

Kept in the orchestrator's scratchpad as `codex/run.sh`, with briefs in `codex/briefs/` and outputs in `codex/runs/<name>/`. Recreate it from this copy:

```zsh
#!/bin/zsh
acct=$1 name=$2 effort=$3 prompt=$4 model=${5:-gpt-6.1-sol}
homes=("$HOME/.codex" "$HOME/.codex-t3/account-3" "$HOME/.codex-t3/nush")
home=${homes[$acct]}
out=${0:A:h}/runs/$name
mkdir -p $out
print -r -- "account=$acct home=$home effort=$effort model=$model started=$(date +%H:%M:%S)" > $out/meta
CODEX_HOME=$home codex exec --dangerously-bypass-approvals-and-sandbox -C /Users/prashantbhudwal/Code/buddies/v2-upgrade -m $model -c "model_reasoning_effort=\"$effort\"" --json -o $out/last.md - < $prompt > $out/events.jsonl 2> $out/stderr.log
code=$?
print -r -- "exit=$code finished=$(date +%H:%M:%S)" >> $out/meta
grep -m1 -o '"thread_id":"[^"]*"' $out/events.jsonl >> $out/meta
exit $code
```

Usage: `run.sh <account 1|2|3> <name> <effort> <brief.md> [model]`, launched as a background Bash command so the orchestrator is notified when it exits. Examples:

- complex: `run.sh 1 w-c1 xhigh briefs/w-c1.md`
- scoped: `run.sh 3 w-tooling high briefs/w-tooling.md`
- minor: `run.sh 2 r-simulation max briefs/r-simulation.md gpt-6-luna`

Outputs per run:

| File | Use |
|---|---|
| `meta` | account, model, effort, start/finish time, exit code, `thread_id` |
| `last.md` | the agent's final message (its report). Read this first. |
| `events.jsonl` | full event log. Large; grep it, don't read it whole. |
| `stderr.log` | CLI errors, usage-limit messages |

Follow-ups: `codex exec resume <thread_id>` continues a finished run with its context (same `CODEX_HOME`). A `codex exec` run is non-interactive: you cannot message it mid-run, so coordinate through files (below) and through precise briefs.

## Writing a brief

Every brief is a standalone markdown file. The agent starts cold; it reads the repo's `AGENTS.md` by itself, but nothing else. Sections, in order:

1. **Role and repo**: worktree path, stack, "follow `AGENTS.md`", "other agents are editing concurrently".
2. **Read first**: `STATUS.md`, `LOG.md`, the relevant research reports and handoffs, with the sections that matter.
3. **Background**: only what the agent needs; state decisions already made as decisions ("do not revisit").
4. **Goal**: numbered sub-goals with concrete file paths, the v2 APIs to use, and the user-visible behaviour to preserve.
5. **Ownership**: an explicit list of files/globs the agent may edit, and an explicit "do NOT edit" list naming which workstream owns each. Shared manifests (`package.json`) get "minimal surgical edits only, never reformat". No `bun install` by agents; they report needed dependencies.
6. **Verification**: focused tests via package scripts, package-level typecheck filtered to owned files (the lock forbids two at once), oxlint on changed files, `script/check-import-contract.ts`. Never root `bun typecheck`/`bun lint`, raw `bun test`, or the full suite; the orchestrator runs those at integration time. Never touch real Buddy home, Electron userData, XDG roots, or `.buddy` state.
7. **Rules**: no code comments, match surrounding style, fix don't port, macOS + Windows, no git commit/stash/reset/checkout/restore, never revert others' changes.
8. **Final message**: a word limit and a fixed list of what to report (design summary, files changed, work needed from other workstreams, verification run, anything unverified).

Research briefs are read-only except for one named report file in `docs/architecture/v2-upstream/v2-migration/`, and require a `file:line` citation for every claim, with inferences marked.

## Coordination between concurrent agents

- **Disjoint ownership.** Split by file, not by concept. When two workstreams meet at one function, the orchestrator assigns the function to one owner and tells the other to call it. If neither should create it first, the orchestrator creates a placeholder with the agreed name before launch (e.g. `gateway/permission.ts` `toBuddyPermissionEvent`, owned by the permissions workstream and called by the events workstream).
- **Stable seams.** When later work depends on an API (e.g. `getOpenCodeClient(): Promise<OpenCodeHost>`), ask its owner to land that API first and keep the names stable ("add, don't rename").
- **Allowed cross-edits.** These are narrow and stated in the brief, e.g. "you may change only the import line in these files".
- **Shared memory lives in files.**
  - `STATUS.md` is the current truth.
  - `LOG.md` is the append-only record of facts, decisions, dispatches and reviews.
  - Research reports and `handoff-*.md` sit in the same folder.
  - Agents read these. Because Codex runs can't receive messages, anything a running agent must know before it finishes goes into a file it will read, or into the next brief.

## Review loop (orchestrator)

1. On a completion notification, read `runs/<name>/meta` and `last.md`.
2. Review the diff for the agent's owned paths (`git diff --stat -- <paths>`, then targeted diffs). Check seams and ownership violations, spot-check claims against code, and run the agent's focused tests if in doubt.
3. Log the result in `LOG.md` (what landed, what was deferred, follow-ups for other workstreams), and update `STATUS.md`.
4. Relay cross-workstream findings: into the next brief, or into a file the running owner will read.
5. If the result is weak, send a `resume` follow-up with specific fixes, or reassign. Pull work back from Sol high/Luna to Sol xhigh, or to the orchestrator, when quality slips.

## Reassignment and handoff

To move a running workstream to another agent:

1. Ask the current agent to stop at the nearest safe point (finish only the edit in progress) and write `handoff-<workstream>.md`. The handoff covers: what's done, the decisions and why, a status table, what's left in order, broken state and traps, and the verification run.
2. Wait for it to confirm it has stopped. Never run two agents on the same files at once.
3. Launch the successor with a continuation brief: "start from the handoff, verify its claims", the original scope, and anything that changed since.

## Autonomy

When the user is away, the orchestrator keeps going: it makes reasonable engineering calls, and records anything that is genuinely the user's decision under "Deferred decisions" in `STATUS.md` with a proposed default, instead of guessing. Examples: product behaviour changes, vendor patches, touching real user state, irreversible actions.
