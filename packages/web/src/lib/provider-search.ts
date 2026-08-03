import fuzzysort from "fuzzysort"
import type { ProviderInfo } from "@/state/chat-types"

type ProviderSearchTarget = {
  provider: ProviderInfo
  extraLabels: string
}

/**
 * fuzzysort keeps anything scoring above zero, so across a ~100-provider
 * catalog a query is answered with its real match *and* every name whose
 * letters happen to fall in that order somewhere: "gpt" drags in GitHub
 * Copilot, "moon" drags in Kimi F-o-r C-o-di-n-g.
 *
 * A plain score cut cannot separate those, because the bands overlap — a real
 * typo ("anthopic" → Anthropic) scores 0.35 while "z" → Amazon Bedrock, which
 * is pure noise, scores 0.47. What actually distinguishes them is not the
 * absolute score but the company it keeps: noise only ever appears *alongside*
 * a much better match for the same query. So the cut is relative to the best
 * hit, with a floor for the case where every hit is weak.
 */
const MINIMUM_MATCH_SCORE = 0.3
const MINIMUM_SHARE_OF_BEST_MATCH = 0.6

function buildProviderSearchTargets(
  providers: ProviderInfo[],
  extraLabelsByID?: ReadonlyMap<string, readonly string[]>,
): ProviderSearchTarget[] {
  return providers.map((provider) => ({
    provider,
    extraLabels: (extraLabelsByID?.get(provider.id) ?? []).join(" "),
  }))
}

export function filterProvidersByQuery(
  providers: ProviderInfo[],
  query: string,
  extraLabelsByID?: ReadonlyMap<string, readonly string[]>,
) {
  const needle = query.trim()
  if (!needle) return providers

  const targets = buildProviderSearchTargets(providers, extraLabelsByID)
  const results = fuzzysort.go(needle, targets, {
    keys: [(target) => target.provider.name, (target) => target.provider.id, "extraLabels"],
    threshold: MINIMUM_MATCH_SCORE,
  })
  // `go` returns best-first, so the first result sets the bar for the rest.
  const bestScore = results[0]?.score ?? 0
  const cutoff = bestScore * MINIMUM_SHARE_OF_BEST_MATCH

  return results.filter((result) => result.score >= cutoff).map((result) => result.obj.provider)
}

export function resolveProviderSearchResults(input: {
  allProviders: ProviderInfo[]
  connectedProviders: ProviderInfo[]
  availableProviders: ProviderInfo[]
  query: string
  extraLabelsByID?: ReadonlyMap<string, readonly string[]>
}) {
  const needle = input.query.trim()
  if (!needle) {
    return {
      connected: input.connectedProviders,
      available: input.availableProviders,
      matchedIDs: undefined as ReadonlySet<string> | undefined,
    }
  }

  const matched = filterProvidersByQuery(input.allProviders, needle, input.extraLabelsByID)
  const matchedIDs = new Set(matched.map((provider) => provider.id))

  return {
    connected: matched.filter((provider) => provider.connected),
    available: matched.filter((provider) => !provider.connected),
    matchedIDs,
  }
}
