import { create } from "zustand"
import { isNativeResourceFormat } from "@buddy/workspace-file-policy"
import {
  persist,
  type PersistStorage,
  type StateStorage,
  type StorageValue,
} from "zustand/middleware"
import { immer } from "zustand/middleware/immer"
import {
  arePromptPartsEqual,
  createPromptPartsFromValue,
  clonePromptParts,
  serializePromptParts,
} from "@/components/prompt/prompt-parts"
import {
  clonePromptHistoryEntry,
  prependHistoryEntry,
  type PromptHistoryEntry,
} from "@/components/prompt/prompt-history"
import {
  PROMPT_PART_TYPE_AGENT,
  PROMPT_PART_TYPE_SKILL,
  PROMPT_PART_TYPE_TEXT,
  OPENCODE_REFERENCE_PART_TYPE,
  READING_SELECTION_PART_TYPE,
  RESOURCE_REFERENCE_PART_TYPE,
  SELECTION_CONTEXT_PART_TYPE,
  WORKSPACE_FILE_REFERENCE_PART_TYPE,
  readPromptReaderTextAnchor,
  type PromptComposerAttachment,
  type PromptComposerPart,
  type PromptMarkdownSelectionContextPart,
  type PromptReadingSelectionContextPart,
  type PromptReadingSelectionPart,
  isPromptModelAttachment,
  isPromptReadyNativeResourceAttachment,
} from "@/components/prompt/prompt-types"
import { getPlatform } from "../context/platform"

export const PROMPT_STORE_STORAGE_KEY = "buddy.prompt.v1"
export const PROMPT_STORE_STORAGE_FILE = "buddy.prompt.dat"
export const PROMPT_STORE_VERSION = 2
export const PROMPT_STORE_PERSIST_DEBOUNCE_MS = 250
export const WORKSPACE_PROMPT_SCOPE = "__workspace__"
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

export type PromptStore = {
  draftsByKey: Record<string, PromptDraftState>
  historyByDirectory: Record<string, PromptHistoryEntry[]>
  historyNavigationByKey: Record<string, PromptHistoryNavigationState>
  replaceDraft: (key: string, draft: Omit<PromptDraftState, "updatedAt">) => void
  setAttachments: (key: string, attachments: PromptComposerAttachment[]) => void
  setCursor: (key: string, cursor: number) => void
  clearDraft: (key: string) => void
  pushHistoryEntry: (directory: string, entry: PromptHistoryEntry) => void
  setHistoryNavigation: (key: string, input: PromptHistoryNavigationState) => void
  resetHistoryNavigation: (key: string) => void
  migrateWorkspaceDraft: (directory: string, sessionID: string) => void
  removeSessionDraft: (key: string) => void
}

type PersistedPromptStoreState = {
  draftsByKey?: Record<string, PromptDraftState>
  historyByDirectory?: Record<string, PromptHistoryEntry[]>
}

const EMPTY_HISTORY_ENTRIES: PromptHistoryEntry[] = []
const EMPTY_HISTORY_NAVIGATION: PromptHistoryNavigationState = {
  historyIndex: -1,
  savedDraft: null,
}
const EMPTY_PROMPT_DRAFT: PromptDraftState = {
  value: "",
  parts: [],
  attachments: [],
  cursor: 0,
  updatedAt: 0,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isPromptComposerAttachment(value: unknown): value is PromptComposerAttachment {
  if (!isRecord(value)) {
    return false
  }
  const isModelAttachment =
    typeof value.id === "string" &&
    typeof value.filename === "string" &&
    typeof value.mime === "string" &&
    typeof value.dataUrl === "string" &&
    (value.localPath === undefined || typeof value.localPath === "string") &&
    (value.editTarget === undefined || value.editTarget === true) &&
    (value.kind === "image" || value.kind === "file")
  if (isModelAttachment) return true

  if (
    typeof value.id !== "string" ||
    typeof value.filename !== "string" ||
    typeof value.mime !== "string" ||
    value.kind !== "native-resource" ||
    typeof value.format !== "string" ||
    !isNativeResourceFormat(value.format) ||
    (value.delivery !== "model-and-resource" && value.delivery !== "resource-only")
  ) {
    return false
  }
  if (value.status === "copying") return true
  if (value.status === "error") return typeof value.error === "string"
  return (
    value.status === "ready" &&
    typeof value.uploadID === "string" &&
    typeof value.workspacePath === "string" &&
    typeof value.localPath === "string" &&
    typeof value.sizeBytes === "number" &&
    Number.isFinite(value.sizeBytes)
  )
}

function readOptionalString(value: unknown): string | undefined | null {
  if (value === undefined) return undefined
  return typeof value === "string" ? value : null
}

function readOptionalStringArray(value: unknown): string[] | undefined | null {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) return null
  return [...value]
}

