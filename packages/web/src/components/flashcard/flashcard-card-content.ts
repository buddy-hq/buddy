import type { ObjectFlashcardDeckReadDeckResponse } from "@buddy/sdk/types"

type FlashcardNote = ObjectFlashcardDeckReadDeckResponse["notes"][number]

type FlashcardBasicFields = {
  front: string
  back: string
}

type FlashcardClozeFields = {
  text: string
}

type FlashcardVisibleContent = {
  frontText: string
  backText?: string
}

function isBasicFlashcardFields(
  fields: FlashcardBasicFields | FlashcardClozeFields,
): fields is FlashcardBasicFields {
  return "front" in fields && "back" in fields
}

function isClozeFlashcardFields(
  fields: FlashcardBasicFields | FlashcardClozeFields,
): fields is FlashcardClozeFields {
  return "text" in fields && !("front" in fields)
}

function renderClozeText(text: string, ordinal: number, revealed: boolean): string {
  return text.replace(/\{\{c(\d+)::([^}]+)\}\}/gu, (_match, indexStr: string, answer: string) => {
    const clozeOrdinal = Number.parseInt(indexStr, 10)
    if (clozeOrdinal === ordinal) {
      return revealed ? answer : "[...]"
    }
    return answer
  })
}

function buildFlashcardVisibleContent(input: {
  note: FlashcardNote
  templateIdx: number
  revealed: boolean
}): FlashcardVisibleContent {
  if (isBasicFlashcardFields(input.note.fields)) {
    return input.revealed
      ? {
          frontText: input.note.fields.front,
          backText: input.note.fields.back,
        }
      : {
          frontText: input.note.fields.front,
        }
  }

  if (isClozeFlashcardFields(input.note.fields)) {
    const ordinal = input.templateIdx + 1
    return input.revealed
      ? {
          frontText: renderClozeText(input.note.fields.text, ordinal, false),
          backText: renderClozeText(input.note.fields.text, ordinal, true),
        }
      : {
          frontText: renderClozeText(input.note.fields.text, ordinal, false),
        }
  }

  return {
    frontText: "",
  }
}

export {
  buildFlashcardVisibleContent,
  isBasicFlashcardFields,
  isClozeFlashcardFields,
  renderClozeText,
}
export type { FlashcardBasicFields, FlashcardClozeFields, FlashcardVisibleContent }
