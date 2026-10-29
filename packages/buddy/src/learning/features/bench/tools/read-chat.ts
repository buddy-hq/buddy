import z from "zod"
import { isNotFound } from "@buddy/agent-runtime/errors"
import type { MessageWithParts } from "@buddy/transcript-contract/message"
import { readSessionInDirectory } from "../../../../project/session-history"
import { getAgentRuntime } from "../../../../runtime/agent-runtime"
import { createBuddyTool } from "../../../runtime/create-buddy-tool"

const CHAT_OUTPUT_POLICY = { maxLines: 500_000, maxBytes: 5_000_000 }

function messageBlock(message: MessageWithParts): string {
  if (message.info.role === "user") {
    const text = message.parts.flatMap((part) =>
      part.type === "text" && !part.synthetic && !part.ignored ? [part.text] : [],
    ).join("")
    const attachments = message.parts.flatMap((part) => {
      if (part.type !== "file") return []
      const label = `[Attachment: ${part.filename || "unnamed"} (${part.mime})]`
      const unopened = [label, "(open that chat to view it)"]
      if (!part.url.startsWith("data:")) return unopened
      const comma = part.url.indexOf(",")
      const metadata = part.url.slice(5, comma).split(";")
      const mime = metadata[0]?.toLowerCase() ?? ""
      if (comma < 0 || (!mime.startsWith("text/") && mime !== "application/json")) return unopened
      try {
        const data = decodeURIComponent(part.url.slice(comma + 1))
        const content = metadata.some((entry) => entry.toLowerCase() === "base64")
          ? Buffer.from(data, "base64").toString("utf8")
          : data
        return [label, content]
      } catch {
        return unopened
      }
    })
    return `User:\n${[...(text ? [text] : []), ...attachments].join("\n")}`
  }
  const text = message.parts.flatMap((part) => {
    if (part.type === "text") return [part.text]
    if (part.type !== "tool") return []
    const outcome = part.state.status === "completed"
      ? [part.state.output, ...(part.state.attachments ?? []).map((file) =>
        [file.filename, file.mime, file.url.startsWith("data:") ? undefined : file.url].filter(Boolean).join(" "))].filter(Boolean).join("\n")
      : part.state.status === "error" ? part.state.error : ""
    return [`Tool ${part.tool} (${part.state.status}):\n${outcome}`]
  })
  return `Assistant:\n${text.join("\n")}`
}

function omissionNotice(count: number): string {
  return count > 0 ? `${count} earlier messages left out.\n\n` : ""
}

function boundedTranscript(messages: readonly MessageWithParts[], latest?: number): string {
  const blocks: string[] = []
  let bytes = 0
  let lines = 0
  const selected = latest === undefined ? messages : messages.slice(-latest)
  for (const message of selected.toReversed()) {
    const block = messageBlock(message)
    const earlier = messages.length - blocks.length - 1
    const notice = omissionNotice(earlier)
    const nextBytes = bytes + Buffer.byteLength(block) + (blocks.length > 0 ? 2 : 0)
    const nextLines = lines + block.split("\n").length + (blocks.length > 0 ? 1 : 0)
    if (
      nextBytes + Buffer.byteLength(notice) > CHAT_OUTPUT_POLICY.maxBytes ||
      nextLines + (notice ? 2 : 0) > CHAT_OUTPUT_POLICY.maxLines
    ) {
      if (blocks.length === 0) {
        const label = message.info.role === "user" ? "User:" : "Assistant:"
        const prefix = `${notice}${label}\n[Latest message truncated to fit the output limit.]\n`
        const tail = block.split("\n").slice(-(CHAT_OUTPUT_POLICY.maxLines - prefix.split("\n").length)).join("\n")
        const encoded = Buffer.from(tail)
        let start = Math.max(0, encoded.length - (CHAT_OUTPUT_POLICY.maxBytes - Buffer.byteLength(prefix)))
        while (start < encoded.length && ((encoded[start] ?? 0) & 0xc0) === 0x80) start += 1
        return prefix + encoded.subarray(start).toString("utf8")
      }
      break
    }
    blocks.push(block)
    bytes = nextBytes
    lines = nextLines
  }
  return omissionNotice(messages.length - blocks.length) + blocks.toReversed().join("\n\n")
}

export const benchReadChatTool = createBuddyTool({
  id: "bench_read_chat",
  description:
    "Read the transcript of a chat in this notebook: a chat or subagent chat tab's target.sessionID from bench_read_context, or a chat the user mentioned. Returns its messages oldest first: the user's text, the assistant's text, and each tool call with its outcome. Set latest to read only the most recent messages. Reading never changes the chat.",
  parameters: z.object({
    sessionID: z.string().describe("ID of the chat in this notebook to read."),
    latest: z.number().int().positive().optional().describe("Read only the latest N messages. Omit to read the whole chat within the output limit."),
  }).strict(),
  presentation: {
    archetype: "activity",
    icon: "read",
    renderer: "buddy-custom",
    layoutRole: "activity",
    phases: {
      pending: { action: "Reading chat" },
      running: { action: "Reading chat" },
      completed: { action: "Read chat" },
      error: { action: "Failed to read chat" },
    },
    summary: {
      category: "read-chat",
      pending: "Reading chat",
      running: "Reading chat",
      completed: "Read chat",
      error: "Failed to read chat",
    },
  },
  output: CHAT_OUTPUT_POLICY,
  async execute(params, ctx) {
    const session = await readSessionInDirectory(ctx.directory, params.sessionID).catch((error) => {
      if (isNotFound(error, "session")) return undefined
      throw error
    })
    if (!session) throw new Error("Chat not found in this notebook")
    const { items } = await (await getAgentRuntime()).conversations.history({
      directory: ctx.directory,
      sessionID: session.id,
    })
    return {
      title: "Read chat",
      output: boundedTranscript(items, params.latest),
      metadata: {},
    }
  },
})
