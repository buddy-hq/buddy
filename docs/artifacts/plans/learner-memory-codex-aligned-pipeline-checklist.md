# Learner Memory Codex-Aligned Pipeline Checklist

Status: in progress
Reference: `/Users/prashantbhudwal/Code/codex/codex-rs/core/src/memories` and `/Users/prashantbhudwal/Code/codex/codex-rs/state/src/runtime/memories.rs`

Goal: keep Buddy's learner-specific memory semantics, but align the process mechanics with Codex: startup/idle processing, deterministic eligibility, durable leases, transcript filtering, context-aware truncation, stage-one raw outputs, phase-two consolidation, generated read artifacts, and usage feedback.

## 1. Pipeline Entrypoints And Guards

- [x] Replace per-turn delayed extraction with session-start/session-resume pipeline.
  Description: Automatic learner-memory work should not be scheduled after every accepted turn. It should run as a background startup/idle pipeline that scans eligible sessions, like Codex scans old rollouts at startup.
  Acceptance: `message-transform.ts` no longer schedules extraction per turn; a learner-memory startup entrypoint exists and is called from the appropriate session start/resume surface.

- [x] Keep a manual trigger for devtools/routes.
  Description: Manual extraction should be able to force the current session for debugging, while still using durable lease semantics by default.
  Acceptance: existing `/api/learner/memory/session/extract` and devtools action still work.

- [x] Add hard guards before any background work.
  Description: skip when learner memory is disabled, auto extraction is disabled, session is internal/subagent/extraction/consolidation, or project config cannot be read.
  Acceptance: skipped paths emit learner events with explicit reasons and do not call models.

## 2. Session Eligibility And Snapshot Watermarks

- [x] Add durable session extraction job state.
  Description: store job key, lease token, lease expiry, retry-after, attempt count, failure reason, last success watermark, and last scanned fingerprint outside process memory.
  Acceptance: app restart does not lose running/backoff/stale state.

- [x] Compute source snapshot identity.
  Description: use `sourceUpdatedAt`, filtered message count, and source fingerprint. A no-output scan only covers that exact snapshot, not the whole session forever.
  Acceptance: a trivial “hi” scan is skipped while unchanged, but the same session becomes eligible again when new messages change timestamp/fingerprint.

- [x] Implement Codex-style eligibility filter.
  Description: session must be enabled, not current hot session unless forced, newer than watermark, idle long enough, within age cap, and not in retry backoff.
  Acceptance: eligible sessions are ordered newest-first and capped by configurable scan/claim limits.

- [x] Replace in-memory dedup with durable lease claims.
  Description: use SQLite/Drizzle `BEGIN IMMEDIATE` style claim with ownership token and lease expiry.
  Acceptance: five quick Buddy sessions cannot run duplicate extraction for the same source snapshot.

## 3. Source Loading And Filtering

- [x] Load full Buddy/OpenCode session source.
  Description: read messages through the OpenCode adapter and load linked deterministic learner events.
  Acceptance: extraction input is based on real Buddy chat data, not fixtures.

- [x] Strip non-learning and scaffold content.
  Description: drop system/developer content, synthetic learner-context injections, AGENTS/skill payloads, reasoning, compactions, snapshots, retries, hidden/ignored text, and large raw tool dumps.
  Acceptance: filtered transcript contains only learner-authored messages, assistant visible responses, compact relevant tool evidence, and explicit learning events.

- [x] Preserve useful metadata.
  Description: keep message ids, roles, timestamps, tool names, output token counts, learning event ids, and project path for traceability.
  Acceptance: model output can cite source message ids and event ids.

## 4. Deterministic Gate And Budgets

- [x] Run deterministic attention gate before any model call.
  Description: score message count, session span, burst density, assistant effort, learning events, explicit preference/goal/correction markers, and evidence/tool markers.
  Acceptance: low-signal unchanged sessions become `succeeded_no_output`; meaningful sessions can proceed to model extraction.

