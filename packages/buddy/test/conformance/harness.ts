import { runtimeHost } from "../helpers/opencode"
import type { RuntimeExtension } from "@buddy/agent-runtime/extension"
import { startOpenCodeRuntime } from "@buddy/opencode-adapter/runtime"
import type { OpenCodeEvent } from "@buddy/opencode-adapter/host"
import fs from "node:fs/promises"
import path from "node:path"
import { Schema } from "effect"
import z from "zod"
import { Plugin, ToolError, type AISDKHooks } from "@buddy/opencode-adapter/plugin"
import { BuddyEvent, TranscriptEvent } from "@buddy/transcript-contract/event"
import { MessageWithParts } from "@buddy/transcript-contract/message"
import { PermissionRequest, SavedPermission } from "@buddy/transcript-contract/permission"
import { Session, SessionCreate, SessionStatus } from "@buddy/transcript-contract/session"
import { app } from "../../src/app"
import { getAgentRuntime, closeAgentRuntime } from "../../src/runtime/agent-runtime"
import { createBuddyRuntimeExtension } from "../../src/runtime/buddy-extension"
import { openCodeRuntimeEnvironment } from "../../src/runtime/runtime-paths"
import { readOpenCodeHostConfig } from "../../src/config/runtime/notebook-runtime-plan"
import { initializeBenchCaptureStorage } from "../../src/learning/features/bench/captures"
import { tmpdir } from "../helpers/tmpdir"
import { decodeInstruction } from "../helpers/scripted-instruction"
export { scenario } from "../helpers/scripted-instruction"

type LanguageModel = NonNullable<AISDKHooks["language"]["language"]>
type ModelInput = Parameters<LanguageModel["doStream"]>[0]
type StreamPart = Awaited<ReturnType<LanguageModel["doStream"]>>["stream"] extends ReadableStream<infer Part> ? Part : never
const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } }
const question = z.object({ id: z.string(), sessionID: z.string(), questions: z.array(z.object({ header: z.string(), question: z.string(), options: z.array(z.object({ label: z.string(), description: z.string() })), multiple: z.boolean().optional(), custom: z.boolean().optional() })) })

function makeGate() {
  const entered = Promise.withResolvers<void>()
  const released = Promise.withResolvers<void>()
  return { entered: entered.promise, enter: () => entered.resolve(), release: () => released.resolve(), wait: released.promise }
}

function readInstruction(request: ModelInput) {
  const userIndex = request.prompt.findLastIndex((message) => message.role === "user")
  const user = request.prompt[userIndex]
  const text = user?.role === "user" ? user.content.flatMap((part) => part.type === "text" ? [part.text] : []).join("\n") : ""
  return { text, input: decodeInstruction(text), tools: request.prompt.slice(userIndex + 1).filter((message) => message.role === "tool") }
}

function finish(reason: "stop" | "tool-calls"): StreamPart {
  return { type: "finish", finishReason: { unified: reason, raw: reason }, usage }
}

function textParts(text: string): StreamPart[] {
  const middle = Math.floor(text.length / 2)
  return [{ type: "text-start", id: "answer" }, { type: "text-delta", id: "answer", delta: text.slice(0, middle) }, { type: "text-delta", id: "answer", delta: text.slice(middle) }, { type: "text-end", id: "answer" }]
}

async function waitAtGate(gates: ReadonlyMap<string, ReturnType<typeof makeGate>>, key: string, signal?: AbortSignal) {
  const gate = gates.get(key)
  if (!gate) throw new Error(`Missing scripted gate: ${key}`)
  gate.enter()
  if (signal?.aborted) return
  const aborted = Promise.withResolvers<void>()
  const onAbort = () => aborted.resolve()
  signal?.addEventListener("abort", onAbort, { once: true })
  try { await Promise.race([gate.wait, aborted.promise]) } finally { signal?.removeEventListener("abort", onAbort) }
}

