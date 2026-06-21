# Bench Refactor Divergences

This file records implementation judgment calls made under the `bench-refactor.md` Deadend Policy. The active plan remains authoritative; these notes document places where the code preserves the plan's intent without following one literal implementation detail.

## Best-Effort Hydration Coalescing Key

`bench-refactor.md` says to keep only the newest pending best-effort action per policy/event key during hydration and to apply normal auto-open suppression when draining.

The corrected shared `BenchClientActionV1` contract intentionally does not carry a separate policy or event-key field. It carries action identity, message identity, optional call identity, origin, acknowledgement kind, expiry, and the Bench command. The old module-global auto-open suppression registry and transcript scanner were removed.

Implementation judgment:

- Backend best-effort auto-open emits live-only SSE actions and never delays the producing tool.
- Frontend derives the conservative auto-open identity from the action target kind for currently supported producers: whiteboard and fullscreen HTML widget.
- While active session state is unknown, frontend coalesces best-effort actions by derived policy, message ID, call ID, and canonical target key.
- The derived key is frontend-only and is not part of the shared wire contract.
- Best-effort actions still drop when expired or superseded, and they do not create backend completions.

Why this preserves intent:

The plan's required behavior is live-only best-effort delivery with bounded hydration coalescing and no transcript replay. A new shared policy/event field would reintroduce extra protocol surface area after the corrected lease/action contract deliberately narrowed shared action identity. The implemented key keeps duplicate best-effort actions bounded during hydration without restoring the removed suppression registry or making backend tool completion depend on best-effort UI state.

## Final Review Without Subagents

`bench-refactor.md` asks for two parallel review subagents at completion. The user later explicitly instructed not to make subagents while debugging the Electron-only toggle failure.

Implementation judgment:

- Do not dispatch review subagents for this closeout.
- Keep the same review intent by running a direct faithfulness pass against the active plan, auditing the uncommitted toggle path for similar lifecycle-disposal bugs, and running the focused tests plus `bun lint` and root `bun typecheck`.

Why this preserves intent:

The plan's closing policy is meant to catch unfaithful implementation and review bugs. The later user instruction is more specific operational guidance for this session. A direct review pass avoids violating that instruction while still preserving the verification purpose.