function readPromptComposerPart(value: unknown): PromptComposerPart | undefined {
  if (!isRecord(value) || typeof value.type !== "string") return undefined
  if (value.type === PROMPT_PART_TYPE_TEXT) {
    return typeof value.text === "string"
      ? { type: PROMPT_PART_TYPE_TEXT, text: value.text }
      : undefined
  }
  if (value.type === PROMPT_PART_TYPE_AGENT) {
    return typeof value.name === "string"
      ? { type: PROMPT_PART_TYPE_AGENT, name: value.name }
      : undefined
  }
  if (value.type === PROMPT_PART_TYPE_SKILL) {
    return typeof value.name === "string"
      ? { type: PROMPT_PART_TYPE_SKILL, name: value.name }
      : undefined
  }
  if (value.type === OPENCODE_REFERENCE_PART_TYPE) {
    return typeof value.name === "string" && typeof value.path === "string"
      ? { type: OPENCODE_REFERENCE_PART_TYPE, name: value.name, path: value.path }
      : undefined
  }
  if (value.type === WORKSPACE_FILE_REFERENCE_PART_TYPE) {
    return typeof value.path === "string"
      ? { type: WORKSPACE_FILE_REFERENCE_PART_TYPE, path: value.path }
      : undefined
  }
  if (value.type === RESOURCE_REFERENCE_PART_TYPE) {
    return typeof value.key === "string"
      ? { type: RESOURCE_REFERENCE_PART_TYPE, key: value.key }
      : undefined
  }
  if (value.type === READING_SELECTION_PART_TYPE) {
    if (typeof value.text !== "string") return undefined
    const anchor = readPromptReaderTextAnchor(value)
    if (!anchor) return undefined
    const selectionKey = readOptionalString(value.selectionKey)
    const resourceKey = readOptionalString(value.resourceKey)
    const tocLabel = readOptionalString(value.tocLabel)
    const pageLabel = readOptionalString(value.pageLabel)
    const locationLabel = readOptionalString(value.locationLabel)
    if (
      selectionKey === null ||
      resourceKey === null ||
      tocLabel === null ||
      pageLabel === null ||
      locationLabel === null
    ) {
      return undefined
    }
    const part: PromptReadingSelectionPart = Object.assign(
      Object.assign(
        {
          type: READING_SELECTION_PART_TYPE,
          text: value.text,
        },
        selectionKey !== undefined ? { selectionKey } : undefined,
        resourceKey !== undefined ? { resourceKey } : undefined,
        { anchor },
      ),
      tocLabel !== undefined ? { tocLabel } : undefined,
      pageLabel !== undefined ? { pageLabel } : undefined,
      locationLabel !== undefined ? { locationLabel } : undefined,
    )
    return part
  }
  if (value.type === SELECTION_CONTEXT_PART_TYPE) {
    if (typeof value.text !== "string" || typeof value.selectionKey !== "string") {
      return undefined
    }
    if (value.source === "markdown") {
      const path = readOptionalString(value.path)
      const version = readOptionalString(value.version)
      const headingPath = readOptionalStringArray(value.headingPath)
      if (path === null || version === null || headingPath === null) return undefined
      const part: PromptMarkdownSelectionContextPart = Object.assign(
        {
          type: SELECTION_CONTEXT_PART_TYPE,
          source: "markdown" as const,
          text: value.text,
          selectionKey: value.selectionKey,
        },
        path !== undefined ? { path } : undefined,
        version !== undefined ? { version } : undefined,
        headingPath !== undefined ? { headingPath } : undefined,
      )
      return part
    }
    if (value.source !== "reading") return undefined
    const anchor = readPromptReaderTextAnchor(value)
    if (!anchor) return undefined
    const resourceKey = readOptionalString(value.resourceKey)
    const tocLabel = readOptionalString(value.tocLabel)
    const pageLabel = readOptionalString(value.pageLabel)
    const locationLabel = readOptionalString(value.locationLabel)
    if (resourceKey === null || tocLabel === null || pageLabel === null || locationLabel === null) {
      return undefined
    }
    const part: PromptReadingSelectionContextPart = Object.assign(
      Object.assign(
        {
          type: SELECTION_CONTEXT_PART_TYPE,
          source: "reading" as const,
          text: value.text,
          selectionKey: value.selectionKey,
        },
        resourceKey !== undefined ? { resourceKey } : undefined,
        { anchor },
      ),
      tocLabel !== undefined ? { tocLabel } : undefined,
      pageLabel !== undefined ? { pageLabel } : undefined,
      locationLabel !== undefined ? { locationLabel } : undefined,
    )
    return part
  }
  return undefined
}

