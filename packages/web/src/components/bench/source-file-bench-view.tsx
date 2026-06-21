import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AlertCircleIcon } from "lucide-react"
import { BenchViewerShell } from "@/components/bench/bench-viewer-shell"
import {
  VersionedTextFileEditor,
  type VersionedTextFileEditorHandle,
  type VersionedTextFileEditorSnapshot,
} from "@/components/editors/versioned-text-file-editor"
import { WorkspaceFileActionsMenu } from "@/components/files/workspace-file-actions"
import {
  useRegisterBenchContextProvider,
  type BenchContextProvider,
} from "@/components/bench/bench-route-context"
import { workspaceFileRef } from "@/components/bench/bench-context-utils"
import { allowBenchLeave, type BenchLeaveGuardResult } from "@/lib/bench-leave-guard"
import {
  isReadableWorkspaceText,
  monacoLanguageForWorkspacePath,
  workspaceTextEncoding,
} from "@/lib/workspace-file-content"
import { fileNameFromPath } from "@/lib/workspace-file-paths"
import type { BenchTarget } from "@/lib/bench-navigation"
import {
  ProjectExplorerFileVersionConflictError,
  readProjectExplorerEditableFile,
  readProjectExplorerEditableFileStatus,
  saveProjectExplorerEditableFile,
} from "@/state/chat-actions"

const EXTERNAL_FILE_REFRESH_INTERVAL_MS = 2_000
const SOURCE_FILE_CONTEXT_SEMANTIC_KEY_SEPARATOR = "\u0000"

function blockBenchLeave(
  reason: "dirty" | "saving" | "conflict" | "save_error",
  message: string,
): BenchLeaveGuardResult {
  return { status: "block", reason, message }
}

