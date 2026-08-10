# Bench Refactor Divergences

This file records implementation judgment calls made under the `bench-refactor.md` Deadend Policy. The active plan remains authoritative; these notes document places where the code preserves the plan's intent without following one literal implementation detail.

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

## Final Review Without Subagents

`bench-refactor.md` asks for two parallel review subagents at completion. The user later explicitly instructed not to make subagents while debugging the Electron-only toggle failure.

Implementation judgment:

- Do not dispatch review subagents for this closeout.
- Keep the same review intent by running a direct faithfulness pass against the active plan, auditing the uncommitted toggle path for similar lifecycle-disposal bugs, and running the focused tests plus `bun lint` and root `bun typecheck`.

Why this preserves intent:

The plan's closing policy is meant to catch unfaithful implementation and review bugs. The later user instruction is more specific operational guidance for this session. A direct review pass avoids violating that instruction while still preserving the verification purpose.
