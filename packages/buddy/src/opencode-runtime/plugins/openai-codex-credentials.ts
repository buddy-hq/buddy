import z from "zod"
import type { PluginContext } from "@buddy/opencode-adapter/plugin"
import { resolveIntegrationCredential } from "@buddy/opencode-adapter/gateway/integration"

export const OPENAI_PROVIDER_ID = "openai"
export type OpenAICodexStoredAuth = {
  type: "oauth"
  access: string
  refresh: string
  expires: number
  accountId?: string
  credentialID?: string
}

export class OpenAICodexAuthenticationError extends Error {
  readonly reconnectRequired = true
  constructor() { super("ChatGPT authentication requires reconnection"); this.name = "OpenAICodexAuthenticationError" }
}

export function createOpenAICodexCredentialResolver(ctx: PluginContext) {
  return async (): Promise<OpenAICodexStoredAuth | undefined> => {
    const connection = await ctx.integration.connection.active(OPENAI_PROVIDER_ID)
    if (!connection || connection.type !== "credential" || connection.method !== "oauth") return undefined
    const integration = await ctx.integration.get({ integrationID: OPENAI_PROVIDER_ID })
    if (integration.data.connections.some((entry) => entry.type === "credential" && entry.id === connection.id && entry.status?.status === "needs_auth")) throw new OpenAICodexAuthenticationError()
    let credential
    try { credential = await resolveIntegrationCredential(ctx, connection) } catch (error) {
      if (error instanceof Error && /Request failed: (400|401)/u.test(error.message)) {
        throw new OpenAICodexAuthenticationError()
      }
      throw error
    }
    if (credential?.type !== "oauth" || !["chatgpt-browser", "chatgpt-headless"].includes(credential.methodID)) return undefined
    const current = await ctx.integration.connection.active(OPENAI_PROVIDER_ID)
    if (current?.type !== "credential" || current.id !== connection.id) return undefined
    const accountID = z.string().safeParse(credential.metadata?.accountID)
    return { type: "oauth", access: credential.access, refresh: credential.refresh, expires: credential.expires, accountId: accountID.success ? accountID.data : undefined, credentialID: connection.id }
  }
}

export async function rejectOpenAICodexCredentials(ctx: PluginContext, auth: OpenAICodexStoredAuth): Promise<void> {
  const connection = await ctx.integration.connection.active(OPENAI_PROVIDER_ID)
  if (connection?.type !== "credential" || connection.id !== auth.credentialID) return
  const credential = await resolveIntegrationCredential(ctx, connection).catch(() => undefined)
  if (credential?.type !== "oauth" || credential.access !== auth.access || credential.refresh !== auth.refresh || credential.expires !== auth.expires) return
  const active = await ctx.integration.connection.active(OPENAI_PROVIDER_ID)
  if (active?.type !== "credential" || active.id !== connection.id) return
  await ctx.integration.connection.status({ integrationID: OPENAI_PROVIDER_ID, connection: active, status: { status: "needs_auth", message: "Reconnect your ChatGPT account" } })
}
