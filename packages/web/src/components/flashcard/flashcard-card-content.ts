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

type FlashcardClozeSegment =
  | { kind: "text"; text: string }
  | { kind: "deletion"; ordinal: number; answer: string }

const CLOZE_PATTERN = /\{\{c(\d+)::([\s\S]*?)\}\}/gu

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

function parseClozeText(text: string): FlashcardClozeSegment[] {
  const segments: FlashcardClozeSegment[] = []
  const pattern = new RegExp(CLOZE_PATTERN)
  let cursor = 0
  let match = pattern.exec(text)

  while (match) {
    if (match.index > cursor) {
      segments.push({ kind: "text", text: text.slice(cursor, match.index) })
    }

    const [full, rawOrdinal, answer] = match
    if (rawOrdinal === undefined || answer === undefined) {
      segments.push({ kind: "text", text: full })
    } else {
      segments.push({
        kind: "deletion",
        ordinal: Number.parseInt(rawOrdinal, 10),
        answer,
      })
    }
    cursor = match.index + full.length
    match = pattern.exec(text)
  }

  if (cursor < text.length) {
    segments.push({ kind: "text", text: text.slice(cursor) })
  }
  return segments
}

function renderClozeText(text: string, ordinal: number, revealed: boolean): string {
  return parseClozeText(text)
    .map((segment) => {
      if (segment.kind === "text") return segment.text
      if (segment.ordinal !== ordinal) return segment.answer
      return revealed ? segment.answer : "[...]"
    })
    .join("")
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
  parseClozeText,
  renderClozeText,
}
export type {
  FlashcardBasicFields,
  FlashcardClozeFields,
  FlashcardClozeSegment,
  FlashcardVisibleContent,
}
