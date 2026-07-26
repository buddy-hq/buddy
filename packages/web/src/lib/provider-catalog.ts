import type { ProviderCatalogState, ProviderInfo } from "@/state/chat-types"
import { OPENCODE_PROVIDER_ID } from "@/lib/provider-ids"

export type ProviderModelSelection = {
  providerID: string
  modelID: string
}

export function isAnonymousOpenCodeProvider(provider: ProviderInfo | undefined): boolean {
  return provider?.id === OPENCODE_PROVIDER_ID && !provider.connected
}

export function getConnectedProviders(providers: ProviderInfo[]) {
  return providers.filter((provider) => provider.connected)
}

export function getUsableProviders(providers: ProviderInfo[]) {
  return providers.filter(
    (provider) =>
      provider.connected || (isAnonymousOpenCodeProvider(provider) && provider.models.length > 0),
  )
}

function resolveProviderModel(provider: ProviderInfo | undefined, preferredModelID?: string) {
  if (!provider) return undefined

  if (preferredModelID) {
    const preferred = provider.models.find((model) => model.id === preferredModelID)
    if (preferred) return preferred
  }

  return provider.models[0]
}

function resolveFirstProviderModelSelection(
  providers: ProviderInfo[],
  providerDefault: Record<string, string>,
) {
  for (const provider of providers) {
    const model = resolveProviderModel(provider, providerDefault[provider.id])
    if (model) {
      return {
        providerID: provider.id,
        modelID: model.id,
      } satisfies ProviderModelSelection
    }
  }

  return undefined
}

export function resolveUsableModelSelection(input: {
  providers: ProviderInfo[]
  selection: ProviderModelSelection | undefined
}) {
  const selection = input.selection
  if (!selection) return undefined

  const provider = getUsableProviders(input.providers).find(
    (provider) => provider.id === selection.providerID,
  )
  if (!provider) return undefined

  const model = provider.models.find((model) => model.id === selection.modelID)
  if (!model) return undefined

  return selection
}

export function resolveProviderModelSelection(input: {
  providers: ProviderInfo[]
  providerDefault: Record<string, string>
  providerID: string
  requireConnected?: boolean
}) {
  const providerPool =
    input.requireConnected === false ? input.providers : getConnectedProviders(input.providers)
  const provider = providerPool.find((entry) => entry.id === input.providerID)
  const model = resolveProviderModel(provider, input.providerDefault[input.providerID])

  if (!provider || !model) return undefined

  return {
    providerID: provider.id,
    modelID: model.id,
  } satisfies ProviderModelSelection
}

export function resolveCatalogProviderModelSelection(input: {
  catalog: ProviderCatalogState
  providerID: string
  requireConnected?: boolean
}) {
  return resolveProviderModelSelection({
    providers: input.catalog.providers,
    providerDefault: input.catalog.default,
    providerID: input.providerID,
    requireConnected: input.requireConnected,
  })
}

export function resolveAutoModelSelection(input: {
  providers: ProviderInfo[]
  providerDefault: Record<string, string>
  agentModel?: ProviderModelSelection
  configuredModel?: ProviderModelSelection
  recentModels?: ProviderModelSelection[]
}) {
  const agentModel = resolveUsableModelSelection({
    providers: input.providers,
    selection: input.agentModel,
  })
  if (agentModel) {
    return agentModel
  }

  const configuredModel = resolveUsableModelSelection({
    providers: input.providers,
    selection: input.configuredModel,
  })
  if (configuredModel) {
    return configuredModel
  }

  for (const recentModel of input.recentModels ?? []) {
    const selection = resolveUsableModelSelection({
      providers: input.providers,
      selection: recentModel,
    })
    if (selection) {
      return selection
    }
  }

  const connectedFallback = resolveFirstProviderModelSelection(
    getConnectedProviders(input.providers),
    input.providerDefault,
  )
  if (connectedFallback) {
    return connectedFallback
  }

  return resolveFirstProviderModelSelection(
    getUsableProviders(input.providers).filter((provider) => !provider.connected),
    input.providerDefault,
  )
}
