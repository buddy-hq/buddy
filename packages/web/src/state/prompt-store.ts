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
import { z } from "zod"
import { getPlatform } from "../context/platform"
import {
  browserLocalStorage,
  browserWindow,
  hasFunctionValue,
  parseBuddyConfigObject,
  parseFiniteNumber,
  parseFilteredStringArray,
  parseOptionalStringField,
  parseStringValue,
  parseWithSchema,
} from "./parse-external"

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

const modelAttachmentKindSchema = z.enum(["image", "file"])
const nativeResourceDeliverySchema = z.enum(["model-and-resource", "resource-only"])

function parsePromptComposerAttachment<TValue>(
  value: TValue,
): PromptComposerAttachment | undefined {
  const record = parseBuddyConfigObject(value)
  if (!record) return undefined
  const id = parseStringValue(record.id)
  const filename = parseStringValue(record.filename)
  const mime = parseStringValue(record.mime)
  if (!id || !filename || !mime) return undefined

  const localPath = parseOptionalStringField(record.localPath)
  if (localPath === null) return undefined
  const dataUrl = parseStringValue(record.dataUrl)
  const modelKind = parseWithSchema(modelAttachmentKindSchema, record.kind)
  if (
    dataUrl !== undefined &&
    (record.editTarget === undefined || record.editTarget === true) &&
    modelKind !== undefined
  ) {
    return Object.assign(
      {
        id,
        filename,
        mime,
        dataUrl,
        kind: modelKind,
      },
      localPath !== undefined ? { localPath } : undefined,
      record.editTarget === true ? { editTarget: true as const } : undefined,
    )
  }

  const formatValue = parseStringValue(record.format)
  const delivery = parseWithSchema(nativeResourceDeliverySchema, record.delivery)
  if (
    record.kind !== "native-resource" ||
    !formatValue ||
    !isNativeResourceFormat(formatValue) ||
    delivery === undefined
  ) {
    return undefined
  }
  if (record.status === "copying") {
    return Object.assign(
      {
        id,
        filename,
        mime,
        kind: "native-resource" as const,
        format: formatValue,
        delivery,
        status: "copying" as const,
      },
      localPath !== undefined ? { localPath } : undefined,
    )
  }
  if (record.status === "error") {
    const error = parseStringValue(record.error)
    if (error === undefined) return undefined
    return Object.assign(
      {
        id,
        filename,
        mime,
        kind: "native-resource" as const,
        format: formatValue,
        delivery,
        status: "error" as const,
        error,
      },
      localPath !== undefined ? { localPath } : undefined,
    )
  }
  const uploadID = parseStringValue(record.uploadID)
  const workspacePath = parseStringValue(record.workspacePath)
  const readyLocalPath = parseStringValue(record.localPath)
  const sizeBytes = parseFiniteNumber(record.sizeBytes)
  if (
    record.status !== "ready" ||
    !uploadID ||
    !workspacePath ||
    !readyLocalPath ||
    sizeBytes === undefined
  ) {
    return undefined
  }
  return {
    id,
    filename,
    mime,
    kind: "native-resource",
    format: formatValue,
    delivery,
    status: "ready",
    uploadID,
    workspacePath,
    localPath: readyLocalPath,
    sizeBytes,
  }
}

function parseOptionalStringArrayField<TValue>(value: TValue): string[] | undefined | null {
  if (value === undefined) return undefined
  return parseFilteredStringArray(value) ?? null
}

