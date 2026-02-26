# Buddy System Prompt Architecture (Storm)

This is a proposed _prompt architecture_ for Buddy (not just a single monolithic prompt).
The goal is to make Buddy a strong teacher by giving it (1) stable operational rules, (2) rich learner context, and (3) a memory + retrieval path that stays token-efficient.

## Design Goals

- Teach well by default: diagnose, adapt, verify understanding, and keep the learner oriented.
- Use _learner journey context_ (across chats) without stuffing everything into the context window.
- Keep the top-level system content stable for caching + predictability.
- Enforce safety and permissions in runtime (tool filtering), not only by prompt text.
- Make the whole prompt explainable/debuggable: clear section boundaries, deterministic assembly.

## First-Principles Principles

1. Separate _policy_ from _data_.
   - Policy: what Buddy must/should do (stable, system-side).
   - Data: learner state, curriculum, environment, session telemetry (volatile, injected separately).

2. Stable core + progressive disclosure beats "stuff everything into system".
   - Always inject a compact index/summary.
   - Provide a tool-based path to fetch the deep details only when relevant.

3. Put volatile context _outside_ the system prompt.
   - Environment, date, cwd, "last 20 messages", and live stats should not invalidate the cached system prefix.

4. Teach with a closed loop.
   - Explanations must end with a check (question, tiny exercise, or quiz).
   - If the learner is stuck, shrink scope and re-ground with prerequisites.

5. Minimal "hard engineering" early; maximize useful data to unlock model-native teaching behaviors.
   - Start with rich learner context + simple decision boundaries.
   - Add more autonomous heuristics later only where metrics show consistent failure modes.

## Prompt Assembly: Recommended Hybrid

Take the best bits:

- Gemini CLI: snippet-based composition (modular sections, easy to extend)
- Codex: dynamic updates as append-only developer messages; progressive disclosure memory
- OpenCode: runtime tool filtering/permissions; model-routed templates when needed

### Two-Stage Pipeline

Stage A: gather context (no model call)

- Resolve active "mode": teach vs build vs debug vs review.
- Resolve learner identity and fetch compact learner summary.
- Resolve curriculum pointer and fetch compact curriculum summary.
- Resolve permissions + tool set for this session.
- Build volatile session telemetry (drift, confusion, time-on-topic, etc.).

Stage B: render model payload

- System content: stable core + selected workflow template + compact indices.
- Synthetic user message #1: environment + volatile telemetry + current objective.
- Developer update messages: mode switches, permission changes, model switches.

## Where Each Kind of Context Goes

Keep this rule simple: if it changes often, do not put it in system.

| Content                                      | Inject As                   | Refresh          | Why                                  |
| -------------------------------------------- | --------------------------- | ---------------- | ------------------------------------ |
| Core identity, safety policy, tool-use rules | System                      | Rare             | Stable behavioral anchor             |
| Teaching workflow + response style           | System                      | Rare             | Consistency and predictable pedagogy |
| Tool schema + allowed tools                  | Structural + runtime filter | Per request      | Hard safety boundary                 |
| Learner summary index (compact)              | System (or Developer)       | Often            | Always-on teaching context           |
| Curriculum summary index (compact)           | System (or Developer)       | Often            | Keeps model oriented                 |
| Environment (cwd/platform/date)              | Synthetic user msg          | Per turn/session | Avoid cache churn                    |
| Live session telemetry                       | Synthetic user msg          | Per turn         | Volatile; don't pollute system       |
| Deep learner history, full transcripts       | Tool-retrieved              | On demand        | Token control                        |

Note: putting learner/curriculum summaries in system is fine _if they are compact and strongly bounded_.
If they are longer or change constantly, move them to developer or synthetic user message.

## Learner Context: What Buddy Should Know

Treat learner context as a product surface, not a blob.

### Long-Term (stable traits)

- Goals: what outcome they want (job interview, build a project, pass a class)
- Background: prior experience, preferred languages/tools
- Preferences: explanation style, pacing, "ask me questions" vs "show me first"
- Constraints: available time, device, environment limitations

### Medium-Term (journey + curriculum position)

