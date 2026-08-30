# Bench Refactor Divergences

This file records implementation judgment calls made under the `bench-refactor.md` Deadend Policy. Live protocol for best-effort identity is [`current-architecture.md`](current-architecture.md) (Client Actions). These notes document where the code preserved plan intent without one literal implementation detail.

## Best-Effort Hydration Coalescing Key (superseded by tabs Phase 2)

`bench-refactor.md` says to keep only the newest pending best-effort action per policy/event key during hydration and to apply normal auto-open suppression when draining.

The original V1 judgment derived auto-open identity in the frontend. Tabs Phase 2 replaced that
contract directly with `BenchClientActionV2`; `present` now carries nullable canonical
`{ policyID, eventKey }` identity.

Implementation judgment:

- Backend best-effort auto-open emits live-only SSE actions and never delays the producing tool.
- Frontend coalesces live and hydration-pending best-effort actions by canonical policy, originating
  session, and event key.
- The canonical identity is part of the shared wire contract and is emitted by whiteboard and
  fullscreen HTML widget producers.
- Best-effort actions still drop when expired or superseded, and they do not create backend completions.

Why this preserves intent:

The plan's required behavior is live-only best-effort delivery with hydration coalescing and no
transcript replay. Canonical wire identity removes target-kind inference, coalesces duplicate
producers deterministically, and does not make backend tool completion depend on best-effort UI
state.

## Final Review Without Subagents (non-authoritative historical process noise)

This section records a **one-session** operational override from the Electron
toggle-debug closeout. It is **not** repository process, not AGENTS.md policy,
and not an instruction for later work.

`bench-refactor.md` asked for two parallel review subagents at completion. The
user for that session instructed not to dispatch subagents while debugging the
toggle failure. Closeout used a direct faithfulness pass, toggle-path audit, and
focused tests instead.

Do not cite this section as a standing “never use subagents” rule.
