import { useCallback, useEffect, useRef, useState } from "react"
import { useStore } from "zustand"
import { toast } from "@buddy/ui"
import {
  createMarkdownBenchFileStore,
  type MarkdownBenchFileStore,
} from "@/components/bench/markdown/file-store"
import {
  flushMarkdownBenchPendingSave,
  markdownBenchDirty,
  markdownBenchPendingSaveSnapshot,
  MARKDOWN_FILE_CHANGED_MESSAGE,
  MARKDOWN_FILE_UNAVAILABLE_MESSAGE,
  MARKDOWN_LEAVE_GUARD_POLL_MS,
  MARKDOWN_LEAVE_GUARD_WAIT_MS,
  MARKDOWN_SAVE_DEBOUNCE_MS,
  type MarkdownBenchFileLocation,
  type MarkdownBenchPendingSaveSnapshot,
  type MarkdownBenchSaveFile,
} from "@/components/bench/markdown/file-rules"
import type { BenchLeaveGuardResult } from "@/lib/bench-leave-guard"
import { stringifyError } from "@/lib/api-client"
import { cacheMarkdownBenchFile, invalidateMarkdownBenchFile } from "@/state/bench-surface-query"
import { appQueryClient } from "@/state/query-client"
import {
  ProjectExplorerFileVersionConflictError,
  readProjectExplorerEditableFile,
  readProjectExplorerEditableFileStatus,
  saveProjectExplorerEditableFile,
  type ProjectExplorerEditableFileState,
} from "@/state/chat-actions"

export type MarkdownBenchDocumentIO = {
  read: typeof readProjectExplorerEditableFile
  status: typeof readProjectExplorerEditableFileStatus
  save: typeof saveProjectExplorerEditableFile
}

export type MarkdownBenchFileController = {
  store: MarkdownBenchFileStore
  saveFile: MarkdownBenchSaveFile
  snapshot(): MarkdownBenchPendingSaveSnapshot
  waitForSaveToSettle(): Promise<MarkdownBenchPendingSaveSnapshot>
  reload(): Promise<void>
  save(input?: { overwrite?: boolean }): Promise<void>
  synchronize(): Promise<{ changed: boolean }>
  leaveGuard(): Promise<BenchLeaveGuardResult>
}

