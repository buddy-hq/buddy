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
  saveProjectExplorerEditableFile,
} from "@/state/chat-actions"

const EXTERNAL_FILE_REFRESH_INTERVAL_MS = 2_000

function blockBenchLeave(
  reason: "dirty" | "saving" | "conflict" | "save_error",
  message: string,
): BenchLeaveGuardResult {
  return { status: "block", reason, message }
}

export function SourceFileBenchView(props: { directory: string; path: string }) {
  const editorRef = useRef<VersionedTextFileEditorHandle>(null)
  const snapshotRef = useRef<VersionedTextFileEditorSnapshot>()
  const [snapshot, setSnapshot] = useState<VersionedTextFileEditorSnapshot>()
  const [unreadable, setUnreadable] = useState(false)
  const title = fileNameFromPath(props.path) || props.path
  const contextTarget = useMemo<BenchTarget>(
    () => ({ type: "workspace-file", path: props.path, viewer: "file" }),
    [props.path],
  )

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

  const contextProvider = useMemo<BenchContextProvider>(
    () => ({
      read: () => {
        const current = snapshotRef.current
        return {
          targetStatus: current?.loading ? "loading" : unreadable ? "error" : "ready",
          title,
          metadata: [
            "renderer: source-editor",
            `version: ${current?.version ?? "unknown"}`,
            `encoding: ${current ? workspaceTextEncoding(current.content) : "unknown"}`,
            `dirty: ${current?.dirty ? "true" : "false"}`,
            `save_state: ${current?.saveState ?? "loading"}`,
          ],
          content: current?.content ?? "Source editor is loading.",
          refs: [
            workspaceFileRef({
              path: props.path,
              note: "Source file currently visible and editable on Bench.",
            }),
          ],
          hints: current?.dirty
            ? ["The context includes unsaved in-memory edits."]
            : ["The context contains the complete in-memory editor buffer."],
        }
      },
    }),
    [props.path, title, unreadable],
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
    leaveGuard,
  })

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
      ) : (
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
      )}
    </BenchViewerShell>
  )
}