type HarnessToolResult = {
  readonly name: string
  readonly parts: readonly (
    | { readonly type: "text"; readonly text: string }
    | { readonly type: "file"; readonly filename?: string; readonly mime: string; readonly url: string }
  )[]
  readonly error?: string
}

function modelPlugin(gates: ReadonlyMap<string, ReturnType<typeof makeGate>>, toolResults: readonly HarnessToolResult[] = [], observe?: (request: ModelInput) => void) {
  return Plugin.define({ id: "buddy.test.conformance-runtime", async setup(ctx) {
    await ctx.tool.transform((editor) => editor.add({
      name: "conformance_pause", description: "Wait for the local scripted fixture.",
      input: { type: "object", properties: { key: { type: "string" } }, required: ["key"], additionalProperties: false },
      options: { codemode: false },
      async execute(raw, context) {
        const { key } = z.object({ key: z.string() }).parse(raw)
        await waitAtGate(gates, key, context.signal)
        return { content: "Pause released." }
      },
    }))
    for (const result of toolResults) {
      await ctx.tool.transform((editor) => editor.add({
        name: result.name, description: "Return local transcript evidence.",
        input: { type: "object", properties: {}, additionalProperties: false },
        options: { codemode: false },
        async execute() {
          if (result.error) throw new ToolError({ message: result.error })
          return { content: result.parts.map((part) => part.type === "text" ? part : { type: "file" as const, name: part.filename, mime: part.mime, uri: part.url }) }
        },
      }))
    }
    await ctx.aisdk.hook("language", (event) => {
      event.language = {
        specificationVersion: "v3", provider: "buddy-conformance", modelId: "chat", supportedUrls: {},
        async doGenerate() { throw new Error("Unexpected non-streaming model request") },
        async doStream(request) {
          observe?.(request)
          const { input, tools, text } = readInstruction(request)
          if (input?.kind === "hold") await waitAtGate(gates, input.key, request.abortSignal)
          if (input?.kind === "stream") return { stream: new ReadableStream<StreamPart>({ async start(controller) {
            controller.enqueue({ type: "text-start", id: "answer" })
            controller.enqueue({ type: "text-delta", id: "answer", delta: input.text })
            await waitAtGate(gates, input.key, request.abortSignal)
            if (request.abortSignal?.aborted) return
            controller.enqueue({ type: "text-end", id: "answer" })
            controller.enqueue(finish("stop"))
            controller.close()
          } }) }
          let call: { name: string; input: object } | undefined
          let answer = input?.kind === "reply" || input?.kind === "pause" || input?.kind === "hold" ? input.text : "Conformance title."
          if (input?.kind === "command") answer = text.includes("Expanded conformance command:") ? input.text : "Command template was not expanded"
          if (!input && request.tools !== undefined) answer = `Observed completion: ${JSON.stringify(request.prompt.at(-1))}`
          if (input?.kind === "catalog") {
            const name = input.access === "allowed" ? "read" : "shell"
            answer = request.tools?.some((tool) => tool.type === "function" && tool.name === name) ? "Tool available" : "Tool hidden"
          }
          if (tools.length > 0) answer = input?.kind === "pause" ? input.text : `Tool result: ${JSON.stringify(tools)}`
          else if (input?.kind === "pause") call = { name: "conformance_pause", input: { key: input.key } }
          else if (input?.kind === "tool") call = { name: input.name, input: input.arguments }
          else if (input?.kind === "read") call = { name: "read", input: { path: input.path } }
          else if (input?.kind === "question") call = { name: "question", input: { questions: [
            { header: "Format", question: "Which format?", options: [{ label: "PDF", description: "Portable document" }, { label: "Text", description: "Plain text" }] },
            { header: "Extras", question: "Which extras?", options: [{ label: "Notes", description: "Include notes" }, { label: "Images", description: "Include images" }], multiple: true },
          ] } }
          else if (input?.kind === "delegate") call = { name: "subagent", input: { agent: input.role, description: "Conformance worker", prompt: input.prompt, background: input.background ?? false } }
          const parts: StreamPart[] = call ? [
            ...textParts("Working on the request."),
            { type: "tool-input-start", id: "scripted-call", toolName: call.name },
            { type: "tool-input-delta", id: "scripted-call", delta: JSON.stringify(call.input) },
            { type: "tool-input-end", id: "scripted-call" },
            { type: "tool-call", toolCallId: "scripted-call", toolName: call.name, input: JSON.stringify(call.input) }, finish("tool-calls"),
          ] : [...textParts(answer), finish("stop")]
          return { stream: new ReadableStream<StreamPart>({ start(controller) { for (const part of parts) controller.enqueue(part); controller.close() } }) }
        },
      }
    }, { providerID: "conformance" })
  } })
}

