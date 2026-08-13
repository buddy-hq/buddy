import {
  readPromptReadingSelectionMetadata,
  readPromptSelectionContextMetadata,
  readPromptNativeResourceAttachmentMetadata,
  readPromptTextFileAttachmentMetadata,
} from "@/components/prompt/prompt-types"
import type { MessagePart } from "@/state/chat-types"

import { isChatTextPart, type ChatTextPart } from "./part-guards"

/**
 * A user text part the bubble actually renders.
 *
 * Synthetic parts and the four prompt-metadata kinds carry text that is shown as
 * a chip or clip — or not at all. `UserSection` renders only the parts this
 * accepts, so the row-size estimate must count only these too: counting the rest
 * inflated a one-line message to two lines on every send, and the first message
 * of a session (which carries the largest synthetic context) to fourteen.
 */
export function isVisibleUserTextPart(part: MessagePart): part is ChatTextPart {
  return (
    isChatTextPart(part) &&
    part.synthetic !== true &&
    readPromptSelectionContextMetadata(part.metadata) === undefined &&
    readPromptReadingSelectionMetadata(part.metadata) === undefined &&
    readPromptNativeResourceAttachmentMetadata(part.metadata) === undefined &&
    readPromptTextFileAttachmentMetadata(part.metadata) === undefined
  )
}

/** Length of the text the user bubble renders, in characters. */
export function visibleUserTextLength(parts: MessagePart[]) {
  return parts.reduce((total, part) => {
    if (!isVisibleUserTextPart(part)) return total
    return total + part.text.length
  }, 0)
}
