import type { ProviderAuthAuthorization } from "@buddy/sdk/types"
import type { ProviderInfo } from "@/state/chat-types"
import { clearOpenAIUsageQuery } from "@/state/openai-usage-query"
import { appQueryClient } from "@/state/query-client"
import { getBuddyClient } from "./buddy-client"
import { OPENAI_PROVIDER_ID } from "./provider-ids"

const CANCELLED_AUTHORIZATION_ERROR = "Authorization cancelled"
const SUPERSEDED_AUTHORIZATION_ERROR = "Superseded by a newer authorization request"

function hasErrorData(error: unknown): error is { data?: { message?: unknown } } {
  return Boolean(error && typeof error === "object" && "data" in error)
}

function hasNestedError(error: unknown): error is { error?: unknown } {
  return Boolean(error && typeof error === "object" && "error" in error)
}

function hasMessage(error: unknown): error is { message?: unknown } {
  return Boolean(error && typeof error === "object" && "message" in error)
}

export function formatProviderAuthError(error: unknown, fallback: string): string {
  if (hasErrorData(error) && typeof error.data?.message === "string" && error.data.message) {
    return error.data.message
  }
  if (hasNestedError(error)) {
    const nested = formatProviderAuthError(error.error, "")
    if (nested) return nested
  }
  if (hasMessage(error) && typeof error.message === "string" && error.message) {
    return error.message
  }
  if (error instanceof Error && error.message) return error.message
  if (typeof error === "string" && error) return error
  return fallback
}

export function parseProviderConfirmationCode(input?: string) {
  if (!input) return ""
  if (!input.includes(":")) return ""
  return input.split(":")[1]?.trim() ?? ""
}

export function findPreferredOAuthMethodIndex(provider: ProviderInfo) {
  const browserMatch = provider.methods.findIndex(
    (method) =>
      method.type === "oauth" && /chatgpt/i.test(method.label) && /browser/i.test(method.label),
  )
  if (browserMatch >= 0) return browserMatch

  const chatGptMatch = provider.methods.findIndex(
    (method) => method.type === "oauth" && /chatgpt/i.test(method.label),
  )
  if (chatGptMatch >= 0) return chatGptMatch

  const fallback = provider.methods.findIndex((method) => method.type === "oauth")
  return fallback >= 0 ? fallback : undefined
}

export async function authorizeProviderOAuth(input: {
  directory?: string
  providerID: string
  methodIndex: number
}): Promise<ProviderAuthAuthorization | undefined> {
  const client = getBuddyClient(input.directory)
  const result = await client.provider.oauth.authorize(
    {
      providerID: input.providerID,
      method: input.methodIndex,
    },
    { throwOnError: true },
  )
  return result.data ?? undefined
}

export async function completeProviderOAuth(input: {
  directory?: string
  providerID: string
  methodIndex: number
  code?: string
}) {
  const client = getBuddyClient(input.directory)
  await client.provider.oauth.callback(
    {
      providerID: input.providerID,
      method: input.methodIndex,
      ...(input.code ? { code: input.code } : {}),
    },
    { throwOnError: true },
  )
  if (input.providerID === OPENAI_PROVIDER_ID) {
    clearOpenAIUsageQuery(appQueryClient)
  }
}

export async function cancelProviderOAuth(input: { directory?: string; providerID: string }) {
  const client = getBuddyClient(input.directory)
  await client.provider.oauth.cancel(
    {
      providerID: input.providerID,
    },
    { throwOnError: true },
  )
}

export function isProviderAuthFlowInterrupted(error: unknown) {
  const message = formatProviderAuthError(error, "")
  return message === CANCELLED_AUTHORIZATION_ERROR || message === SUPERSEDED_AUTHORIZATION_ERROR
}

export async function removeProviderAuth(input: { providerID: string }) {
  const client = getBuddyClient()
  await client.auth.remove(
    {
      providerID: input.providerID,
    },
    { throwOnError: true },
  )
  if (input.providerID === OPENAI_PROVIDER_ID) {
    clearOpenAIUsageQuery(appQueryClient)
  }
}

export async function reloadProviderRuntime() {
  const client = getBuddyClient()
  await client.global.dispose({ throwOnError: true })
}