export const patchModel = { providerID: "conformance", modelID: "gpt-5-conformance" }

type PermissionAction = "allow" | "ask" | "deny"

export async function createRuntimeHarness(input?: { readonly directory?: string; readonly toolResults?: readonly HarnessToolResult[]; readonly permission?: Readonly<Record<string, PermissionAction>> }) {
  if (!process.env.BUDDY_TEST_XDG_ROOT) throw new Error("Conformance tests require the isolated Buddy preload")
  const permission = { "*": "allow", external_directory: "ask", bash: "deny", ...input?.permission } satisfies Readonly<Record<string, PermissionAction>>
  const notebook = await tmpdir({ config: {
    model: "conformance/chat",
    provider: { conformance: { npm: "@ai-sdk/perplexity", options: { apiKey: "local-script" }, models: { chat: {}, [patchModel.modelID]: {} } } },
    permission,
    agent: { "conformance-runner": { options: {}, mode: "primary", prompt: "Follow the scripted instruction.", permission } },
  } })
  const directory = input?.directory ?? notebook.path
  const gates = new Map<string, ReturnType<typeof makeGate>>()
  const outsideFile = path.join(path.dirname(directory), `${path.basename(directory)}-external.txt`)
  try {
    if (input?.directory) await fs.cp(path.join(notebook.path, ".buddy"), path.join(directory, ".buddy"), { recursive: true })
    await fs.writeFile(outsideFile, "External fixture contents")
    await fs.writeFile(path.join(directory, "opencode.json"), JSON.stringify({ command: { conformance: { template: "Expanded conformance command: $ARGUMENTS" } } }))
    let host = runtimeHost(await getAgentRuntime())
    await host.plugin(modelPlugin(gates, input?.toolResults))
    async function request(route: string, init: RequestInit = {}) {
      const headers = new Headers(init.headers)
      headers.set("x-buddy-directory", directory)
      if (init.body !== undefined) headers.set("content-type", "application/json")
      return app.request(`/api${route}`, { ...init, headers, signal: init.signal ?? AbortSignal.timeout(10_000) })
    }
    async function json(route: string, init: RequestInit = {}) {
      const response = await request(route, init)
      if (!response.ok) throw new Error(`${init.method ?? "GET"} ${route}: ${response.status} ${await response.text()}`)
      const data: unknown = await response.json()
      return data
    }
    async function messages(sessionID: string, query = "") {
      return Schema.decodeUnknownSync(Schema.Array(MessageWithParts))(await json(`/session/${sessionID}/message${query}`))
    }
    return {
      directory, outsideFile, request, json, messages,
      async create(input: typeof SessionCreate.Type = {}) {
        return Schema.decodeUnknownSync(Session)(await json("/session", { method: "POST", body: JSON.stringify({ title: "Conformance conversation", agent: "conformance-runner", ...input }) }))
      },
      async seedTextConversation(input: { readonly title: string; readonly text: string; readonly contextText?: string }) {
        const session = await host.session.create({ title: input.title, location: { directory } })
        const messageID = `msg_${crypto.randomUUID()}`
        await host.session.remove({ sessionID: session.id })
        await host.session.import({
          info: session, location: { directory },
          messages: [
            { id: messageID, type: "user", text: input.text, time: { created: 1 } },
            ...(input.contextText === undefined ? [] : [{ id: `msg_${crypto.randomUUID()}`, type: "synthetic" as const, text: input.contextText, time: { created: 2 } }]),
          ],
        })
        return { sessionID: session.id, messageID }
      },
      async session(sessionID: string) { return Schema.decodeUnknownSync(Session)(await json(`/session/${sessionID}`)) },
      async sessions(query = "") { return Schema.decodeUnknownSync(Schema.Array(Session))(await json(`/session${query}`)) },
      async children(sessionID: string) { return Schema.decodeUnknownSync(Schema.Array(Session))(await json(`/session/${sessionID}/children`)) },
      async prompt(sessionID: string, content: string, options: { delivery?: "queue" | "steer"; noReply?: boolean; messageID?: string; agent?: string; model?: typeof patchModel } = {}) {
        return request(`/session/${sessionID}/message`, { method: "POST", body: JSON.stringify({ agent: "conformance-runner", content, ...options }) })
      },
      async promptAsync(sessionID: string, content: string, options: { delivery?: "queue" | "steer"; messageID?: string; agent?: string; model?: typeof patchModel } = {}) {
        const response = await request(`/session/${sessionID}/prompt_async`, { method: "POST", body: JSON.stringify({ agent: "conformance-runner", content, ...options }) })
        if (response.status !== 204) throw new Error(`Prompt admission: ${response.status} ${await response.text()}`)
        return response
      },
      async statuses() { return Schema.decodeUnknownSync(Schema.Record(Schema.String, SessionStatus))(await json("/session/status")) },
      async permissions(sessionID: string) { return Schema.decodeUnknownSync(Schema.Array(PermissionRequest))(await json(`/permission?sessionID=${sessionID}`)) },
      async savedPermissions() { return Schema.decodeUnknownSync(Schema.Array(SavedPermission))(await json("/permission/saved")) },
      async questions() { return z.array(question).parse(await json("/question")) },
      async restart() {
        await closeAgentRuntime()
        host = runtimeHost(await getAgentRuntime())
        await host.plugin(modelPlugin(gates, input?.toolResults))
      },
      gate() {
        const key = crypto.randomUUID()
        const gate = makeGate()
        gates.set(key, gate)
        return { key, entered: gate.entered, release: gate.release }
      },
      async events() {
        const response = await request("/event")
        if (response.status !== 200 || !response.headers.get("content-type")?.includes("text/event-stream") || !response.body) throw new Error(`SSE connection failed: ${response.status}`)
        const reader = response.body.getReader()
        const seen: BuddyEvent[] = []
        const decoder = new TextDecoder()
        let buffer = ""
        async function next() {
          while (true) {
            const boundary = buffer.indexOf("\n\n")
            if (boundary >= 0) {
              const frame = buffer.slice(0, boundary)
              buffer = buffer.slice(boundary + 2)
              const data = frame.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n")
              if (!data) continue
              const event = Schema.decodeUnknownSync(BuddyEvent)(JSON.parse(data))
              seen.push(event)
              return event
            }
            const read = await reader.read()
            if (read.done) throw new Error(`SSE ended before expected event; received ${JSON.stringify(seen.map((event) => event.payload))}`)
            buffer += decoder.decode(read.value, { stream: true })
          }
        }
        const stream = {
          seen,
          async until(matches: (event: BuddyEvent) => boolean) {
            while (true) { const event = await next(); if (matches(event)) return event }
          },
          async idle(sessionID: string) {
            return stream.until((event) => event.payload.type === "session.status" && event.payload.properties.sessionID === sessionID && Schema.decodeUnknownSync(SessionStatus)(event.payload.properties.status).type === "idle")
          },
          async [Symbol.asyncDispose]() { await reader.cancel() },
        }
        await stream.until((event) => event.payload.type === "server.connected")
        return stream
      },
      async [Symbol.asyncDispose]() {
        for (const gate of gates.values()) gate.release()
        gates.clear()
        try {
          const sessions = Schema.decodeUnknownSync(Schema.Array(Session))(await json(`/session?directory=${encodeURIComponent(directory)}`))
          for (const session of sessions.filter((entry) => entry.parentID === undefined)) {
            const response = await request(`/session/${session.id}`, { method: "DELETE" })
            if (!response.ok) throw new Error(`Conversation cleanup failed: ${response.status} ${await response.text()}`)
          }
        } finally {
          try { await closeAgentRuntime() } finally { await fs.rm(outsideFile, { force: true }); await notebook[Symbol.asyncDispose]() }
        }
      },
    }
  } catch (error) {
    await closeAgentRuntime()
    await fs.rm(outsideFile, { force: true })
    await notebook[Symbol.asyncDispose]()
    throw error
  }
}

