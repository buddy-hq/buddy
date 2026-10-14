import type { SessionContext } from "@buddy/opencode-adapter/plugin"
import type { SessionClient, UpstreamMessage } from "@buddy/opencode-adapter/gateway/client"
import { readPromptPresentation } from "@buddy/transcript-contract/prompt"
import { getOpenCodeClient } from "../../../opencode-runtime/client"

export async function applyBuddyPromptContext(event: SessionContext, messages: readonly UpstreamMessage[], client?: Pick<SessionClient, "message">): Promise<void> {
  const users = new Map(messages.flatMap((message) => message.type === "user" ? [[message.id, message] as const] : []))
  event.messages = event.messages.map((message) => {
    const user = message.id === undefined ? undefined : users.get(message.id)
    if (!user) return message
    const prompt = readPromptPresentation(user.metadata, user.text)
    if (!prompt?.segments.some((segment) => segment.ignored === true)) return message
    const text = prompt.segments.filter((segment) => segment.ignored !== true).map((segment) => user.text.slice(segment.start, segment.end)).join("")
    const content = message.content.flatMap((part) => part.type === "text" && part.text === user.text
      ? text ? [Object.assign({}, part, { text })] : []
      : [part])
    return Object.assign({}, message, { content })
  })
  for (const message of messages.toReversed()) {
    if (message.type !== "user") continue
    const system = readPromptPresentation(message.metadata, message.text)?.system
    if (!system) continue
    event.system.push({ type: "text", text: system })
    return
  }
  if (!messages.some((message) => message.type === "compaction" && message.status === "completed")) return
  const host = client ?? await getOpenCodeClient()
  let cursor: string | undefined
  do {
    const page = await host.message.list({ sessionID: event.sessionID, type: "user", limit: 200, ...(cursor ? { cursor } : { order: "desc" }) })
    for (const message of page.data) {
      if (message.type !== "user") continue
      const system = readPromptPresentation(message.metadata, message.text)?.system
      if (!system) continue
      event.system.push({ type: "text", text: system })
      return
    }
    cursor = page.cursor.next ?? undefined
  } while (cursor)
}
