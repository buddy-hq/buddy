# Memory Optimization Recovery Plan

**Created:** Tue Jun 23 2026
**Purpose:** Reset the memory optimization work onto a maintainable path after the first branch mixed useful startup optimizations with fragile provider reimplementation.

## Context Recovery

- After any context summarization or compaction, read this entire plan before continuing work.
- Also read `docs/memory-optimization/memory-optimization-log.md`, `docs/memory-optimization/memory-startup-recovery-worktree-review.md`, and `docs/memory-optimization/memory-fix-invariants.md` before continuing memory/provider work.
- Do not continue from summarized memory of this plan. Use the recorded files as the source of truth.

## Problem Statement

Buddy was retaining a large Windows backend working set after passive startup. The strongest theory is that normal app startup and provider/settings bootstrap were invoking the full OpenCode provider list path. That path loads, transforms, caches, and serializes the full models.dev catalog. On Windows, the temporary peak can remain resident, so a startup-time provider spike becomes a persistent idle-memory problem.

The goal is still to reduce passive startup and idle memory. The goal is not to remove provider functionality or recreate OpenCode provider behavior in Buddy.

## Principles

- Do not maintain a second provider runtime in Buddy.
- Do not duplicate OpenCode provider auth, config, plugin, model transformation, default model, or custom loader semantics.
- Do not make provider settings lie about available auth methods, prompts, connected state, or usable models.
- Do not ship all models for all providers to satisfy provider browsing.
- Keep lightweight paths lightweight by narrowing what they answer.
- Use runtime-backed OpenCode behavior when the user asks for runtime-backed behavior.
- Keep referring to the vendored OpenCode Electron frontend before changing provider/model/auth UX or state patterns.

## Vendor Frontend Reference

Buddy should preserve the product behavior patterns used by the vendored OpenCode Electron app unless Buddy has an explicit product reason to differ.

Reference files:

- `vendor/opencode/packages/app/src/context/global-sync/bootstrap.ts`
- `vendor/opencode/packages/app/src/hooks/use-providers.ts`
- `vendor/opencode/packages/app/src/context/models.tsx`
- `vendor/opencode/packages/app/src/components/dialog-connect-provider.tsx`

Patterns to preserve:

- Provider list remains the backing state for provider UI and model UI.
- Connected providers are derived from the provider list's `connected` ids, not from frontend guesses.
- Model UI derives available models from connected providers.
- Provider auth methods are loaded lazily when the connection dialog opens.
- The connection dialog can fall back to a generic API-key form and saves it through `auth.set`.
- OAuth/plugin methods must come from provider auth hooks, including prompts and redirect/code behavior.

Buddy's memory fix should change when and how much provider data the backend returns, not invent a parallel provider UX model.

## Demand Splitting

The fix should split provider demand by what the UI actually needs.

### Provider Browse Demand

Used by settings search/list and low-cost onboarding checks.

Return metadata only:

- provider id
- provider name
- env variable names
- lightweight source/connection/config-disabled state
- whether Buddy can offer a generic API-key credential form

This path must not include model objects, provider auth hooks, plugin-loaded provider behavior, or connected-provider model semantics. It can be backed by a generated or cached provider metadata index, plus cheap config/auth/env checks that do not initialize the full provider runtime.

Provider browsing must still tell the truth about whether a provider is connected or unavailable because it is disabled by config. Settings and onboarding should not need model-bearing provider payloads just to render provider rows.

### Provider Auth Demand

Used when the user opens a provider connection flow.

Use the canonical OpenCode provider auth methods for OAuth/plugin flows, including OAuth hooks and prompt metadata. If this is expensive, make it lazy and scoped to the selected provider or dialog-open moment.

Do not synthesize OAuth/plugin auth methods in the frontend. Buddy may still own a generic API-key credential form for providers whose lightweight metadata says API-key credentials are supported. That form should save through the existing auth storage path, not pretend to be provider-specific OpenCode auth metadata.

### Usable Model Demand

Used by the model picker, learner-memory settings, devtools, chat metadata, and onboarding model selection.

Return models only for providers that can actually be used:

- connected providers
- configured providers
- env-backed providers
- public OpenCode Zen fallback models

This path should preserve OpenCode behavior. If the implementation needs OpenCode provider config, plugin model hooks, auth loader behavior, or model transforms, it should use the vendor/runtime implementation or adapter helpers that share vendor semantics.

If this endpoint simply calls the old full `provider.list()` and filters afterward, it may still pay the same heap cost. That can be acceptable only when the user explicitly opens a model-dependent surface. If the model picker or learner-memory settings still need lower memory, build or expose a scoped vendor-backed helper rather than reimplementing provider semantics in Buddy.

### ChatGPT Account Demand

Use the existing ChatGPT account-scoped model availability and usage endpoints. It is acceptable to show lightweight optimistic metadata while the account-scoped result loads, but avoid hardcoded frontend model metadata becoming the canonical model source.

## Frontend State Split

Do not normalize the split endpoints back into one eager `ProviderCatalogState` during bootstrap.

Use separate frontend state/query shapes:

- provider browser catalog for settings rows and onboarding checks
- auth methods for the selected provider/dialog
- usable model catalog for model picker, learner-memory settings, and chat auto-model resolution
- ChatGPT account model availability for account-scoped filtering

The old combined catalog can remain as a compatibility adapter only for callers that genuinely need all of those pieces at once.

## Suggested Endpoint Shape

- `GET /api/provider/catalog`
  - Metadata-only provider browser payload.
  - Safe for settings and passive startup.

- `GET /api/provider/auth`
  - Canonical OpenCode auth methods, loaded lazily.
  - If needed later, split to `GET /api/provider/:providerID/auth`.
  - OAuth/plugin methods only; generic API-key support is represented by provider catalog metadata.

- `GET /api/provider/usable-models`
  - Runtime-backed, bounded model payload for usable providers only.
  - May be called when the model picker opens or when chat needs auto-model resolution.

- Existing `GET /api/provider`
  - Either keep as compatibility or migrate internal callers away from it.
  - It must not be used by passive startup if it returns the old all-purpose payload.

## Recovery Steps

1. Create a fresh branch from synced `main`.
2. Move the current memory branch changes there.
3. Unstage all carried changes so each optimization can be reviewed independently.
4. Discard provider-specific reimplementation changes.
5. Keep only non-provider startup/import optimizations that are clean and independently understandable.
6. Rebuild the provider optimization step-by-step from the demand-split design.

## Provider Changes To Avoid Carrying Forward

- Adapter-local provider catalog that reimplements auth/config/provider source behavior.
- Hand-written JSON scanner as a behavior source for connected provider models.
- Frontend guessing that missing auth methods means API-key auth is available.
- Frontend synthetic provider auth methods as canonical data.
- Frontend synthetic OpenAI model metadata as canonical data.
- Model-bearing paths that bypass plugin model hooks or configured provider models.

## Verification Goals

- Passive startup and health checks do not load the full provider/model runtime.
- Settings provider browsing stays small and still lists supported providers.
- Provider browsing returns zero model objects.
- Passive bootstrap does not call the old all-purpose `provider.list()` path.
- API-key providers can still be connected, updated, disconnected, and reconnected.
- GitHub Copilot auth prompts survive.
- Configured custom provider models survive.
- Connected plugin/OAuth providers expose the same usable models as OpenCode runtime behavior.
- Default provider metadata response stays below a concrete response-size threshold agreed before implementation.
- Windows rebuilt sidecar measurements are recorded after each meaningful batch.
