import type {
  SessionMessageInfo,
  SessionMessageAssistant,
  SessionMessageAssistantTool,
  SessionStructuredError,
} from "@opencode/client"
import type { AssistantMessage, MessageError, MessageWithParts, Part, ToolPart } from "@buddy/transcript-contract/message"
import { parseStringValue } from "@buddy/transcript-contract/parse-external"
import { readCommandDisplay, readPromptPresentation } from "@buddy/transcript-contract/prompt"
import { isVisibleToUserTextPartInfo } from "@buddy/transcript-contract/message-visibility"
import type { SessionClient } from "./client"
import { withToolPresentationOnPart, type ToolPresentationLookup } from "../session-tool-presentation"
import { toBuddySubagentCompletion, toBuddySubagentPresentation } from "./subagent"

const EmptyTokens = { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }

export type MessageContext = {
  readonly sessionID: string
  readonly directory: string
  readonly parentID?: string
  readonly presentation?: ToolPresentationLookup
}

export function partID(messageID: string, index: number, key: string): string {
  return `prt_${messageID}_${index.toString().padStart(8, "0")}_${encodeURIComponent(key)}`
}

export function toBuddyMessageError(error: SessionStructuredError): MessageError {
  return {
    name: error.type === "aborted" ? "MessageAbortedError" : error.type,
    message: error.message,
    data: { message: error.message, statusCode: error.status, responseBody: error.response?.body },
  }
}

function toolPart(part: SessionMessageAssistantTool, index: number, messageID: string, context: MessageContext): ToolPart {
  const id = partID(messageID, index, `tool:${part.id}`)
  const identity = { id, messageID, sessionID: context.sessionID, type: "tool", callID: part.id, tool: part.name, subagent: toBuddySubagentPresentation(part, messageID, context.sessionID) } as const
  const state = part.state
  const metadata = state.status === "streaming" ? {} : state.metadata ?? {}
  if (state.status === "streaming") {
    return withToolPresentationOnPart({ ...identity, state: { status: "pending", input: {}, raw: state.input, metadata } }, context.presentation)
  }
  const time = { start: part.time.ran ?? part.time.created, end: part.time.completed }
  if (state.status === "running") {
    return withToolPresentationOnPart({ ...identity, state: { status: "running", input: state.input, metadata, time } }, context.presentation)
  }
  if (state.status === "error") {
    return withToolPresentationOnPart({ ...identity, state: { status: "error", input: state.input, metadata, time, error: state.error.message, errorType: state.error.type } }, context.presentation)
  }
  const attachments = state.content.flatMap((content, attachmentIndex) => content.type === "file" ? [{
    id: `${id}:attachment:${attachmentIndex}`,
    type: "file" as const,
    sessionID: context.sessionID,
    messageID,
    mime: content.mime,
    filename: content.name ?? undefined,
    url: content.uri,
  }] : [])
  return withToolPresentationOnPart({
    ...identity,
    state: {
      status: "completed", input: state.input, metadata, time,
      output: state.content.flatMap((content) => content.type === "text" ? [content.text] : []).join("\n"),
      attachments,
    },
  }, context.presentation)
}

export function toBuddyAssistantPart(content: SessionMessageAssistant["content"][number], index: number, message: SessionMessageAssistant, context: MessageContext): Part {
  if (content.type === "tool") return toolPart(content, index, message.id, context)
  const identity = { id: partID(message.id, index, content.type), messageID: message.id, sessionID: context.sessionID }
  if (content.type === "reasoning") {
    return { ...identity, type: "reasoning", text: content.text, metadata: content.state, time: { start: content.time?.created ?? message.time.created, end: content.time?.completed } }
  }
  return { ...identity, type: "text", text: content.text, metadata: content.state }
}

function assistantInfo(message: SessionMessageInfo, context: MessageContext): AssistantMessage {
  const assistant = message.type === "assistant" ? message : undefined
  const model = assistant?.model
  const tokens = assistant?.tokens ?? (message.type === "compaction" && message.status !== "running" ? message.tokens : undefined) ?? EmptyTokens
  return {
    id: message.id,
    sessionID: context.sessionID,
    role: "assistant",
    time: message.time,
    parentID: context.parentID ?? "",
    agent: assistant?.agent ?? "",
    mode: assistant?.agent ?? "",
    modelID: model?.id ?? "",
    providerID: model?.providerID ?? "",
    variant: model?.variant,
    path: { cwd: context.directory, root: context.directory },
    cost: assistant?.cost ?? (message.type === "compaction" && message.status !== "running" ? message.cost : undefined) ?? 0,
    tokens,
    error: assistant?.error ? toBuddyMessageError(assistant.error) : undefined,
    finish: assistant?.finish,
    metadata: message.metadata,
  }
}

function noticeText(message: Extract<SessionMessageInfo, { type: "synthetic" | "skill" | "shell" }>): string {
  if (message.type === "skill") return `Using skill: ${message.name}`
  if (message.type === "shell") return `${message.command}${message.output?.output ? `\n${message.output.output}` : ""}`
  const source = message.metadata?.source
  if (source === "subagent" || source === "shell") {
    const state = message.metadata?.state
    const label = source === "subagent" ? "Subagent" : "Shell"
    const status = state === "error" ? "failed" : state === "cancelled" ? "cancelled" : "completed"
    return `${label} ${status}${message.description ? `: ${message.description}` : ""}`
  }
  return message.description ?? message.text
}

