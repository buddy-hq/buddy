import {
  readPromptNativeResourceAttachmentMetadata,
  readPromptNativeResourceAttachmentPart,
  readPromptTextFileAttachmentMetadata,
  type PromptNativeResourceAttachmentPart,
  type PromptTextFileAttachmentMetadata,
} from "@/components/prompt/prompt-types"
import type { MessagePart } from "@/state/chat-types"

import {
  isChatFilePart,
  readChatReadingSelectionPart,
  type ChatFilePart,
  type ChatReadingSelectionPart,
} from "./part-guards"

type IdentifiedAttachment<TAttachment> = {
  id: string
  attachment: TAttachment
}

export type UserMessageStackedContent = {
  attachmentParts: ChatFilePart[]
  nativeResourceParts: IdentifiedAttachment<PromptNativeResourceAttachmentPart>[]
  selectionContextParts: ChatReadingSelectionPart[]
  textFileAttachmentParts: IdentifiedAttachment<PromptTextFileAttachmentMetadata>[]
}

function filePartSourcePath(part: ChatFilePart): string | undefined {
  const source = part.source
  if (source === null || source === undefined) return undefined
  if (source.type === "file" || source.type === "symbol") return source.path
  return undefined
}

export function isUserAttachmentFilePart(part: ChatFilePart): boolean {
  return part.mime.startsWith("image/") || part.mime === "application/pdf"
}

/**
 * Projects the non-prose blocks that `UserSection` stacks above a user bubble.
 * Keeping this projection shared makes the virtual row estimate describe the
 * same groups the renderer mounts, including metadata-backed text parts.
 */
export function projectUserMessageStackedContent(parts: MessagePart[]): UserMessageStackedContent {
  const nativeResourceParts = parts.flatMap((part) => {
    const attachment =
      readPromptNativeResourceAttachmentPart(part) ??
      readPromptNativeResourceAttachmentMetadata(part.metadata)
    return attachment ? [{ id: part.id, attachment }] : []
  })
  const nativeResourceSourcePaths = new Set(
    nativeResourceParts.map(({ attachment }) => attachment.sourcePath),
  )
  const attachmentParts = parts.filter(isChatFilePart).filter((part) => {
    if (!isUserAttachmentFilePart(part)) return false
    const sourcePath = filePartSourcePath(part)
    return !sourcePath || !nativeResourceSourcePaths.has(sourcePath)
  })

  return {
    attachmentParts,
    nativeResourceParts,
    selectionContextParts: parts.flatMap((part) => {
      const selection = readChatReadingSelectionPart(part)
      return selection ? [selection] : []
    }),
    textFileAttachmentParts: parts.flatMap((part) => {
      const attachment = readPromptTextFileAttachmentMetadata(part.metadata)
      return attachment ? [{ id: part.id, attachment }] : []
    }),
  }
}

/** Number of top-level rows the user renderer adds above its prose bubble. */
export function userMessageStackedContentCount(content: UserMessageStackedContent): number {
  const attachmentRowCount = content.attachmentParts.length > 0 ? 1 : 0
  const attachmentChipRowCount =
    content.nativeResourceParts.length > 0 || content.textFileAttachmentParts.length > 0 ? 1 : 0
  return attachmentRowCount + attachmentChipRowCount + content.selectionContextParts.length
}
