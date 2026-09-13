import z from "zod"

const MERMAID_AUTO_REPAIR_MESSAGE_ID_PREFIX = "msg_buddy_mermaid_auto_repair_" as const
const SVG_AUTO_REPAIR_MESSAGE_ID_PREFIX = "msg_buddy_svg_auto_repair_" as const
const HiddenMessageMetadataSchema = z.object({ hiddenFromUser: z.literal(true) }).passthrough()
const HiddenPromptTextPartMetadataSchema = z
  .object({
    buddyPromptPart: z
      .object({
        type: z.enum([
          "native-resource-attachment",
          "reading-selection",
          "selection-context",
          "text-file-attachment",
        ]),
      })
      .passthrough(),
  })
  .passthrough()
const MessageIDSchema = z.string()

type MessageVisibilityInfo = {
  id: string
  role: string
  metadata?: unknown
}

type TextPartVisibilityInfo = {
  type: string
  synthetic?: boolean | null
  ignored?: boolean | null
  metadata?: unknown
}

function metadataHidesMessage<TValue>(metadata: TValue): boolean {
  return HiddenMessageMetadataSchema.safeParse(metadata).success
}

export function isSvgAutoRepairMessageID<TValue>(value: TValue): boolean {
  const parsed = MessageIDSchema.safeParse(value)
  return parsed.success && parsed.data.startsWith(SVG_AUTO_REPAIR_MESSAGE_ID_PREFIX)
}

export function isHiddenFromUserMessageInfo(message: MessageVisibilityInfo): boolean {
  return (
    message.role === "user" &&
    (metadataHidesMessage(message.metadata) ||
      message.id.startsWith(MERMAID_AUTO_REPAIR_MESSAGE_ID_PREFIX) ||
      isSvgAutoRepairMessageID(message.id))
  )
}

export function isVisibleToUserTextPartInfo(part: TextPartVisibilityInfo): boolean {
  return (
    part.type === "text" &&
    part.synthetic !== true &&
    part.ignored !== true &&
    !HiddenPromptTextPartMetadataSchema.safeParse(part.metadata).success
  )
}