- Current track + milestone map (where they are, what's next)
- Mastery estimates per concept (rough bins: unknown / shaky / solid)
- Persistent misconceptions ("common wrong turns" for this learner)
- Retrieval practice schedule (what to revisit and when)

### Short-Term (session state)

- Current objective for this chat
- Open loops: questions asked but not resolved
- Drift/rabbit-hole indicator ("we are off-goal")
- Recent error patterns (same bug 3 times)

## Memory System for Learner Journey (Progressive Disclosure)

The key is: _inject an index, not the whole book_.

### Artifacts (example)

- `memories/learner_summary.md` (<= ~200-400 lines; keyword dense)
- `memories/LEARNER_MEMORY.md` (canonical grouped knowledge)
- `memories/session_summaries/<session-id>.md` (per chat/thread)
- `memories/raw_events.jsonl` (append-only facts; optional)

### Consolidation Pipeline (Codex-like)

1. Stage 1 (per session extraction)
   - Extract: what learner tried, where they got stuck, what clicked, what they prefer.
   - Output: structured JSON + a compact session summary.

2. Stage 2 (global consolidation)
   - Merge new facts into `LEARNER_MEMORY.md`.
   - Resolve contradictions (preferences can change).
   - Rewrite `learner_summary.md` to match the canonical memory.

### Decision Boundary (teach-focused)

In the system prompt, include a simple rule:

- Always read the compact learner summary.
- Fetch deep memory only when the current request overlaps:
  - the active curriculum module
  - past misconceptions for the same concept
  - repeated confusion or repeated errors
  - user references "like last time" / "as we discussed"

This keeps the base context small while still making the teacher "feel" persistent.

## Autonomy: What Buddy Can Do _Because_ It Has Learner Context

Keep autonomy scoped and transparent.

### Allowed proactive moves

- Refocus: if drift is high, offer a 1-sentence recap + confirm the next step.
- Verify: after a long explanation, ask a single check question.
- Quiz: if the learner drilled a concept hard or shows repeated confusion, offer a short quiz.
- Spaced repetition: if a previously weak concept is relevant, propose a 60-second recall.

### How to do it without being annoying

- Propose, don't hijack: "Want a 3-question quiz, or should we continue building?"
- Prefer 1 question at a time.
- If user declines, drop it and continue.

## Curriculum Injection: Index First, Content On Demand

Instead of injecting raw curriculum pages into system:

- Inject a compact curriculum state block:
  - current module title
  - current objective
  - prerequisites
  - next checkpoint
  - common pitfalls

- Provide tools to fetch:
  - the next lesson chunk
  - examples
  - exercises
  - rubric/expected answers

This matches the progressive disclosure approach used for memory.

## Tools + Permissions (Hard Boundary)

Prompt text should explain intended tool behavior, but enforcement should be runtime.

- Filter which tools the model can call based on:
  - mode (teach vs build)
  - sandbox/permission policy
  - workspace boundaries

Teaching-focused tools worth having (conceptually):

- `learner.memory.search(query)` -> returns excerpts from `LEARNER_MEMORY.md`
- `learner.progress.update(event)` -> updates mastery/drift/open loops
- `curriculum.get(module_id, slice)` -> returns lesson chunk/exercise/rubric
- `quiz.generate(spec)` + `quiz.grade(submission)` -> retrieval practice loop

If Buddy also codes, keep those tools separate and gated by mode.

## Token Budgeting

Set explicit budgets per injected block so the system can't silently balloon.

Example (rough):

- Core system policy + workflows: 2k-6k tokens
- Learner summary index: 500-1500 tokens (hard cap)
- Curriculum summary index: 500-1500 tokens (hard cap)
- Synthetic user context (env + telemetry): 200-800 tokens

If any block exceeds budget: truncate + include "how to fetch more" instructions.

## Model Routing Without Identity Drift

It is fine to have model-specific templates, but keep invariant policy stable.

- Stable core (always): safety, pedagogy, tool-use contract, memory decision boundary.
- Model-specific layer (optional): formatting strictness, verbosity, reasoning style.

Avoid making the entire behavioral identity depend on which model family is selected.

## Debuggability (Non-Negotiable)

Make prompt assembly observable:

- Dump the final system prompt to a file (for development).
- Dump the synthetic user context block.
- Log which modules were included and their token counts.
- For each deep-memory/curriculum fetch: log the trigger reason (drift, overlap, repeat error).

This is how you iterate from "give it data" to "add heuristics" safely.

## Concrete Prompt Skeletons

These are _shapes_, not final copy.

### System Prompt (stable core + compact indices)

```md
You are Buddy: a teaching-first engineering assistant.

## Non-negotiables

- Be truthful about uncertainty; ask when blocked.
- Optimize for learner understanding, not just completion.
- Prefer progressive disclosure: start small, fetch more context only when needed.

## Teaching workflow (default)

1. Identify the learner's goal for this step.
2. Explain at the right abstraction level (use learner profile).
3. Give a tiny exercise or check question.
4. Adapt based on the response.

## Autonomy you may use

- If the learner drifts, propose a refocus.
- If confusion repeats, propose a micro-quiz.
- If mastery looks solid, propose a harder variant.

## Memory decision boundary

- Always use the learner summary index.
- Fetch deep learner memory only when there is topic overlap or repeated confusion.

## Learner Summary Index

{{LEARNER_SUMMARY_MD}}

## Curriculum Summary Index

{{CURRICULUM_SUMMARY_MD}}
```

### Synthetic User Message #1 (volatile context)

```xml
<buddy_context>
  <environment>
    <platform>{{platform}}</platform>
    <cwd>{{cwd}}</cwd>
    <date>{{date}}</date>
  </environment>
  <session_state>
    <objective>{{current_objective}}</objective>
    <open_loops>{{open_loops}}</open_loops>
    <drift_score>{{drift_score}}</drift_score>
    <confusion_signals>{{confusion_signals}}</confusion_signals>
    <time_on_topic_minutes>{{time_on_topic_minutes}}</time_on_topic_minutes>
  </session_state>
</buddy_context>
```

### Developer Update Messages (append-only)

- `<mode_switch>` teach <-> build
- `<permissions_update>` tool availability / sandbox
- `<model_switch>` new model capabilities
- `<curriculum_pointer_update>` learner moved to next checkpoint

These should not rewrite the whole system prompt; they should be small deltas.

## What I Would Build First

1. Snippet-based prompt composition with hard token caps.
2. Learner memory summary + progressive disclosure fetch path.
3. Synthetic user context block with drift/open-loop signals.
4. One or two gentle proactive behaviors (refocus + check question) gated by telemetry.

Everything else can iterate after you can observe behavior in real sessions.
