/**
 * Sample catalog for the model selector prototypes: only what a person needs to recognise a
 * model — its name and who serves it. Keys mirror the composer's `providerID/modelID`.
 */

export type ModelEntry = {
  key: string
  name: string
  providerID: string
  providerName: string
}

const PROVIDER_NAMES = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
  xai: "xAI",
  deepseek: "DeepSeek",
  openrouter: "OpenRouter",
  "github-copilot": "GitHub Copilot",
  lmstudio: "LM Studio",
}

const ROWS: Array<[provider: keyof typeof PROVIDER_NAMES, id: string, name: string]> = [
  ["anthropic", "claude-fable-5-1", "Claude Fable 5.1"],
  ["anthropic", "claude-opus-5", "Claude Opus 5"],
  ["anthropic", "claude-sonnet-5", "Claude Sonnet 5"],
  ["anthropic", "claude-haiku-4-5", "Claude Haiku 4.5"],
  ["openai", "gpt-5", "GPT-5"],
  ["openai", "gpt-5-codex", "GPT-5 Codex"],
  ["openai", "gpt-5-mini", "GPT-5 mini"],
  ["openai", "gpt-5-nano", "GPT-5 nano"],
  ["google", "gemini-2.5-pro", "Gemini 2.5 Pro"],
  ["google", "gemini-2.5-flash", "Gemini 2.5 Flash"],
  ["xai", "grok-4", "Grok 4"],
  ["xai", "grok-code-fast-1", "Grok Code Fast 1"],
  ["deepseek", "deepseek-v3.1", "DeepSeek V3.1"],
  ["deepseek", "deepseek-r1", "DeepSeek R1"],
  ["openrouter", "anthropic/claude-sonnet-5", "Claude Sonnet 5"],
  ["openrouter", "openai/gpt-5", "GPT-5"],
  ["openrouter", "moonshotai/kimi-k2", "Kimi K2"],
  ["openrouter", "deepseek/deepseek-v3.1", "DeepSeek V3.1"],
  ["github-copilot", "claude-sonnet-5", "Claude Sonnet 5"],
  ["github-copilot", "gpt-5-mini", "GPT-5 mini"],
  ["github-copilot", "gemini-2.5-pro", "Gemini 2.5 Pro"],
  ["lmstudio", "qwen3-coder-30b", "Qwen3 Coder 30B"],
  ["lmstudio", "gpt-oss-20b", "gpt-oss 20B"],
]

export const MODELS: ModelEntry[] = ROWS.map(([providerID, id, name]) => ({
  key: `${providerID}/${id}`,
  name,
  providerID,
  providerName: PROVIDER_NAMES[providerID],
}))

export const MODEL_BY_KEY = new Map(MODELS.map((model) => [model.key, model]))

export const PROVIDERS = Object.entries(PROVIDER_NAMES).map(([id, name]) => ({ id, name }))

export const DEFAULT_MODEL_KEY = "anthropic/claude-sonnet-5"
export const PINNED_KEYS = ["anthropic/claude-sonnet-5", "openai/gpt-5", "lmstudio/qwen3-coder-30b"]
export const RECENT_KEYS = [
  "github-copilot/claude-sonnet-5",
  "google/gemini-2.5-flash",
  "anthropic/claude-opus-5",
]

/** Names a person gave their models, keyed by model key. */
export const DEFAULT_ALIASES = new Map([
  ["anthropic/claude-sonnet-5", "Tutor"],
  ["github-copilot/claude-sonnet-5", "Work"],
  ["openai/gpt-5-nano", "Quick"],
  ["lmstudio/qwen3-coder-30b", "Offline"],
])

const NAME_PROVIDER_COUNT = MODELS.reduce((counts, model) => {
  counts.set(model.name, (counts.get(model.name) ?? 0) + 1)
  return counts
}, new Map<string, number>())

/** A name offered by more than one provider needs its provider spelled out to be identifiable. */
export function isAmbiguousName(model: ModelEntry) {
  return (NAME_PROVIDER_COUNT.get(model.name) ?? 0) > 1
}

export function queryTokens(query: string) {
  return query.toLowerCase().split(/\s+/).filter(Boolean)
}

/**
 * Every token must hit the alias, name, provider or key. Alias hits rank first, then name, then
 * provider, so "sonnet" lists Sonnets before anything that merely lives at Anthropic.
 */
export function searchModels(
  models: ModelEntry[],
  query: string,
  aliases?: ReadonlyMap<string, string>,
) {
  const tokens = queryTokens(query)
  if (tokens.length === 0) return models
  const scored: Array<{ model: ModelEntry; score: number }> = []
  for (const model of models) {
    const alias = aliases?.get(model.key)?.toLowerCase() ?? ""
    const name = model.name.toLowerCase()
    const provider = `${model.providerName} ${model.providerID}`.toLowerCase()
    let score = 0
    let matchedAll = true
    for (const token of tokens) {
      if (alias.startsWith(token)) score += 6
      else if (name.startsWith(token) || name.includes(` ${token}`)) score += 4
      else if (alias.includes(token) || name.includes(token)) score += 3
      else if (provider.includes(token)) score += 2
      else if (model.key.includes(token)) score += 1
      else {
        matchedAll = false
        break
      }
    }
    if (matchedAll) scored.push({ model, score })
  }
  return scored.toSorted((a, b) => b.score - a.score).map((entry) => entry.model)
}
