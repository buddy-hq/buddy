import { useMemo } from "react"
import { z } from "zod"
import { isTerminalAssistantMessageInfo } from "@/state/chat-tool-parts"
import type { MessagePart, MessageWithParts } from "@/state/chat-types"
import { useTranscriptParts } from "@/state/transcript-repository"

const WHITEBOARD_CREATE_VIEW_TOOL_ID = "whiteboard_create_view" as const
const WHITEBOARD_TOOL_PENDING_STATUS = "pending"
const WHITEBOARD_TOOL_RUNNING_STATUS = "running"

const whiteboardCreateToolStatusSchema = z.object({
  status: z.string(),
})

function parseWhiteboardCreateToolStatus(part: MessagePart): string | undefined {
  const parsed = whiteboardCreateToolStatusSchema.safeParse(part.state)
  return parsed.success ? parsed.data.status : undefined
}

function activeWhiteboardCreatePartIDs(messages: MessageWithParts[]): string[] {
  const partIDs: string[] = []
  for (const message of messages) {
    if (message.info.role !== "assistant" || isTerminalAssistantMessageInfo(message.info)) {
      continue
    }
    for (const part of message.parts) {
      if (part.type !== "tool" || part.tool !== WHITEBOARD_CREATE_VIEW_TOOL_ID) continue
      const status = parseWhiteboardCreateToolStatus(part)
      if (status !== WHITEBOARD_TOOL_PENDING_STATUS && status !== WHITEBOARD_TOOL_RUNNING_STATUS) {
        continue
      }
      partIDs.push(part.id)
    }
  }
  return partIDs
}

function mergeLiveWhiteboardCreateParts(
  messages: MessageWithParts[],
  liveParts: MessagePart[],
): MessageWithParts[] {
  if (liveParts.length === 0) return messages
  const livePartsByID = new Map(liveParts.map((part) => [part.id, part]))
  let messagesChanged = false
  const merged = messages.map((message) => {
    let partsChanged = false
    const parts = message.parts.map((part) => {
      const livePart = livePartsByID.get(part.id)
      if (!livePart || livePart === part) return part
      partsChanged = true
      return livePart
    })
    if (!partsChanged) return message
    messagesChanged = true
    return { ...message, parts }
  })
  return messagesChanged ? merged : messages
}

function useLiveWhiteboardMessages(messages: MessageWithParts[]): MessageWithParts[] {
  const activePartIDs = useMemo(() => activeWhiteboardCreatePartIDs(messages), [messages])
  const liveParts = useTranscriptParts(activePartIDs)
  return useMemo(() => mergeLiveWhiteboardCreateParts(messages, liveParts), [liveParts, messages])
}

export { activeWhiteboardCreatePartIDs, mergeLiveWhiteboardCreateParts, useLiveWhiteboardMessages }
