# Buddy Memory Fix Invariants

> **Dated investigation contract (2026-06-22).** Not a living host-model spec. Canonical process/packaging: [utility-process-backend.md](../../architecture/decisions/utility-process-backend.md). Provider demand split / `models=usable` **did not ship** ([exit-branch.md](../exit-branch.md) negative catalog). Keep Zen vs Go, ChatGPT account-scoped models, and “do not load the full models.dev catalog for normal UI” as product lessons.

**Created:** Mon Jun 22 2026
**Scope:** Working contract **for the June 22 compiled-sidecar memory investigation**. It is not the current desktop host contract (Electron utility + `virtual:buddy-server`).

## Context Recovery

- After any context summarization, read [utility-process-backend.md](../../architecture/decisions/utility-process-backend.md) and [exit-branch.md](../exit-branch.md) before treating this file as current.
- Do not restore `docs/memory-optimization/memory-optimization-log.md` from git; that path is not in the tree.

## Baseline Target

- The comparison target is **OpenCode Desktop on the same Windows machine**, not a theoretical Mac result and not only Codex.
- On June 22 2026, OpenCode Desktop on this machine showed Electron/utility processes in the approximate range of **16-179 MB private bytes** and **42-196 MB working set**, with the NodeService utility around **179 MB private / 196 MB working set**.
- The measured OpenCode Desktop process baseline on June 22 2026 was:

| Process role | Private bytes | Working set |
|---|---:|---:|
| Main/browser process | ~109 MB | ~167 MB |
| NodeService utility | ~179 MB | ~196 MB |
| Renderer | ~61 MB | ~128 MB |
| GPU process | ~107 MB | ~151 MB |
| Network utility | ~16 MB | ~61 MB |
| Crashpad | ~12 MB | ~42 MB |

- Buddy backend must stay in the OpenCode Desktop neighborhood for passive use. A normal app launch, health check, settings entry, onboarding provider check, or model-picker open must never settle at **500-900 MB working set**.
- Preferred target for the Buddy backend hot path is **under 100 MB working set** after startup and provider/model-picker checks. If the compiled Bun runtime makes that impossible for a resident process, the implementation must prove the lower bound with a minimal compiled Bun baseline and then keep Buddy close to that floor.
- Every claimed memory improvement must include measured before/after numbers on this Windows machine: idle startup, `/api/healthz`, provider/model-picker path, and any endpoint that intentionally starts the runtime.
- Do not stop at an explanation. **In this investigation** the production sidecar had to be rebuilt and measured. That host path is obsolete; measure the Electron utility process instead ([utility-process-backend.md](../../architecture/decisions/utility-process-backend.md)).
- Passing typecheck/lint/tests is not the success metric. After checks pass, the final gate is always: how much closer the rebuilt Buddy backend is to the measured OpenCode Desktop baseline, and where the next measured memory source remains. If the Buddy backend is still not close enough, keep optimizing instead of stopping at green checks.
- Batch compatible optimizations before expensive production rebuild/measurement loops. Update the optimization log after each meaningful change, but do not rebuild the sidecar after every tiny lever when several independent memory improvements can be implemented and checked together first.

## Product Behavior

- Do not break the app to reduce memory.
- Do not remove functionality to reduce memory.
- Do not take fragile shortcuts for memory optimization. The fix must remain maintainable across OpenCode vendor refreshes.
- Do not patch `vendor` for this memory work. Vendor changes are not an acceptable optimization path.
- Do not get sidetracked into unrelated styling, lint, or test cleanup. Only fix unrelated failures when they directly block building, measuring, or proving the memory fix.
- The primary success metric **of this investigation** was measured backend memory reduction on the rebuilt production sidecar. Current proof uses the Electron utility-process host, not that sidecar.
- Existing user-visible workflows must continue to work: desktop launch, onboarding, provider settings, ChatGPT OAuth, API-key provider connection, model selection, starting a chat, and running an agent.
- If a memory optimization changes data shape or loading timing, add tests or smoke coverage proving the workflow still works.
- A smaller response is only acceptable if it preserves the user's ability to browse/connect providers and select usable connected models. It is not acceptable to hide providers, drop connected models, or make settings/onboarding lie about connection state.
- The provider settings screen must continue to let users browse and add providers beyond the onboarding-recommended providers. Do not hardcode the provider system to only OpenAI, OpenCode Zen, or OpenCode Go.
- Users must still be able to connect arbitrary supported providers from provider settings, and connected non-OpenAI providers must still expose their usable models where the model picker, learner-memory settings, devtools, onboarding, and chat flows need models.

