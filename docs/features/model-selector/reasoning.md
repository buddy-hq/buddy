# Reasoning Selector: Semantics and Missing Metadata

Status: open exploration (2026-08-10). The only shipped change recorded here is the `Xhigh` →
`Extra High` label; the default-level badge remains undecided.

## What "Default" Means

In the reasoning dropdown (`Default`, `Low`, `Medium`, `High`, `Extra High`), "Default" does **not** mean "no reasoning". It means "send no effort override" so the model executes at the provider's native default level.

"No reasoning" is a distinct variant (`none` / `disabled`), available only on models that explicitly support turning reasoning off.

Reasoning selection is tracked as a tri-state in `model-selection-store.ts`:
- `undefined`: untouched; resolves to agent's pinned variant if set, else `Default`.
- `null`: user explicitly selected "Default".
- `"high"` etc.: user explicitly selected a reasoning level.

## The Lying-Default Problem

When an agent configuration pins a variant (e.g. `high`) and the user explicitly chooses `Default` in the composer:
1. The UI displays **Default**.
2. At request time, `prompt.ts` checks `input.variant ?? ag.variant`. Because `input.variant` is omitted for "Default", the server backfills the agent's pinned variant (`high`).
3. The turn runs at `high` effort while the composer UI falsely indicates `Default`.

## Request-Time Precedence

The server resolves the variant per message in
`vendor/opencode/packages/opencode/src/session/prompt.ts`:

```ts
const variant = input.variant ??
  (ag.variant && full?.variants?.[ag.variant] ? ag.variant : undefined)
```

Thus an omitted UI override can still inherit an agent-pinned variant. Request options are then
merged in `vendor/opencode/packages/opencode/src/session/llm/request.ts` as
`base → model.options → agent.options → variant`, with the variant strongest. Any UI label change
must account for both merges, not just the dropdown's local tri-state.

## Missing Metadata Across Upstream Sources

1. **`models.dev`**: Exposes only `reasoning: boolean`. It provides no reasoning levels, supported variants, or default values.
2. **OpenCode Variant Regexes**: `ProviderTransform.variants()` maps model IDs to variant name arrays (e.g. `low`, `medium`, `high`, `xhigh`), but does not define which level is the default.
3. **Provider Defaults**: Providers document default efforts on websites, but omit default indicators in API metadata. OpenCode hardcodes effort injections for only a few models (e.g. Gemini-3 on OpenRouter, Meta on OpenAI SDK).
4. **Web Normalization Drops Option Bags**: `normalizeProviderModel` reduces `variants` to key strings and drops `options`. If `options` were preserved, a shape-agnostic superset check (`effective options ⊇ variant options bag`) could deterministically identify defaults when injected.

`ProviderTransform.options()` also forces reasoning for a small set of cases before the request:
Gemini-3 through OpenRouter/llmgateway, Meta models through the OpenAI SDK, `zai`/`zhipuai`
thinking, and selected Kimi/GLM/hosted models. For those rows, “Default” can mean an OpenCode
injection rather than a provider-native default; the source of the value must stay visible in any
future design.

## Discovery Opportunities

The OpenAI Codex account API (`supported_reasoning_levels`) provides model-level defaults in some account payloads. Inspecting account model endpoints can provide authoritative defaults without guessing or maintaining fragile hand-rolled mapping tables.

## T3 Comparison and Options

T3 Code can label defaults because its curated providers expose `isDefault` (Claude's hand-written
catalog) or a provider API field such as Codex `defaultReasoningEffort`. Buddy instead receives
hundreds of models through models.dev, whose only reasoning field is a boolean. Copying T3's pill
without equivalent metadata would guess across providers.

If this is revisited, the bounded options are:

1. polish the existing standalone `Default` row and keep semantics unchanged;
2. preserve variant option bags and show a pill only when the superset proof is decisive;
3. maintain a small hand-rolled map (cheap but silently stale); or
4. remove `Default` and risk pinning adaptive provider defaults to a guessed level.

The honest first check is whether the existing Codex account response contains a default field; it
could provide one authoritative provider without a global hand-maintained table.

## Source Map

- UI tri-state and labels: `packages/web/src/lib/directory-chat/use-directory-chat-state.ts`
- request mapping: `packages/web/src/lib/directory-chat/use-directory-chat-page-controller.ts`
- composer rendering: `packages/web/src/components/prompt/components/prompt-composer-toolbar.tsx`
- model normalization: `packages/web/src/state/chat-actions.ts`
- provider variants/options: `vendor/opencode/packages/opencode/src/provider/transform.ts`
- Codex account metadata: `packages/buddy/src/opencode-runtime/plugins/openai-codex-account.ts`
