# Codex Memory Architecture: Engineering Overview

This document provides a top-down, pedagogical overview of how the Codex agent persists, consolidates, and uses memory across sessions. It outlines how a single user interaction transforms into long-term actionable memory that is dynamically injected into future LLM system prompts.

---

## 1. High-Level Concept

The Codex memory system is designed around **asynchronous, two-phase consolidation** and **progressive disclosure**.

Instead of cramming every past interaction into the agent's context window (which wastes tokens and degrades reasoning), Codex runs a background job at startup that summarizes recent interactions. It maintains two primary user-facing artifacts in the `.codex/memories/` directory:

1. `MEMORY.md`: The long-form, highly detailed knowledge base.
2. `memory_summary.md`: A highly compact, keyword-dense index of what is inside `MEMORY.md`.

When Codex starts a new task, it _only_ reads `memory_summary.md` in its system prompt. If the summary overlaps with the user's current request, the agent is instructed to use its tools to search `MEMORY.md` for the full details (progressive disclosure).

---

## 2. The Architecture: Two-Phase Pipeline

The pipeline is triggered automatically in the background when a new root session starts (provided memory is enabled and the session is not ephemeral). It executes in two distinct phases: Phase 1 (Per-Thread Extraction) and Phase 2 (Global Consolidation).

### Phase 1: Rollout Extraction (Per-Thread)

**Goal:** Extract high-signal facts, rulings, and patterns from individual, recently completed conversation threads (called "rollouts") and store them in the database.

1. **Claiming Work:** Codex queries its SQLite state database for recently completed, idle rollouts that haven't been summarized yet.
2. **LLM Extraction:** For each eligible rollout, Codex spins up a background LLM call (defaulting to the faster `gpt-5.1-codex-mini` with low reasoning effort).
   - **Prompt:** `stage_one_system.md`
   - **Context Limit:** It enforces a token limit on the thread history (e.g., max 150,000 tokens) to ensure it fits in the extraction model.
3. **Structured Output:** The model is asked to output strictly structured JSON containing:
   - `raw_memory`: A detailed account of what was learned (e.g., "User prefers 2-space indents", "Project uses tRPC for standard routes").
   - `rollout_summary`: A highly compressed bullet point of the thread.
   - `rollout_slug`: A short identifier for the file system.
4. **Redaction & Storage:** Codex runs a secrets-redaction pass over the generated text and saves these "Stage-1 Outputs" back into the state DB.

_Note: Phase 1 scales horizontally. Multiple rollouts can be processed in parallel during this phase._

### Phase 2: Global Consolidation (Single-Threaded)

**Goal:** Merge the new individual rollout memories (Stage-1 outputs) into the persistent, global `.codex/memories/` text files, and resolve any conflicts using a smarter model.

1. **Global Lock:** Only one Phase 2 consolidation job can run at a time to prevent file-write race conditions.
2. **Artifact Sync:** Codex loads the latest Stage-1 outputs from the DB and writes them to disk:
   - `raw_memories.md`: An append-only log of raw memories.
   - `rollout_summaries/<slug>.md`: Individual files for recent rollouts.
3. **Consolidation Sub-Agent:** Once the new raw data is on disk, Codex spawns a dedicated, headless sub-agent (defaulting to the heavier `gpt-5.3-codex` with medium reasoning effort).
   - **Capabilities Restrictions:** This agent is strictly sandboxed. It is run with _no approvals required_, _no network access_, and _local write access only_ scoped tightly to the `.codex/memories/` folder.
   - **Task:** The sub-agent is given a strict set of rules (`consolidation.md`) and told to merge the new facts from `raw_memories.md` into the master `MEMORY.md` file. It must logically group facts, resolve contradictions (e.g., if the user changed their mind about a framework), and drop obsolete data.
4. **Summary Generation:** Finally, the sub-agent rewrites `memory_summary.md` to perfectly reflect the new Table of Contents and keywords available in `MEMORY.md`.
5. **Watermarking:** The completion timestamp is saved to the DB so future startups know they don't need to re-scan these threads.

---

## 3. How Memory is Used (Progressive Disclosure)

Once the files are built, they need to be injected into the prompt of the _active_ coding agent. This happens in `core/src/memories/prompts.rs` (`build_memory_tool_developer_instructions`).

1. **Truncation:** If `memory_summary.md` exists, Codex loads it. To protect the context window, it forcibly truncates the summary if it exceeds 5,000 tokens.
2. **System Prompt Injection:** The contents of `memory_summary.md` are wrapped in an XML `<memory>` tag and appended to the Developer Instructions.
3. **The Trigger Rule:** The system prompt includes explicit instructions acting as a "Decision Boundary":
   - _Do not use memory for trivial tasks (one-line changes, formatting)._
   - _If the user's query overlaps with topics mentioned in the injected summary, use tools (like `rg` or `cat`) to search `MEMORY.md` to retrieve the heavy context._
   - _If the user says "remember our previous conversation about X," explicitly fetch the relevant `rollout_summaries/X.md` file._

---

## 4. Summary of Key Files

If you want to explore the source code of this pipeline, the following files are the primary actors:

### Source Code (`codex-rs/core/src/memories/`)

- `README.md & mod.rs`: Outlines the Phase 1 and Phase 2 concurrency, models used, and token limits.
- `phase1.rs`: The logic for querying the DB, spinning up the extraction model, and scrubbing secrets.
- `phase2.rs`: The logic for grabbing the global lock, syncing raw disk artifacts, and spawning the headless sub-agent to do the intelligent merging.
- `prompts.rs`: The logic that injects `memory_summary.md` into the active session's system prompt.

### Prompt Templates (`codex-rs/core/templates/memories/`)

- `stage_one_system.md`: The prompt that tells the model how to extract facts from a raw conversation history.
- `consolidation.md`: The massive set of rules handed to the headless sub-agent explaining _exactly_ how to format `MEMORY.md`, handle conflicts, and build the index for `memory_summary.md`.

---

## References

- `~/code/codex/codex-rs/core/src/memories/mod.rs`
- `~/code/codex/codex-rs/core/src/memories/phase1.rs`
- `~/code/codex/codex-rs/core/src/memories/phase2.rs`
- `~/code/codex/codex-rs/core/src/memories/prompts.rs`
- `~/code/codex/codex-rs/core/templates/memories/stage_one_system.md`
- `~/code/codex/codex-rs/core/templates/memories/consolidation.md`