function readPromptComposerParts(value: unknown): PromptComposerPart[] | undefined {
  if (!Array.isArray(value)) return undefined
  const parts: PromptComposerPart[] = []
  for (const part of value) {
    const parsed = readPromptComposerPart(part)
    if (!parsed) return undefined
    parts.push(parsed)
  }
  return parts
}

function readPromptDraftState(value: unknown): PromptDraftState | undefined {
  if (!isRecord(value)) return undefined
  const parts = readPromptComposerParts(value.parts)
  if (
    typeof value.value !== "string" ||
    !parts ||
    !Array.isArray(value.attachments) ||
    !value.attachments.every(isPromptComposerAttachment) ||
    typeof value.cursor !== "number" ||
    !Number.isFinite(value.cursor) ||
    typeof value.updatedAt !== "number" ||
    !Number.isFinite(value.updatedAt)
  ) {
    return undefined
  }

  return {
    value: value.value,
    parts,
    attachments: value.attachments,
    cursor: value.cursor,
    updatedAt: value.updatedAt,
  }
}

function readPromptHistoryEntry(value: unknown): PromptHistoryEntry | undefined {
  if (!isRecord(value)) return undefined
  const parts = readPromptComposerParts(value.parts)
  if (
    typeof value.value !== "string" ||
    !parts ||
    !Array.isArray(value.attachments) ||
    !value.attachments.every(isPromptComposerAttachment)
  ) {
    return undefined
  }

  return {
    value: value.value,
    parts,
    attachments: value.attachments,
  }
}

function readDraftsByKey(value: unknown): Record<string, PromptDraftState> | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const result: Record<string, PromptDraftState> = {}
  for (const [key, entry] of Object.entries(value)) {
    const draft = readPromptDraftState(entry)
    if (draft) result[key] = draft
  }
  return result
}

function readHistoryByDirectory(value: unknown): Record<string, PromptHistoryEntry[]> | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const result: Record<string, PromptHistoryEntry[]> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (Array.isArray(entry)) {
      const historyEntries = entry.flatMap((historyEntry) => {
        const parsed = readPromptHistoryEntry(historyEntry)
        return parsed ? [parsed] : []
      })
      result[key] = historyEntries
    }
  }
  return result
}

function readPersistedPromptStoreState(value: unknown): PersistedPromptStoreState {
  if (!isRecord(value)) {
    return {}
  }

  return {
    draftsByKey: readDraftsByKey(value.draftsByKey),
    historyByDirectory: readHistoryByDirectory(value.historyByDirectory),
  }
}

type PersistedPromptStorageValue = StorageValue<PersistedPromptStoreState>

