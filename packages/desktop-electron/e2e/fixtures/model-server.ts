import { randomUUID } from "node:crypto"
import { EventEmitter } from "node:events"
import { createServer, type ServerResponse } from "node:http"
import z from "zod"
import { decodeInstruction, scenario, type Instruction } from "../../../buddy/test/helpers/scripted-instruction"

const textPart = z.object({ type: z.string(), text: z.string().optional() }).passthrough()
const message = z.object({
  role: z.string(),
  content: z.union([z.string(), z.array(textPart)]).nullish(),
  tool_call_id: z.string().optional(),
}).passthrough()
const completion = z.object({
  model: z.string(),
  stream: z.literal(true),
  messages: z.array(message),
  tools: z.array(z.object({ function: z.object({ name: z.string() }) }).passthrough()).optional(),
}).passthrough()

function messageText(content: z.infer<typeof message>["content"]): string {
  const parsed = z.string().safeParse(content)
  return parsed.success ? parsed.data : (Array.isArray(content) ? content.flatMap((part) => part.type === "text" && part.text ? [part.text] : []).join("\n") : "")
}

export function uiPrompt(input: Instruction): string {
  return scenario(input).replaceAll("\n", " ")
}

export type ModelRequest = {
  readonly body: z.infer<typeof completion>
  readonly instruction: ReturnType<typeof decodeInstruction>
  readonly text: string
  readonly tools: readonly z.infer<typeof message>[]
}

function makeGate(key: string) {
  const entered = Promise.withResolvers<void>()
  const released = Promise.withResolvers<void>()
  return { key, entered: entered.promise, enter: entered.resolve, release: released.resolve, wait: released.promise }
}

function deltas(text: string): string[] {
  const width = Math.max(1, Math.ceil(text.length / 3))
  return Array.from({ length: Math.max(1, Math.ceil(text.length / width)) }, (_, index) => text.slice(index * width, (index + 1) * width))
}

