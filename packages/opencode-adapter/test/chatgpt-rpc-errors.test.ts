import { expect, test } from "bun:test"
import { ChatGPTReconnectRequired } from "@buddy/agent-runtime/chatgpt"
import { OpenCode } from "@opencode/client"
import * as ChatGPTExtension from "../src/extension/chatgpt"
import type { OpenCodeHost } from "../src/host"
import { createChatGPT } from "../src/runtime/chatgpt"

const failureMessage = 'Codex image generate request failed: 403 {"detail":"Forbidden"}'

function errorContext(signal = new AbortController().signal) {
  const errors: { type: string; message: string; data: Record<string, never> }[] = []
  const returned = Symbol("declared error")
  return {
    errors,
    returned,
    context: {
      signal,
      error(type: string, message: string, data: Record<string, never>) {
        errors.push({ type, message, data })
        return returned
      },
    },
  }
}

function rejectingHost(cause: { type: string; message: string }): OpenCodeHost {
  const client = OpenCode.make({ baseUrl: "http://chatgpt.test" })
  return {
    ...client,
    sessions: client.session,
    events: client.event,
    plugin: Object.assign(async () => {}, client.plugin),
    async close() {},
    async [Symbol.asyncDispose]() {},
    rpc: Object.assign(client.rpc, {
      async call() {
        throw cause
      },
    }),
  }
}

test("ChatGPT handlers return the upstream request failure as a declared error", async () => {
  const { context, errors, returned } = errorContext()

  const result = await ChatGPTExtension.returnChatGPTError(context, async () => {
    throw new Error(failureMessage)
  })

  expect(result).toBe(returned)
  expect(errors).toEqual([{ type: "chatgpt.request_failed", message: failureMessage, data: {} }])
})

test("ChatGPT handlers return a reconnect requirement as a declared error", async () => {
  const { context, errors, returned } = errorContext()
  const error = new ChatGPTReconnectRequired()

  const result = await ChatGPTExtension.returnChatGPTError(context, async () => {
    throw error
  })

  expect(result).toBe(returned)
  expect(errors).toEqual([{ type: "chatgpt.reconnect_required", message: "ChatGPT authentication requires reconnection", data: {} }])
})

test("an aborted ChatGPT call rethrows its original error", async () => {
  const { context, errors } = errorContext(AbortSignal.abort())
  const error = new Error("Image request aborted")

  await expect(ChatGPTExtension.returnChatGPTError(context, async () => {
    throw error
  })).rejects.toBe(error)
  expect(errors).toEqual([])
})

test("ChatGPT image requests preserve the declared upstream failure message", async () => {
  const chatgpt = createChatGPT(rejectingHost({ type: "chatgpt.request_failed", message: failureMessage }), {})

  await expect(chatgpt.image("/workspace", { prompt: "Draw a tree", imageDataUrls: [] })).rejects.toThrow(failureMessage)
})

test("ChatGPT image requests restore the reconnect required error", async () => {
  const chatgpt = createChatGPT(rejectingHost({ type: "chatgpt.reconnect_required", message: "x" }), {})

  await expect(chatgpt.image("/workspace", { prompt: "Draw a tree", imageDataUrls: [] })).rejects.toBeInstanceOf(ChatGPTReconnectRequired)
})
