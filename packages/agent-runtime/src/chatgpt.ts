import z from "zod"

const usageWindowResponseSchema = z.object({
  usedPercent: z.number(),
  resetsAt: z.string(),
  windowSeconds: z.number(),
})

const usageRateLimitResponseSchema = z.object({
  primary: usageWindowResponseSchema.nullable(),
  secondary: usageWindowResponseSchema.nullable(),
})

const usageAdditionalRateLimitResponseSchema = z.object({
  name: z.string().nullable(),
  meteredFeature: z.string().nullable(),
  rateLimit: usageRateLimitResponseSchema,
})

const usageCreditsResponseSchema = z.object({
  hasCredits: z.boolean(),
  unlimited: z.boolean(),
  balance: z.number().nullable(),
})

export const chatGPTModelAvailabilitySchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("not_connected"),
  }),
  z.object({
    status: z.literal("loading"),
  }),
  z.object({
    status: z.literal("ready"),
    modelIDs: z.array(z.string()),
    fetchedAt: z.string(),
    refreshing: z.boolean(),
  }),
  z.object({
    status: z.literal("error"),
  }),
  z.object({
    status: z.literal("reconnect_required"),
  }),
])

export const chatGPTUsageSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("not_connected"),
  }),
  z.object({
    status: z.literal("ready"),
    plan: z.string().nullable(),
    rateLimit: usageRateLimitResponseSchema,
    additionalRateLimits: z.array(usageAdditionalRateLimitResponseSchema),
    credits: usageCreditsResponseSchema.nullable(),
    fetchedAt: z.string(),
  }),
  z.object({
    status: z.literal("error"),
  }),
  z.object({
    status: z.literal("reconnect_required"),
  }),
])

export const chatGPTIdentitySchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("not_connected") }),
  z.object({ status: z.literal("ready"), email: z.email() }),
  z.object({ status: z.literal("unavailable") }),
])

export type ChatGPTModelAvailability = z.infer<typeof chatGPTModelAvailabilitySchema>
export type ChatGPTUsage = z.infer<typeof chatGPTUsageSchema>
export type ChatGPTIdentity = z.infer<typeof chatGPTIdentitySchema>

export type ChatGPTAuth = {
  readonly access: string
  readonly refresh: string
  readonly expires: number
  readonly accountId?: string
  readonly credentialID?: string
}

export class ChatGPTReconnectRequired extends Error {
  readonly _tag = "ChatGPTReconnectRequired"

  constructor() {
    super("ChatGPT authentication requires reconnection")
    this.name = "ChatGPTReconnectRequired"
  }
}

export type ChatGPTImageRequest = {
  readonly prompt: string
  readonly imageDataUrls: readonly string[]
  readonly signal?: AbortSignal
}

export type ChatGPTImage = {
  readonly base64: string
  readonly operation: "generate" | "edit"
}

export type ChatGPTAccountModel = {
  readonly id: string
  readonly name?: string
  readonly contextWindow?: number
  readonly maxOutputTokens?: number
  readonly inputModalities?: readonly string[]
  readonly reasoningEfforts?: readonly string[]
  readonly reasoningSummary?: boolean
}

export interface ChatGPT {
  identity(directory: string): Promise<ChatGPTIdentity>
  models(directory: string, input: { readonly refresh: boolean }): Promise<ChatGPTModelAvailability>
  usage(directory: string, input: { readonly refresh: boolean }): Promise<ChatGPTUsage>
  image(directory: string, request: ChatGPTImageRequest): Promise<ChatGPTImage>
}

export interface ChatGPTCredentials {
  resolve(): Promise<ChatGPTAuth | undefined>
  reject(auth: ChatGPTAuth): Promise<void>
}

export interface ChatGPTAccountService {
  identity(): Promise<ChatGPTIdentity>
  models(input: { readonly refresh: boolean }): Promise<ChatGPTModelAvailability>
  usage(input: { readonly refresh: boolean }): Promise<ChatGPTUsage>
  image(request: ChatGPTImageRequest & { readonly signal: AbortSignal }): Promise<ChatGPTImage>
  accountModels(signal: AbortSignal): Promise<readonly ChatGPTAccountModel[] | undefined>
  credentialSwitched(): Promise<void>
}
