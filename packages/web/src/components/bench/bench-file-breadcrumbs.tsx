import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  cn,
  toast,
} from "@buddy/ui"
import { useQuery } from "@tanstack/react-query"
import { useRef, useState } from "react"
import { FileTypeIcon } from "@/components/files/file-type-icon"
import type { RightWorkspaceOpenOutcome } from "@/components/directory-chat/right-workspace-open"
import {
  ArrowLeftIcon,
  ChevronRightIcon,
  FolderIcon,
  Loader2Icon,
  RefreshCwIcon,
} from "@/icons/app-icons"
import { stringifyError } from "@/lib/api-client"
import { workspaceRelativeFilePath } from "@/lib/workspace-file-paths"
import { listProjectExplorerDirectory } from "@/state/chat-actions"

type FileBreadcrumb = { label: string; path: string; kind: "directory" | "file" }

type BenchFileBreadcrumbsProps = {
  directory: string
  path?: string
  onOpenFile?: (path: string) => Promise<RightWorkspaceOpenOutcome>
}

function breadcrumbs(directory: string, path: string | undefined): FileBreadcrumb[] {
  const root = directory.replace(/\\/gu, "/").replace(/\/+$/u, "")
  const relative = path
    ? (workspaceRelativeFilePath({ directory, path }) ?? path.replace(/\\/gu, "/"))
    : ""
  const segments = relative.split("/").filter(Boolean)
  return [
    { label: root.split("/").findLast(Boolean) ?? directory, path: "", kind: "directory" },
    ...segments.map(
      (label, index): FileBreadcrumb => ({
        label,
        path: segments.slice(0, index + 1).join("/"),
        kind: index === segments.length - 1 ? "file" : "directory",
      }),
    ),
  ]
}

function DirectoryContents(props: {
  directory: string
  currentFile: string | undefined
  rootPath: string
  rootLabel: string
  onOpenFile: (path: string) => Promise<RightWorkspaceOpenOutcome>
  onClose: () => void
}) {
  const [path, setPath] = useState(props.rootPath)
  const [opening, setOpening] = useState(false)
  const openingRef = useRef(false)
  const listing = useQuery({
    queryKey: ["project-explorer-directory", props.directory, path],
    queryFn: () => listProjectExplorerDirectory({ directory: props.directory, path }),
    retry: false,
  })
  const entries = listing.data?.toSorted((left, right) => {
    if (left.type !== right.type) return left.type === "directory" ? -1 : 1
    return left.name.localeCompare(right.name, undefined, { sensitivity: "base" })
  })
  const parent = path.slice(0, Math.max(0, path.lastIndexOf("/")))
  const canGoBack = path !== props.rootPath

  async function openFile(filePath: string) {
    if (openingRef.current) return
    openingRef.current = true
    setOpening(true)
    try {
      const outcome = await props.onOpenFile(filePath)
      if (outcome === "opened" || outcome === "focused") props.onClose()
    } catch (error) {
      toast.error(stringifyError(error))
    } finally {
      openingRef.current = false
      setOpening(false)
    }
  }

  return (
    <DropdownMenuContent
      align="start"
      className="w-max min-w-40 max-w-[min(19rem,var(--radix-dropdown-menu-content-available-width))]"
      onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" || !canGoBack || opening) return
        event.preventDefault()
        event.stopPropagation()
        setPath(parent)
      }}
    >
      <DropdownMenuGroup>
        {canGoBack && (
          <>
            <DropdownMenuItem
              disabled={opening}
              onSelect={(event) => {
                event.preventDefault()
                setPath(parent)
              }}
            >
              <ArrowLeftIcon aria-hidden />
              <span className="truncate">
                Back to {parent.split("/").findLast(Boolean) ?? props.rootLabel}
              </span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {listing.isPending ? (
          <DropdownMenuItem disabled>
            <Loader2Icon aria-hidden className="animate-spin" />
            Loading folder…
          </DropdownMenuItem>
        ) : entries?.length === 0 ? (
          <DropdownMenuItem disabled>This folder is empty.</DropdownMenuItem>
        ) : (
          entries?.map((entry) => (
            <DropdownMenuItem
              key={entry.path}
              disabled={opening}
              aria-current={
                entry.type === "file" && entry.path === props.currentFile ? "page" : undefined
              }
              title={entry.path}
              onSelect={(event) => {
                event.preventDefault()
                if (entry.type === "directory") setPath(entry.path)
                else void openFile(entry.path)
              }}
            >
              {entry.type === "directory" ? (
                <FolderIcon aria-hidden />
              ) : (
                <FileTypeIcon fileName={entry.path} className="size-4 shrink-0 object-contain" />
              )}
              <span className={cn("min-w-0 flex-1 truncate", entry.ignored && "opacity-60")}>
                {entry.name}
              </span>
              {entry.type === "directory" && <ChevronRightIcon aria-hidden />}
            </DropdownMenuItem>
          ))
        )}
        {listing.isError && (
          <DropdownMenuItem
            disabled={listing.isFetching || opening}
            onSelect={(event) => {
              event.preventDefault()
              void listing.refetch()
            }}
          >
            <RefreshCwIcon aria-hidden />
            {entries ? "Refresh failed — retry" : "Retry loading folder"}
          </DropdownMenuItem>
        )}
      </DropdownMenuGroup>
    </DropdownMenuContent>
  )
}

function DirectoryCrumb(
  props: BenchFileBreadcrumbsProps & { crumb: FileBreadcrumb; currentFile: string | undefined },
) {
  const [open, setOpen] = useState(false)
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Browse ${props.crumb.label}`}
          title={props.crumb.path || props.directory}
          className="max-w-40 min-w-0 truncate rounded-sm px-0.5 text-left hover:bg-surface-raised-base hover:text-text-base focus-visible:outline-2 focus-visible:outline-border-base"
        >
          {props.crumb.label}
        </button>
      </DropdownMenuTrigger>
      {open && props.onOpenFile && (
        <DirectoryContents
          directory={props.directory}
          rootPath={props.crumb.path}
          rootLabel={props.crumb.label}
          currentFile={props.currentFile}
          onOpenFile={props.onOpenFile}
          onClose={() => setOpen(false)}
        />
      )}
    </DropdownMenu>
  )
}

/** Notebook-relative file location with lazily loaded folder browsing menus. */
export function BenchFileBreadcrumbs(props: BenchFileBreadcrumbsProps) {
  const crumbs = breadcrumbs(props.directory, props.path)
  const currentFile = crumbs.findLast((crumb) => crumb.kind === "file")?.path
  return (
    <nav aria-label="File path" className="min-w-0 flex-1 overflow-hidden">
      <ol className="flex min-w-0 items-center text-xs text-text-weak">
        {crumbs.map((crumb, index) => (
          <li
            key={crumb.path}
            className={cn(
              "flex min-w-0 items-center",
              crumb.kind === "file" ? "shrink text-text-base" : "max-w-40 shrink",
            )}
            aria-current={crumb.kind === "file" ? "page" : undefined}
          >
            {index > 0 && (
              <ChevronRightIcon aria-hidden className="mx-1 size-3.5 shrink-0 text-text-weaker" />
            )}
            {crumb.kind === "directory" && props.onOpenFile ? (
              <DirectoryCrumb
                key={`${props.directory}:${currentFile}:${crumb.path}`}
                {...props}
                crumb={crumb}
                currentFile={currentFile}
              />
            ) : (
              <span
                className={cn("min-w-0 truncate", crumb.kind === "file" && "max-w-[40ch]")}
                title={crumb.path || props.directory}
              >
                {crumb.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}
