import type { ProviderCatalogState, ProviderInfo } from "@/state/chat-types"

export type ProviderModelSelection = {
  providerID: string
  modelID: string
}

export function getConnectedProviders(providers: ProviderInfo[]) {
  return providers.filter((provider) => provider.connected)
}

function resolveConnectedProviderModel(
  provider: ProviderInfo | undefined,
  preferredModelID?: string,
) {
  if (!provider) return undefined

  if (preferredModelID) {
    const preferred = provider.models.find((model) => model.id === preferredModelID)
    if (preferred) return preferred
  }

  return provider.models[0]
}

export function resolveProviderModelSelection(input: {
  providers: ProviderInfo[]
  providerDefault: Record<string, string>
  providerID: string
}) {
  const provider = getConnectedProviders(input.providers).find(
    (entry) => entry.id === input.providerID,
  )
  const model = resolveConnectedProviderModel(provider, input.providerDefault[input.providerID])

  if (!provider || !model) return undefined

  return {
    providerID: provider.id,
    modelID: model.id,
  } satisfies ProviderModelSelection
}

export function resolveCatalogProviderModelSelection(input: {
  catalog: ProviderCatalogState
  providerID: string
}) {
  return resolveProviderModelSelection({
    providers: input.catalog.providers,
    providerDefault: input.catalog.default,
    providerID: input.providerID,
  })
}

export function resolveAutoModelSelection(input: {
  providers: ProviderInfo[]
  providerDefault: Record<string, string>
  configuredModel?: ProviderModelSelection
}) {
  if (input.configuredModel) {
    return input.configuredModel
  }

  for (const provider of getConnectedProviders(input.providers)) {
    const model = resolveConnectedProviderModel(provider, input.providerDefault[provider.id])
    if (model) {
      return {
        providerID: provider.id,
        modelID: model.id,
      } satisfies ProviderModelSelection
    }
  }

  return undefined
}
