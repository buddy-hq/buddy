import type {
  ProjectExplorerEditableFileSaveResult,
  saveProjectExplorerEditableFile,
} from "@/state/chat-actions"

export const MARKDOWN_FILE_UNAVAILABLE_MESSAGE = "Markdown file was deleted or moved on disk."
export const MARKDOWN_FILE_CHANGED_MESSAGE = "Markdown file changed on disk."
export const MARKDOWN_CHANGED_DURING_RENAME_MESSAGE =
  "Markdown changed while preparing the rename. Wait for it to save, then try again."
export const MARKDOWN_SAVE_DEBOUNCE_MS = 900
export const MARKDOWN_LEAVE_GUARD_WAIT_MS = 5000
export const MARKDOWN_LEAVE_GUARD_POLL_MS = 50

export type MarkdownBenchProcessingStatus = "loading" | "ready" | "error"
export type MarkdownBenchSaveState = "conflict" | "error" | "saving" | "ready"
export type MarkdownBenchTargetStatus = "unavailable" | "error" | "loading" | "dirty" | "ready"

export type MarkdownBenchFileState = {
  conflict: boolean
  exists: boolean
  loading: boolean
  markdown: string
  processingError: string | undefined
  processingStatus: MarkdownBenchProcessingStatus
  savedMarkdown: string
  saveError: string | undefined
  saving: boolean
  version: string
}

export type MarkdownBenchFileLocation = {
  directory: string
  path: string
}

export type MarkdownBenchPendingSaveSnapshot = {
  conflict: boolean
  content: string
  directory: string
  exists: boolean
  path: string
  saveError: boolean
  savedContent: string
  saving: boolean
  version: string
}

export type MarkdownBenchSaveFile = (
  input: Parameters<typeof saveProjectExplorerEditableFile>[0],
) => ReturnType<typeof saveProjectExplorerEditableFile>

export function markdownBenchDirty(state: MarkdownBenchFileState): boolean {
  return state.markdown !== state.savedMarkdown
}

export function markdownBenchSaveState(state: MarkdownBenchFileState): MarkdownBenchSaveState {
  if (state.conflict) return "conflict"
  if (state.saveError) return "error"
  if (state.saving) return "saving"
  return "ready"
}

export function resolveMarkdownBenchTargetStatus(
  state: MarkdownBenchFileState,
): MarkdownBenchTargetStatus {
  if (!state.exists) return "unavailable"
  if (state.conflict || state.saveError || state.processingStatus === "error") return "error"
  if (state.loading || state.processingStatus === "loading") return "loading"
  return markdownBenchDirty(state) ? "dirty" : "ready"
}

export function markdownBenchPendingSaveSnapshot(
  state: MarkdownBenchFileState,
  location: MarkdownBenchFileLocation,
): MarkdownBenchPendingSaveSnapshot {
  return {
    conflict: state.conflict,
    content: state.markdown,
    directory: location.directory,
    exists: state.exists,
    path: location.path,
    saveError: state.saveError !== undefined,
    savedContent: state.savedMarkdown,
    saving: state.saving,
    version: state.version,
  }
}

export function reconcileMarkdownBenchSavedSnapshot(
  snapshot: MarkdownBenchPendingSaveSnapshot,
  saved: ProjectExplorerEditableFileSaveResult,
): MarkdownBenchPendingSaveSnapshot {
  return {
    ...snapshot,
    conflict: false,
    exists: true,
    savedContent: saved.content,
    saveError: false,
    saving: false,
    version: saved.version ?? "",
  }
}

export function shouldFlushMarkdownBenchPendingSave(
  snapshot: MarkdownBenchPendingSaveSnapshot,
): boolean {
  return (
    snapshot.exists &&
    snapshot.content !== snapshot.savedContent &&
    !snapshot.saving &&
    !snapshot.conflict &&
    !snapshot.saveError
  )
}

export async function flushMarkdownBenchPendingSave(
  snapshot: MarkdownBenchPendingSaveSnapshot,
  saveFile: MarkdownBenchSaveFile,
): Promise<boolean> {
  if (!shouldFlushMarkdownBenchPendingSave(snapshot)) return false

  try {
    await saveFile({
      directory: snapshot.directory,
      path: snapshot.path,
      content: snapshot.content,
      expectedVersion: snapshot.version,
    })
    return true
  } catch {
    return false
  }
}

export function markdownBenchProcessingPatch(
  currentMarkdown: string,
  nextMarkdown: string,
): Partial<MarkdownBenchFileState> {
  if (currentMarkdown === nextMarkdown) return {}
  return {
    processingError: undefined,
    processingStatus: "loading",
  }
}
