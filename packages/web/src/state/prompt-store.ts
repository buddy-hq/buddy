import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  createPromptPartsFromValue,
  clonePromptParts,
  serializePromptParts,
} from '@/components/prompt/prompt-parts'
import {
  clonePromptHistoryEntry,
  prependHistoryEntry,
  type PromptHistoryEntry,
} from '@/components/prompt/prompt-history'
import type { PromptComposerAttachment, PromptComposerPart } from '@/components/prompt/prompt-types'
import { createPlatformJsonStorage } from '../context/platform'

export const PROMPT_STORE_STORAGE_KEY = 'buddy.prompt.v1'
export const WORKSPACE_PROMPT_SCOPE = '__workspace__'
export const MAX_PROMPT_DRAFTS = 20

export type PromptDraftState = {
  value: string
  parts: PromptComposerPart[]
  attachments: PromptComposerAttachment[]
  cursor: number
  updatedAt: number
}

export type PromptHistoryNavigationState = {
  historyIndex: number
  savedDraft: PromptHistoryEntry | null
}

type PromptStore = {
  draftsByKey: Record<string, PromptDraftState>
  historyByDirectory: Record<string, PromptHistoryEntry[]>
  historyNavigationByKey: Record<string, PromptHistoryNavigationState>
  replaceDraft: (key: string, draft: Omit<PromptDraftState, 'updatedAt'>) => void
  setAttachments: (key: string, attachments: PromptComposerAttachment[]) => void
  setCursor: (key: string, cursor: number) => void
  clearDraft: (key: string) => void
  pushHistoryEntry: (directory: string, entry: PromptHistoryEntry) => void
  setHistoryNavigation: (key: string, input: PromptHistoryNavigationState) => void
  resetHistoryNavigation: (key: string) => void
  migrateWorkspaceDraft: (directory: string, sessionID: string) => void
  removeSessionDraft: (key: string) => void
}

const EMPTY_HISTORY_ENTRIES: PromptHistoryEntry[] = []
const EMPTY_HISTORY_NAVIGATION: PromptHistoryNavigationState = {
  historyIndex: -1,
  savedDraft: null,
}
const EMPTY_PROMPT_DRAFT: PromptDraftState = {
  value: '',
  parts: [],
  attachments: [],
  cursor: 0,
  updatedAt: 0,
}

function cloneAttachments(attachments: PromptComposerAttachment[]) {
  return attachments.map((attachment) => ({ ...attachment }))
}

export function clonePromptDraft(draft: PromptDraftState): PromptDraftState {
  return {
    value: draft.value,
    parts: clonePromptParts(draft.parts),
    attachments: cloneAttachments(draft.attachments),
    cursor: draft.cursor,
    updatedAt: draft.updatedAt,
  }
}

function omitRecordKey<T>(record: Record<string, T>, key: string) {
  if (!(key in record)) return record
  const next = { ...record }
  delete next[key]
  return next
}

function isDraftEmpty(draft: PromptDraftState) {
  return !draft.value.trim() && draft.attachments.length === 0 && draft.parts.length === 0
}

function normalizePromptDraft(
  draft: Omit<PromptDraftState, 'updatedAt'>,
  updatedAt = Date.now(),
): PromptDraftState {
  const parts = clonePromptParts(draft.parts)
  const attachments = cloneAttachments(draft.attachments)
  const value = parts.length > 0 ? serializePromptParts(parts) : draft.value
  const cursorLimit = parts.length > 0 ? value.length : draft.value.length

  return {
    value,
    parts,
    attachments,
    cursor: Math.max(0, Math.min(draft.cursor, cursorLimit)),
    updatedAt,
  }
}

function pruneDraftEntries(entries: Record<string, PromptDraftState>, max = MAX_PROMPT_DRAFTS) {
  const keys = Object.keys(entries)
  if (keys.length <= max) return entries

  const ordered = keys
    .map((key) => [key, entries[key]] as const)
    .sort((left, right) => (right[1]?.updatedAt ?? 0) - (left[1]?.updatedAt ?? 0))
    .slice(0, max)

  return Object.fromEntries(ordered)
}

export function getPromptScopeKey(directory: string, sessionID?: string) {
  return `${directory}::${sessionID ?? WORKSPACE_PROMPT_SCOPE}`
}

