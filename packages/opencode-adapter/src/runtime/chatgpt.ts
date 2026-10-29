import z from "zod"
import { ChatGPTReconnectRequired, chatGPTIdentitySchema, chatGPTModelAvailabilitySchema, chatGPTUsageSchema, type ChatGPT } from "@buddy/agent-runtime/chatgpt"
import type { OpenCodeHost } from "../host"
import { toRuntimeError } from "./errors"
import type { OpenCodeRuntimeOptions } from "./options"

const CHATGPT_RPC_ID = "buddy.codex"
const imageSchema = z.object({ base64: z.string().min(1), operation: z.enum(["generate", "edit"]) })
const chatGPTErrorSchema = z.object({ type: z.string(), message: z.string() })

export function createChatGPT(host: OpenCodeHost, _options: OpenCodeRuntimeOptions): ChatGPT {
  async function call(directory: string, method: string, input: z.infer<typeof inputSchema>, signal?: AbortSignal) {
    try {
      return (await host.rpc.call({ location: { directory }, rpcID: CHATGPT_RPC_ID, method, input }, signal ? { signal } : undefined)).output
    } catch (cause) {
      const error = chatGPTErrorSchema.safeParse(cause)
      if (error.success && error.data.type === "chatgpt.reconnect_required") throw new ChatGPTReconnectRequired()
      if (error.success && error.data.type === "chatgpt.request_failed") throw toRuntimeError(new Error(error.data.message))
      throw toRuntimeError(cause)
    }
  }

  return {
    async identity(directory) {
      return chatGPTIdentitySchema.parse(await call(directory, "identity", {}))
    },
    async models(directory, input) {
      return chatGPTModelAvailabilitySchema.parse(await call(directory, "models", { refresh: input.refresh }))
    },
    async usage(directory, input) {
      return chatGPTUsageSchema.parse(await call(directory, "usage", { refresh: input.refresh }))
    },
    async image(directory, request) {
      return imageSchema.parse(await call(directory, "image", { prompt: request.prompt, imageDataUrls: [...request.imageDataUrls] }, request.signal))
    },
  }
}

const inputSchema = z.union([
  z.object({}),
  z.object({ refresh: z.boolean() }),
  z.object({ prompt: z.string(), imageDataUrls: z.array(z.string()) }),
])
