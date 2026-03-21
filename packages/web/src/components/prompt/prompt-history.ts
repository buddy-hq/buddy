import type { PromptComposerAttachment, PromptComposerPart } from './prompt-types'

export type PromptHistoryEntry = {
  value: string
  attachments: PromptComposerAttachment[]
  parts: PromptComposerPart[]
}

const EMPTY_DRAFT: PromptHistoryEntry = {
  value: '',
  attachments: [],
  parts: [],
}

export const MAX_HISTORY = 100

export function clonePromptHistoryEntry(entry: PromptHistoryEntry): PromptHistoryEntry {
  return {
    value: entry.value,
    attachments: entry.attachments.map((attachment) => ({ ...attachment })),
    parts: entry.parts.map((part) => ({ ...part })),
  }
}

export function canNavigateHistoryAtCursor(
  direction: 'up' | 'down',
  text: string,
  cursor: number,
  inHistory = false,
) {
  const position = Math.max(0, Math.min(cursor, text.length))
  const atStart = position === 0
  const atEnd = position === text.length

  if (inHistory) return atStart || atEnd
  if (direction === 'up') return atStart
  return atEnd
}

function isHistoryEntryEqual(left: PromptHistoryEntry, right: PromptHistoryEntry) {
  if (left.value !== right.value) return false
  if (left.attachments.length !== right.attachments.length) return false
  if (left.parts.length !== right.parts.length) return false

  for (let index = 0; index < left.attachments.length; index += 1) {
    const leftAttachment = left.attachments[index]
    const rightAttachment = right.attachments[index]
    if (!leftAttachment || !rightAttachment) return false
    if (leftAttachment.filename !== rightAttachment.filename) return false
    if (leftAttachment.mime !== rightAttachment.mime) return false
    if (leftAttachment.dataUrl !== rightAttachment.dataUrl) return false
    if (leftAttachment.kind !== rightAttachment.kind) return false
  }

  for (let index = 0; index < left.parts.length; index += 1) {
    const leftPart = left.parts[index]
    const rightPart = right.parts[index]
    if (!leftPart || !rightPart) return false
    if (leftPart.type !== rightPart.type) return false
    if ('text' in leftPart && 'text' in rightPart && leftPart.text !== rightPart.text) return false
    if ('name' in leftPart && 'name' in rightPart && leftPart.name !== rightPart.name) return false
    if ('path' in leftPart && 'path' in rightPart && leftPart.path !== rightPart.path) return false
    if ('key' in leftPart && 'key' in rightPart && leftPart.key !== rightPart.key) return false
  }

  return true
}

export function prependHistoryEntry(
  entries: PromptHistoryEntry[],
  entry: PromptHistoryEntry,
  max = MAX_HISTORY,
) {
  const normalized = {
    value: entry.value.trimEnd(),
    attachments: entry.attachments,
    parts: entry.parts,
  }

  if (
    !normalized.value.trim() &&
    normalized.attachments.length === 0 &&
    normalized.parts.length === 0
  ) {
    return entries
  }

  const snapshot = clonePromptHistoryEntry(normalized)
  const latest = entries[0]
  if (latest && isHistoryEntryEqual(latest, snapshot)) {
    return entries
  }

  return [snapshot, ...entries].slice(0, max)
}

type HistoryInput = {
  direction: 'up' | 'down'
  entries: PromptHistoryEntry[]
  historyIndex: number
  current: PromptHistoryEntry
  savedDraft: PromptHistoryEntry | null
}

type HistoryResult =
  | {
      handled: false
      historyIndex: number
      savedDraft: PromptHistoryEntry | null
    }
  | {
      handled: true
      historyIndex: number
      savedDraft: PromptHistoryEntry | null
      entry: PromptHistoryEntry
      cursor: 'start' | 'end'
    }

export function navigatePromptHistory(input: HistoryInput): HistoryResult {
  if (input.direction === 'up') {
    if (input.entries.length === 0) {
      return {
        handled: false,
        historyIndex: input.historyIndex,
        savedDraft: input.savedDraft,
      }
    }

    if (input.historyIndex === -1) {
      return {
        handled: true,
        historyIndex: 0,
        savedDraft: clonePromptHistoryEntry(input.current),
        entry: clonePromptHistoryEntry(input.entries[0]!),
        cursor: 'start',
      }
    }

    if (input.historyIndex < input.entries.length - 1) {
      const next = input.historyIndex + 1
      return {
        handled: true,
        historyIndex: next,
        savedDraft: input.savedDraft,
        entry: clonePromptHistoryEntry(input.entries[next]!),
        cursor: 'start',
      }
    }

    return {
      handled: false,
      historyIndex: input.historyIndex,
      savedDraft: input.savedDraft,
    }
  }

  if (input.historyIndex > 0) {
    const next = input.historyIndex - 1
    return {
      handled: true,
      historyIndex: next,
      savedDraft: input.savedDraft,
      entry: clonePromptHistoryEntry(input.entries[next]!),
      cursor: 'end',
    }
  }

  if (input.historyIndex === 0) {
    return {
      handled: true,
      historyIndex: -1,
      savedDraft: null,
      entry: clonePromptHistoryEntry(input.savedDraft ?? EMPTY_DRAFT),
      cursor: 'end',
    }
  }

  return {
    handled: false,
    historyIndex: input.historyIndex,
    savedDraft: input.savedDraft,
  }
}
