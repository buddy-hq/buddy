import { createStore, type StoreApi } from "zustand/vanilla"
import {
  MARKDOWN_FILE_CHANGED_MESSAGE,
  MARKDOWN_FILE_UNAVAILABLE_MESSAGE,
  markdownBenchDirty,
  markdownBenchProcessingPatch,
  type MarkdownBenchFileState,
} from "@/components/bench/markdown/file-rules"
import type { ProjectExplorerEditableFileSaveResult } from "@/state/chat-actions"

export type MarkdownBenchFileActions = {
  applyProcessingResult(result: { markdown: string; error: string | undefined }): void
  beginLoad(): void
  beginSave(): void
  changeMarkdown(markdown: string): void
  commitFile(file: { content: string; version: string }): void
  commitSaved(saved: ProjectExplorerEditableFileSaveResult): void
  endLoad(): void
  endSave(): void
  failSave(message: string): void
  markConflict(message: string): void
  markMissingDuringSave(): void
  markMissingOnDisk(): void
  markRenamed(version: string): void
  markStaleOnDisk(): void
}

export type MarkdownBenchFileStoreState = MarkdownBenchFileState & MarkdownBenchFileActions
export type MarkdownBenchFileStore = StoreApi<MarkdownBenchFileStoreState>

export function createMarkdownBenchFileStore(initial: {
  content: string
  version: string
}): MarkdownBenchFileStore {
  return createStore<MarkdownBenchFileStoreState>()((set, get) => ({
    conflict: false,
    exists: true,
    loading: false,
    markdown: initial.content,
    processingError: undefined,
    processingStatus: "ready",
    savedMarkdown: initial.content,
    saveError: undefined,
    saving: false,
    version: initial.version,

    applyProcessingResult(result) {
      if (get().markdown !== result.markdown) return
      set({
        processingError: result.error,
        processingStatus: result.error ? "error" : "ready",
      })
    },
    beginLoad() {
      set({ loading: true, saveError: undefined })
    },
    beginSave() {
      set({ saving: true, saveError: undefined })
    },
    changeMarkdown(markdown) {
      set({ markdown, processingError: undefined, processingStatus: "ready" })
    },
    commitFile(file) {
      set({
        ...markdownBenchProcessingPatch(get().markdown, file.content),
        conflict: false,
        exists: true,
        loading: false,
        markdown: file.content,
        savedMarkdown: file.content,
        saveError: undefined,
        version: file.version,
      })
    },
    commitSaved(saved) {
      set({
        conflict: false,
        exists: true,
        savedMarkdown: saved.content,
        saveError: undefined,
        saving: false,
        version: saved.version ?? "",
      })
    },
    endLoad() {
      set({ loading: false })
    },
    endSave() {
      set({ saving: false })
    },
    failSave(message) {
      set({ saveError: message })
    },
    markConflict(message) {
      set({ conflict: true, saveError: message })
    },
    markMissingDuringSave() {
      set({ conflict: true, exists: false, saveError: MARKDOWN_FILE_UNAVAILABLE_MESSAGE })
    },
    markMissingOnDisk() {
      const dirty = markdownBenchDirty(get())
      set({
        conflict: dirty,
        exists: false,
        loading: false,
        saveError: dirty ? MARKDOWN_FILE_UNAVAILABLE_MESSAGE : undefined,
      })
    },
    markRenamed(version) {
      set({ exists: false, saving: false, version })
    },
    markStaleOnDisk() {
      set({
        conflict: true,
        exists: true,
        loading: false,
        saveError: MARKDOWN_FILE_CHANGED_MESSAGE,
      })
    },
  }))
}
