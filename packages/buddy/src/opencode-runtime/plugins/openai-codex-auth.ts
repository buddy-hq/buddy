import z from "zod"
import { Plugin } from "@buddy/opencode-adapter/plugin"
import { registerProviderCatalog } from "@buddy/opencode-adapter/gateway/provider"
import { createOpenAICodexCredentialResolver, rejectOpenAICodexCredentials, type OpenAICodexStoredAuth } from "./openai-codex-credentials"
import { createOpenAICodexAccountService, openAIAccountIdentityResponseSchema, openAIModelAvailabilityResponseSchema, openAIUsageResponseSchema } from "./openai-codex-account"
import { registerOpenAICodexModels } from "./openai-codex-provider"
import { createCodexImagesClient } from "../../learning/features/image-generation/service/codex-images"
import { traceOpenAIAuth } from "./openai-auth-trace"

export function createOpenAICodexPlugin(options: { fetch?: Parameters<typeof createOpenAICodexAccountService>[0]["fetch"]; now?: () => number } = {}) {
  const request = options.fetch ?? ((input, init) => fetch(input, init))
  return Plugin.define({
    id: "buddy.codex",
    async setup(ctx) {
      const directory = ctx.location.directory
      const resolveAuth = createOpenAICodexCredentialResolver(ctx)
      const onRejected = (auth: OpenAICodexStoredAuth) => rejectOpenAICodexCredentials(ctx, auth)
      const service = createOpenAICodexAccountService({ fetch: (input, init) => request(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(5_000) }), now: options.now ?? (() => Date.now()), getAuth: resolveAuth, onRejected })
      const syncModels = await registerOpenAICodexModels(ctx, { resolveAuth, resolveModels: (signal) => service.resolveModelCatalog(directory, signal) })
      const images = createCodexImagesClient({ fetch: (url, init) => request(url, init), resolveAuth, onRejected })
      await registerProviderCatalog(ctx, syncModels)
      await ctx.rpc.register({
        id: "buddy.codex", events: {}, methods: {
          identity: { input: z.object({}), output: openAIAccountIdentityResponseSchema },
          models: { input: z.object({ refresh: z.boolean() }), output: openAIModelAvailabilityResponseSchema },
          usage: { input: z.object({ refresh: z.boolean() }), output: openAIUsageResponseSchema },
          image: { input: z.object({ prompt: z.string(), imageDataUrls: z.array(z.string()) }), output: z.object({ base64: z.string(), operation: z.enum(["generate", "edit"]) }) },
        },
      }, {
        identity: () => service.readIdentity(directory),
        models: async ({ refresh }) => {
          const result = refresh ? await service.refreshModelAvailability(directory) : await service.readModelAvailability(directory)
          await syncModels()
          return result
        },
        usage: ({ refresh }) => service.readUsage(directory, refresh),
        image: (input, { signal }) => images.createImage({ ...input, signal }),
      })
      await ctx.session.hook("retry", async (event) => {
        let usageLimit = false
        if (event.error.response?.body) {
          const result = z.object({ error: z.object({ code: z.string().optional(), type: z.string().optional() }) }).safeParse(await Promise.resolve().then(() => JSON.parse(event.error.response?.body ?? "{}")).catch(() => undefined))
          usageLimit = result.success && (result.data.error.code === "usage_limit_reached" || result.data.error.type === "usage_limit_reached")
        }
        if (usageLimit) event.decision = { retry: false }
      }, { providerID: "openai" })
      await ctx.session.hook("http.response", async (event) => {
        if (event.response.status !== 401) return
        const rejectedAccess = event.request.headers.get("authorization")?.replace(/^Bearer /iu, "")
        if (!rejectedAccess) return
        const auth = await resolveAuth().catch(() => undefined)
        if (auth?.access === rejectedAccess) await onRejected(auth)
      }, { providerID: "openai" })
      const controller = new AbortController()
      const events = (async () => {
        for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
          if (event.type !== "credential.switched" || event.data.integrationID !== "openai") continue
          await traceOpenAIAuth("credential_switched")
          await syncModels()
        }
      })().catch((error) => {
        if (!controller.signal.aborted) console.error("Buddy ChatGPT catalog subscription failed", error instanceof Error ? error.name : "UnknownError")
      })
      return async () => { controller.abort(); await events }
    },
  })
}