export function toBuddyMessage(message: SessionMessageInfo, context: MessageContext): MessageWithParts | undefined {
  const base = { sessionID: context.sessionID, messageID: message.id }
  if (message.type === "user") {
    const display = readCommandDisplay(message.metadata)
    const presentation = display === undefined ? readPromptPresentation(message.metadata, message.text) : undefined
    const parts: Part[] = presentation?.segments.length ? presentation.segments.map((segment, index) => Object.assign({}, base, {
      id: partID(message.id, index, "text"), type: "text" as const,
      text: message.text.slice(segment.start, segment.end), synthetic: segment.synthetic,
      ignored: segment.ignored, metadata: segment.metadata,
    })) : [{ ...base, id: partID(message.id, 0, "text"), type: "text", text: display ?? message.text }]
    function mentionRange(mention: { text: string; start: number; end: number } | undefined) {
      if (!mention) return undefined
      if (display !== undefined) {
        const start = display.indexOf(mention.text)
        return start < 0 ? undefined : { value: mention.text, start, end: start + mention.text.length }
      }
      if (!presentation) return { value: mention.text, start: mention.start, end: mention.end }
      let offset = 0
      for (const segment of presentation.segments) {
        if (!isVisibleToUserTextPartInfo({ ...segment, type: "text" })) continue
        if (mention.start >= segment.start && mention.end <= segment.end) return { value: mention.text, start: offset + mention.start - segment.start, end: offset + mention.end - segment.start }
        offset += segment.end - segment.start
      }
      return undefined
    }
    for (const file of message.files ?? []) {
      const source = { ...file.source, text: mentionRange(file.mention) }
      parts.push({ ...base, id: partID(message.id, parts.length, "file"), type: "file", mime: file.mime, filename: file.name, source, url: `data:${file.mime};base64,${file.data}` })
    }
    for (const agent of message.agents ?? []) {
      parts.push({ ...base, id: partID(message.id, parts.length, "agent"), type: "agent", name: agent.name, source: mentionRange(agent.mention) })
    }
    return {
      info: {
        id: message.id, sessionID: context.sessionID, role: "user", time: message.time, metadata: message.metadata,
        agent: "", model: { providerID: "", modelID: "" },
      },
      parts,
    }
  }
  if (message.type === "assistant") {
    return { info: assistantInfo(message, context), parts: message.content.map((content, index) => toBuddyAssistantPart(content, index, message, context)) }
  }
  if (message.type === "synthetic" || message.type === "skill" || message.type === "shell") {
    const info = assistantInfo(message, context)
    return {
      info: { ...info, kind: message.type, description: "description" in message ? message.description : undefined, finish: message.type === "shell" && message.status === "running" ? undefined : "stop", time: { ...info.time, completed: message.type === "shell" ? message.time.completed : message.time.created } },
      parts: [{ ...base, id: partID(message.id, 0, "notice"), type: "notice", text: noticeText(message), metadata: message.metadata, source: message.type === "synthetic" ? parseStringValue(message.metadata?.source) : message.type, status: message.type === "shell" ? message.status : parseStringValue(message.metadata?.state), completion: toBuddySubagentCompletion(message, context.sessionID) }],
    }
  }
  if (message.type === "compaction") {
    const info = assistantInfo(message, context)
    return {
      info: { ...info, kind: "compaction", summary: true, finish: message.status === "running" ? undefined : "stop", time: { ...info.time, completed: message.status === "running" ? undefined : message.time.created }, error: message.status === "failed" ? toBuddyMessageError(message.error) : undefined },
      parts: [{ ...base, id: partID(message.id, 0, "compaction"), type: "compaction", auto: message.reason === "auto", status: message.status, error: message.status === "failed" ? message.error.message : undefined }],
    }
  }
  return undefined
}

export async function listMessages(client: SessionClient, context: MessageContext, input: { readonly limit?: number; readonly before?: string } = {}) {
  const limit = input.limit === undefined || input.limit === 0 ? 200 : Math.min(200, Math.max(1, input.limit))
  let cursor = input.before
  const messages: SessionMessageInfo[] = []
  do {
    const page = await client.message.list({ sessionID: context.sessionID, limit, ...(cursor ? { cursor } : { order: "desc" }) })
    messages.unshift(...page.data.toReversed())
    cursor = page.cursor.next ?? undefined
    if (input.limit && messages.some((message) => toBuddyMessage(message, context) !== undefined)) break
  } while (cursor)
  let parentID = context.parentID
  const items = messages.flatMap((message) => {
    if (message.type === "user") parentID = message.id
    const mapped = toBuddyMessage(message, { ...context, parentID })
    return mapped ? [mapped] : []
  })
  return { items, cursor }
}

export async function getMessage(client: SessionClient, context: MessageContext, messageID: string) {
  return toBuddyMessage(await client.session.message.get({ sessionID: context.sessionID, messageID }), context)
}