- [x] Enforce extraction budgets from durable state.
  Description: per-session and per-day caps should count durable successful model calls, not only JSONL event scans.
  Acceptance: budget decisions survive restart and concurrent session starts.

## 5. Model Resolution, Filtering, And Truncation

- [x] Resolve the extraction model from the user's connected models.
  Description: use configured learner-memory extract model when set; otherwise use exact OpenAI `gpt-5.4-mini` when OpenAI is connected; otherwise use a connected small/default fallback.
  Acceptance: no backend-only provider is required for Buddy extraction, and the user can override the model in settings.

- [x] Derive context budget from model metadata.
  Description: use model context window when available; otherwise use a safe fallback. Reserve prompt/output budget and use a configurable context percent.
  Acceptance: filtered transcript is truncated before the model call using a deterministic budget.

- [x] Use effective/input context windows where available.
  Description: prefer model input/effective context metadata before falling back to raw context window, then apply the 70% extraction budget.
  Acceptance: Buddy does not overfill extraction prompts for models whose usable input window is smaller than their advertised context window.

- [x] Truncate head+tail, not just tail.
  Description: preserve early intent/context and latest resolution/evidence; drop the middle with a marker.
  Acceptance: long sessions produce bounded prompts with explicit truncation metadata.

- [x] Redact before prompt where possible and before disk always.
  Description: sanitize API keys, bearer tokens, common secret assignments, and sensitive credential-looking values.
  Acceptance: stage-one files and generated markdown do not contain obvious secrets from transcript/model output.

## 6. Phase One: Learner-Specific Raw Extraction

- [x] Change extraction schema to stage-one output.
  Description: model returns `session_summary`, `session_slug`, `raw_learner_memory`, and `candidate_patches`; this output is not final memory.
  Acceptance: extraction can return no candidates but still store a useful session summary/raw memory when appropriate.

- [x] Use OpenCode structured output for extraction.
  Description: stage-one extraction should call `SessionPrompt.prompt` with `format: { type: "json_schema" }`, not freeform `generateSmallText` plus JSON parsing.
  Acceptance: extraction reads `assistant.structured`, validates it with zod, and malformed model output marks the job failed with retry backoff.

- [x] Persist only canonical stage-one output before final memory changes.
  Description: write `stage-one-outputs/<session>.json` and DB metadata only; do not eagerly rebuild phase-two markdown projections on every stage-one write.
  Acceptance: model extraction does not directly pollute final learner memory records.

- [x] Track token/cost telemetry.
  Description: store input, cached input, output, reasoning output if available from the model response.
  Acceptance: debug/devtools can show model cost drivers per extraction job.

## 7. Phase Two: Consolidation

- [x] Add singleton global consolidation job.
  Description: maintain input watermark, last consolidation watermark, lease token, heartbeat, retry-after, and failure reason.
  Acceptance: only one consolidation runs for the global learner-memory root; lost lease fails safely.

- [x] Select stage-one inputs using Codex-like ranking.
  Description: include non-empty recent raw outputs, rank by usage count then last usage/source update, cap inputs, and prune old unselected outputs.
  Acceptance: consolidation input is bounded and favors useful/recent learner evidence.

- [x] Compute added/retained/removed diff.
  Description: compare current selected stage-one outputs to previous selection.
  Acceptance: consolidation prompt receives explicit changes, not a blind full dump.

- [x] Sync phase-two readable projections from selected stage-one outputs.
  Description: generate `raw-memories.md` and `rollout-summaries/*.md` only for selected consolidation inputs; prune projections for removed inputs.
  Acceptance: phase two owns the Codex-like readable artifacts, and stage one remains a canonical JSON-plus-ledger write.

- [x] Run learner-specific file-oriented consolidation model.
  Description: run an internal learner-memory consolidator subagent that can inspect selected phase-two files and existing memory artifacts, write `MEMORY.md` and `summary.md`, then return structured bookkeeping.
  Acceptance: phase two uses file references and generated artifacts instead of one giant inline dump; the backend does not regenerate markdown over the agent's written files after consolidation.

