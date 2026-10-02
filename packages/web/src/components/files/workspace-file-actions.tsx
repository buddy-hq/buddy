import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
  DropdownMenuTrigger,
  cn,
  toast,
} from "@buddy/ui"
import {
  AlertTriangleIcon,
  ClipboardCopyIcon,
  CheckIcon,
  ChevronDownIcon,
  ExternalLinkIcon,
  FolderOpenIcon,
} from "@/icons/app-icons"
import { useEffect, useMemo, useState } from "react"
import { BenchViewerShell } from "@/components/bench/bench-viewer-shell"
import { usePlatform, type FileApplication } from "@/context/platform"
import { stringifyError } from "@/lib/api-client"
import { absoluteWorkspaceFilePath, fileNameFromPath } from "@/lib/workspace-file-paths"

const BYTES_PER_MEGABYTE = 1_000_000

function formatFileSize(sizeBytes: number) {
  return `${(sizeBytes / BYTES_PER_MEGABYTE).toFixed(1)} MB`
}

function runWorkspaceFileAction(action: () => Promise<void>, successMessage?: string) {
  void action().then(
    () => {
      if (successMessage) toast(successMessage)
    },
    (error) => toast.error(stringifyError(error)),
  )
}

const DEFAULT_APPLICATION_ID = "default"
const PREFERRED_APPLICATION_KEY = "preferred-application"

function ApplicationIcon(props: { icon: string | null }) {
  return props.icon ? (
    <img src={props.icon} alt="" className="size-4 shrink-0 object-contain" aria-hidden />
  ) : (
    <ExternalLinkIcon aria-hidden data-icon="inline-start" className="size-3.5" />
  )
}

/** Opens a workspace file with the last chosen installed app and exposes native file actions. */
export function WorkspaceFileActionsMenu(props: { directory: string; path: string }) {
  const platform = usePlatform()
  const storage = useMemo(() => platform.storage?.("workspace-file-actions"), [platform])
  const [applications, setApplications] = useState<readonly FileApplication[]>([])
  const [defaultApplication, setDefaultApplication] = useState<FileApplication | null>(null)
  const [preferredId, setPreferredId] = useState<string | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const [opening, setOpening] = useState(false)
  const absolutePath = absoluteWorkspaceFilePath({ directory: props.directory, path: props.path })
  const selectedApplication =
    preferredId && preferredId !== DEFAULT_APPLICATION_ID
      ? applications.find((application) => application.id === preferredId)
      : undefined
  const selectedName = selectedApplication?.name ?? defaultApplication?.name ?? "default app"
  const revealLabel = platform.os === "macos" ? "Reveal in Finder" : "Reveal in File Explorer"

  useEffect(() => {
    let active = true
    setHydrated(false)
    void Promise.allSettled([
      platform.listFileApplications?.(absolutePath) ??
        Promise.resolve({ applications: [], defaultApplication: null }),
      Promise.resolve(storage?.getItem(PREFERRED_APPLICATION_KEY)),
    ]).then(([installed, stored]) => {
      if (!active) return
      if (installed.status === "fulfilled") {
        setApplications(installed.value.applications)
        setDefaultApplication(installed.value.defaultApplication)
      } else toast.error(stringifyError(installed.reason))
      if (stored.status === "fulfilled") setPreferredId(stored.value ?? null)
      else toast.error(stringifyError(stored.reason))
      setHydrated(true)
    })
    return () => {
      active = false
    }
  }, [absolutePath, platform, storage])

  const openInApplication = (application?: FileApplication) => {
    const openPath = platform.openPath
    if (!openPath || !hydrated || opening) return
    setOpening(true)
    void openPath(absolutePath, application?.path)
      .then(async () => {
        const id = application?.id ?? DEFAULT_APPLICATION_ID
        setPreferredId(id)
        try {
          await storage?.setItem(PREFERRED_APPLICATION_KEY, id)
        } catch (error) {
          toast.error(`File opened, but the preferred app was not saved: ${stringifyError(error)}`)
        }
      })
      .catch((error) => toast.error(stringifyError(error)))
      .finally(() => setOpening(false))
  }

  return (
    <div role="group" aria-label="Open file" className="flex shrink-0 items-center">
      {platform.openPath ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 rounded-r-none px-2.5 text-xs has-[>svg]:px-2"
          aria-label={`Open in ${selectedName}`}
          title={`Open in ${selectedName}`}
          disabled={!hydrated || opening}
          onClick={() => openInApplication(selectedApplication)}
        >
          <ApplicationIcon icon={selectedApplication?.icon ?? defaultApplication?.icon ?? null} />
          Open
        </Button>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            aria-label="Choose app and file actions"
            title="Choose app and file actions"
            className={cn("size-7", platform.openPath && "rounded-l-none border-l-0")}
          >
            <ChevronDownIcon aria-hidden className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          {platform.openPath ? (
            <>
              <DropdownMenuLabel>Open in</DropdownMenuLabel>
              <DropdownMenuGroup>
                <DropdownMenuItem
                  disabled={!hydrated || opening}
                  onSelect={() => openInApplication()}
                >
                  <ApplicationIcon icon={defaultApplication?.icon ?? null} />
                  <span className="flex-1">Default app</span>
                  {!selectedApplication ? <CheckIcon aria-hidden /> : null}
                </DropdownMenuItem>
                {applications.map((application) => (
                  <DropdownMenuItem
                    key={application.id}
                    disabled={!hydrated || opening}
                    onSelect={() => openInApplication(application)}
                  >
                    <ApplicationIcon icon={application.icon} />
                    <span className="flex-1">{application.name}</span>
                    {selectedApplication?.id === application.id ? <CheckIcon aria-hidden /> : null}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
            </>
          ) : null}
          <DropdownMenuGroup>
            {platform.revealPath ? (
              <DropdownMenuItem
                onSelect={() =>
                  runWorkspaceFileAction(
                    () => platform.revealPath?.(absolutePath) ?? Promise.resolve(),
                  )
                }
              >
                <FolderOpenIcon aria-hidden />
                {revealLabel}
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem
              onSelect={() =>
                runWorkspaceFileAction(
                  () => navigator.clipboard.writeText(absolutePath),
                  "Path copied",
                )
              }
            >
              <ClipboardCopyIcon aria-hidden />
              Copy path
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export function WorkspaceFileLargeWarning(props: {
  path: string
  sizeBytes: number
  onOpenAnyway: () => void
}) {
  const title = fileNameFromPath(props.path) || props.path

  return (
    <BenchViewerShell title={title} contentClassName="overflow-hidden">
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
