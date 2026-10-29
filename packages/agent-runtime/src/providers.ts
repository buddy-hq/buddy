import z from "zod"
import type { ModelSelection } from "./common"

const modalitiesSchema = z.object({ text: z.boolean(), audio: z.boolean(), image: z.boolean(), video: z.boolean(), pdf: z.boolean() })
const cacheCostSchema = z.object({ read: z.number(), write: z.number() })
export const providerModelSchema = z.object({
  id: z.string(), providerID: z.string(), api: z.object({ id: z.string(), url: z.string(), npm: z.string() }),
  name: z.string(), family: z.string().optional(), free: z.boolean().optional().describe("Free to use under this provider's catalog pricing"),
  capabilities: z.object({ temperature: z.boolean(), reasoning: z.boolean(), attachment: z.boolean(), toolcall: z.boolean(), input: modalitiesSchema, output: modalitiesSchema, interleaved: z.union([z.boolean(), z.object({ field: z.string() })]) }),
  cost: z.object({ input: z.number(), output: z.number(), cache: cacheCostSchema, tiers: z.array(z.object({ input: z.number(), output: z.number(), cache: cacheCostSchema, tier: z.object({ type: z.literal("context"), size: z.number() }) })).optional() }),
  limit: z.object({ context: z.number(), input: z.number().optional(), output: z.number() }),
  status: z.enum(["alpha", "beta", "deprecated", "active"]), options: z.record(z.string(), z.unknown()), headers: z.record(z.string(), z.string()),
  release_date: z.string(), variants: z.record(z.string(), z.record(z.string(), z.unknown())).optional(), enabled: z.boolean(),
}).meta({ id: "Model" })
export const providerSchema = z.object({ id: z.string(), name: z.string(), bundled: z.boolean().optional().describe("Hosted provider bundled with the runtime"), source: z.enum(["env", "config", "custom", "api"]), env: z.array(z.string()), options: z.record(z.string(), z.unknown()), models: z.record(z.string(), providerModelSchema) }).meta({ id: "Provider" })
export const providerConfigSchema = z.object({ providers: z.array(providerSchema), default: z.record(z.string(), z.string()) })
export const providerListSchema = z.object({ all: z.array(providerSchema), default: z.record(z.string(), z.string()), connected: z.array(z.string()) })

const promptFields = {
  key: z.string(), message: z.string(), required: z.boolean().optional(), hidden: z.boolean().optional(), default: z.string().optional(),
  when: z.array(z.object({ key: z.string(), op: z.enum(["eq", "neq"]), value: z.union([z.string(), z.number(), z.boolean()]) })).optional(),
}
const promptSchema = z.union([
  z.object({ ...promptFields, type: z.literal("text"), placeholder: z.string().optional() }),
  z.object({ ...promptFields, type: z.literal("select"), options: z.array(z.object({ label: z.string(), value: z.string(), hint: z.string().optional() })) }),
])
export const providerAuthMethodSchema = z.object({ id: z.string(), type: z.enum(["oauth", "api"]), label: z.string(), prompts: z.array(promptSchema).optional() }).meta({ id: "ProviderAuthMethod" })
export const providerAuthSchema = z.record(z.string(), z.array(providerAuthMethodSchema))
export const providerAuthorizationSchema = z.object({ url: z.string(), method: z.enum(["auto", "code"]), instructions: z.string(), methodID: z.string(), attemptID: z.string(), expiresAt: z.number() }).meta({ id: "ProviderAuthAuthorization" })
export const providerAuthAnswersSchema = z.record(z.string(), z.union([z.string(), z.array(z.string()), z.number(), z.boolean()]))
export const providerOAuthStartSchema = z.object({ methodID: z.string().min(1), answers: providerAuthAnswersSchema.optional() })
export const providerOAuthAttemptSchema = z.object({ attemptID: z.string().min(1), methodID: z.string().optional(), code: z.string().optional() })

export type ProviderModel = z.infer<typeof providerModelSchema>
export type ProviderInfo = z.infer<typeof providerSchema>
export type ProviderList = z.infer<typeof providerListSchema>
export type ProviderAuthMethods = z.infer<typeof providerAuthSchema>
export type ProviderAuthorization = z.infer<typeof providerAuthorizationSchema>
export type ProviderAuthAnswers = z.infer<typeof providerAuthAnswersSchema>
export type ProviderOAuthStart = z.infer<typeof providerOAuthStartSchema>
export type ProviderOAuthAttempt = z.infer<typeof providerOAuthAttemptSchema>

export interface Providers {
  catalog(directory: string): Promise<ProviderList>
  defaultModel(directory: string): Promise<ModelSelection | undefined>
  authMethods(directory: string): Promise<ProviderAuthMethods>
  startOAuth(directory: string, providerID: string, input: ProviderOAuthStart): Promise<ProviderAuthorization>
  completeOAuth(directory: string, providerID: string, input: ProviderOAuthAttempt, signal?: AbortSignal): Promise<void>
  cancelOAuth(directory: string, providerID: string, attemptID: string): Promise<void>
  setKey(directory: string, providerID: string, key: string, answers?: ProviderAuthAnswers): Promise<void>
  removeCredentials(directory: string, providerID: string): Promise<void>
}
