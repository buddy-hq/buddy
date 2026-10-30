import { useMemo, useState } from "react"
import type { FileChange } from "@buddy/transcript-contract/message"

import {
  ChevronRightIcon,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  cn,
  toast,
} from "@buddy/ui"
import { FileText } from "@/icons/app-icons"

import { language } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useWorkspaceFileOpen, type WorkspaceFileActionInput } from "@/lib/use-workspace-file-open"
import {
  WORKSPACE_FILE_OPEN_TARGET_FILE_BENCH,
  WORKSPACE_FILE_OPEN_TARGET_MARKDOWN_BENCH,
} from "@/lib/workspace-file-open"
import { absoluteWorkspaceFilePath, workspaceRelativeFilePath } from "@/lib/workspace-file-paths"

import { basename, dirname } from "../../utils/path"
import { readNonEmptyString, type ToolState } from "../types"
import { PierreContentCode, PierreContentDiff } from "./pierre-content"
import {
  normalizePierreDiff,
  type PierreDiffInput,
  type PierreFileStatus,
  type PierreViewDiff,
} from "./pierre-diff"
import type { ToolActivityEntry } from "./entries"

type FilePatchKind = NonNullable<FileChange["kind"]>

type FilePatch = {
  path: string
  absolutePath: string | undefined
  type?: FilePatchKind
  diff: PierreDiffInput
}

type FileChangeDetails =
  | { type: "write"; path: string; content: string }
  | { type: "patch"; files: FilePatch[] }

function patchStatus(type: FilePatchKind | undefined): PierreFileStatus {
  if (type === "add") return "added"
  if (type === "delete") return "deleted"
  return "modified"
}

function usePierreViewDiff(diff: PierreDiffInput): PierreViewDiff {
  const { additions, after, before, deletions, file, patch, status } = diff

  return useMemo(
    () => normalizePierreDiff({ additions, after, before, deletions, file, patch, status }),
    [additions, after, before, deletions, file, patch, status],
  )
}

function hasPreview(change: FileChange): boolean {
  return (
    change.content !== undefined ||
    change.patch !== undefined ||
    change.before !== undefined ||
    change.after !== undefined
  )
}

function previewedFileChanges(state: ToolState): FileChange[] {
  if (state.status === "pending") return []
  return (state.fileChanges ?? []).filter(hasPreview)
}

function openableFilePath(change: FileChange): string | undefined {
  return change.kind === "move" || change.kind === "delete" ? undefined : change.path
}

function filePatch(change: FileChange, state: ToolState): FilePatch {
  const path = change.relativePath ?? change.path ?? state.title ?? "file"
  return {
    path,
    absolutePath: openableFilePath(change),
    type: change.kind,
    diff: {
      file: path,
      patch: change.patch,
      before: change.before,
      after: change.after,
      additions: change.additions ?? 0,
      deletions: change.deletions ?? 0,
      status: patchStatus(change.kind),
    },
  }
}

function detailsForEntry(entry: ToolActivityEntry): FileChangeDetails | undefined {
  const { state } = entry
  const changes = previewedFileChanges(state)
  const written = changes.find((change) => change.content !== undefined)?.content
  if (written !== undefined) {
    return {
      type: "write",
      path: readNonEmptyString(state.summary?.subject) ?? state.title ?? "file",
      content: written,
    }
  }

  return changes.length > 0
    ? { type: "patch", files: changes.map((change) => filePatch(change, state)) }
    : undefined
}

export function activityEntryFilePath(entry: ToolActivityEntry): string | undefined {
  if (entry.state.status !== "completed") return undefined

  const changes = previewedFileChanges(entry.state)
  if (changes.length > 0) {
    return changes.length === 1 ? openableFilePath(changes[0]) : undefined
  }
  if (entry.presentation.renderer !== "read") return undefined
  return readNonEmptyString(entry.state.summary?.subject)
}

export function hasActivityFileChangeDetails(entry: ToolActivityEntry): boolean {
  return previewedFileChanges(entry.state).length > 0
}

function ActivityDiffChanges({ additions, deletions }: { additions: number; deletions: number }) {
  if (additions + deletions === 0) return null

  return (
    <span className="activity-patch-file-diff-changes">
      <span className="activity-patch-file-additions">+{additions}</span>
      <span className="activity-patch-file-deletions">-{deletions}</span>
    </span>
  )
}

function ActivityPatchFileAction({ file }: { file: FilePatch }) {
  if (file.type === "add") {
    return (
      <span className="activity-patch-file-change text-icon-diff-add-base">
        {language.t("chatTools.patch.created")}
      </span>
    )
  }
  if (file.type === "delete") {
    return (
      <span className="activity-patch-file-change text-icon-diff-delete-base">
        {language.t("chatTools.patch.deleted")}
      </span>
    )
  }
  if (file.type === "move") {
    return (
      <span className="activity-patch-file-change text-icon-diff-modified-base">
        {language.t("chatTools.patch.moved")}
      </span>
    )
  }
  return <ActivityDiffChanges additions={file.diff.additions} deletions={file.diff.deletions} />
}

function isAbsoluteFilePath(filePath: string): boolean {
  return (
    filePath.startsWith("/") || filePath.startsWith("\\") || /^[A-Za-z]:/u.test(filePath)
  )
}

