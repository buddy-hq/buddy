import { readPromptComposerLiveDraft } from "@/components/prompt/prompt-composer-live-draft"
import {
  SELECTION_CONTEXT_PART_TYPE,
  type PromptComposerPart,
  type PromptMessageSelectionContextPart,
} from "@/components/prompt/prompt-types"
import {
  appendSelectionContextToDraft,
  removeSelectionContextFromDraft,
} from "@/components/readers/utils/reading-selection-draft"
import { getPromptScopeKey, type PromptStore } from "@/state/prompt-store"

const MESSAGE_QUOTE_SELECTION_KEY_PREFIX = "message_" as const

function isMessageSelectionContextPart(
  part: PromptComposerPart,
): part is PromptMessageSelectionContextPart {
  return part.type === SELECTION_CONTEXT_PART_TYPE && part.source === "message"
}

export function quoteMessageIntoPromptDraft(input: {
  directory: string
  sessionID: string
  messageID: string
  text: string
  replaceDraft: PromptStore["replaceDraft"]
}): void {
  const promptScopeKey = getPromptScopeKey(input.directory, input.sessionID)
  const currentDraft = readPromptComposerLiveDraft(promptScopeKey)
  const existingQuote = currentDraft.parts.find(isMessageSelectionContextPart)
  const withoutPreviousQuote = existingQuote
    ? (removeSelectionContextFromDraft(currentDraft, existingQuote.selectionKey) ?? currentDraft)
    : currentDraft
  input.replaceDraft(
    promptScopeKey,
    appendSelectionContextToDraft(withoutPreviousQuote, {
      source: "message",
      text: input.text,
      selectionKey: `${MESSAGE_QUOTE_SELECTION_KEY_PREFIX}${input.messageID}`,
      quotedMessageID: input.messageID,
    }),
  )
}
