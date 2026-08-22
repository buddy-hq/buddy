# Learner Context Pipeline — Brainstorm

## The Core Insight

> Don't hard-engineer teaching behaviors first. Give the model rich context about the learner and let its inherent teaching abilities emerge.
> Models are already trained on massive amounts of educational content. They already _know_ how to teach. What they're missing is **awareness of the learner**. The bet: if we supply that awareness, emergent pedagogical behaviors (redirecting rabbit holes, suggesting quizzes, adjusting difficulty) will show up without explicit coding.

## What Buddy Knows Today

| Layer       | What's Injected                                           | Source                                                                                                   |
| ----------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Environment | Working directory, platform, date, model ID               | [system-prompt.ts](file:///Users/prashantbhudwal/Code/buddy/packages/buddy/src/session/system-prompt.ts) |
| Behavior    | Static behavioral prompt from `learning-companion.txt`    | Static file                                                                                              |
| Curriculum  | Condensed headings + incomplete items + completion counts | `CurriculumService.peek()`                                                                               |

## **What's completely missing**: anything about the learner as a person, their journey, their current session state, or their history.

## Proposed Learner Context Layers

### Layer A: Session Pulse (live, within current chat)

Real-time signals from the current session that the model can use to steer behavior.
| Signal | How to compute | What it unlocks |
| --------------------- | ------------------------------------------------------- | -------------------------------------------------------------- |
| Message count | `SessionStorage.userMessageCount()` — already exists | Model knows if this is message 2 vs message 40 |
| Session duration | `time_created` on session vs `Date.now()` | "You've been at this for 2 hours, maybe take a break?" |
| Topic drift score | Compare last 3 messages against the session title/topic | Buddy can gently redirect rabbit holes |
| Question/answer ratio | Count user questions vs assistant explanations | Detects if learner is passively receiving vs actively engaging |
| Tool usage in session | Count of tool calls by type | Knows if learner is coding along or just reading |
**Injection method**: Computed at each turn and injected as a small `<session_pulse>` block in the system prompt. Cheap — maybe 100-200 tokens.

---

### Layer B: Session History (cross-session, same topic/curriculum area)

Summary of related past sessions so Buddy doesn't start from scratch.
| Signal | How to compute | What it unlocks |
| ------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------- |
| Related session summaries | Query sessions by directory + recent, use compacted summaries | "Last time we worked on streams, you got stuck on backpressure" |
| Total sessions on topic | Count sessions with overlapping curriculum items | Knows if this is attempt 1 or attempt 5 |
| Last session timestamp | `time_updated` from most recent related session | "It's been 3 days since we looked at this" |
| Cross-session progress | Diff curriculum state across sessions | Track what actually moved between sessions |
**Injection method**: A `<learning_history>` block with the 3-5 most recent related session summaries. This requires **compaction/summarization** — you already have [compaction.ts](file:///Users/prashantbhudwal/Code/buddy/packages/buddy/src/session/compaction.ts). The key is to generate a learning-focused summary, not a general chat summary.

> [!IMPORTANT]
> This is the highest-value layer. This is what turns Buddy from a stateless chatbot into a tutor that **remembers**.

---

### Layer C: Learner Profile (persistent, cross-topic)

A gradually-built model of the learner themselves.
| Signal | How to compute | What it unlocks |
| ------------------------- | -------------------------------------------------------------- | --------------------------------------------- |
| Known concepts (mastered) | Agent writes to `memories.local.md` after sessions | Avoids re-explaining things the learner knows |
| Struggling concepts | Agent flags concepts with repeated confusion | Can offer more scaffolding on weak areas |
| Learning pace | Average messages-to-understanding across topics | Adjusts depth automatically |
| Preferred learning style | Observed over time (asks for examples? analogies? code-first?) | Tailors explanations |
**Injection method**: `<learner_profile>` block loaded from a structured markdown file. This is the **memory system** from the `what-next` doc, but scoped specifically to learning-relevant memories.

---

### Layer D: Curriculum Position (enhanced, already partially exists)

Upgrade the current curriculum injection to include richer context.
| Signal | Currently injected? | What to add |
| ------------------- | ------------------- | ------------------------------------------------------- |
| Incomplete items | ✅ Yes | — |
| Completion counts | ✅ Yes | — |
| Current focus area | ❌ No | Which section the learner is actively working on |
| Prerequisite chain | ❌ No | What topics should have been learned before this one |
| Suggested next step | ❌ No | Agent-recommended next item based on profile + progress |

---

## The Philosophy: Context First, Behaviors Second

```
Phase 1: Feed context → observe what the model does naturally
Phase 2: Identify gaps → where does the model fail to do the right thing?
Phase 3: Hard-code only the gaps → add explicit rules/tools only where needed
```

This is the right approach because:

1. **Models improve** — hard-coded behaviors become tech debt as models get smarter
2. **Context is reusable** — the same learner context helps with teaching, exercises, quizzes, pacing
3. **Less code to maintain** — instead of coding 20 teaching heuristics, you inject 4 context blocks
4. **Surprising emergent behaviors** — models might do things we wouldn't have thought to code

---

## What to Build (Priority Order)

### 1. Session Pulse (cheapest, immediate value)

- Compute 3-4 signals from existing DB data
- Inject as `<session_pulse>` in system prompt
- **Zero new infrastructure needed** — all data already exists in `SessionStorage`
- Can ship in a single PR

### 2. Session History / Cross-Session Memory

- Requires: learning-focused session summarization (extend compaction)
- Requires: querying related sessions by topic/directory
- Requires: token budget management for history injection
- This is the **Memory v1** from the what-next doc, but framed as a learner-context problem

### 3. Learner Profile

- Requires: the full memory read/write system
- Requires: agent-driven writes after sessions
- Requires: structured format for profile data
- Can start as a simple markdown file, evolve into structured storage

### 4. Enhanced Curriculum Position

- Extend `condenseCurriculum()` to include focus area and prerequisite signals
- Relatively small change to existing infrastructure

---

## Open Questions

1. **How much context is too much?** Each layer adds tokens. With a ~128k context window this seems fine, but we need a budget. Proposal: cap total learner context at ~2000 tokens across all layers.
2. **Should session summaries be learning-focused or general?** I lean toward: both. Store a general summary (for the UI/transcript) and a separate learning-extract ("what did the learner learn, struggle with, and ask about").
3. **When does the learner profile get written?** Options:
   - End of every session (automatic)
   - After N messages (periodic)
   - Agent decides (tool-based, like memory_write)
   - Combination: auto-summarize + agent can write anytime
4. **Topic drift detection** — is this something the model can self-assess ("am I off topic?") or do we need to compute it externally (e.g. embedding similarity of recent messages vs session topic)?