const memoryPromptStorage = new Map<string, string>()
let pendingPromptStorageName: string | undefined
let pendingPromptStorageValue: PersistedPromptStorageValue | undefined
let pendingPromptStorageTimer: ReturnType<typeof setTimeout> | undefined
let promptStorageFlushEventsInstalled = false

const fallbackPromptStorage: StateStorage = {
  getItem(name) {
    return memoryPromptStorage.get(name) ?? null
  },
  setItem(name, value) {
    memoryPromptStorage.set(name, value)
  },
  removeItem(name) {
    memoryPromptStorage.delete(name)
  },
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}

function getPromptStateStorage(): StateStorage {
  const platformStorage = getPlatform().storage?.(PROMPT_STORE_STORAGE_FILE)
  if (platformStorage) return platformStorage
  if (typeof localStorage !== "undefined") return localStorage
  return fallbackPromptStorage
}

function isFlushableStorage(
  storage: StateStorage,
): storage is StateStorage & { flush: () => Promise<void> | void } {
  return "flush" in storage && typeof storage.flush === "function"
}

function readPersistedPromptStorageValue(raw: string): PersistedPromptStorageValue | null {
  const parsed = parseJson(raw)
  if (!isRecord(parsed)) return null

  return Object.assign(
    {
      state: readPersistedPromptStoreState(parsed.state),
    },
    typeof parsed.version === "number" ? { version: parsed.version } : undefined,
  )
}

export function flushPromptStorePersistence() {
  if (pendingPromptStorageTimer !== undefined) {
    clearTimeout(pendingPromptStorageTimer)
    pendingPromptStorageTimer = undefined
  }

  if (!pendingPromptStorageName || !pendingPromptStorageValue) return

  const name = pendingPromptStorageName
  const value = pendingPromptStorageValue
  pendingPromptStorageName = undefined
  pendingPromptStorageValue = undefined

  const storage = getPromptStateStorage()
  void storage.setItem(name, JSON.stringify(value))
  if (isFlushableStorage(storage)) {
    void storage.flush()
  }
}

function schedulePromptStorePersistence() {
  if (pendingPromptStorageTimer !== undefined) {
    clearTimeout(pendingPromptStorageTimer)
  }

  pendingPromptStorageTimer = setTimeout(() => {
    flushPromptStorePersistence()
  }, PROMPT_STORE_PERSIST_DEBOUNCE_MS)
}

function installPromptStorePersistenceFlushEvents() {
  if (promptStorageFlushEventsInstalled || typeof window === "undefined") return
  promptStorageFlushEventsInstalled = true

  window.addEventListener("pagehide", flushPromptStorePersistence)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "hidden") return
    flushPromptStorePersistence()
  })
}

