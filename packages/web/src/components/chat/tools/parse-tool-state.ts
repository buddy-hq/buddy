import { isRecord, toToolStatus, readNonEmptyString } from "../shared/utils"
import type { ToolState, ToolAttachment } from "./registry"
import type { MessagePart } from "@/state/chat-types"

export function parseToolState(part: MessagePart): ToolState {
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
