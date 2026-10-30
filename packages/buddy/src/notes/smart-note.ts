import { activateNotesLibraryRoot, scanNotes } from "./library-index"
import { findNotebookIdentity } from "./notebook-identity"
import { notePlainText } from "./presentation"
import { smartNotePrompt, type TSmartNoteContextNote } from "./smart-note-prompt"

const WRAPPED_NOTE = /^```[^\n]*\r?\n([\s\S]*?)\r?\n```[ \t]*$/u

export class SmartNoteDraftEmpty extends Error {
  readonly _tag = "SmartNoteDraftEmpty" as const

  constructor() {
    super("The note draft was empty.")
    this.name = "SmartNoteDraftEmpty"
  }
}

export class SmartNoteDraftUnavailable extends Error {
  readonly _tag = "SmartNoteDraftUnavailable" as const

  constructor(cause: unknown) {
    super("A note could not be drafted from this chat.", { cause })
    this.name = "SmartNoteDraftUnavailable"
  }
}

export type TSmartNoteDraftError = SmartNoteDraftEmpty | SmartNoteDraftUnavailable

export type TSmartNoteDraftResult =
  | { readonly _tag: "ok"; readonly text: string }
  | { readonly _tag: "err"; readonly error: TSmartNoteDraftError }

export type TSmartNoteGenerate = (input: {
  readonly sessionID: string
  readonly prompt: string
  readonly signal?: AbortSignal
}) => Promise<string>

function parseSmartNoteDraft(text: string) {
  const trimmed = text.trim()
  const wrapped = WRAPPED_NOTE.exec(trimmed)
  const note = (wrapped?.[1] ?? trimmed).trim()
  return note.length > 0 ? note : undefined
}

async function notesForDirectory(directory: string): Promise<TSmartNoteContextNote[]> {
  const identity = await findNotebookIdentity(directory)
  if (!identity) return []
  const root = await activateNotesLibraryRoot()
  const notes = await scanNotes(root)
  return notes
    .filter((note) => note.summary.notebookID === identity.id)
    .map((note) => ({
      title: note.summary.title,
      text: notePlainText(note.content),
      updatedAt: note.summary.updatedAt,
    }))
}

export async function draftSessionSmartNote(input: {
  readonly directory: string
  readonly sessionID: string
  readonly focus?: string
  readonly signal?: AbortSignal
  readonly generate: TSmartNoteGenerate
}): Promise<TSmartNoteDraftResult> {
  if (input.signal?.aborted) {
    return { _tag: "err", error: new SmartNoteDraftUnavailable(input.signal.reason) }
  }

  let prompt: string
  try {
    const notes = await notesForDirectory(input.directory)
    prompt = input.focus
      ? smartNotePrompt({ notes, focus: input.focus })
      : smartNotePrompt({ notes })
  } catch (cause) {
    return { _tag: "err", error: new SmartNoteDraftUnavailable(cause) }
  }

  if (input.signal?.aborted) {
    return { _tag: "err", error: new SmartNoteDraftUnavailable(input.signal.reason) }
  }

  try {
    const text = input.signal
      ? await input.generate({
          sessionID: input.sessionID,
          prompt,
          signal: input.signal,
        })
      : await input.generate({
          sessionID: input.sessionID,
          prompt,
        })
    const draft = parseSmartNoteDraft(text)
    if (!draft) return { _tag: "err", error: new SmartNoteDraftEmpty() }
    return { _tag: "ok", text: draft }
  } catch (cause) {
    return { _tag: "err", error: new SmartNoteDraftUnavailable(cause) }
  }
}
