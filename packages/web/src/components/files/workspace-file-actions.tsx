import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  toast,
} from "@buddy/ui"
import {
  AlertTriangleIcon,
  ClipboardCopyIcon,
  EllipsisIcon,
  ExternalLinkIcon,
  FolderOpenIcon,
} from "@/icons/app-icons"
import { BenchViewerShell } from "@/components/bench/bench-viewer-shell"
import { usePlatform } from "@/context/platform"
import { stringifyError } from "@/lib/api-client"
import { absoluteWorkspaceFilePath, fileNameFromPath } from "@/lib/workspace-file-paths"

const BYTES_PER_MEGABYTE = 1_000_000

function formatFileSize(sizeBytes: number) {
  return `${(sizeBytes / BYTES_PER_MEGABYTE).toFixed(1)} MB`
}

export function WorkspaceFileActionsMenu(props: { directory: string; path: string }) {
  const platform = usePlatform()
  const absolutePath = absoluteWorkspaceFilePath({
    directory: props.directory,
    path: props.path,
  })
  const revealLabel = platform.os === "macos" ? "Reveal in Finder" : "Reveal in File Explorer"

  const run = (action: () => Promise<void>, successMessage?: string) => {
    void action().then(
      () => {
        if (successMessage) toast(successMessage)
      },
      (error: unknown) => toast.error(stringifyError(error)),
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="File actions"
          title="File actions"
          className="size-8 rounded-lg text-text-weak hover:bg-surface-base-hover hover:text-text-base"
        >
          <EllipsisIcon className="size-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {platform.openPath ? (
          <DropdownMenuItem
            onSelect={() => run(() => platform.openPath?.(absolutePath) ?? Promise.resolve())}
          >
            <ExternalLinkIcon className="size-4" aria-hidden />
            Open in default app
          </DropdownMenuItem>
        ) : null}
        {platform.revealPath ? (
          <DropdownMenuItem
            onSelect={() => run(() => platform.revealPath?.(absolutePath) ?? Promise.resolve())}
          >
            <FolderOpenIcon className="size-4" aria-hidden />
            {revealLabel}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          onSelect={() => run(() => navigator.clipboard.writeText(absolutePath), "Path copied")}
        >
          <ClipboardCopyIcon className="size-4" aria-hidden />
          Copy path
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function WorkspaceFileLargeWarning(props: {
  directory: string
  path: string
  sizeBytes: number
  onOpenAnyway: () => void
}) {
  const title = fileNameFromPath(props.path) || props.path

  return (
    <BenchViewerShell
      title={title}
      subtitle={props.path}
      toolbar={<WorkspaceFileActionsMenu directory={props.directory} path={props.path} />}
      contentClassName="overflow-hidden"
    >
      <LargeFileWarningContent sizeBytes={props.sizeBytes} onOpenAnyway={props.onOpenAnyway} />
    </BenchViewerShell>
  )
}

export function LargeFileWarningContent(props: { sizeBytes: number; onOpenAnyway: () => void }) {
  return (
    <div className="flex h-full min-h-0 items-center justify-center p-6">
      <div className="max-w-md text-center">
        <AlertTriangleIcon className="mx-auto size-6 text-icon-warning-base" aria-hidden />
        <h2 className="mt-3 text-sm font-semibold text-text-strong">Large file</h2>
        <p className="mt-1 text-sm text-text-weak">
          This file is {formatFileSize(props.sizeBytes)}. Opening it in Buddy may use significant
          memory.
        </p>
        <Button type="button" className="mt-4" onClick={props.onOpenAnyway}>
          Open anyway
        </Button>
      </div>
    </div>
  )
}