function createPromptStoreStorage(): PersistStorage<PersistedPromptStoreState> {
  installPromptStorePersistenceFlushEvents()

  return {
    getItem(name) {
      if (pendingPromptStorageName === name && pendingPromptStorageValue) {
        return pendingPromptStorageValue
      }

      const raw = getPromptStateStorage().getItem(name)
      if (raw !== null && typeof raw === "object") {
        return raw.then((value) =>
          typeof value === "string" ? readPersistedPromptStorageValue(value) : null,
        )
      }
      if (typeof raw !== "string") return null
      return readPersistedPromptStorageValue(raw)
    },
    setItem(name, value) {
      pendingPromptStorageName = name
      pendingPromptStorageValue = value
      schedulePromptStorePersistence()
    },
    removeItem(name) {
      if (pendingPromptStorageName === name) {
        pendingPromptStorageName = undefined
        pendingPromptStorageValue = undefined
      }
      if (pendingPromptStorageTimer !== undefined) {
        clearTimeout(pendingPromptStorageTimer)
        pendingPromptStorageTimer = undefined
      }
      void getPromptStateStorage().removeItem(name)
    },
  }
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

function isDraftEmpty(draft: PromptDraftState) {
  return !draft.value.trim() && draft.attachments.length === 0 && draft.parts.length === 0
}

export function normalizePromptDraft(
  draft: Omit<PromptDraftState, "updatedAt">,
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

function areAttachmentsEqual(left: PromptComposerAttachment[], right: PromptComposerAttachment[]) {
  if (left.length !== right.length) return false

  for (let index = 0; index < left.length; index += 1) {
    const leftAttachment = left[index]
    const rightAttachment = right[index]
    if (!leftAttachment || !rightAttachment) return false
    if (leftAttachment.id !== rightAttachment.id) return false
    if (leftAttachment.filename !== rightAttachment.filename) return false
    if (leftAttachment.mime !== rightAttachment.mime) return false
    if (leftAttachment.kind !== rightAttachment.kind) return false
    if (isPromptModelAttachment(leftAttachment) && isPromptModelAttachment(rightAttachment)) {
      if (leftAttachment.dataUrl !== rightAttachment.dataUrl) return false
      if (leftAttachment.localPath !== rightAttachment.localPath) return false
      if (leftAttachment.editTarget !== rightAttachment.editTarget) return false
      continue
    }
    if (leftAttachment.kind !== "native-resource" || rightAttachment.kind !== "native-resource") {
      return false
    }
    if (leftAttachment.format !== rightAttachment.format) return false
    if (leftAttachment.delivery !== rightAttachment.delivery) return false
    if (leftAttachment.status !== rightAttachment.status) return false
    if (leftAttachment.status === "error" && rightAttachment.status === "error") {
      if (leftAttachment.error !== rightAttachment.error) return false
      continue
    }
    if (leftAttachment.status === "ready" && rightAttachment.status === "ready") {
      if (leftAttachment.uploadID !== rightAttachment.uploadID) return false
      if (leftAttachment.workspacePath !== rightAttachment.workspacePath) return false
      if (leftAttachment.localPath !== rightAttachment.localPath) return false
      if (leftAttachment.sizeBytes !== rightAttachment.sizeBytes) return false
    }
  }

  return true
}

export function arePromptDraftContentsEqual(left: PromptDraftState, right: PromptDraftState) {
  return (
    left.value === right.value &&
    left.cursor === right.cursor &&
    arePromptPartsEqual(left.parts, right.parts) &&
    areAttachmentsEqual(left.attachments, right.attachments)
  )
}

function pruneDraftEntries(entries: Record<string, PromptDraftState>, max = MAX_PROMPT_DRAFTS) {
  const ordered = Object.entries(entries).toSorted(
    (left, right) => (right[1]?.updatedAt ?? 0) - (left[1]?.updatedAt ?? 0),
  )
  if (ordered.length <= max) {
    return entries
  }

  return Object.fromEntries(ordered.slice(0, max))
}

export function getPromptScopeKey(directory: string, sessionID?: string) {
  return `${directory}::${sessionID ?? WORKSPACE_PROMPT_SCOPE}`
}

export function createTextPromptDraft(value: string): Omit<PromptDraftState, "updatedAt"> {
  return {
    value,
    parts: createPromptPartsFromValue(value, new Set()),
    attachments: [],
    cursor: value.length,
  }
}

export function getPromptDraft(
  state: Pick<PromptStore, "draftsByKey">,
  key: string,
): PromptDraftState {
  return state.draftsByKey[key] ?? EMPTY_PROMPT_DRAFT
}

export function getPromptHistoryEntries(
  state: Pick<PromptStore, "historyByDirectory">,
  directory: string,
): PromptHistoryEntry[] {
  return state.historyByDirectory[directory] ?? EMPTY_HISTORY_ENTRIES
}

export function getPromptHistoryNavigation(
  state: Pick<PromptStore, "historyNavigationByKey">,
  key: string,
): PromptHistoryNavigationState {
  return state.historyNavigationByKey[key] ?? EMPTY_HISTORY_NAVIGATION
}

export const usePromptStore = create<PromptStore>()(
  persist(
    immer((set, get) => {
      const draftSlice: Pick<
        PromptStore,
        | "draftsByKey"
        | "replaceDraft"
        | "setAttachments"
        | "setCursor"
        | "clearDraft"
        | "migrateWorkspaceDraft"
        | "removeSessionDraft"
      > = {
        draftsByKey: {},
        replaceDraft(key, draft) {
          set((state) => {
            const nextDraft = normalizePromptDraft(draft)
            const currentDraft = state.draftsByKey[key]
            if (currentDraft && arePromptDraftContentsEqual(currentDraft, nextDraft)) {
              return
            }
            if (isDraftEmpty(nextDraft)) {
              if (!currentDraft) return
              delete state.draftsByKey[key]
            } else {
              state.draftsByKey = pruneDraftEntries({
                ...state.draftsByKey,
                [key]: nextDraft,
              })
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
          set((state) => {
            delete state.draftsByKey[key]
            delete state.historyNavigationByKey[key]
          })
        },
        migrateWorkspaceDraft(directory, sessionID) {
          const sourceKey = getPromptScopeKey(directory)
          const targetKey = getPromptScopeKey(directory, sessionID)
          const source = getPromptDraft(get(), sourceKey)
          const target = getPromptDraft(get(), targetKey)

          if (isDraftEmpty(source) || !isDraftEmpty(target)) return

          set((state) => {
            const clonedSource = clonePromptDraft(source)
            clonedSource.updatedAt = Date.now()
            delete state.draftsByKey[sourceKey]
            delete state.historyNavigationByKey[sourceKey]
            state.draftsByKey = pruneDraftEntries({
              ...state.draftsByKey,
              [targetKey]: clonedSource,
            })
          })
        },
        removeSessionDraft(key) {
          get().clearDraft(key)
        },
      }

      const historySlice: Pick<
        PromptStore,
        | "historyByDirectory"
        | "historyNavigationByKey"
        | "pushHistoryEntry"
        | "setHistoryNavigation"
        | "resetHistoryNavigation"
      > = {
        historyByDirectory: {},
        historyNavigationByKey: {},
        pushHistoryEntry(directory, entry) {
          set((state) => {
            state.historyByDirectory[directory] = prependHistoryEntry(
              state.historyByDirectory[directory] ?? EMPTY_HISTORY_ENTRIES,
              entry,
            )
          })
        },
        setHistoryNavigation(key, input) {
          set((state) => {
            state.historyNavigationByKey[key] = {
              historyIndex: input.historyIndex,
              savedDraft: input.savedDraft ? clonePromptHistoryEntry(input.savedDraft) : null,
            }
          })
        },
        resetHistoryNavigation(key) {
          set((state) => {
            delete state.historyNavigationByKey[key]
          })
        },
      }

      return {
        ...draftSlice,
        ...historySlice,
      }
    }),
    {
      name: PROMPT_STORE_STORAGE_KEY,
      version: PROMPT_STORE_VERSION,
      storage: createPromptStoreStorage(),
      partialize(state) {
        const draftsByKey = Object.fromEntries(
          Object.entries(state.draftsByKey).map(([key, draft]) => [
            key,
            {
              ...draft,
              attachments: draft.attachments.filter(
                (attachment) =>
                  isPromptModelAttachment(attachment) ||
                  isPromptReadyNativeResourceAttachment(attachment),
              ),
            },
          ]),
        )
        const historyByDirectory = Object.fromEntries(
          Object.entries(state.historyByDirectory).map(([directory, entries]) => [
            directory,
            entries.map((entry) => ({
              ...entry,
              attachments: entry.attachments.filter(
                (attachment) =>
                  isPromptModelAttachment(attachment) ||
                  isPromptReadyNativeResourceAttachment(attachment),
              ),
            })),
          ]),
        )
        return {
          draftsByKey,
          historyByDirectory,
        }
      },
      migrate(persistedState) {
        const state = readPersistedPromptStoreState(persistedState)

        return {
          draftsByKey: state?.draftsByKey ?? {},
          historyByDirectory: state?.historyByDirectory ?? {},
          historyNavigationByKey: {},
        }
      },
    },
  ),
)
