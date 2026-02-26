# Codex Memory System: Complete Implementation Notes

This document maps how memory works in `~/code/codex` today, from trigger to storage to prompt-time usage, and then evaluates whether the same approach is viable in Buddy.

## 1) What "memory" is in Codex

Codex memory is a two-phase background pipeline that:

1. Extracts per-rollout memory records from recent session rollouts (Phase 1).
2. Consolidates those records into filesystem artifacts (`MEMORY.md`, `memory_summary.md`, `skills/`) via a dedicated internal consolidation agent (Phase 2).

It is implemented in:

- `codex-rs/core/src/memories/mod.rs`
- `codex-rs/core/src/memories/start.rs`
- `codex-rs/core/src/memories/phase1.rs`
- `codex-rs/core/src/memories/phase2.rs`
- `codex-rs/core/src/memories/storage.rs`
- `codex-rs/core/src/memories/prompts.rs`
- `codex-rs/state/src/runtime/memories.rs`
- `codex-rs/state/migrations/0006_memories.sql`
- `codex-rs/state/migrations/0009_stage1_outputs_rollout_slug.sql`

## 2) Gating and trigger conditions

Startup entrypoint:

- `start_memories_startup_task(...)` in `core/src/memories/start.rs`

It runs only when all are true:

- Session is not ephemeral.
- Feature `memories` (`Feature::MemoryTool`) is enabled.
- Session is not a sub-agent session.
- State DB is available.

Call sites:

- Session startup path in `core/src/codex.rs` (normal automatic trigger).
- Manual re-trigger through `Op::UpdateMemories` (wired to a debug slash command `debug-m-update`).

Also supported:

- `Op::DropMemories` / `debug-m-drop` clears memory DB rows and removes the memory folder.

## 3) Data model and persistence

### State DB tables

From migrations (`state/migrations`):

- `stage1_outputs`
  - `thread_id` (PK)
  - `source_updated_at`
  - `raw_memory`
  - `rollout_summary`
  - `rollout_slug` (added in migration `0009`)
  - `generated_at`
- `jobs`
  - Generic job orchestration row keyed by `(kind, job_key)`, used for:
    - Phase-1 per-thread jobs (`kind=memory_stage1`, `job_key=<thread_id>`)
    - Phase-2 singleton global job (`kind=memory_consolidate_global`, `job_key=global`)
  - Contains lease, ownership token, retry/backoff, watermark fields.

### Memory artifacts on disk

Root:

- `memory_root(codex_home) => <codex_home>/memories`

Managed files:

- `raw_memories.md`
- `rollout_summaries/*.md`
- `MEMORY.md`
- `memory_summary.md`
- optional `skills/*`

## 4) Phase 1: rollout extraction

Implemented in `core/src/memories/phase1.rs`.

### Selection and claim

DB call: `claim_stage1_jobs_for_startup(...)` in `state/src/runtime/memories.rs`.

Filters:

- Only interactive sources (`Cli`, `VSCode`).
- Excludes current thread.
- Age window and minimum idle time.
- Only stale threads (`stage1_outputs` and prior `last_success_watermark` older than thread update).
- Bounded by `scan_limit` and `max_claimed`.

Claim semantics:

- Lease-based ownership token.
- Retry backoff and retry budget.
- Concurrency cap on running stage-1 jobs.
- Explicit skip outcomes: up-to-date, running, retry backoff, retry exhausted.

### Extraction

For each claim:

- Load rollout items from recorded rollout file.
- Keep only memory-relevant response items (`should_persist_response_item_for_memories`).
- Build prompt using `templates/memories/stage_one_system.md` and `stage_one_input.md`.
- Truncate rollout input by token budget based on model context window.
- Call model with strict JSON output schema:
  - `raw_memory`
  - `rollout_summary`
  - `rollout_slug`
- Redact secrets in generated fields.

### Phase-1 outcomes

Per job:

- success with output -> upsert `stage1_outputs` and enqueue phase-2 global job.
- success no output -> mark succeeded_no_output and delete stale stage1 output.
- failure -> mark failed with retry delay.

Runtime behavior:

- Jobs run in parallel via `buffer_unordered(CONCURRENCY_LIMIT)` (`CONCURRENCY_LIMIT = 8`).

## 5) Phase 2: global consolidation

Implemented in `core/src/memories/phase2.rs`.

### Global claim and watermarking

DB call: `try_claim_global_phase2_job(...)`.

Claim rules:

- Skip if not dirty (`input_watermark <= last_success_watermark`).
- Skip if backoff active or retries exhausted.
- Skip if another valid running lease exists.
- Otherwise claim singleton global lock with ownership token.

Watermark:

- Completion watermark is `max(claimed_input_watermark, max(stage1.source_updated_at))`.
- Ensures monotonic progress and dirty detection across runs.

### Artifact sync before consolidation agent

From latest retained stage-1 outputs:

