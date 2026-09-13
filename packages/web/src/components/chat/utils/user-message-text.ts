import type { MessagePart } from "@/state/chat-types"
import { isVisibleToUserTextPartInfo } from "@buddy/opencode-adapter/message-visibility"

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
  return isChatTextPart(part) && isVisibleToUserTextPartInfo(part)
}

/** Length of the text the user bubble renders, in characters. */
export function visibleUserTextLength(parts: MessagePart[]) {
  return parts.reduce((total, part) => {
    if (!isVisibleUserTextPart(part)) return total
    return total + part.text.length
  }, 0)
}

/**
 * The readable text of a message, matching what the backend writes into a note
 * quote. Mirrors `readableMessageText` in packages/buddy/src/notes/chat-capture.ts.
 */
export function visibleMessageText(parts: MessagePart[]) {
  return parts
    .flatMap((part) => {
      if (!isVisibleUserTextPart(part)) return []
      const text = part.text.trim()
      return text ? [text] : []
    })
    .join("\n\n")
}
