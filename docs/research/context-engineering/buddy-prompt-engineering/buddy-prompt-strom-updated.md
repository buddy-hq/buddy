# Buddy Prompt Architecture (Codex-first, Ideal Learning Agent)

This supersedes `agent-storms/context-engineering/buddy-prompt-storm.md`.

This revision is prompt-first: it is intentionally not constrained by Buddy's current runtime or toolset.
Assume we can build infra to satisfy the prompt contract.

Reference stance:

- Primary: Codex (role placement, update items, progressive disclosure memory, explicit decision boundaries).
- Secondary: OpenCode (runtime tool/permission enforcement, caching-aware header stability).
- Not used: Gemini CLI (intentionally ignored for this design).

## North Star

Buddy should behave like:

- A curriculum-aware tutor.
- A project coach (learn by building).
- A careful engineer when touching code.
- A persistent companion who remembers the learner's journey.

"Good teaching" means:

- Keeps the learner oriented (goal -> next step -> why).
- Adapts depth/pacing to the learner.
- Verifies learning with checks/exercises/quizzes.
- Detects drift (rabbit holes) and recenters gently.
- Maintains continuity across sessions without dumping transcripts.

## Prompt As Architecture, Not A Blob

Do not treat "the system prompt" as the only lever.
The best design is a stable core + append-only updates, plus progressive disclosure for high-volume context.

Codex patterns to copy:

- Stable base instructions (doctrine).
- Dynamic developer updates (mode switches, permissions, model switches) as separate messages.
- Progressive disclosure memory: inject only a compact summary index, then use tools to fetch deep details only when relevant.
- Explicit decision boundaries for memory usage and question-asking.

OpenCode patterns to copy:

- Runtime tool filtering is the hard boundary (do not rely on model compliance).
- Keep the top-level system header stable for prompt caching.

## Message Stack (Recommended)

Use a consistent multi-role message stack.

1. `system` (stable core)

- Identity, teaching doctrine, safety.
- Tool behavior and response formatting rules.
- Memory decision boundary (how to use learner memory/curriculum).

2. `developer` (append-only updates)

- Active mode (Default / Plan / Exam / etc).
- Permissions summary / sandbox info.
- Loaded instruction files (AGENTS-style project rules).
- Learner summary index (compact, token-capped).
- Curriculum summary index (compact, token-capped).
- Any special constraints (max steps, structured output, etc).

3. `user` (synthetic context)

- Environment snapshot (cwd/platform/date, workspace roots, network).
- Session telemetry and learning signals (drift, repetition, time-on-topic).
- Current objective snapshot (goal stack).

4. `user` (actual)

- The learner's message.

This mirrors Codex's "stable instructions + update items + env as user message" shape, while keeping OpenCode's runtime enforcement.

## Stable vs Volatile Placement

Rule: if it changes frequently, do not put it in the stable system header.

| Kind of context                   | Put it in        | Why                          |
| --------------------------------- | ---------------- | ---------------------------- |
| Core doctrine + safety            | `system`         | stable identity and behavior |
| Teaching workflow + style         | `system`         | consistency                  |
| Tool schemas                      | tool definitions | structured, not text         |
| Permissions enforcement           | runtime          | hard boundary                |
| Permissions explanation           | `developer`      | changes per session/mode     |
| Instruction files (project rules) | `developer`      | changes with cwd/project     |
| Learner summary index             | `developer`      | always useful, but bounded   |
| Curriculum summary index          | `developer`      | always useful, but bounded   |
| Environment (cwd/date/platform)   | synthetic `user` | volatile; protect caching    |
| Telemetry signals                 | synthetic `user` | volatile and per-turn        |
| Deep history/transcripts          | on-demand tools  | avoid token blow-ups         |

## Learner Model: What Buddy Needs

Treat learner context as a structured product surface, not a blob.

Long-term profile:

- Goals and motivation.
- Background and constraints.
- Preferences (pacing, examples, strictness).
- Accessibility needs (if stated).

Journey state:

