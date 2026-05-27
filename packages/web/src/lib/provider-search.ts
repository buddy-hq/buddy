import fuzzysort from "fuzzysort"
import type { ProviderInfo } from "@/state/chat-types"

type ProviderSearchTarget = {
  provider: ProviderInfo
  extraLabels: string
}

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
  return fuzzysort
    .go(needle, targets, {
      keys: [(target) => target.provider.name, (target) => target.provider.id, "extraLabels"],
    })
    .map((result) => result.obj.provider)
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