export function transcript(event: BuddyEvent) {
  return Schema.decodeUnknownSync(TranscriptEvent)(event.payload)
}

type TranscriptMessage = typeof MessageWithParts.Type
type TranscriptPart = TranscriptMessage["parts"][number]

function compareMessages(left: TranscriptMessage["info"], right: TranscriptMessage["info"]) {
  if (left.time.created !== right.time.created) return left.time.created - right.time.created
  const leftKey = left.order ?? left.id
  const rightKey = right.order ?? right.id
  return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0
}

function compareParts(left: TranscriptPart, right: TranscriptPart) {
  if (left.position !== undefined && right.position !== undefined && left.position !== right.position) return left.position - right.position
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
}

export function liveTranscript(seen: readonly BuddyEvent[], sessionID: string, base: readonly TranscriptMessage[] = []): TranscriptMessage[] {
  const infos = new Map(base.map((message) => [message.info.id, message.info]))
  const parts = new Map(base.map((message) => [message.info.id, new Map(message.parts.map((part) => [part.id, part]))]))
  const partsOf = (messageID: string) => {
    const existing = parts.get(messageID)
    if (existing) return existing
    const created = new Map<string, TranscriptPart>()
    parts.set(messageID, created)
    return created
  }
  for (const event of seen) {
    if (!event.payload.type.startsWith("message.")) continue
    const change = transcript(event)
    if (change.type === "message.updated") {
      if (change.properties.info.sessionID === sessionID) infos.set(change.properties.info.id, change.properties.info)
    } else if (change.type === "message.removed") {
      if (change.properties.sessionID !== sessionID) continue
      infos.delete(change.properties.messageID)
      parts.delete(change.properties.messageID)
    } else if (change.type === "message.part.updated") {
      if (change.properties.part.sessionID === sessionID) partsOf(change.properties.part.messageID).set(change.properties.part.id, change.properties.part)
    } else if (change.type === "message.part.removed") {
      if (change.properties.sessionID === sessionID) parts.get(change.properties.messageID)?.delete(change.properties.partID)
    } else if (change.type === "message.part.delta" && change.properties.sessionID === sessionID) {
      const target = parts.get(change.properties.messageID)
      const part = target?.get(change.properties.partID)
      if (!target || !part) throw new Error(`Delta arrived before its part: ${change.properties.partID}`)
      if (change.properties.field !== "text" || !("text" in part)) throw new Error(`Unexpected ${change.properties.field} delta for a ${part.type} part`)
      target.set(part.id, { ...part, text: `${part.text}${change.properties.delta}` })
    }
  }
  return [...infos.values()].toSorted(compareMessages).map((info) => ({ info, parts: [...(parts.get(info.id)?.values() ?? [])].toSorted(compareParts) }))
}

