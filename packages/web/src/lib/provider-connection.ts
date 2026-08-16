import { OPENCODE_PROVIDER_ID } from "@/lib/provider-ids"
import { parseTJsonObject, parseTString } from "@/components/chat/tools/types"
import type { ProviderInfo } from "@/state/chat-types"

export function providerNeedsConfigDisable<TConfig>(
  provider: ProviderInfo,
  globalConfig?: TConfig,
) {
  if (provider.id === OPENCODE_PROVIDER_ID) {
    return false
  }

  const providers = parseTJsonObject(parseTJsonObject(globalConfig)?.provider)
  const configuredProvider = parseTJsonObject(providers?.[provider.id])
  if (!configuredProvider) {
    return false
  }

  if (parseTString(configuredProvider.npm) !== "@ai-sdk/openai-compatible") {
    return false
  }

  const models = parseTJsonObject(configuredProvider.models)
  return Boolean(models && Object.keys(models).length > 0)
}
