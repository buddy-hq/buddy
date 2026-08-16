import {
  EMPTY_JSON_OBJECT,
  parseTJsonObject,
  parseTNumber,
  parseTString,
  readNonEmptyString,
  type TJsonObject,
  type TJsonValue,
  type ToolAttachment,
} from "../tools/types"
import { toToolStatus } from "../utils/tool"
import type { ToolState } from "./registry"
import type { MessagePart } from "@/state/chat-types"

function parseAttachments(partID: string, value: TJsonValue | undefined): ToolAttachment[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((attachment, index): ToolAttachment[] => {
    const record = parseTJsonObject(attachment)
    if (!record) return []

    const mime = readNonEmptyString(record.mime)
    const url = readNonEmptyString(record.url)
    if (!mime || !url) return []

    const filename = readNonEmptyString(record.filename)
    return [
      Object.assign(
        {
          id: readNonEmptyString(record.id) ?? `${partID}:attachment:${index}`,
          mime,
          url,
        },
        filename !== undefined ? { filename } : undefined,
      ),
    ]
  })
}

export function parseToolState(part: MessagePart): ToolState {
  const rawState = parseTJsonObject(part.state) ?? EMPTY_JSON_OBJECT
  const status = toToolStatus(rawState.status)
  const input = parseTJsonObject(rawState.input) ?? EMPTY_JSON_OBJECT
  const rawTime = parseTJsonObject(rawState.time) ?? EMPTY_JSON_OBJECT
  const stateMetadata = parseTJsonObject(rawState.metadata) ?? EMPTY_JSON_OBJECT
  const partMetadata = parseTJsonObject(part.metadata) ?? EMPTY_JSON_OBJECT
  const metadata: TJsonObject = {
    ...partMetadata,
    ...stateMetadata,
  }

  const start = parseTNumber(rawTime.start)
  const end = parseTNumber(rawTime.end)
  const output = parseTString(rawState.output)
  const error = parseTString(rawState.error)
  const title = readNonEmptyString(rawState.title)
  return Object.assign(
    Object.assign(
      {
        status,
        input,
        metadata,
        attachments: parseAttachments(part.id, rawState.attachments),
      },
      start !== undefined ? { start } : undefined,
      end !== undefined ? { end } : undefined,
      output !== undefined ? { output } : undefined,
    ),
    error !== undefined ? { error } : undefined,
    title !== undefined ? { title } : undefined,
  )
}