export function SourceFileBenchView(props: { directory: string; path: string }) {
  const editorRef = useRef<VersionedTextFileEditorHandle>(null)
  const snapshotRef = useRef<VersionedTextFileEditorSnapshot>()
  const existsOnDiskRef = useRef(true)
  const [snapshot, setSnapshot] = useState<VersionedTextFileEditorSnapshot>()
  const [unreadable, setUnreadable] = useState(false)
  const [existsOnDisk, setExistsOnDisk] = useState(true)
  const title = fileNameFromPath(props.path) || props.path
  const contextTarget = useMemo<BenchTarget>(
    () => ({ type: "workspace-file", path: props.path, viewer: "file" }),
    [props.path],
  )
  const updateExistsOnDisk = useCallback((nextExistsOnDisk: boolean) => {
    existsOnDiskRef.current = nextExistsOnDisk
    setExistsOnDisk(nextExistsOnDisk)
  }, [])

  const load = useCallback(async () => {
    const file = await readProjectExplorerEditableFile({
      directory: props.directory,
      path: props.path,
    })
    if (!isReadableWorkspaceText(file.content)) {
      setUnreadable(true)
    }
    return {
      path: file.path,
      exists: true,
      content: file.content,
      version: file.version,
    }
  }, [props.directory, props.path])
  const save = useCallback(
    (input: { content: string; expectedVersion?: string | null }) =>
      saveProjectExplorerEditableFile({
        directory: props.directory,
        path: props.path,
        content: input.content,
        expectedVersion: input.expectedVersion,
      }),
    [props.directory, props.path],
  )
  const handleSnapshotChange = useCallback((next: VersionedTextFileEditorSnapshot) => {
    snapshotRef.current = next
    setSnapshot(next)
  }, [])
  const synchronize = useCallback(async () => {
    const current = snapshotRef.current
    if (current?.saving) return { changed: false }

    const status = await readProjectExplorerEditableFileStatus({
      directory: props.directory,
      path: props.path,
    })

    if (!status.exists) {
      const changed = existsOnDiskRef.current
      updateExistsOnDisk(false)
      return { changed }
    }

    let changed = false
    if (!existsOnDiskRef.current) {
      updateExistsOnDisk(true)
      changed = true
    }

    if (!current || current.loading || current.dirty || current.conflict) {
      return { changed }
    }

    if (!current.exists || current.version !== status.version) {
      await editorRef.current?.reloadFromDisk({ silent: true })
      return { changed: true }
    }

    return { changed }
  }, [props.directory, props.path, updateExistsOnDisk])

  const contextProvider = useMemo<BenchContextProvider>(
    () => ({
      read: () => {
        const current = snapshotRef.current
        const currentExistsOnDisk = existsOnDiskRef.current
        const dirty = current?.dirty ?? false
        const unavailableClean = !currentExistsOnDisk && !dirty
        const targetStatus = unavailableClean
          ? "unavailable"
          : current?.loading
            ? "loading"
            : unreadable
              ? "error"
              : "ready"

        return {
          targetStatus,
          title,
          metadata: [
            "renderer: source-editor",
            `exists: ${currentExistsOnDisk}`,
            `version: ${current?.version ?? "unknown"}`,
            `encoding: ${current ? workspaceTextEncoding(current.content) : "unknown"}`,
            `dirty: ${dirty ? "true" : "false"}`,
            `save_state: ${current?.saveState ?? "loading"}`,
          ],
          content: unavailableClean
            ? `The source file at ${props.path} was deleted or moved. No verified file content is available.`
            : (current?.content ?? "Source editor is loading."),
          refs: [
            workspaceFileRef({
              path: props.path,
              note: "Source file currently visible and editable on Bench.",
            }),
          ],
          hints: [
            ...(dirty ? ["The context includes unsaved in-memory edits."] : []),
            ...(!currentExistsOnDisk && dirty
              ? [
                  "The file no longer exists on disk; this source content exists only in Bench memory until explicitly restored.",
                ]
              : []),
            ...(!currentExistsOnDisk && !dirty
              ? ["File content is unavailable because the file no longer exists on disk."]
              : []),
            ...(currentExistsOnDisk && !dirty
              ? ["The context contains the complete in-memory editor buffer."]
              : []),
          ],
        }
      },
    }),
    [props.path, title, unreadable],
  )
  const contextSemanticKey = useMemo(
    () =>
      [
        existsOnDisk,
        snapshot?.content ?? "",
        snapshot?.version ?? "",
        snapshot?.dirty ?? false,
        snapshot?.saveState ?? "loading",
        snapshot?.saveError ?? "",
        snapshot?.conflict ?? "",
        unreadable,
      ].join(SOURCE_FILE_CONTEXT_SEMANTIC_KEY_SEPARATOR),
    [
      existsOnDisk,
      snapshot?.conflict,
      snapshot?.content,
      snapshot?.dirty,
      snapshot?.saveError,
      snapshot?.saveState,
      snapshot?.version,
      unreadable,
    ],
  )

  const leaveGuard = useCallback(async (): Promise<BenchLeaveGuardResult> => {
    const current = snapshotRef.current
    if (!current || unreadable) return allowBenchLeave()
    if (current.conflict) {
      return blockBenchLeave("conflict", "Resolve the source file conflict before leaving Bench.")
    }
    if (current.saving) {
      return blockBenchLeave("saving", "Wait for the source file to finish saving.")
    }
    if (!current.dirty && !current.saveError) return allowBenchLeave()

    const flushed = await editorRef.current?.flushPendingSave()
    if (flushed) return allowBenchLeave()
    const next = snapshotRef.current
    if (next?.conflict) {
      return blockBenchLeave("conflict", "Resolve the source file conflict before leaving Bench.")
    }
    if (next?.saveError) {
      return blockBenchLeave("save_error", "Retry or resolve the source file save failure first.")
    }
    return blockBenchLeave("dirty", "Source file changes could not be saved.")
  }, [unreadable])

  useRegisterBenchContextProvider({
    target: contextTarget,
    provider: contextProvider,
    semanticKey: contextSemanticKey,
    synchronize,
    leaveGuard,
  })

  useEffect(() => {
    updateExistsOnDisk(true)
  }, [props.directory, props.path, updateExistsOnDisk])

  useEffect(() => {
    const shouldBlock = Boolean(
      snapshot?.dirty || snapshot?.saving || snapshot?.conflict || snapshot?.saveError,
    )
    if (!shouldBlock) return

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => window.removeEventListener("beforeunload", handleBeforeUnload)
  }, [snapshot?.conflict, snapshot?.dirty, snapshot?.saveError, snapshot?.saving])

  const saveStatus = snapshot?.loading
    ? "Loading"
    : !existsOnDisk
      ? "Unavailable"
      : snapshot?.conflict
        ? "Conflict"
        : snapshot?.saving
          ? "Saving"
          : snapshot?.saveError
            ? "Save failed"
            : snapshot?.dirty
              ? "Dirty"
              : undefined

  return (
    <BenchViewerShell
      title={title}
      subtitle={saveStatus ? `${props.path} · ${saveStatus}` : props.path}
      toolbar={<WorkspaceFileActionsMenu directory={props.directory} path={props.path} />}
      contentClassName="overflow-hidden"
    >
      {unreadable ? (
        <div className="flex h-full items-center justify-center p-6 text-center text-sm text-text-weak">
          <div className="max-w-sm">
            <AlertCircleIcon className="mx-auto mb-2 size-5 text-icon-critical-base" aria-hidden />
            This file is not readable UTF-8 text. Use the file actions to open it externally.
          </div>
        </div>
      ) : !existsOnDisk && !snapshot?.dirty ? (
        <div className="flex h-full items-center justify-center p-6 text-center text-sm text-text-weak">
          <div className="max-w-sm rounded-2xl border border-border-base bg-surface-base px-5 py-4 shadow-sm">
            <AlertCircleIcon className="mx-auto mb-2 size-5 text-icon-warning-base" aria-hidden />
            <h2 className="text-sm font-medium text-text-base">File deleted or moved</h2>
            <p className="mt-2 text-sm text-text-weak">{props.path} no longer exists on disk.</p>
          </div>
        </div>
      ) : (
        <div className="flex h-full min-h-0 flex-col">
          {!existsOnDisk ? (
            <div className="border-b border-border-warning-base/50 bg-surface-warning-weak px-4 py-2 text-xs text-text-on-warning-weak">
              File deleted or moved on disk. Save/overwrite only after deciding to restore it.
            </div>
          ) : null}
          <VersionedTextFileEditor
            ref={editorRef}
            fallbackPath={props.path}
            languageId={monacoLanguageForWorkspacePath(props.path)}
            statusIndicator="none"
            errorPresentation="inline"
            reloadBehavior="once"
            externalReloadIntervalMs={EXTERNAL_FILE_REFRESH_INTERVAL_MS}
            className="gap-0 p-0"
            editorOptions={{
              lineNumbers: "on",
              minimap: { enabled: false },
              wordWrap: "off",
            }}
            load={load}
            save={save}
            isVersionConflictError={(error) =>
              error instanceof ProjectExplorerFileVersionConflictError
            }
            onSnapshotChange={handleSnapshotChange}
          />
        </div>
      )}
    </BenchViewerShell>
  )
}
