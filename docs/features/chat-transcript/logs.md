# Chat Transcript Refactor Logs

## 2026-06-28

This log records what went wrong during the transcript refactor pass and what the fixes taught us. The companion invariants live in [invariants.md](./invariants.md).

### Summary

The main failure mode was not one isolated bug. It was losing behavioral contracts from the old monolithic Zustand chat store while moving transcript ownership into the normalized repository.

The normalized repository is the right direction, but it must explicitly replace the old contracts instead of assuming keyed part subscriptions and row projection naturally cover every event-order case.

### Important old contracts that were easy to miss

The old store carried hidden but important behavior:

- preserving orphan parts that arrive before parent messages
- merging orphan parts when the parent message arrives
- applying deltas before final snapshots
- reconciling terminal assistant messages into terminal parts
- converting interrupted pending/running tools into interrupted tool errors
- keeping completed reasoning visible as a collapsed thought row
- updating whole message arrays in ways that accidentally reran row projection

The new repository has to preserve these intentionally.

### Concrete regressions found/fixed

- Optimistic thinking did not appear immediately on send.
- Completed reasoning no longer appeared as a collapsed “Thought for Ns” row.
- Thought rows were present in data/DOM but visually missing or badly spaced.
- DOM rows overlapped when virtualization measurements were stale or row heights changed.
- Sidebar/bench width changes caused transcript flicker.
- Code/math/Mermaid appeared to flicker because parent rows/Markdown blocks were being remounted.
- Broken Markdown images disappeared/reappeared during active streaming because the live block fallback replaced already-rendered content.
- Artifact wrappers replayed mount/layout animations under virtualization.
- Code highlighting worker startup failure could crash the transcript instead of preserving raw code fallback.
- Terminal assistant sealing marked only the message completed; pending/running tools could remain active forever.
- Orphan parts outside active reloads were dropped permanently.
- Orphan part deltas before parent message arrival were lost.
- Initial transcript load with a fixed limit could cut off the latest user message and open on assistant-only turns.
- Deltas that made empty text/reasoning parts non-empty notified only part subscribers; no row existed yet, so assistant text could stay hidden behind the thinking placeholder.

### Current fixes added during this pass

- Restored optimistic thinking and completed thought summary behavior.
- Restored terminal assistant part reconciliation in the transcript repository.
- Preserved orphan parts unconditionally and merged them when parent messages arrive.
- Applied orphan deltas before parent messages arrive.
- Honored orphan part removals before parent messages arrive.
- Made initial transcript loads extend backward to the latest user boundary.
- Emitted session-level updates when part updates/deltas change timeline visibility or structure.
- Preserved broken image nodes while live Markdown grows.
- Kept raw code fallback when the Markdown highlighting worker is unavailable or construction fails.
- Removed transcript artifact mount/layout animations that replay under virtualization.
- Added reduced-motion handling for remaining compositor-only task-card entrances.

### Debugging pattern that worked

The reliable path was:

1. Reproduce from raw event/data flow.
2. Compare against HEAD behavior.
3. Compare against current standalone OpenCode at `/Users/prashantbhudwal/code/opencode`.
4. Identify the product contract before patching.
5. Patch the architecture-level owner, not the symptom component.
6. Add a regression test for the contract.
7. Run focused affected tests, then root `bun lint` and root `bun typecheck`.

### Lessons for future passes

- “Part subscriber only” is not enough when a part first becomes structurally visible. Row projection needs a session-level update.
- “Initial limit = 2” is an optimization, not an invariant. “Initial tail includes the latest user boundary” is the invariant.
- Animation cleanup can reduce flicker, but it does not fix remounting. Treat animations as amplifiers, not the root cause, unless measurements prove otherwise.
- If the old store updated a message array, check whether the new repository must explicitly emit a structural/session notification.
- Do not assume SSE event ordering is friendly. Message parts, deltas, removals, terminal messages, and refresh pages can interleave.
- Do not treat test pass status as behavioral proof if no test covers the old contract.

### Open follow-up from this day

The remaining larger Markdown architecture issue is still separate:

- Streaming-to-final Markdown projection can still rebuild too much of the response.
- Virtualized Markdown live-tail identity must avoid content-derived remount keys.
- Mermaid-aware segmentation and references still need a more coherent projection model.

Those are tracked in [findings.md](./findings.md).