- [x] Split consolidated base memory from working memory.
  Description: phase two owns consolidated `MEMORY.md` and `summary.md`; chat-time CRUD, learner corrections, deterministic writes, runtime typed snapshots, search, devtools, and routes use `working-memory.md` and `working-summary.md`.
  Acceptance: creating/updating/deleting learner-authored or deterministic memory writes parseable working markdown blocks, rebuilds `index.sqlite` from `working-memory.md`, keeps no final `memories/*.json` directory, and does not parse or rewrite consolidated `MEMORY.md` from the CRUD path.

- [x] Restrict consolidation tool access to the learner-memory root.
  Description: allow only the read/search/write tools needed for memory-root consolidation, deny task/delegation/network/shell, and keep backend validation after the agent returns.
  Acceptance: the consolidator can read/search/write memory artifacts under the global `~/.buddy/learner-memory` root using memory-root-scoped permissions and prompt-scoped search paths, but cannot spawn recursive agents.

- [x] Resolve the consolidation model separately from extraction.
  Description: use configured learner-memory consolidation model when set; otherwise use exact OpenAI `gpt-5.4` when OpenAI is connected; otherwise use the active notebook default model fallback.
  Acceptance: consolidation no longer reuses the extraction small-model resolver by accident.

- [x] Mark selected outputs consumed.
  Description: update selected flags/source snapshots and advance consolidation watermark after successful final memory write.
  Acceptance: unchanged input does not retrigger consolidation.

## 8. Read Path And Usage Feedback

- [x] Preserve bootstrap/delta synthetic context behavior.
  Description: final learner context is sent once per session and then only when fingerprint changes; never in the stable system prompt.
  Acceptance: prompt-cache-friendly dynamic context behavior remains intact.

- [x] Keep on-demand `learner_memory_search`.
  Description: agent can fetch deeper final memory when needed.
  Acceptance: search results include source ids and paths.

- [x] Record final memory usage and stage-one usage.
  Description: search/use/citation should strengthen final memory and update stage-one usage metadata for future consolidation ranking.
  Acceptance: frequently used memories/outputs rank higher.

## 9. UI, Devtools, And Settings

- [x] Expose pipeline state in memory settings/devtools.
  Description: show stage-one jobs, leases, retry status, stage-one outputs, consolidation watermark, and final memories.
  Acceptance: user/developer can see why memory did or did not run.

- [x] Add tunables for Codex-like mechanics.
  Description: startup idle age, startup concurrency, extraction budgets, consolidation input cap, stage-one retention, and model selectors.
  Acceptance: settings write through existing project config.

## 10. Tests And Verification

- [x] Add unit tests for snapshot fingerprints and watermarks.
  Description: unchanged trivial sessions skip; continued sessions requalify.
  Acceptance: tests cover no-output watermark behavior.

- [x] Add unit tests for filtering and truncation.
  Description: scaffold/synthetic/reasoning is removed; head+tail truncation is deterministic.
  Acceptance: tests show kept/dropped content explicitly.

- [x] Add unit tests for durable leases/backoff.
  Description: duplicate claim fails while lease active; retry backoff blocks; expired lease can be reclaimed.
  Acceptance: concurrency behavior is deterministic.

- [x] Add integration test for phase-one stage output.
  Description: forced session extraction writes stage-one artifacts and does not directly create final model memories.
  Acceptance: stage output files exist; final memories change only through deterministic/direct paths or phase two.

- [x] Add integration test for phase-two consolidation.
  Description: selected stage-one outputs produce final memory records and generated markdown.
  Acceptance: phase-two selection diff, selected markers, and watermark mechanics are covered without requiring a live provider-backed model call in CI.

- [x] Run required package checks.
  Description: no task is complete until formatting, linting, typecheck, and targeted tests pass.
  Acceptance: `bun fmt`, `bun lint`, `bun typecheck`, and changed-package targeted tests pass.
