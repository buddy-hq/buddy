import type { ProviderAuthMethod, ProviderOauthAuthorizeResponse } from "@buddy/sdk/types"
import { parseTJsonObject, parseTString } from "@/components/chat/tools/types"
import type { ProviderInfo } from "@/state/chat-types"
import { resetOpenAIAccountQuery } from "@/state/openai-account-query"
import { clearOpenAIUsageQuery } from "@/state/openai-usage-query"
import { appQueryClient } from "@/state/query-client"
import { getBuddyClient } from "./buddy-client"
import { OPENAI_PROVIDER_ID } from "./provider-ids"

const CANCELLED_AUTHORIZATION_ERROR = "Authorization cancelled"
const SUPERSEDED_AUTHORIZATION_ERROR = "Superseded by a newer authorization request"

export function formatProviderAuthError<TError>(error: TError, fallback: string): string {
  const record = parseTJsonObject(error)
  const dataMessage = record ? parseTString(parseTJsonObject(record.data)?.message) : undefined
  if (dataMessage) return dataMessage

  const nested = record ? formatProviderAuthError(record.error, "") : ""
  if (nested) return nested

  const message = record ? parseTString(record.message) : undefined
  if (message) return message
  if (error instanceof Error && error.message) return error.message
  const text = parseTString(error)
  if (text) return text
  return fallback
}

export function parseProviderConfirmationCode(input?: string) {
  if (!input) return ""
  if (!input.includes(":")) return ""
  return input.split(":")[1]?.trim() ?? ""
}

export function activeProviderAuthPrompts(method: ProviderAuthMethod, answers: Record<string, string>) {
  const prompts = method.prompts ?? []
  const values = { ...Object.fromEntries(prompts.filter((prompt) => prompt.default !== undefined).map((prompt) => [prompt.key, prompt.default])), ...answers }
  return prompts.filter((prompt) => prompt.when?.every((condition) => {
    const value = values[condition.key]
    if (value === undefined) return false
    return condition.op === "eq" ? value === condition.value : value !== condition.value
  }) ?? true)
}

export function resolveProviderAuthAnswers(method: ProviderAuthMethod, answers: Record<string, string>) {
  return Object.fromEntries(activeProviderAuthPrompts(method, answers).flatMap((prompt) => {
    const value = answers[prompt.key] ?? prompt.default
    return value === undefined || value === "" ? [] : [[prompt.key, value]]
  }))
}

export function findPreferredOAuthMethodIndex(provider: ProviderInfo) {
  const legacyBrowser = provider.methods.findIndex((method) => "id" in method && method.id === "chatgpt-browser")
  if (legacyBrowser >= 0) return legacyBrowser
  const browserMatch = provider.methods.findIndex(
    (method) =>
      method.type === "oauth" && /chatgpt/i.test(method.label) && /browser/i.test(method.label),
  )
  if (browserMatch >= 0) return browserMatch

  const codexBrowser = provider.methods.findIndex((method) => method.type === "oauth" && /codex.*browser/iu.test(method.label))
  if (codexBrowser >= 0) return codexBrowser

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
  methodID?: string
  answers?: Record<string, string>
}): Promise<ProviderOauthAuthorizeResponse | undefined> {
  const client = getBuddyClient(input.directory)
  const methods = await client.provider.auth({}, { throwOnError: true })
  const available = methods.data?.[input.providerID] ?? []
  const method = input.methodID ? available.find((entry) => entry.id === input.methodID) : available[input.methodIndex]
  if (!method || method.type !== "oauth") throw new Error("OAuth method is unavailable")
  const result = await client.provider.oauth.authorize(
    { providerID: input.providerID, methodID: method.id, answers: resolveProviderAuthAnswers(method, input.answers ?? {}) },
    { throwOnError: true },
  )
  return result.data ?? undefined
}

export async function completeProviderOAuth(input: {
  directory?: string
  providerID: string
  attemptID: string
  methodID: string
  code?: string
}) {
  const client = getBuddyClient(input.directory)
  await client.provider.oauth.callback(
    Object.assign(
      {
        providerID: input.providerID,
        attemptID: input.attemptID,
        methodID: input.methodID,
      },
      input.code ? { code: input.code } : undefined,
    ),
    { throwOnError: true },
  )
  if (input.providerID === OPENAI_PROVIDER_ID) {
    clearOpenAIUsageQuery(appQueryClient)
    await resetOpenAIAccountQuery(appQueryClient)
  }
}

export async function cancelProviderOAuth(input: { directory?: string; providerID: string; attemptID: string }) {
  const client = getBuddyClient(input.directory)
  await client.provider.oauth.cancel(
    {
      providerID: input.providerID,
      attemptID: input.attemptID,
    },
    { throwOnError: true },
  )
}

export function isProviderAuthFlowInterrupted<TError>(error: TError) {
  const message = formatProviderAuthError(error, "")
  return message === CANCELLED_AUTHORIZATION_ERROR || message === SUPERSEDED_AUTHORIZATION_ERROR
}

export async function removeProviderAuth(input: { providerID: string; directory?: string }) {
  const client = getBuddyClient(input.directory)
  await client.auth.remove(
    {
      providerID: input.providerID,
    },
    { throwOnError: true },
  )
  if (input.providerID === OPENAI_PROVIDER_ID) {
    clearOpenAIUsageQuery(appQueryClient)
    await resetOpenAIAccountQuery(appQueryClient)
  }
}

export async function reloadProviderRuntime() {
  const client = getBuddyClient()
  await client.global.dispose({ throwOnError: true })
}
