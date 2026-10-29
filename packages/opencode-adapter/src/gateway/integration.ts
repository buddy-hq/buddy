import type z from "zod"
import type {
  providerAuthMethodSchema,
  providerAuthSchema,
  providerAuthAnswersSchema,
  providerOAuthStartSchema,
  providerOAuthAttemptSchema,
} from "@buddy/agent-runtime/providers"
import type { OpenCodeClient, ConnectionInfo, FormStringField } from "@opencode/client"
import type { PluginContext } from "../plugin"
import { readProviderIntegrations } from "./provider"
export { Credential } from "@opencode/schema/credential"
export { Integration } from "@opencode/schema/integration"

type IntegrationClient = Pick<OpenCodeClient, "integration" | "credential" | "provider" | "rpc">

function projectPrompt(
  field: FormStringField,
): NonNullable<z.infer<typeof providerAuthMethodSchema>["prompts"]>[number] {
  const shared = {
    key: field.key,
    message: field.title ?? field.key,
    required: field.required,
    hidden: field.hidden,
    default: field.default,
    when: field.when,
  }
  if (field.options?.length && !field.custom)
    return {
      ...shared,
      type: "select",
      options: field.options.map((option) => ({
        label: option.label,
        value: option.value,
        hint: option.description,
      })),
    }
  return { ...shared, type: "text", placeholder: field.placeholder }
}

async function integrationID(
  client: Pick<IntegrationClient, "rpc">,
  directory: string,
  providerID: string,
) {
  const mapping = await readProviderIntegrations(client, directory)
  return mapping[providerID] ?? providerID
}

export async function listProviderAuth(client: IntegrationClient, directory: string) {
  const integrations = await client.integration.list({ location: { directory } })
  const result: z.infer<typeof providerAuthSchema> = {}
  for (const integration of integrations.data) {
    result[integration.id] = integration.methods.flatMap(
      (method): z.infer<typeof providerAuthMethodSchema>[] => {
        if (method.type === "oauth" || method.type === "key") {
          const prompts = method.form?.flatMap((field) =>
            field.type === "string" ? [projectPrompt(field)] : [],
          )
          return [
            {
              id: method.type === "oauth" ? method.id : "key",
              type: method.type === "oauth" ? "oauth" : "api",
              label: method.label ?? "API key",
              prompts,
            },
          ]
        }
        return []
      },
    )
  }
  const mapping = await readProviderIntegrations(client, directory)
  for (const [providerID, integrationID] of Object.entries(mapping))
    result[providerID] = result[integrationID] ?? []
  return result
}

export async function startProviderOAuth(
  client: IntegrationClient,
  directory: string,
  providerID: string,
  input: z.infer<typeof providerOAuthStartSchema>,
) {
  const id = await integrationID(client, directory, providerID)
  const integration = await client.integration.get({ location: { directory }, integrationID: id })
  if (
    !integration.data?.methods.some(
      (method) => method.type === "oauth" && method.id === input.methodID,
    )
  )
    throw Object.assign(new Error("OAuth method is unavailable"), {
      name: "IntegrationMethodNotFoundError",
    })
  const attempt = await client.integration.oauth.connect({
    location: { directory },
    integrationID: id,
    methodID: input.methodID,
    answer: input.answers,
  })
  return {
    url: attempt.data.url,
    instructions: attempt.data.instructions,
    method: attempt.data.mode,
    methodID: input.methodID,
    attemptID: attempt.data.attemptID,
    expiresAt: attempt.data.time.expires,
  }
}

export async function completeProviderOAuth(
  client: IntegrationClient,
  directory: string,
  providerID: string,
  input: z.infer<typeof providerOAuthAttemptSchema>,
  signal?: AbortSignal,
) {
  const params = {
    location: { directory },
    integrationID: await integrationID(client, directory, providerID),
    attemptID: input.attemptID,
  }
  if (input.code !== undefined)
    await client.integration.oauth.complete({ ...params, code: input.code }, { signal })
  while (true) {
    const result = await client.integration.oauth.status(params, { signal })
    if (result.data.status === "complete") return true
    if (result.data.status === "failed")
      throw Object.assign(new Error(result.data.message), { name: "ProviderOAuthError" })
    if (result.data.status === "expired")
      throw Object.assign(new Error("Authorization expired"), { name: "ProviderOAuthError" })
    await new Promise<void>((resolve, reject) => {
      if (signal?.aborted) {
        reject(signal.reason)
        return
      }
      const onAbort = () => {
        clearTimeout(timer)
        reject(signal?.reason)
      }
      const timer = setTimeout(() => {
        signal?.removeEventListener("abort", onAbort)
        resolve()
      }, 500)
      signal?.addEventListener("abort", onAbort, { once: true })
    })
  }
}

export async function cancelProviderOAuth(
  client: IntegrationClient,
  directory: string,
  providerID: string,
  attemptID: string,
) {
  await client.integration.oauth.cancel({
    location: { directory },
    integrationID: await integrationID(client, directory, providerID),
    attemptID,
  })
  return true
}

export async function setProviderKey(
  client: IntegrationClient,
  directory: string,
  providerID: string,
  key: string,
  answers?: z.infer<typeof providerAuthAnswersSchema>,
) {
  await client.integration.connect.key({
    location: { directory },
    integrationID: await integrationID(client, directory, providerID),
    key,
    answer: answers,
  })
  return true
}

export async function removeProviderCredentials(
  client: IntegrationClient,
  directory: string,
  providerID: string,
) {
  const result = await client.integration.get({
    location: { directory },
    integrationID: await integrationID(client, directory, providerID),
  })
  for (const connection of result.data?.connections ?? [])
    if (connection.type === "credential")
      await client.credential.remove({ credentialID: connection.id })
  return true
}

const resolutions = new Map<
  string,
  ReturnType<PluginContext["integration"]["connection"]["resolve"]>
>()
export async function resolveIntegrationCredential(ctx: PluginContext, connection: ConnectionInfo) {
  const key = connection.type === "credential" ? connection.id : `env:${connection.name}`
  const pending = resolutions.get(key)
  if (pending) return pending
  const resolution = ctx.integration.connection.resolve(connection)
  resolutions.set(key, resolution)
  try {
    return await resolution
  } finally {
    if (resolutions.get(key) === resolution) resolutions.delete(key)
  }
}