export function useMarkdownBenchFile(input: {
  location: MarkdownBenchFileLocation
  initialFile: ProjectExplorerEditableFileState
  io: MarkdownBenchDocumentIO | undefined
  renamingTitle: boolean
  onExternalMarkdown(markdown: string): void
}): MarkdownBenchFileController {
  const { directory, path } = input.location
  const readFile = input.io?.read ?? readProjectExplorerEditableFile
  const readFileStatus = input.io?.status ?? readProjectExplorerEditableFileStatus
  const saveFile = input.io?.save ?? saveProjectExplorerEditableFile
  const [store] = useState(() =>
    createMarkdownBenchFileStore({
      content: input.initialFile.content,
      version: input.initialFile.version ?? "",
    }),
  )
  const onExternalMarkdownRef = useRef(input.onExternalMarkdown)
  const synchronizeAfterSaveRef = useRef(false)

  useEffect(() => {
    onExternalMarkdownRef.current = input.onExternalMarkdown
  }, [input.onExternalMarkdown])

  const snapshot = useCallback(
    () => markdownBenchPendingSaveSnapshot(store.getState(), { directory, path }),
    [directory, path, store],
  )

  const waitForSaveToSettle = useCallback(async () => {
    const startedAt = Date.now()
    while (store.getState().saving) {
      if (Date.now() - startedAt >= MARKDOWN_LEAVE_GUARD_WAIT_MS) break
      await new Promise((resolve) => window.setTimeout(resolve, MARKDOWN_LEAVE_GUARD_POLL_MS))
    }
    return snapshot()
  }, [snapshot, store])

  const reload = useCallback(async () => {
    const state = store.getState()
    state.beginLoad()
    try {
      const next = await readFile({ directory, path })
      store.getState().commitFile({ content: next.content, version: next.version ?? "" })
      cacheMarkdownBenchFile(appQueryClient, { directory, path, file: next })
      onExternalMarkdownRef.current(next.content)
    } catch (error) {
      store.getState().failSave(stringifyError(error))
    } finally {
      store.getState().endLoad()
    }
  }, [directory, path, readFile, store])

  const save = useCallback(
    async (options?: { overwrite?: boolean }) => {
      const overwrite = options?.overwrite === true
      const state = store.getState()
      if (!overwrite && (!state.exists || !markdownBenchDirty(state))) return

      state.beginSave()
      const content = state.markdown
      try {
        const saved = await saveFile({
          directory,
          path,
          content,
          previousContent: overwrite ? undefined : state.savedMarkdown,
          expectedVersion: overwrite ? undefined : state.version,
        })
        store.getState().commitSaved(saved)
        cacheMarkdownBenchFile(appQueryClient, { directory, path, file: saved })
      } catch (error) {
        if (!(error instanceof ProjectExplorerFileVersionConflictError)) {
          store.getState().failSave(stringifyError(error))
          return
        }
        const status = await readFileStatus({ directory, path }).catch(() => undefined)
        if (status && !status.exists) {
          store.getState().markMissingDuringSave()
          return
        }
        store.getState().markConflict(error.message)
      } finally {
        store.getState().endSave()
      }
    },
    [directory, path, readFileStatus, saveFile, store],
  )

  const synchronize = useCallback(async () => {
    if (store.getState().saving) {
      synchronizeAfterSaveRef.current = true
      return { changed: false }
    }

    try {
      const status = await readFileStatus({ directory, path })
      const latest = store.getState()
      if (latest.saving) {
        synchronizeAfterSaveRef.current = true
        return { changed: false }
      }
      const latestDirty = markdownBenchDirty(latest)

      if (!status.exists) {
        const nextSaveError = latestDirty ? MARKDOWN_FILE_UNAVAILABLE_MESSAGE : undefined
        const changed =
          latest.exists ||
          latest.conflict !== latestDirty ||
          latest.saveError !== nextSaveError ||
          latest.loading
        if (!changed) return { changed: false }
        latest.markMissingOnDisk()
        invalidateMarkdownBenchFile(appQueryClient, { directory, path })
        return { changed: true }
      }

      if (latest.exists && latest.version === status.version) return { changed: false }

      if (latestDirty) {
        const changed =
          !latest.exists || !latest.conflict || latest.saveError !== MARKDOWN_FILE_CHANGED_MESSAGE
        latest.markStaleOnDisk()
        invalidateMarkdownBenchFile(appQueryClient, { directory, path })
        return { changed }
      }

      const next = await readFile({ directory, path })
      const settled = store.getState()
      if (settled.saving) {
        synchronizeAfterSaveRef.current = true
        return { changed: false }
      }
      if (markdownBenchDirty(settled)) {
        settled.markStaleOnDisk()
        invalidateMarkdownBenchFile(appQueryClient, { directory, path })
        return { changed: true }
      }

      const nextVersion = next.version ?? ""
      const changed =
        !settled.exists ||
        settled.markdown !== next.content ||
        settled.version !== nextVersion ||
        settled.conflict ||
        settled.saveError !== undefined ||
        settled.loading
      if (!changed) return { changed: false }

      settled.commitFile({ content: next.content, version: nextVersion })
      cacheMarkdownBenchFile(appQueryClient, { directory, path, file: next })
      onExternalMarkdownRef.current(next.content)
      return { changed: true }
    } catch (error) {
      const latest = store.getState()
      latest.endLoad()
      const nextSaveError = stringifyError(error)
      if (!markdownBenchDirty(latest) || latest.saveError === nextSaveError) {
        return { changed: false }
      }
      latest.failSave(nextSaveError)
      return { changed: true }
    }
  }, [directory, path, readFile, readFileStatus, store])

  const leaveGuard = useCallback(async (): Promise<BenchLeaveGuardResult> => {
    let pending = snapshot()
    if (pending.saving) pending = await waitForSaveToSettle()

    if (pending.saving) {
      return {
        status: "block",
        reason: "saving",
        message: "Markdown is still saving. Wait for the save to finish before leaving Bench.",
      }
    }
    if (pending.conflict) {
      return {
        status: "block",
        reason: "conflict",
        message: "Markdown has a file conflict. Resolve it before leaving Bench.",
      }
    }
    if (pending.saveError) {
      return {
        status: "block",
        reason: "save_error",
        message: "Markdown has a save error. Resolve it before leaving Bench.",
      }
    }
    if (pending.content === pending.savedContent) return { status: "allow" }

    if (await flushMarkdownBenchPendingSave(pending, saveFile)) return { status: "allow" }

    const message = "Markdown could not be saved before leaving Bench."
    store.getState().failSave(message)
    toast(message)
    return { status: "block", reason: "save_error", message }
  }, [saveFile, snapshot, store, waitForSaveToSettle])

  const saving = useStore(store, (state) => state.saving)
  const dirty = useStore(store, markdownBenchDirty)
  const exists = useStore(store, (state) => state.exists)
  const conflict = useStore(store, (state) => state.conflict)
  const markdown = useStore(store, (state) => state.markdown)

  useEffect(() => {
    if (saving || !synchronizeAfterSaveRef.current) return
    synchronizeAfterSaveRef.current = false
    void synchronize()
  }, [saving, synchronize])

  useEffect(() => {
    if (!exists || !dirty || saving || conflict || input.renamingTitle) return
    const timeout = window.setTimeout(() => {
      void save()
    }, MARKDOWN_SAVE_DEBOUNCE_MS)
    return () => window.clearTimeout(timeout)
  }, [conflict, dirty, exists, input.renamingTitle, markdown, save, saving])

  useEffect(() => {
    return () => {
      void flushMarkdownBenchPendingSave(
        markdownBenchPendingSaveSnapshot(store.getState(), { directory, path }),
        saveFile,
      )
    }
  }, [directory, path, saveFile, store])

  return {
    store,
    saveFile,
    snapshot,
    waitForSaveToSettle,
    reload,
    save,
    synchronize,
    leaveGuard,
  }
}
