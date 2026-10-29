import type { ServerWebSocket } from "bun"
import z from "zod"

type ProviderPayload = z.infer<ReturnType<typeof z.json>>

export function createToolInputProvider(input: { tool: string; chunks: readonly string[]; transport: "http" | "websocket" }) {
  const entered = Promise.withResolvers<void>()
  const released = Promise.withResolvers<void>()
  const encoder = new TextEncoder()
  const callID = "call_runner"
  const itemID = "fc_wire"
  const raw = input.chunks.join("")
  const requests = z.object({
    messages: z.array(z.object({ role: z.string() })),
    tools: z.array(z.object({ function: z.object({ name: z.string() }) })).optional(),
  })
  const exchanges = new WeakSet<ServerWebSocket<undefined>>()
  const server = Bun.serve<undefined>({
    hostname: "127.0.0.1", port: 0,
    async fetch(request, server) {
      if (input.transport === "websocket" && server.upgrade(request, { data: undefined })) return
      if (input.transport === "websocket") return new Response("Unexpected HTTP", { status: 500 })
      const body = requests.parse(await request.json())
      const toolCall = body.tools?.some((tool) => tool.function.name === input.tool) && !body.messages.some((message) => message.role === "tool")
      const response = new ReadableStream<Uint8Array>({ async start(controller) {
        const send = (delta: ProviderPayload, finish_reason: string | null = null) => controller.enqueue(encoder.encode(`data: ${JSON.stringify({ id: "chat_fixture", object: "chat.completion.chunk", created: 1, model: "chat", choices: [{ index: 0, delta, finish_reason }] })}\n\n`))
        const release = () => released.resolve()
        request.signal.addEventListener("abort", release, { once: true })
        try {
          if (toolCall) {
            send({ role: "assistant", tool_calls: [{ index: 0, id: callID, type: "function", function: { name: input.tool, arguments: "" } }] })
            send({ tool_calls: [{ index: 0, function: { arguments: input.chunks[0] ?? "" } }] })
            entered.resolve()
            await released.promise
            if (request.signal.aborted) return
            for (const chunk of input.chunks.slice(1)) send({ tool_calls: [{ index: 0, function: { arguments: chunk } }] })
            send({}, "tool_calls")
          } else {
            send({ role: "assistant", content: "Fixture complete." })
            send({}, "stop")
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"))
          controller.close()
        } finally { request.signal.removeEventListener("abort", release) }
      } })
      return new Response(response, { headers: { "content-type": "text/event-stream" } })
    },
    websocket: {
      async message(socket) {
        const response = { id: "resp_fixture", output: [], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } }
        const send = (event: ProviderPayload) => socket.send(JSON.stringify(event))
        send({ type: "response.created", response })
        if (!exchanges.has(socket)) {
          exchanges.add(socket)
          const item = { id: itemID, type: "function_call", call_id: callID, name: input.tool, arguments: "" }
          send({ type: "response.output_item.added", output_index: 0, item })
          send({ type: "response.function_call_arguments.delta", item_id: itemID, output_index: 0, delta: input.chunks[0] ?? "" })
          entered.resolve()
          await released.promise
          for (const delta of input.chunks.slice(1)) send({ type: "response.function_call_arguments.delta", item_id: itemID, output_index: 0, delta })
          const done = { ...item, arguments: raw }
          send({ type: "response.output_item.done", output_index: 0, item: done })
          send({ type: "response.completed", response: { ...response, output: [done] } })
        } else {
          const item = { id: "msg_wire", type: "message", role: "assistant", content: [{ type: "output_text", text: "Fixture complete." }] }
          send({ type: "response.output_item.added", output_index: 0, item: { ...item, content: [] } })
          send({ type: "response.output_text.delta", item_id: item.id, output_index: 0, delta: "Fixture complete." })
          send({ type: "response.output_item.done", output_index: 0, item })
          send({ type: "response.completed", response: { ...response, output: [item] } })
        }
      },
      close() { released.resolve() },
    },
  })
  return {
    callID, itemID, entered: entered.promise, release: () => released.resolve(),
    config: {
      model: "wire/chat", small_model: "wire/chat", permission: { "*": "allow" },
      provider: { wire: { npm: input.transport === "http" ? "@ai-sdk/openai-compatible" : "@ai-sdk/openai", options: {
        apiKey: "loopback-fixture", baseURL: `http://127.0.0.1:${server.port}/v1`, transport: input.transport,
      }, models: { chat: { name: "Loopback Chat", tool_call: true, limit: { context: 100_000, input: 90_000, output: 1_000 } } } } },
    },
    [Symbol.dispose]() { released.resolve(); server.stop(true) },
  }
}