function parsePromptComposerPart<TValue>(value: TValue): PromptComposerPart | undefined {
  const record = parseBuddyConfigObject(value)
  const type = parseStringValue(record?.type)
  if (!record || type === undefined) return undefined
  if (type === PROMPT_PART_TYPE_TEXT) {
    const text = parseStringValue(record.text)
    return text !== undefined ? { type: PROMPT_PART_TYPE_TEXT, text } : undefined
  }
  if (type === PROMPT_PART_TYPE_AGENT) {
    const name = parseStringValue(record.name)
    return name !== undefined ? { type: PROMPT_PART_TYPE_AGENT, name } : undefined
  }
  if (type === PROMPT_PART_TYPE_SKILL) {
    const name = parseStringValue(record.name)
    return name !== undefined ? { type: PROMPT_PART_TYPE_SKILL, name } : undefined
  }
  if (type === OPENCODE_REFERENCE_PART_TYPE) {
    const name = parseStringValue(record.name)
    const path = parseStringValue(record.path)
    return name !== undefined && path !== undefined
      ? { type: OPENCODE_REFERENCE_PART_TYPE, name, path }
      : undefined
  }
  if (type === WORKSPACE_FILE_REFERENCE_PART_TYPE) {
    const path = parseStringValue(record.path)
    return path !== undefined ? { type: WORKSPACE_FILE_REFERENCE_PART_TYPE, path } : undefined
  }
  if (type === RESOURCE_REFERENCE_PART_TYPE) {
    const key = parseStringValue(record.key)
    return key !== undefined ? { type: RESOURCE_REFERENCE_PART_TYPE, key } : undefined
  }
  if (type === READING_SELECTION_PART_TYPE) {
    const text = parseStringValue(record.text)
    if (text === undefined) return undefined
    const anchor = readPromptReaderTextAnchor(record)
    if (!anchor) return undefined
    const selectionKey = parseOptionalStringField(record.selectionKey)
    const resourceKey = parseOptionalStringField(record.resourceKey)
    const tocLabel = parseOptionalStringField(record.tocLabel)
    const pageLabel = parseOptionalStringField(record.pageLabel)
    const locationLabel = parseOptionalStringField(record.locationLabel)
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
          text,
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
  if (type === SELECTION_CONTEXT_PART_TYPE) {
    const text = parseStringValue(record.text)
    const selectionKey = parseStringValue(record.selectionKey)
    if (text === undefined || selectionKey === undefined) {
      return undefined
    }
    if (record.source === "markdown") {
      const path = parseOptionalStringField(record.path)
      const version = parseOptionalStringField(record.version)
      const headingPath = parseOptionalStringArrayField(record.headingPath)
      if (path === null || version === null || headingPath === null) return undefined
      const part: PromptMarkdownSelectionContextPart = Object.assign(
        {
          type: SELECTION_CONTEXT_PART_TYPE,
          source: "markdown" as const,
          text,
          selectionKey,
        },
        path !== undefined ? { path } : undefined,
        version !== undefined ? { version } : undefined,
        headingPath !== undefined ? { headingPath } : undefined,
      )
      return part
    }
    if (record.source !== "reading") return undefined
    const anchor = readPromptReaderTextAnchor(record)
    if (!anchor) return undefined
    const resourceKey = parseOptionalStringField(record.resourceKey)
    const tocLabel = parseOptionalStringField(record.tocLabel)
    const pageLabel = parseOptionalStringField(record.pageLabel)
    const locationLabel = parseOptionalStringField(record.locationLabel)
    if (resourceKey === null || tocLabel === null || pageLabel === null || locationLabel === null) {
      return undefined
    }
    const part: PromptReadingSelectionContextPart = Object.assign(
      Object.assign(
        {
          type: SELECTION_CONTEXT_PART_TYPE,
          source: "reading" as const,
          text,
          selectionKey,
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

function parsePromptComposerParts<TValue>(value: TValue): PromptComposerPart[] | undefined {
  if (!Array.isArray(value)) return undefined
  const parts: PromptComposerPart[] = []
  for (const part of value) {
    const parsed = parsePromptComposerPart(part)
    if (!parsed) return undefined
    parts.push(parsed)
  }
  return parts
}

function parsePromptAttachments<TValue>(value: TValue): PromptComposerAttachment[] | undefined {
  if (!Array.isArray(value)) return undefined
  const attachments: PromptComposerAttachment[] = []
  for (const item of value) {
    const parsed = parsePromptComposerAttachment(item)
    if (!parsed) return undefined
    attachments.push(parsed)
  }
  return attachments
}

function parsePromptDraftState<TValue>(value: TValue): PromptDraftState | undefined {
  const record = parseBuddyConfigObject(value)
  if (!record) return undefined
  const draftValue = parseStringValue(record.value)
  const parts = parsePromptComposerParts(record.parts)
  const attachments = parsePromptAttachments(record.attachments)
  const cursor = parseFiniteNumber(record.cursor)
  const updatedAt = parseFiniteNumber(record.updatedAt)
  if (
    draftValue === undefined ||
    !parts ||
    !attachments ||
    cursor === undefined ||
    updatedAt === undefined
  ) {
    return undefined
  }

  return {
    value: draftValue,
    parts,
    attachments,
    cursor,
    updatedAt,
  }
}

function parsePromptHistoryEntry<TValue>(value: TValue): PromptHistoryEntry | undefined {
  const record = parseBuddyConfigObject(value)
  if (!record) return undefined
  const entryValue = parseStringValue(record.value)
  const parts = parsePromptComposerParts(record.parts)
  const attachments = parsePromptAttachments(record.attachments)
  if (entryValue === undefined || !parts || !attachments) {
    return undefined
  }

  return {
    value: entryValue,
    parts,
    attachments,
  }
}

function parseDraftsByKey<TValue>(value: TValue): Record<string, PromptDraftState> | undefined {
  const record = parseBuddyConfigObject(value)
  if (!record) {
    return undefined
  }

  const result: Record<string, PromptDraftState> = {}
  for (const [key, entry] of Object.entries(record)) {
    const draft = parsePromptDraftState(entry)
    if (draft) result[key] = draft
  }
  return result
}

function parseHistoryByDirectory<TValue>(
  value: TValue,
): Record<string, PromptHistoryEntry[]> | undefined {
  const record = parseBuddyConfigObject(value)
  if (!record) {
    return undefined
  }

  const result: Record<string, PromptHistoryEntry[]> = {}
  for (const [key, entry] of Object.entries(record)) {
    if (Array.isArray(entry)) {
      const historyEntries = entry.flatMap((historyEntry) => {
        const parsed = parsePromptHistoryEntry(historyEntry)
        return parsed ? [parsed] : []
      })
      result[key] = historyEntries
    }
  }
  return result
}

function parsePersistedPromptStoreState<TValue>(value: TValue): PersistedPromptStoreState {
  const record = parseBuddyConfigObject(value)
  if (!record) {
    return {}
  }

  return {
    draftsByKey: parseDraftsByKey(record.draftsByKey),
    historyByDirectory: parseHistoryByDirectory(record.historyByDirectory),
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

function parsePersistedPromptStorageValue(raw: string): PersistedPromptStorageValue | null {
  try {
    const record = parseBuddyConfigObject(JSON.parse(raw))
    if (!record) return null
    return Object.assign(
      {
        state: parsePersistedPromptStoreState(record.state),
      },
      parseFiniteNumber(record.version) !== undefined
        ? { version: parseFiniteNumber(record.version) }
        : undefined,
    )
  } catch {
    return null
  }
}

function getPromptStateStorage(): StateStorage {
  const platformStorage = getPlatform().storage?.(PROMPT_STORE_STORAGE_FILE)
  if (platformStorage) return platformStorage
  const localStorageNode = browserLocalStorage()
  if (localStorageNode) return localStorageNode
  return fallbackPromptStorage
}

function isFlushableStorage(
  storage: StateStorage,
): storage is StateStorage & { flush: () => Promise<void> | void } {
  return "flush" in storage && hasFunctionValue(storage.flush)
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
  const windowNode = browserWindow()
  if (promptStorageFlushEventsInstalled || !windowNode) return
  promptStorageFlushEventsInstalled = true

  windowNode.addEventListener("pagehide", flushPromptStorePersistence)
  windowNode.document.addEventListener("visibilitychange", () => {
    if (windowNode.document.visibilityState !== "hidden") return
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
      if (raw instanceof Promise) {
        return raw.then((value) => {
          const text = parseStringValue(value)
          return text === undefined ? null : parsePersistedPromptStorageValue(text)
        })
      }
      const text = parseStringValue(raw)
      if (text === undefined) return null
      return parsePersistedPromptStorageValue(text)
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
        const state = parsePersistedPromptStoreState(persistedState)

        return {
          draftsByKey: state?.draftsByKey ?? {},
          historyByDirectory: state?.historyByDirectory ?? {},
          historyNavigationByKey: {},
        }
      },
    },
  ),
)
