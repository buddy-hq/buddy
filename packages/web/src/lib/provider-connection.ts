import { OPENCODE_PROVIDER_ID } from "@/lib/provider-ids"
import type { ProviderInfo } from "@/state/chat-types"

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined
  }
  return value as Record<string, unknown>
}

export function providerNeedsConfigDisable(
  provider: ProviderInfo,
  globalConfig?: Record<string, unknown>,
) {
  if (provider.id === OPENCODE_PROVIDER_ID) {
    return false
  }

  const providers = asRecord(globalConfig?.provider)
  const configuredProvider = asRecord(providers?.[provider.id])
  if (!configuredProvider) {
    return false
  }

  if (configuredProvider.npm !== "@ai-sdk/openai-compatible") {
    return false
  }

  const models = asRecord(configuredProvider.models)
  return Boolean(models && Object.keys(models).length > 0)
}