export async function createModelServer() {
  const requests: ModelRequest[] = []
  const errors: string[] = []
  const events = new EventEmitter()
  const gates = new Map<string, ReturnType<typeof makeGate>>()

  async function play(request: ModelRequest, response: ServerResponse) {
    const id = `chatcmpl-${randomUUID()}`
    const created = Math.floor(Date.now() / 1000)
    const chunk = (delta: { readonly content?: string; readonly role?: "assistant"; readonly tool_calls?: readonly { readonly index: number; readonly id?: string; readonly type?: "function"; readonly function: { readonly name?: string; readonly arguments: string } }[] }, finishReason: "stop" | "tool_calls" | null = null) => {
      if (response.destroyed) return
      const payload = { id, object: "chat.completion.chunk", created, model: request.body.model, choices: [{ index: 0, delta, finish_reason: finishReason }], usage: finishReason ? { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } : null }
      response.write(`data: ${JSON.stringify(payload)}\n\n`)
    }
    const text = (value: string) => { for (const delta of deltas(value)) chunk({ content: delta }) }
    const finish = (reason: "stop" | "tool_calls") => {
      chunk({}, reason)
      if (!response.destroyed) response.end("data: [DONE]\n\n")
    }
    const waitAtGate = async (key: string) => {
      const gate = gates.get(key)
      if (!gate) throw new Error(`Missing scripted gate: ${key}`)
      const closed = Promise.withResolvers<void>()
      const onClose = () => closed.resolve()
      response.once("close", onClose)
      gate.enter()
      try { if (!response.destroyed) await Promise.race([gate.wait, closed.promise]) }
      finally { response.off("close", onClose) }
    }

    response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" })
    response.flushHeaders()
    chunk({ role: "assistant" })
    const input = request.instruction
    if (!input) {
      text("Conformance title.")
      finish("stop")
      return
    }
    if (input.kind === "stream") {
      text(input.text)
      await waitAtGate(input.key)
      finish("stop")
      return
    }
    if (input.kind === "pause" || input.kind === "hold") {
      await waitAtGate(input.key)
      text(input.text)
      finish("stop")
      return
    }
    if ((input.kind === "tool" || input.kind === "read") && request.tools.length > 0) {
      text(`Tool result: ${JSON.stringify(request.tools)}`)
      finish("stop")
      return
    }
    const call = input.kind === "tool" ? { name: input.name, arguments: input.arguments }
      : input.kind === "read" ? { name: "read", arguments: { path: input.path } }
        : undefined
    if (call) {
      if (!request.body.tools?.some((tool) => tool.function.name === call.name)) throw new Error(`Scripted tool is unavailable: ${call.name}`)
      const callID = `call_${randomUUID()}`
      chunk({ tool_calls: [{ index: 0, id: callID, type: "function", function: { name: call.name, arguments: "" } }] })
      for (const delta of deltas(JSON.stringify(call.arguments))) chunk({ tool_calls: [{ index: 0, function: { arguments: delta } }] })
      finish("tool_calls")
      return
    }
    if (input.kind !== "reply") throw new Error(`Instruction is not supported by the UI fixture: ${input.kind}`)
    text(input.text)
    finish("stop")
  }

  const server = createServer((request, response) => {
    void (async () => {
      if (request.method !== "POST" || request.url !== "/v1/chat/completions") {
        throw new Error(`Unexpected model endpoint: ${request.method} ${request.url}`)
      }
      const chunks: Buffer[] = []
      for await (const chunk of request) chunks.push(Buffer.from(chunk))
      const body = completion.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")))
      const userIndex = body.messages.findLastIndex((entry) => entry.role === "user")
      const text = messageText(body.messages[userIndex]?.content)
      const internal = body.tools === undefined && body.messages.some((entry) => entry.role === "system" && messageText(entry.content).includes("You are a title generator."))
      const recorded = { body, text, instruction: internal ? undefined : decodeInstruction(text), tools: body.messages.slice(userIndex + 1).filter((entry) => entry.role === "tool") }
      if (!internal && !recorded.instruction && text.includes("BEGIN_CONFORMANCE")) errors.push(`Scripted instruction did not survive the composer: ${text.slice(0, 200)}`)
      requests.push(recorded)
      events.emit("request", recorded)
      await play(recorded, response)
    })().catch((error: Error) => {
      errors.push(error.message)
      if (!response.headersSent) response.writeHead(400, { "content-type": "application/json" })
      response.end(JSON.stringify({ error: { message: error.message } }))
    })
  })
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => { server.off("error", reject); resolve() })
  })
  const address = server.address()
  if (!address || z.string().safeParse(address).success) throw new Error("Model server did not bind a TCP port")
  const { port } = z.object({ port: z.number() }).parse(address)

  return {
    baseURL: `http://127.0.0.1:${port}/v1`,
    requests,
    gate() {
      const gate = makeGate(randomUUID())
      gates.set(gate.key, gate)
      return { key: gate.key, entered: gate.entered, release: gate.release }
    },
    async waitForRequest(matches: (request: ModelRequest) => boolean, timeout = 30_000): Promise<ModelRequest> {
      const existing = requests.find(matches)
      if (existing) return existing
      const signal = AbortSignal.timeout(timeout)
      return new Promise((resolve, reject) => {
        const cleanup = () => { events.off("request", onRequest); signal.removeEventListener("abort", onAbort) }
        const onRequest = (request: ModelRequest) => { if (matches(request)) { cleanup(); resolve(request) } }
        const onAbort = () => { cleanup(); reject(new Error(`Model request not received; recorded ${requests.length} requests. ${errors.join("; ")}`)) }
        events.on("request", onRequest)
        signal.addEventListener("abort", onAbort, { once: true })
      })
    },
    assertHealthy() { if (errors.length > 0) throw new Error(errors.join("\n")) },
    async close() {
      for (const gate of gates.values()) gate.release()
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve())
        server.closeAllConnections()
      })
    },
  }
}
