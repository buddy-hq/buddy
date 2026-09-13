import { useMemo, useState } from "react"

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
import { workspaceRelativeFilePath } from "@/lib/workspace-file-paths"

import { basename, dirname } from "../../utils/path"
import {
  isRecord,
  parseTString,
  readNonEmptyString,
  readNonNegativeInt,
  readString,
} from "../types"
import { PierreContentCode, PierreContentDiff } from "./pierre-content"
import {
  normalizePierreDiff,
  type PierreDiffInput,
  type PierreFileStatus,
  type PierreViewDiff,
} from "./pierre-diff"
import type { ToolActivityEntry } from "./entries"

type FilePatchKind = "add" | "update" | "delete" | "move"

type FilePatch = {
  path: string
  absolutePath: string | undefined
  type?: FilePatchKind
  diff: PierreDiffInput
}

type FileChangeDetails =
  | { type: "write"; path: string; content: string }
  | { type: "patch"; files: FilePatch[] }

function patchKind<TValue>(value: TValue): FilePatchKind | undefined {
  const kind = parseTString(value)
  if (kind === "add" || kind === "update" || kind === "delete" || kind === "move") {
    return kind
  }
  return undefined
}

function patchStatus(type: FilePatchKind): PierreFileStatus {
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

function editFilePath(state: ToolActivityEntry["state"]): string | undefined {
  const filediff = isRecord(state.metadata.filediff) ? state.metadata.filediff : undefined
  return readNonEmptyString(filediff?.file) ?? readNonEmptyString(state.input.filePath)
}

function writeFilePath(state: ToolActivityEntry["state"]): string | undefined {
  return readNonEmptyString(state.metadata.filepath) ?? readNonEmptyString(state.input.filePath)
}

function editDetails(entry: ToolActivityEntry): FileChangeDetails | undefined {
  const state = entry.state
  if (!state) return undefined

  const filediff = isRecord(state.metadata.filediff) ? state.metadata.filediff : undefined
  const path =
    readNonEmptyString(filediff?.file) ??
    readNonEmptyString(state.input.filePath) ??
    state.title ??
    "file"
  const before = readString(filediff?.before) ?? readString(state.input.oldString)
  const after = readString(filediff?.after) ?? readString(state.input.newString)
  const filediffPatch = readString(filediff?.patch)
  const patch =
    filediffPatch ??
    (before === undefined && after === undefined ? readString(state.metadata.diff) : undefined)
  if (patch === undefined && before === undefined && after === undefined) return undefined

  return {
    type: "patch",
    files: [
      {
        path,
        absolutePath: editFilePath(state),
        diff: {
          file: path,
          patch,
          before,
          after,
          additions: readNonNegativeInt(filediff?.additions) ?? 0,
          deletions: readNonNegativeInt(filediff?.deletions) ?? 0,
          status: "modified",
        },
      },
    ],
  }
}

function writeDetails(entry: ToolActivityEntry): FileChangeDetails | undefined {
  const state = entry.state
  if (!state) return undefined

  const content = readString(state.input.content)
  if (content === undefined) return undefined

  return {
    type: "write",
    path: readNonEmptyString(state.input.filePath) ?? state.title ?? "file",
    content,
  }
}

function applyPatchDetails(entry: ToolActivityEntry): FileChangeDetails | undefined {
  const files = entry.state?.metadata.files
  if (!Array.isArray(files)) return undefined

  const patches = files.flatMap((value): FilePatch[] => {
    if (!isRecord(value)) return []

    const type = patchKind(value.type)
    const filePath = readNonEmptyString(value.filePath)
    const relativePath = readNonEmptyString(value.relativePath) ?? filePath
    if (!type || !filePath || !relativePath) return []

    const patch = readString(value.patch) ?? readString(value.diff)
    const before = readString(value.before)
    const after = readString(value.after)
    if (patch === undefined && before === undefined && after === undefined) return []

    const additions = readNonNegativeInt(value.additions) ?? 0
    const deletions = readNonNegativeInt(value.deletions) ?? 0
    return [
      {
        path: relativePath,
        // A moved file no longer lives at `filePath`, and a deleted one is gone.
        absolutePath: type === "move" || type === "delete" ? undefined : filePath,
        type,
        diff: {
          file: relativePath,
          patch,
          before,
          after,
          additions,
          deletions,
          status: patchStatus(type),
        },
      },
    ]
  })

  return patches.length > 0 ? { type: "patch", files: patches } : undefined
}

function detailsForEntry(entry: ToolActivityEntry): FileChangeDetails | undefined {
  const tool = String(entry.part.tool ?? "")
  if (tool === "edit") return editDetails(entry)
  if (tool === "write") return writeDetails(entry)
  return tool === "apply_patch" ? applyPatchDetails(entry) : undefined
}

// The one file a finished write or edit changed, as an absolute path.
export function activityEntryFilePath(entry: ToolActivityEntry): string | undefined {
  const state = entry.state
  if (state?.status !== "completed") return undefined

  const tool = String(entry.part.tool ?? "")
  if (tool === "write") return writeFilePath(state)
  if (tool === "edit") return editFilePath(state)
  if (tool !== "apply_patch") return undefined

  const details = applyPatchDetails(entry)
  return details?.type === "patch" && details.files.length === 1
    ? details.files[0].absolutePath
    : undefined
}

export function hasActivityFileChangeDetails(entry: ToolActivityEntry): boolean {
  const state = entry.state
  if (!state) return false

  const tool = String(entry.part.tool ?? "")
  if (tool === "write") {
    return readString(state.input.content) !== undefined
  }

  if (tool === "edit") {
    const filediff = isRecord(state.metadata.filediff) ? state.metadata.filediff : undefined
    return (
      readString(filediff?.before) !== undefined ||
      readString(filediff?.after) !== undefined ||
      readString(filediff?.patch) !== undefined ||
      readString(state.input.oldString) !== undefined ||
      readString(state.input.newString) !== undefined ||
      readString(state.metadata.diff) !== undefined
    )
  }

  if (tool !== "apply_patch") return false

  const files = state.metadata.files
  if (!Array.isArray(files)) return false

  return files.some((value) => {
    if (!isRecord(value)) return false

    const type = patchKind(value.type)
    const filePath = readNonEmptyString(value.filePath)
    const relativePath = readNonEmptyString(value.relativePath) ?? filePath
    if (!type || !filePath || !relativePath) return false

    return (
      readString(value.patch) !== undefined ||
      readString(value.diff) !== undefined ||
      readString(value.before) !== undefined ||
      readString(value.after) !== undefined
    )
  })
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

// Opens a changed file on the Bench. Undefined when the file is outside the notebook or the Bench
// can't show it, so callers render a plain name instead of a link.
export function useBenchFileOpener(
  directory: string | undefined,
  absolutePath: string | undefined,
): (() => void) | undefined {
  const platform = usePlatform()
  const { resolvePlan, executePrimary } = useWorkspaceFileOpen(directory)
  const path =
    directory && absolutePath
      ? workspaceRelativeFilePath({ directory, path: absolutePath })
      : undefined
  if (!path) return undefined

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

function ActivityPatchFile({ file, directory }: { file: FilePatch; directory?: string }) {
  const [open, setOpen] = useState(file.type !== "delete")
  const openFile = useBenchFileOpener(directory, file.absolutePath)
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
        <ActivityPatchFile key={file.path} file={file} directory={directory} />
      ))}
    </div>
  )
}
