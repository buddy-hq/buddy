import z from "zod"

type ToolCall = { callID: string; name: string }
type ToolInputDelta = { callID: string; delta: string }
type ChatCall = { id: string; name: string }
type PendingChatCall = { id: string | undefined; name: string | undefined; fragments: string[] }

const wireEvent = z.union([
  z.object({ type: z.literal("response.created") }),
  z.object({ type: z.literal("response.output_item.added"), output_index: z.number().optional(), item: z.object({ type: z.literal("function_call"), id: z.string().optional(), call_id: z.string(), name: z.string(), arguments: z.string().optional() }) }),
  z.object({ type: z.literal("response.function_call_arguments.delta"), item_id: z.string().optional(), output_index: z.number().optional(), delta: z.string() }),
  z.object({ type: z.literal("content_block_start"), index: z.number(), content_block: z.object({ type: z.literal("tool_use"), id: z.string(), name: z.string() }) }),
  z.object({ type: z.literal("content_block_delta"), index: z.number(), delta: z.object({ type: z.literal("input_json_delta"), partial_json: z.string() }) }),
  z.object({ choices: z.array(z.object({ delta: z.object({ tool_calls: z.array(z.object({ index: z.number().nullish(), id: z.string().nullish(), function: z.object({ name: z.string().nullish(), arguments: z.string().nullish() }).nullish() })).nullish() }).nullish() })) }),
])

function toolIndexByID(calls: Partial<Record<number, ChatCall>>, pendingCalls: Partial<Record<number, PendingChatCall>>, id: string | undefined) {
  if (!id) return undefined
  const entry = Object.entries({ ...pendingCalls, ...calls }).find(([, call]) => call?.id === id)
  return entry ? Number(entry[0]) : undefined
}

export function createToolInputObserver(tools: ReadonlySet<string>) {
  const items = new Map<string, ToolCall>()
  const outputs = new Map<number, string>()
  const blocks = new Map<number, ToolCall>()
  const calls: Partial<Record<number, ChatCall>> = {}
  const pendingCalls: Partial<Record<number, PendingChatCall>> = {}
  let latestToolIndex: number | undefined
  let nextToolIndex = 0

  return function observe(json: string): ToolInputDelta[] {
    try {
      if (!json.includes("response.created") && !json.includes("function_call") && !json.includes("tool_use") && !json.includes("input_json_delta") && !json.includes("tool_calls")) return []
      const parsed = wireEvent.safeParse(JSON.parse(json))
      if (!parsed.success) return []
      const event = parsed.data
      if ("choices" in event) {
        const fragments: ToolInputDelta[] = []
        const toolDeltas = event.choices[0]?.delta?.tool_calls ?? []
        for (const [position, tool] of toolDeltas.entries()) {
          const matched = toolIndexByID(calls, pendingCalls, tool.id || undefined)
          const fallback = toolDeltas.length > 1 ? position : (latestToolIndex ?? position)
          const fallbackCall = calls[fallback] ?? pendingCalls[fallback]
          const index = tool.index ?? matched ?? (tool.id && fallbackCall?.id && fallbackCall.id !== tool.id ? nextToolIndex : fallback)
          const current = calls[index]
          const pending = pendingCalls[index]
          const id = current?.id ?? pending?.id ?? (tool.id || undefined)
          const name = current?.name ?? pending?.name ?? (tool.function?.name || undefined)
          const buffered = pending?.fragments ?? []
          if (tool.function?.arguments) buffered.push(tool.function.arguments)
          latestToolIndex = index
          nextToolIndex = Math.max(nextToolIndex, index + 1)
          if (!id || !name) {
            pendingCalls[index] = { id, name, fragments: buffered }
            continue
          }
          delete pendingCalls[index]
          calls[index] = { id, name }
          if (tools.has(name)) for (const delta of buffered) fragments.push({ callID: id, delta })
        }
        return fragments
      }
      switch (event.type) {
        case "response.created":
          items.clear()
          outputs.clear()
          return []
        case "response.output_item.added": {
          const id = event.item.id ?? (event.output_index === undefined ? undefined : outputs.get(event.output_index)) ?? `fc_${crypto.randomUUID().replaceAll("-", "")}`
          if (event.output_index !== undefined) outputs.set(event.output_index, id)
          const call = { callID: event.item.call_id, name: event.item.name }
          items.set(id, call)
          return tools.has(call.name) && event.item.arguments ? [{ callID: call.callID, delta: event.item.arguments }] : []
        }
        case "response.function_call_arguments.delta": {
          const id = event.item_id === undefined || event.output_index === undefined ? event.item_id : (outputs.get(event.output_index) ?? event.item_id)
          const call = id === undefined ? undefined : items.get(id)
          return call && tools.has(call.name) ? [{ callID: call.callID, delta: event.delta }] : []
        }
        case "content_block_start":
          blocks.set(event.index, { callID: event.content_block.id, name: event.content_block.name })
          return []
        case "content_block_delta": {
          const call = blocks.get(event.index)
          return call && tools.has(call.name) ? [{ callID: call.callID, delta: event.delta.partial_json }] : []
        }
      }
    } catch {
      return []
    }
  }
}