## Provider Loading

- The normal Buddy provider/model path must not call the vendored full provider list (`Provider.list`, `client.provider.list`, or any equivalent path that transforms and serializes the whole models.dev catalog).
- Filtering the full catalog after loading it is not a fix. The full 145-provider / 5k-model catalog must not be loaded, transformed, deep-cloned, or serialized for normal UI startup, onboarding, settings summary, or the model picker.
- OpenCode Desktop's actual Electron app currently bootstraps the legacy `sdk.provider.list()` path through `vendor/opencode/packages/app/src/context/global-sync/bootstrap.ts`; do not move Buddy onto OpenCode v2 provider/model APIs as a product behavior unless the vendor Electron app has moved there too.
- The measured OpenCode NodeService baseline is a whole runtime baseline, not "models only". Any comparison must separate process baseline, provider-list increment, model-picker increment, and idle settle behavior.
- The frontend must not receive all models for all providers unless the user explicitly opens a future full-catalog browser designed for that purpose.
- Settings provider browsing may need all provider **metadata**, but it must not require all provider model objects. Provider metadata and provider models must remain separate API concepts.
- The default provider snapshot **in this investigation’s contract** must be metadata-only. The `models=usable` split **did not ship**; do not document it as current API. If that work is restarted, model-bearing calls must stay explicit and limited to model-dependent flows.
- OpenAI model availability should use the OpenAI account-scoped model endpoint and lightweight local model metadata. It must not use the full models.dev provider catalog just to decide which ChatGPT models are visible.
- If no ChatGPT OAuth auth exists, the OpenAI model availability and usage endpoints must return `not_connected` from lightweight auth state and must not boot the OpenCode instance/runtime.
- Do not duplicate OpenCode vendor provider/model transformation semantics inside `packages/buddy`. If Buddy needs provider model objects, the adapter layer must reuse vendor-owned conversion/helpers or a small adapter-owned wrapper around them, so upstream vendor changes do not create a second divergent implementation.
- Moving duplicated provider/model semantics from Buddy into the adapter is not enough. The adapter may do cheap metadata extraction and auth/config state checks, but actual provider model object materialization must either reuse vendor conversion or stay deferred until an explicit model-bearing request.
- Passive provider/auth/settings routes must not import broad barrels or modules that boot OpenCode runtime state. Import paths for hot provider snapshots should stay direct and lazy; runtime-backed imports are reserved for actions that actually need runtime behavior, such as OAuth authorize/callback or starting an agent.
- The frontend demand split is an invariant:
  - provider settings search/list rows need provider id, name, source, env status, and auth methods for all browsable providers;
  - onboarding needs enough model data to select a usable model for the selected auth choice;
  - the model picker, learner-memory settings, devtools, and chat metadata need models only for usable/connected providers and public OpenCode Zen fallback models.
- Splitting endpoints or changing endpoint internals is allowed only if those frontend needs remain satisfied without loading/transmitting all models for all unconnected providers.
- ChatGPT account-scoped model availability is a required optimization and product behavior. Buddy should optimistically expose the existing lightweight/OpenAI fallback model metadata while the ChatGPT account model request is loading, then filter/replace visible ChatGPT models using the real account-scoped endpoint result when it becomes ready.
- Do not remove or bypass the ChatGPT account-scoped model API, plan-aware model filtering, or the existing optimistic-loading behavior around that endpoint.

## OpenCode Zen vs OpenCode Go

- `opencode` is **OpenCode Zen**. This is where the free-input public models come from.
- `opencode-go` is **OpenCode Go**. It is a separate provider and must not be treated as the same pool as OpenCode Zen.
- On the installed Windows cache inspected on June 22 2026, `opencode` had **70 total models** and **5 free-input non-deprecated models**; `opencode-go` had **19 total models** and **0 free-input non-deprecated models**.
- Buddy's free-model fallback must use OpenCode Zen (`opencode`) models only, unless a later catalog explicitly changes where free models live and the code/test/docs are updated together.

## Production Smoke Tests (investigation proposal — host path obsolete)

- The June 22 investigation required catching the Windows memory regression in GitHub Actions before release.
- **Do not** implement “compiled sidecar smoke” as the production gate. The shipped host is Electron utility + `virtual:buddy-server`. Windows utility-process memory checks remain the relevant direction (ADR next-map items 4–5).
- CI asserting a default provider response of thousands of models / multi-megabyte payload is still a valid *product* concern **if** that path is reintroduced; the demand split itself did not ship.
