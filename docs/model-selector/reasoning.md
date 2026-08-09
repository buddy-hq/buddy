# Reasoning selector: what "Default" means and why we can't label it

Status: exploration notes, 2026-08-10. No decision taken beyond renaming `Xhigh` → `Extra High`.

## The question that started this

The composer's reasoning dropdown lists `Default, Low, Medium, High, Xhigh`. The proposal was to
show it the way T3 Code does — drop the standalone `Default` row, and instead put a `Default` pill
on whichever level actually *is* the default:

```
  Reasoning
  Low
  Medium  [Default]  ✓
  High
  Extra High
```

The trigger would then read "Medium" instead of the vague "Default".

Short answer: the visual is trivial, but **we do not know which level to put the pill on**, and for
most models that information does not exist anywhere in our data.

## What "Default" means today

It does **not** mean "no reasoning". It means "send no effort override" — the model still reasons, at
whatever level the provider picks internally. "No reasoning" is a separate thing: `none` is a real
variant on models that support disabling it (see the OpenAI effort lists and the minimax
`none: { thinking: { type: "disabled" } }` entry in `vendor/.../provider/transform.ts`).

The plumbing is a tri-state stored per prompt key in `model-selection-store.ts`:

| Stored value | Meaning | UI shows |
| --- | --- | --- |
| `undefined` | untouched | agent's pinned variant if any, else `Default` |
| `null` | user explicitly chose "Default" | `Default` |
| `"high"` etc. | user picked a level | that level |

Key files:

- `packages/web/src/lib/directory-chat/use-directory-chat-state.ts` — `THINKING_DEFAULT_KEY`,
  `thinkingOptions` (prepends the `Default` row), `resolveSelectedVariant`,
  `resolveConfiguredAgentVariant`, `THINKING_LEVEL_LABELS`.
- `packages/web/src/lib/directory-chat/use-directory-chat-page-controller.ts` — `onThinkingChange`
  maps `"default"` → `null`; both send paths do `selectedThinking !== "default" ? selectedThinking : undefined`.
- `packages/web/src/components/prompt/components/prompt-composer-toolbar.tsx` — renders the select.
  Hides the control entirely when `thinkingOptions.length <= 1`, which is why non-reasoning models
  show no dropdown at all.

## How the effort is actually resolved at request time

Two merges, in this order.

**Server, per message** (`vendor/opencode/packages/opencode/src/session/prompt.ts`):

```ts
const variant = input.variant ?? (ag.variant && full?.variants?.[ag.variant] ? ag.variant : undefined)
```

If the request omits a variant, the server backfills the **agent's configured variant** when the
agent's model matches the current model.

**Request options** (`vendor/opencode/packages/opencode/src/session/llm/request.ts`):

```ts
const options = mergeOptions(mergeOptions(mergeOptions(base, input.model.options), input.agent.options), variant)
```

So the precedence is `base → model.options → agent.options → variant`, variant last and therefore
strongest. `base` comes from `ProviderTransform.options()`.

### Known issue found during this exploration

If an agent pins a variant and the user explicitly picks `Default`, the composer displays **Default**
while the turn actually runs at the agent's pinned level, because the server backfills it. The UI is
lying in that specific case. Not fixed.

## Where the data comes from — and what's missing

**models.dev gives us one boolean.** `vendor/opencode/packages/core/src/models-dev.ts` defines the
model schema, and the only reasoning-related field is:

```ts
reasoning: Schema.Boolean
```

No levels. No default. That's the whole thing.

**The level lists are opencode's own hand-written code.** `ProviderTransform.variants()` in
`vendor/opencode/packages/opencode/src/provider/transform.ts` is a pile of regex matches on model ids
returning arrays of level names — `gpt-5.1` → none/low/medium/high, `gpt-5-pro` → high only,
opus-4.7+ and sonnet-5+ → low/medium/high/xhigh/max, gemini-3-flash → minimal/low/medium/high, and so
on. Roughly five model families cover nearly everything, and the same patterns work regardless of
which of the 150+ providers is serving the model, since OpenRouter's `gpt-5.2` matches the same
regex as OpenAI's.

