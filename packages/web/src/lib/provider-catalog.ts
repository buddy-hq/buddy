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

export function resolveConnectedModelSelection(input: {
  providers: ProviderInfo[]
  selection: ProviderModelSelection | undefined
}) {
  const selection = input.selection
  if (!selection) return undefined

  const connectedProvider = getConnectedProviders(input.providers).find(
    (provider) => provider.id === selection.providerID,
  )
  if (!connectedProvider) return undefined

  const connectedModel = connectedProvider.models.find((model) => model.id === selection.modelID)
  if (!connectedModel) return undefined

  return selection
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
  agentModel?: ProviderModelSelection
  configuredModel?: ProviderModelSelection
  recentModels?: ProviderModelSelection[]
}) {
  const agentModel = resolveConnectedModelSelection({
    providers: input.providers,
    selection: input.agentModel,
  })
  if (agentModel) {
    return agentModel
  }

  const configuredModel = resolveConnectedModelSelection({
    providers: input.providers,
    selection: input.configuredModel,
  })
  if (configuredModel) {
    return configuredModel
  }

  for (const recentModel of input.recentModels ?? []) {
    const selection = resolveConnectedModelSelection({
      providers: input.providers,
      selection: recentModel,
    })
    if (selection) {
      return selection
    }
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
