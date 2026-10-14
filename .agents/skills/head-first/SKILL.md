---
name: head-first
description: Resume the developer's working context across every Buddy worktree, branch, and agent session, rank the work by what matters to them, interview them briefly, and learn from their answers. Use only when the user runs /head-first or $head-first.
disable-model-invocation: true
---

# head-first

The developer works across many worktrees, branches, and agents (Claude Code, Codex, Gemini, Grok), then steps away and loses the thread. This skill rebuilds that thread at the start of a work session: what exists, what each piece was about, what matters most, and what can go.

It is self-improving. Every run reads what earlier runs learned and every interview teaches the next run.

## Shared memory

All memory lives in `$(git rev-parse --git-common-dir)/head-first/`. That directory is shared by every worktree, never committed, and reachable by any agent that can run `git`.

- `state.json`: ranking weights, weight-change history, per-unit intent and labels, to-do sources, known worktree paths.
- `snapshots/<date>.json`: the day's ranking, used to detect rank moves and to learn from corrections.
- `journal.md`: dated, free-form session log written by any agent.

Change `state.json` only through the script so every agent applies the same rules. Write judgement and context to the journal.

## Script

Run from any Buddy worktree:

```sh
bun .agents/skills/head-first/scripts/head-first.ts <command>
```

| Command | Use |
| --- | --- |
| `scan` | Rank all worktrees and branches; saves today's snapshot |
| `show <unit>` | Commits, dirty files, docs, and every agent session file for one unit |
| `note <unit> <intent>` | Record what the work is about, in one sentence |
| `label <unit> focus\|parked\|abandoned\|clear` | Record the developer's verdict |
| `prefer <winner> <loser> [reason]` | Learn from a ranking correction |
| `todo <path> [--unit <unit>] [note]` | Record where to-dos live |
| `log <text>` | Append to the shared journal |
| `journal [n]` | Print the latest journal entries |
| `weights` | Show weights and correction history |

A unit is a branch, or a detached worktree. Units accept any unique substring or a worktree folder name (`hippo`, `skill-smith`).

## Ranking

`score = Σ weight × signal`, each signal 0–1:

- `recency`: `exp(-days / 3)` since the latest commit, dirty-file edit, or agent session.
- `atRisk`: uncommitted plus unpushed lines, log-scaled. Work that exists nowhere else.
- `unshipped`: lines ahead of base with no open or merged PR.
- `momentum`: distinct active days in the last 7.

Labels override the signals: `focus` adds a bonus that fades over about 10 days, `parked` multiplies by 0.3, `abandoned` moves the unit to cleanup. The base branch, merged work, `backup/*` branches, and stale branches without a worktree never rank; they surface as cleanup candidates.

`prefer` nudges the weights toward the signals where the preferred unit scored higher, then logs the change. One correction moves at most 0.1 of total weight, so no single answer rewrites the ranking. When the signals cannot express a preference, the script says so; use a label instead. Corrections are the only way weights move.

## Session

### 1. Gather

1. `git fetch origin --quiet` so merged work and PR state are current.
2. `scan`.
3. `journal 5`. Read what earlier sessions decided and any `feedback:` entries about this skill.

### 2. Reconstruct intent

For each of the top five units whose intent is `UNKNOWN`, a `draft:`, stale, or contradicted by recent activity:

1. `show <unit>`.
2. Read the newest agent sessions it lists. Read whole sessions when the last prompt is not enough; the developer has approved this. Gemini sessions are not indexed; check `~/.gemini/antigravity-cli/brain/` only when a unit clearly involved Gemini.
3. Read the unit's docs with open to-dos, plus any recorded to-do source.
4. Draft one sentence: what the work is, and the next step if one is evident.

When a file with open to-dos is not yet a recorded source, record it with `todo` so tomorrow's scan tracks it. Over time this index shows where to-dos really land; when a pattern is clear, offer one canonical place as a choice in the interview.

### 3. Brief

Write it in the spirit of the Minto pyramid, as Buddy's `summarise` skill does: the answer first, then the few points that support it, then detail only as far as it helps.

- Open with one sentence on what today should be about and why. It should say something, not count things.
- Group the rest by what the developer should do about it, most urgent first. Name what each group adds up to.
- Keep detail to the handful of units that matter today. Everything else can be a name on one line.
- Keep it short enough that the first few lines give the whole picture.
- Base every line on the scan, sessions, docs, or journal. Mark guesses as drafts.

### 4. Interview

Every question is a click. Use single-select (radio) or multi-select (checkbox) questions with concrete options you prepared, never an open-ended prompt. Do not ask for reasons, descriptions, or opinions. The developer can still type into "Other", but no answer may depend on it. Without a question tool, print numbered options and accept numbers.

Ask at most four questions, in one batch:

1. **Order** (checkbox): up to four swaps the developer might want, each phrased "`A` above `B`". Pick them from adjacent units with close scores, big rank moves since the last snapshot, and units with lots of at-risk work that ranked low. Each checked swap becomes `prefer A B`.
2. **Intent** (radio): the highest-ranked unit whose intent is still a draft. Options: your best draft, an alternative reading of the same evidence, `Parked`, and `Abandoned`. Other drafts wait for later days; one per day is enough.
3. **Cleanup** (checkbox): up to four candidates, safest first (merged with a clean tree, then stale backups, then the rest). Carry the remainder to later sessions.
4. **Today** (radio): the top three ranked units, plus `Something else`.

Skip any question whose answer is already known from the journal or labels. When the to-do index suggests a canonical place for to-dos, offer it as a radio question in place of the least useful of the four.

### 5. Record

- `note` the chosen intent. Record unconfirmed drafts as `note <unit> "draft: …"` so the next session knows to ask about them.
- `label <unit> focus` for today's pick. Apply `parked` or `abandoned` when chosen.
- If today's pick was `Something else`, do not follow up with a question. Log it and wait for the developer's first task.
- Run cleanup only for units the developer selected, following the safety rules below.
- `log` a summary: today's focus, corrections, cleanup performed with tip SHAs, and anything the developer said that the script could not capture.
- When the developer corrects something the weights cannot express (a missing signal, a wrong exclusion, a misattributed session), `log "feedback: …"` and propose a concrete change to this skill or its script. Do not change either without approval.

Then hand over: name the worktree path for today's focus and stop.

## Cleanup safety

- Act only on units the developer selected in this session.
- Log every branch's tip SHA with `log` before deleting it, so `git branch <name> <sha>` can restore it.
- Never pass `--force` to `git worktree remove`. A dirty worktree needs the developer to decide what happens to its files first.
- Never remove the main working tree or the worktree the agent is running in.
- `gh pr close` is outward-facing. Confirm each PR by number before closing it.