**Nobody wrote down the defaults.** Not models.dev, not opencode, not the AI SDK (which just forwards
whatever options it's given). Send no effort field and OpenAI's or Anthropic's own server fills in
their documented default — documented on their websites, not in any payload we receive.

### Except where opencode forces a level

`ProviderTransform.options()` hardcodes an effort for a handful of cases before any request goes out:

- gemini-3 via OpenRouter / llmgateway → `reasoning: { effort: "high" }`
- meta models on the OpenAI SDK → `reasoningEffort: "high"`, `reasoningSummary: "auto"`
- zai / zhipuai on openai-compatible → `thinking: { type: "enabled" }`
- baseten, and opencode's own kimi-k2-thinking / glm-4.6 → `chat_template_args: { enable_thinking: true }`

For those models "Default" is opencode deciding, not the provider — and it is deterministic and
knowable from code we ship.

### What the web currently throws away

`normalizeProviderModel` in `packages/web/src/state/chat-actions.ts` reduces variants to
`Object.keys(...)` and drops `options` entirely, even though both are in the payload (see
`packages/sdk/src/gen/types.gen.ts`, the `Model` type). So the web has variant *names* only.

This matters because there is a shape-agnostic way to detect a default without knowing
provider-specific key names: `variants` is `Record<name, optionBag>` and `options` is the base bag
applied to every request. **If the effective options are a superset of one variant's bag, that
variant is provably the default.** Works for `reasoningEffort`, `reasoning.effort`,
`thinkingConfig.thinkingLevel`, SAP's `modelParams` wrapper, all of them. It would catch opencode's
injections and any user config, and stay silent everywhere else.

## How T3 Code does it

Reference implementation at `~/Code/t3code`, `apps/server/src/provider/Layers/`. Their option
descriptors carry an `isDefault: true` flag, which is what renders the pill.

**Claude models: hand-rolled.** `ClaudeProvider.ts` has a hand-written catalog with each model typed
out and one option flagged. 13 occurrences. The values genuinely differ per model — `claude-opus-4-7`
defaults to `xhigh`, everything else to `high` — so this is real per-model knowledge someone looked
up, not something derivable.

**Codex models: from the API.** `CodexProvider.ts` reads `model.defaultReasoningEffort` off the Codex
app-server model list response and flags the matching option. No hand-rolling.

**Cursor: from its API** as well.

**Why this is tractable for them and not for us.** T3's providers are coding agents — Claude, Codex,
Cursor, Grok, OpenCode — five of them, each shipping 5-10 curated models. The entire hand-written
default list is ~20 entries. Buddy goes through models.dev: hundreds of models across 150+ providers,
with a yes/no boolean as the only reasoning metadata.

Their label map is also worth copying verbatim (`CodexProvider.ts`):
`none/minimal/low/medium/high/xhigh/max/ultra` → `None/Minimal/Low/Medium/High/Extra High/Max/Ultra`.

## Options, if we revisit this

1. **Polish only.** `Reasoning` header via `SelectLabel`/`SelectGroup`, checkmark, better labels.
   `Default` stays its own row. Identical on every model, nothing to maintain.
2. **Pill where provable.** Plumb `options` and the variant bags through `normalizeProviderModel`,
   do the superset check, badge when it hits, fall back to the `Default` row otherwise. Correct by
   construction; menu looks different across models.
3. **Hand-rolled default map.** ~5 entries beside the existing five families in `transform.ts`.
   Cheap to write, but it is us guessing at provider internals, and it goes stale silently.
4. **Remove `Default` entirely.** Cleanest UI, but the guess doesn't disappear — it moves into the
   pre-selection, silently overriding both the provider's tuned default and opencode's injections
   (variant wins the merge). Adaptive-effort Anthropic models would get pinned to one level forever.

## Worth checking first

Buddy already talks to the Codex account API. `packages/buddy/src/opencode-runtime/plugins/openai-codex-account.ts`
parses `supported_reasoning_levels` but reads only `{ effort }` from each entry, and the schema is
`.passthrough()`. If that response carries a default the way T3's does, we get the real default for
Codex models for free — one provider, zero maintenance, no guessing. That is the honest version of
this feature and it should be checked before anything is hand-rolled.

## Changed

`THINKING_LEVEL_LABELS.xhigh`: `"Xhigh"` → `"Extra High"` in
`packages/web/src/lib/directory-chat/use-directory-chat-state.ts`. Nothing else.
