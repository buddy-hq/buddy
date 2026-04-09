import { isRecord, readNonEmptyString } from "../tools/types"
import { toToolStatus } from "../utils/tool"
import type { ToolState, ToolAttachment } from "./registry"
import type { MessagePart } from "@/state/chat-types"
import type {
  FilePart as SdkFilePart,
  ToolPart as SdkToolPart,
  ToolState as SdkToolState,
} from "@buddy/sdk"

function isSdkFilePart(value: unknown): value is SdkFilePart {
  if (!isRecord(value)) return false
  if (value.type !== "file") return false
  return (
    typeof value.id === "string" &&
    typeof value.sessionID === "string" &&
    typeof value.messageID === "string" &&
    typeof value.mime === "string" &&
    typeof value.url === "string"
  )
}

function hasToolStateTime(value: unknown): value is { start: number; end?: number } {
  if (!isRecord(value)) return false
  if (typeof value.start !== "number") return false
  if ("end" in value && value.end !== undefined && typeof value.end !== "number") return false
  return true
}

function isSdkToolState(value: unknown): value is SdkToolState {
  if (!isRecord(value) || !isRecord(value.input)) return false

  if (value.status === "pending") {
    return typeof value.raw === "string"
  }

  if (value.status === "running") {
    return hasToolStateTime(value.time)
  }

  if (value.status === "completed") {
    if (!hasToolStateTime(value.time)) return false
    if (typeof value.output !== "string") return false
    if (typeof value.title !== "string") return false
    if (!isRecord(value.metadata)) return false
    if (!("attachments" in value) || value.attachments === undefined) return true
    return (
      Array.isArray(value.attachments) &&
      value.attachments.every((attachment) => isSdkFilePart(attachment))
    )
  }

  if (value.status === "error") {
    return hasToolStateTime(value.time) && typeof value.error === "string"
  }

  return false
}

function isSdkToolPart(part: MessagePart): part is MessagePart & SdkToolPart {
  if (part.type !== "tool") return false
  if (typeof part.callID !== "string") return false
  if (typeof part.tool !== "string") return false
  return isSdkToolState(part.state)
}

function parseSdkAttachments(partID: string, state: SdkToolState): ToolAttachment[] {
  if (state.status !== "completed" || !Array.isArray(state.attachments)) return []

  return state.attachments.flatMap((attachment, index): ToolAttachment[] => {
    const mime = readNonEmptyString(attachment.mime)
    const url = readNonEmptyString(attachment.url)
    if (!mime || !url) return []

    return [
      {
        id: readNonEmptyString(attachment.id) ?? `${partID}:attachment:${index}`,
        mime,
        url,
        filename: readNonEmptyString(attachment.filename),
      },
    ]
  })
}

function parseFromSdkToolPart(part: MessagePart & SdkToolPart): ToolState {
  const state = part.state
  const partMetadata = isRecord(part.metadata) ? part.metadata : {}
  const stateMetadata = "metadata" in state && isRecord(state.metadata) ? state.metadata : {}
  const metadata = {
    ...partMetadata,
    ...stateMetadata,
  }

  const start = "time" in state && hasToolStateTime(state.time) ? state.time.start : undefined
  const end =
    "time" in state && hasToolStateTime(state.time) && typeof state.time.end === "number"
      ? state.time.end
      : undefined
  const title = "title" in state ? readNonEmptyString(state.title) : undefined

  const output = state.status === "completed" ? state.output : undefined
  const error = state.status === "error" ? state.error : undefined
  const attachments = parseSdkAttachments(part.id, state)

  return {
    status: state.status,
    input: state.input,
    metadata,
    attachments,
    start,
    end,
    output,
    error,
    title,
  }
}

export function parseToolState(part: MessagePart): ToolState {
  if (isSdkToolPart(part)) {
    return parseFromSdkToolPart(part)
  }

  const rawState = isRecord(part.state) ? part.state : {}
  const status = toToolStatus(rawState.status)
  const input = isRecord(rawState.input) ? rawState.input : {}
  const rawTime = isRecord(rawState.time) ? rawState.time : {}
  const stateMetadata = isRecord(rawState.metadata) ? rawState.metadata : {}
  const partMetadata = isRecord(part.metadata) ? part.metadata : {}
  const metadata = {
    ...partMetadata,
    ...stateMetadata,
  }

  const start = typeof rawTime.start === "number" ? rawTime.start : undefined
  const end = typeof rawTime.end === "number" ? rawTime.end : undefined
  const output = typeof rawState.output === "string" ? rawState.output : undefined
  const error = typeof rawState.error === "string" ? rawState.error : undefined
  const title = typeof rawState.title === "string" ? rawState.title : undefined
  const attachments: ToolAttachment[] = Array.isArray(rawState.attachments)
    ? rawState.attachments.flatMap((attachment, index): ToolAttachment[] => {
        if (!isRecord(attachment)) return []

        const mime = readNonEmptyString(attachment.mime)
        const url = readNonEmptyString(attachment.url)
        if (!mime || !url) return []

        return [
          {
            id: readNonEmptyString(attachment.id) ?? `${part.id}:attachment:${index}`,
            mime,
            url,
            filename: readNonEmptyString(attachment.filename),
          },
        ]
      })
    : []

  return {
    status,
    input,
    metadata,
    attachments,
    start,
    end,
    output,
    error,
    title,
  }
}