export function createTextPromptDraft(value: string): Omit<PromptDraftState, 'updatedAt'> {
  return {
    value,
    parts: createPromptPartsFromValue(value, new Set()),
    attachments: [],
    cursor: value.length,
  }
}

export function getPromptDraft(
  state: Pick<PromptStore, 'draftsByKey'>,
  key: string,
): PromptDraftState {
  return state.draftsByKey[key] ?? EMPTY_PROMPT_DRAFT
}

export function getPromptHistoryEntries(
  state: Pick<PromptStore, 'historyByDirectory'>,
  directory: string,
): PromptHistoryEntry[] {
  return state.historyByDirectory[directory] ?? EMPTY_HISTORY_ENTRIES
}

export function getPromptHistoryNavigation(
  state: Pick<PromptStore, 'historyNavigationByKey'>,
  key: string,
): PromptHistoryNavigationState {
  return state.historyNavigationByKey[key] ?? EMPTY_HISTORY_NAVIGATION
}

export const usePromptStore = create<PromptStore>()(
  persist(
    (set, get) => ({
      draftsByKey: {},
      historyByDirectory: {},
      historyNavigationByKey: {},
      replaceDraft(key, draft) {
        set((state) => {
          const nextDraft = normalizePromptDraft(draft)
          const draftsByKey = isDraftEmpty(nextDraft)
            ? omitRecordKey(state.draftsByKey, key)
            : pruneDraftEntries({
                ...state.draftsByKey,
                [key]: nextDraft,
              })

          return {
            draftsByKey,
          }
        })
      },
      setAttachments(key, attachments) {
        const current = getPromptDraft(get(), key)
        get().replaceDraft(key, {
          value: current.value,
          parts: current.parts,
          attachments,
          cursor: current.cursor,
        })
      },
      setCursor(key, cursor) {
        const current = getPromptDraft(get(), key)
        get().replaceDraft(key, {
          value: current.value,
          parts: current.parts,
          attachments: current.attachments,
          cursor,
        })
      },
      clearDraft(key) {
        set((state) => ({
          draftsByKey: omitRecordKey(state.draftsByKey, key),
          historyNavigationByKey: omitRecordKey(state.historyNavigationByKey, key),
        }))
      },
      pushHistoryEntry(directory, entry) {
        set((state) => ({
          historyByDirectory: {
            ...state.historyByDirectory,
            [directory]: prependHistoryEntry(getPromptHistoryEntries(state, directory), entry),
          },
        }))
      },
      setHistoryNavigation(key, input) {
        set((state) => ({
          historyNavigationByKey: {
            ...state.historyNavigationByKey,
            [key]: {
              historyIndex: input.historyIndex,
              savedDraft: input.savedDraft ? clonePromptHistoryEntry(input.savedDraft) : null,
            },
          },
        }))
      },
      resetHistoryNavigation(key) {
        set((state) => ({
          historyNavigationByKey: omitRecordKey(state.historyNavigationByKey, key),
        }))
      },
      migrateWorkspaceDraft(directory, sessionID) {
        const sourceKey = getPromptScopeKey(directory)
        const targetKey = getPromptScopeKey(directory, sessionID)
        const source = getPromptDraft(get(), sourceKey)
        const target = getPromptDraft(get(), targetKey)

        if (isDraftEmpty(source) || !isDraftEmpty(target)) return

        set((state) => ({
          draftsByKey: pruneDraftEntries({
            ...omitRecordKey(state.draftsByKey, sourceKey),
            [targetKey]: {
              ...clonePromptDraft(source),
              updatedAt: Date.now(),
            },
          }),
          historyNavigationByKey: omitRecordKey(state.historyNavigationByKey, sourceKey),
        }))
      },
      removeSessionDraft(key) {
        get().clearDraft(key)
      },
    }),
    {
      name: PROMPT_STORE_STORAGE_KEY,
      version: 1,
      storage: createPlatformJsonStorage('buddy.prompt.dat'),
      partialize(state) {
        return {
          draftsByKey: state.draftsByKey,
          historyByDirectory: state.historyByDirectory,
        }
      },
      migrate(persistedState) {
        const state = persistedState as
          | {
              draftsByKey?: Record<string, PromptDraftState>
              historyByDirectory?: Record<string, PromptHistoryEntry[]>
            }
          | undefined

        return {
          draftsByKey: state?.draftsByKey ?? {},
          historyByDirectory: state?.historyByDirectory ?? {},
          historyNavigationByKey: {},
        }
      },
    },
  ),
)
