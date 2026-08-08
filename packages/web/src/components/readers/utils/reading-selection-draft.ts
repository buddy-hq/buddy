import { serializePromptEditorParts } from "@/components/prompt/prompt-parts"
import {
  READING_SELECTION_PART_TYPE,
  SELECTION_CONTEXT_PART_TYPE,
  type PromptComposerPart,
  type PromptMarkdownSelectionContextPart,
  type PromptReadingSelectionContextPart,
} from "@/components/prompt/prompt-types"
import type { PromptDraftState } from "@/state/prompt-store"

type PromptDraftInput = Pick<PromptDraftState, "attachments" | "cursor" | "parts" | "value">

type ReadingSelectionDraftInput = Omit<PromptReadingSelectionContextPart, "type" | "source">

type SelectionContextDraftInput =
  | Omit<PromptReadingSelectionContextPart, "type">
  | Omit<PromptMarkdownSelectionContextPart, "type">

type PromptDraftUpdate = Omit<PromptDraftState, "updatedAt">

function toDraftUpdate(
  currentDraft: PromptDraftInput,
  parts: PromptComposerPart[],
  cursor: number,
): PromptDraftUpdate {
  const value = serializePromptEditorParts(parts)
  return {
    value,
    parts,
    attachments: currentDraft.attachments,
    cursor: Math.max(0, Math.min(cursor, value.length)),
  }
}

export function appendReadingSelectionToDraft(
  currentDraft: PromptDraftInput,
  input: ReadingSelectionDraftInput,
): PromptDraftUpdate {
  return appendSelectionContextToDraft(currentDraft, {
    source: "reading",
    ...input,
  })
}

export function appendSelectionContextToDraft(
  currentDraft: PromptDraftInput,
  input: SelectionContextDraftInput,
): PromptDraftUpdate {
  const parts: PromptComposerPart[] = [
    ...currentDraft.parts,
    {
      type: SELECTION_CONTEXT_PART_TYPE,
      ...input,
    },
  ]

  return toDraftUpdate(currentDraft, parts, Number.POSITIVE_INFINITY)
}

export function removeReadingSelectionFromDraft(
  currentDraft: PromptDraftInput,
  selectionKey: string,
): PromptDraftUpdate | undefined {
  return removeSelectionContextFromDraft(currentDraft, selectionKey)
}

export function removeSelectionContextFromDraft(
  currentDraft: PromptDraftInput,
  selectionKey: string,
): PromptDraftUpdate | undefined {
  const parts = currentDraft.parts.filter((part) => {
    if (part.type !== READING_SELECTION_PART_TYPE && part.type !== SELECTION_CONTEXT_PART_TYPE) {
      return true
    }
    return part.selectionKey !== selectionKey
  })

  if (parts.length === currentDraft.parts.length) {
    return undefined
  }

  return toDraftUpdate(currentDraft, parts, currentDraft.cursor)
}
