export const SMART_NOTE_NOTE_LIMIT = 30
export const SMART_NOTE_NOTE_TEXT_CHARACTERS = 800
export const SMART_NOTE_CONTEXT_CHARACTERS = 12_000
export const SMART_NOTE_FOCUS_CHARACTERS = 2_000

export type TSmartNoteContextNote = {
  readonly title: string
  readonly text: string
  readonly updatedAt: number
}

export type TSmartNotePromptInput = {
  readonly notes: readonly TSmartNoteContextNote[]
  readonly focus?: string
}

function clip(text: string, limit: number) {
  const collapsed = text.replace(/\s+/gu, " ").trim()
  if (collapsed.length <= limit) return collapsed
  let end = limit - 1
  const boundary = collapsed.charCodeAt(end - 1)
  if (boundary >= 0xd800 && boundary <= 0xdbff) end -= 1
  const clipped = collapsed.slice(0, end).trimEnd()
  return clipped.length > 0 ? `${clipped}…` : "…"
}

function noteLines(notes: readonly TSmartNoteContextNote[]) {
  const selected = notes
    .toSorted((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, SMART_NOTE_NOTE_LIMIT)
  const lines: string[] = []
  let used = 0
  for (const note of selected) {
    const title = clip(note.title, SMART_NOTE_NOTE_TEXT_CHARACTERS) || "Untitled"
    const text = clip(note.text, SMART_NOTE_NOTE_TEXT_CHARACTERS)
    const line = text ? `- ${title}: ${text}` : `- ${title}`
    const separator = lines.length === 0 ? 0 : 1
    if (used + separator + line.length > SMART_NOTE_CONTEXT_CHARACTERS) break
    lines.push(line)
    used += separator + line.length
  }
  return lines
}

export function smartNotePrompt(input: TSmartNotePromptInput) {
  const focus = clip(input.focus ?? "", SMART_NOTE_FOCUS_CHARACTERS)
  const lines = noteLines(input.notes)
  const parts = [
    "The learner asked for a note from this chat.",
    "Write one short note they can edit and save, summarizing the learning in this chat.",
    "Do not repeat a note they already saved.",
    "Reply with only the note text. Do not call tools.",
    "",
    "Existing notes:",
    lines.length > 0 ? lines.join("\n") : "None yet.",
  ]
  if (focus.length > 0) parts.push("", `Focus: ${focus}`)
  return parts.join("\n")
}