export function messageText(message: typeof MessageWithParts.Type): string {
  return message.parts.flatMap((part) => part.type === "text" ? [part.text] : []).join("")
}

export async function createRuntimeGuaranteesHarness(input: { readonly extension?: (buddy: RuntimeExtension) => RuntimeExtension } = {}) {
  if (!process.env.BUDDY_TEST_XDG_ROOT) throw new Error("Conformance tests require the isolated Buddy preload")
  const notebook = await tmpdir({ config: {
    model: "conformance/chat", small_model: "conformance/chat", compaction: { auto: false }, learner_memory: { enabled: false },
    provider: { conformance: { npm: "@ai-sdk/perplexity", options: { apiKey: "local-script" }, models: { chat: {} } } },
    permission: { "*": "allow", bash: "deny" },
    agent: { "conformance-runner": { options: {}, mode: "primary", permission: { "*": "allow", bash: "deny" }, prompt: "Instructions from: /conformance/CLAUDE.md\nconformance-excluded-instruction\nInstructions from: conformance-chat-rules\nconformance-kept-instruction\nFollow the scripted instruction." } },
  } })
  const directory = notebook.path
  const gates = new Map<string, ReturnType<typeof makeGate>>()
  const requests: { readonly text: string; readonly system: string }[] = []
  const buddy = createBuddyRuntimeExtension()
  const extension = input.extension?.(buddy) ?? buddy
  let started: Awaited<ReturnType<typeof startOpenCodeRuntime>> | undefined
  function current() {
    if (!started) throw new Error("The conformance runtime is closed")
    return started.runtime
  }
  async function close() {
    const previous = started
    started = undefined
    await previous?.close()
  }
  async function start() {
    started = await startOpenCodeRuntime({
      environment: openCodeRuntimeEnvironment(), extension,
      initializeStorage: initializeBenchCaptureStorage, hostConfig: readOpenCodeHostConfig,
    })
    await runtimeHost(current()).plugin(modelPlugin(gates, [], (request) => requests.push({
      text: readInstruction(request).text,
      system: request.prompt.flatMap((message) => message.role === "system" ? [message.content] : []).join("\n"),
    })))
  }
  try {
    await start()
    return {
      directory, requests, close,
      create: () => current().conversations.create(directory, { title: "Runtime guarantee", agent: "conformance-runner" }),
      prompt: (sessionID: string, text: string) => current().execution.prompt({ sessionID, text, agent: "conformance-runner" }, { directory, signal: AbortSignal.timeout(10_000) }),
      messages: async (sessionID: string) => (await current().conversations.history({ sessionID, directory })).items,
      async restart() { await close(); await start() },
      gate() {
        const key = crypto.randomUUID()
        const gate = makeGate()
        gates.set(key, gate)
        return { key, entered: gate.entered, release: gate.release }
      },
      async events() {
        const controller = new AbortController()
        const events = runtimeHost(current()).event.subscribe({ signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]) })[Symbol.asyncIterator]()
        async function until(matches: (event: OpenCodeEvent) => boolean) {
          for (;;) {
            const next = await events.next()
            if (next.done) throw new Error("Runtime events ended before the expected outcome")
            if (matches(next.value)) return next.value
          }
        }
        await until((event) => event.type === "server.connected")
        return {
          until,
          async finished(sessionID: string) {
            const event = await until((event) => (event.type === "session.execution.succeeded" || event.type === "session.execution.failed") && event.data.sessionID === sessionID)
            if (event.type !== "session.execution.succeeded" && event.type !== "session.execution.failed") throw new Error("Missing resumed execution outcome")
            return event
          },
          async [Symbol.asyncDispose]() { controller.abort(); await events.return?.() },
        }
      },
      async [Symbol.asyncDispose]() {
        for (const gate of gates.values()) gate.release()
        try { await close() } finally { await notebook[Symbol.asyncDispose]() }
      },
    }
  } catch (cause) {
    try { await close() } finally { await notebook[Symbol.asyncDispose]() }
    throw cause
  }
}