- Current track/module.
- Mastery estimates per concept (unknown / shaky / solid).
- Persistent misconceptions (learner-specific pitfalls).
- Open loops from prior sessions.

Session state:

- Primary objective, current step, open loops.
- Drift indicator (rabbit hole detection).
- Repeat confusion/error signals.
- Time-on-topic and fatigue hints.

## Learner Memory: Progressive Disclosure (Codex-like)

Do not inject entire histories.

Artifacts (example; infra can differ):

- `.buddy/learner_summary.md` (compact index; always injected; hard cap)
- `.buddy/LEARNER.md` (canonical grouped memory; searched on demand)
- `.buddy/session_summaries/<session-id>.md` (evidence snippets / recaps)
- `.buddy/raw_events.jsonl` (optional append-only event log)

Decision boundary (in the prompt):

- Always read learner_summary (already injected).
- Fetch deep memory only if:
  - the current query overlaps summary topics, OR
  - the learner asks "like last time", OR
  - repeated confusion suggests prior attempts are relevant, OR
  - the task is ambiguous and could depend on past decisions/preferences.

Quick-pass budget:

- Do 2-6 targeted searches before proceeding.
- Avoid scanning all session summaries.

## Curriculum: Summary-First, Tool-Fetch Full

Curriculum is a first-class teaching primitive.

Prompt contract:

- Model receives a condensed curriculum view by default.
- Model can fetch the full curriculum when needed.
- Model can propose curriculum updates when milestones are complete or when structure needs revision.

Treat curriculum like memory: inject the index; fetch full only when necessary.

## Drift / Rabbit Holes: Goal Stack + Recenter

The prompt should enforce a "goal stack" discipline:

- North star objective (why the learner is here).
- Current step (what we are doing now).
- Open loops (what to return to).

When drift is high:

- Offer a 1-sentence recap of the goal.
- Offer 2-3 options:
  1. continue tangent
  2. return to objective
  3. re-scope objective
- Do not hijack; get consent.

Infra note (optional): compute drift score from topic divergence, tangent count, and time since last objective confirmation.

## Quizzes and Retrieval Practice

This is the teacher upgrade enabled by learner journey + telemetry.

Prompt rules:

- Offer a quiz when:
  - repeated confusion is detected
  - after completing a concept
  - after prolonged drilling
- Keep default quiz short (3 questions).
- Grade with a rubric:
  - identify misconception
  - show correct reasoning
  - give a retry path
- If declined once, stop offering for the session.

Infra note: ideal tools are `quiz.generate` and `quiz.grade`, but the agent can do it in-model.

## Modes As Explicit Update Items

Use Codex-like explicit collaboration modes that persist until changed.

Recommended modes:

- Default (Teach+Build): explain + do.
- Plan: explore and design only; no repo mutations; decision-complete plan output.
- Exam/Quiz: no hints unless requested; grade strictly.

Mode switches should be appended as developer messages, not by rewriting the system prompt.

## Tool Contract (Ideal)

The prompt should assume tool classes exist; exact names are harness-defined.

Required classes:

- Workspace: list/read/search/edit/apply_patch/write
- Shell: run commands
- Web: fetch URLs
- Delegation: spawn subagents
- Curriculum: read/update
- Learner memory: search/read/update
- Quiz: generate/grade

Hard rule: permissions are enforced by the harness (OpenCode-style). Prompt text is guidance.

## Token Discipline (Do Not Creep)

Even with a long stable system prompt, keep dynamic injections bounded.

Suggested caps:

- Learner summary index: token-capped
- Curriculum summary index: token-capped
- Instruction blocks: token-capped
- Synthetic user telemetry: short

If a block exceeds cap:

- Truncate and include explicit "how to fetch more" instructions (memory search, curriculum read, etc).

## Optional Mapping to Buddy Today

This design exceeds today's Buddy runtime, by intent.

If implementing incrementally:

1. Move volatile environment out of the stable system header (send as synthetic user).
2. Add learner summary injection (even if manual at first).
3. Add memory consolidation and quiz infra later.