- Rebuild `raw_memories.md` (latest-first merged view).
- Sync `rollout_summaries/*.md` and prune stale files.
- If no retained memories:
  - keep `raw_memories.md` with "No raw memories yet."
  - remove stale `MEMORY.md`, `memory_summary.md`, and `skills/`
  - mark phase-2 success without spawning consolidation agent.

### Consolidation agent

When there is input:

- Spawn an internal sub-agent (`SubAgentSource::MemoryConsolidation`) with prompt from `templates/memories/consolidation.md`.
- Enforced runtime constraints:
  - approval policy: `Never`
  - sandbox: workspace-write only for `codex_home`, no network
  - collaboration feature disabled (no recursive delegation)
- While running:
  - subscribe to agent status
  - heartbeat global lease every 90s
  - fail job if lease is lost
- On completion:
  - success => mark phase-2 success and write token-usage metrics
  - failure => mark phase-2 failure with retry delay

## 6) How memory is consumed at inference time

Implemented in `core/src/memories/prompts.rs` and `core/src/codex.rs`.

At turn initialization:

- If memory feature is enabled and `memory_summary.md` exists, Codex injects additional developer instructions built from `templates/memories/read_path.md`.
- That prompt includes:
  - memory lookup decision boundary
  - quick-pass retrieval workflow
  - optional memory update behavior guidance
  - strict memory citation format requirements
- `memory_summary.md` is truncated for prompt budget before injection.

So the memory loop is:

1. Background pipeline writes/updates memory artifacts.
2. Foreground turns read memory guidance through injected developer instructions.

## 7) Config and tuning knobs

From `core/src/config/types.rs` (`[memories]` section):

- `max_raw_memories_for_global` (default 1024, capped 4096)
- `max_rollout_age_days` (default 30, clamped 0..90)
- `max_rollouts_per_startup` (default 16, capped 128)
- `min_rollout_idle_hours` (default 6, clamped 1..48)
- `phase_1_model` (optional override)
- `phase_2_model` (optional override)

Feature flag:

- `[features].memories = true` (default false)
- legacy alias still recognized: `memory_tool`

## 8) Observability and operational controls

Metrics include:

- Phase-1 job counts, latencies, token usage, output count.
- Phase-2 job counts, latencies, token usage, input count.
- Memory file usage metrics from tool reads (`codex.memories.usage`) when tools touch memory paths.

Manual controls:

- `UpdateMemories`: trigger pipeline on-demand.
- `DropMemories`: wipe memory rows + memory directory.

## 9) Separate but related path: trace summarization endpoint

There is also a unary API path:

- `POST /memories/trace_summarize`

Implemented in:

- `codex-rs/codex-api/src/endpoint/memories.rs`
- consumed by `core/src/client.rs::summarize_memories(...)`
- used by `core/src/memory_trace.rs` for trace-file memory generation

This is not the startup two-phase pipeline itself, but a related memory summarization primitive.

---

## 10) Can this be implemented in Buddy?

Short answer: **Yes, but not by "turning on" existing OpenCode code. You need a Buddy-owned orchestration layer.**

### Why yes

Buddy already has key foundations:

- Directory/project scoping and per-project identity (`packages/buddy/src/project/*`).
- A dedicated Buddy DB (`buddy.db`) and migration system.
- Existing prompt injection path (`buildBuddySystemPrompt(...)` + session system prompt plumbing).
- Background async execution capability in the backend.

### What is missing today (compared to Codex memory)

1. No stage-1/phase-2 memory job tables with lease/backoff/watermark semantics.
2. No startup memory pipeline trigger logic equivalent to Codex phase1->phase2.
3. No retained memory artifact lifecycle (`raw_memories.md`, `rollout_summaries`, `MEMORY.md`, `memory_summary.md`, `skills`).
4. No dedicated consolidation sub-agent path with strict sandbox/approval constraints.
5. No memory read-path developer instruction injection with citation contract.
6. No memory-specific observability and usage metrics.

### Compatibility caveat with your current architecture

Your Buddy wraps vendored OpenCode TypeScript runtime, not Codex Rust core. The Codex memory subsystem described above is Rust-side (`codex-rs`) and not present in your current OpenCode vendor tree. So the exact module cannot be imported as-is.

### Recommended Buddy implementation approach

1. **Mirror Codex architecture, not Codex code**
   - Implement equivalent tables and job semantics in Buddy DB.
   - Keep extraction and consolidation as two distinct phases.
2. **Use OpenCode runtime as execution substrate**
   - Continue using OpenCode session/tool stack for model calls and constrained sub-agent execution.
3. **Integrate with existing Buddy prompt layer**
   - Inject memory read-path guidance similarly to current curriculum context injection.
4. **Add explicit maintenance controls**
   - Trigger update and drop endpoints/ops for operational recovery and testing.

### Risk level for Buddy

- **Feasible:** high.
- **Implementation effort:** medium-high (orchestration and data lifecycle are the hard part).
- **Main technical risks:** stale/incorrect memory poisoning, project-scope collisions, and artifact churn if watermark/lease logic is weak.

If you want, I can turn this into a concrete Buddy implementation design next (DB schema + endpoints + phased rollout plan + exact file touch list).