function isHomePath(filePath: string): boolean {
  return filePath.trimStart().startsWith("~")
}

function resolvedNotebookRelativePath(filePath: string): string | undefined {
  const normalized = filePath.trim().replaceAll("\\", "/")
  if (!normalized || normalized.startsWith("/") || normalized.startsWith("~")) return undefined

  const resolved: string[] = []
  for (const segment of normalized.split("/")) {
    if (segment.length === 0 || segment === ".") continue
    if (segment === "..") {
      if (resolved.length === 0) return undefined
      resolved.pop()
      continue
    }
    resolved.push(segment)
  }
  if (resolved.length === 0) return undefined
  return resolved.join("/")
}

function benchRelativePath(directory: string, filePath: string): string | undefined {
  if (isHomePath(filePath)) return undefined

  const insideNotebook = workspaceRelativeFilePath({ directory, path: filePath })
  if (insideNotebook) return insideNotebook
  if (isAbsoluteFilePath(filePath)) return undefined
  return resolvedNotebookRelativePath(filePath)
}

// Opens a changed file on the Bench. Undefined when the file is outside the notebook or the Bench
// can't show it, so callers render a plain name instead of a link.
export function useBenchFileOpener(
  directory: string | undefined,
  filePath: string | undefined,
): (() => void) | undefined {
  const platform = usePlatform()
  const { resolvePlan, executePrimary } = useWorkspaceFileOpen(directory)
  if (!directory || !filePath) return undefined

  const path = benchRelativePath(directory, filePath)
  if (!path) return undefined

  const absolutePath = isAbsoluteFilePath(filePath)
    ? filePath
    : absoluteWorkspaceFilePath({ directory, path })
  const input: WorkspaceFileActionInput = {
    path,
    absolutePath,
    name: basename(path),
    available: true,
    canOpenInBuddy: true,
    canOpenDefaultApp: !!platform.openPath,
    canReveal: !!platform.revealPath,
  }
  const target = resolvePlan(input).primaryTarget
  if (
    target !== WORKSPACE_FILE_OPEN_TARGET_FILE_BENCH &&
    target !== WORKSPACE_FILE_OPEN_TARGET_MARKDOWN_BENCH
  ) {
    return undefined
  }

  return () => {
    void executePrimary(input).catch((error) => {
      toast.error(error instanceof Error ? error.message : String(error))
    })
  }
}

export function ActivityFileNameLink(props: {
  name: string
  onOpen: () => void
  className?: string
}) {
  const label = language.t("chatTools.patch.openFileOnBench", { name: props.name })
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn("relative cursor-pointer underline-offset-2 hover:underline", props.className)}
      onClick={props.onOpen}
    >
      {props.name}
    </button>
  )
}

function ActivityPatchFile({
  file,
  directory,
  fileOpeningEnabled,
}: {
  file: FilePatch
  directory?: string
  fileOpeningEnabled: boolean
}) {
  const [open, setOpen] = useState(file.type !== "delete")
  const openFile = useBenchFileOpener(directory, fileOpeningEnabled ? file.absolutePath : undefined)
  const fileDirectory = dirname(file.path)
  const filename = basename(file.path)

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="activity-patch-file">
      <div className="activity-patch-file-header">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="activity-patch-file-trigger"
            title={file.path}
            aria-label={file.path}
          />
        </CollapsibleTrigger>
        <span className="activity-patch-file-info">
          <FileText className="size-3.5 shrink-0 text-icon-weak-base" />
          <span className="activity-patch-file-name">
            {fileDirectory !== "/" ? (
              <span className="activity-patch-file-directory">{fileDirectory}/</span>
            ) : null}
            {openFile ? (
              <ActivityFileNameLink
                name={filename}
                onOpen={openFile}
                className="activity-patch-file-filename"
              />
            ) : (
              <span className="activity-patch-file-filename">{filename}</span>
            )}
          </span>
        </span>
        <span className="activity-patch-file-actions">
          <ActivityPatchFileAction file={file} />
          <ChevronRightIcon
            className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-90")}
          />
        </span>
      </div>
      <CollapsibleContent>{open ? <ActivityPatchFileDiff file={file} /> : null}</CollapsibleContent>
    </Collapsible>
  )
}

function ActivityPatchFileDiff({ file }: { file: FilePatch }) {
  const view = usePierreViewDiff(file.diff)
  return <PierreContentDiff view={view} embedded />
}

function ActivitySinglePatchFile({ file }: { file: FilePatch }) {
  const view = usePierreViewDiff(file.diff)
  return <PierreContentDiff view={view} />
}

export function ActivityFileChangeDetails({
  entry,
  directory,
}: {
  entry: ToolActivityEntry
  directory?: string
}) {
  const details = detailsForEntry(entry)
  if (!details) return null

  if (details.type === "write") {
    return <PierreContentCode code={details.content} filePath={details.path} />
  }

  if (details.files.length === 1) {
    return <ActivitySinglePatchFile file={details.files[0]} />
  }

  return (
    <div className="flex min-w-0 w-full max-w-full flex-col">
      {details.files.map((file) => (
        <ActivityPatchFile
          key={file.path}
          file={file}
          directory={directory}
          fileOpeningEnabled={entry.state.status === "completed"}
        />
      ))}
    </div>
  )
}
