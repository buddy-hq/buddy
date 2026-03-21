import type { CSSProperties } from "react"
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  Card,
  CardContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EllipsisIcon,
  Skeleton,
} from "@buddy/ui"
import {
  FileIcon,
  FileTextIcon,
  ImageIcon,
  RefreshCwIcon,
  PlusIcon,
  Loader2Icon,
  AlertCircleIcon,
  FileCodeIcon,
  FileArchiveIcon,
} from "lucide-react"
import {
  addResource,
  loadResources,
  rebuildResource,
  removeResource,
  renameResource,
  type ResourceRecord,
} from "@/state/resource-actions"
import { pickResourceFilePath } from "../../lib/resource-file-picker"

type ResourcesPanelProps = {
  directory: string
  refreshToken?: number
  className?: string
  style?: CSSProperties
}

const RESOURCE_AUTO_REFRESH_INTERVAL_MS = 1500
const RESOURCE_STATUS_PREPARING = "preparing" as const

function titleCaseLabel(value: string) {
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function statusVariant(status: ResourceRecord["status"]): "secondary" | "outline" | "destructive" {
  if (status === "ready") return "secondary"
  if (status === "error") return "destructive"
  return "outline"
}

function ResourceIcon({ format }: { format: string }) {
  const f = format.toLowerCase()
  if (["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(f))
    return <ImageIcon className="size-4" />
  if (["txt", "md", "mdx", "csv"].includes(f)) return <FileTextIcon className="size-4" />
  if (["json", "js", "ts", "jsx", "tsx", "html", "css", "py", "rs", "go"].includes(f))
    return <FileCodeIcon className="size-4" />
  if (["zip", "tar", "gz"].includes(f)) return <FileArchiveIcon className="size-4" />
  return <FileIcon className="size-4" />
}

function SkeletonCard() {
  return (
    <Card className="gap-0 py-0">
      <CardContent className="p-4">
        <div className="flex items-center gap-4">
          <Skeleton className="size-10 shrink-0 rounded-md" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <div className="flex shrink-0 items-center justify-end gap-1.5">
            <Skeleton className="h-4 w-8" />
            <Skeleton className="size-7" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function ResourcesPanel(props: ResourcesPanelProps) {
  const { directory, refreshToken, className, style } = props
  const [resources, setResources] = useState<ResourceRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const [busyKey, setBusyKey] = useState<string | undefined>(undefined)
  const [resourcePendingRemoval, setResourcePendingRemoval] = useState<ResourceRecord | undefined>(
    undefined,
  )

  const refreshResources = useCallback(
    async (input?: { silent?: boolean }) => {
      const silent = input?.silent === true
      if (!silent) {
        setLoading(true)
        setError(undefined)
      }

      try {
        const next = await loadResources(directory)
        setResources(next)
      } catch (resourceError) {
        setError(resourceError instanceof Error ? resourceError.message : String(resourceError))
      } finally {
        if (!silent) {
          setLoading(false)
        }
      }
    },
    [directory],
  )

  useEffect(() => {
    void refreshResources()
  }, [refreshResources, refreshToken])

  const sortedResources = useMemo(
    () => [...resources].toSorted((left, right) => left.alias.localeCompare(right.alias)),
    [resources],
  )
  const hasPreparingResources = useMemo(
    () => resources.some((resource) => resource.status === RESOURCE_STATUS_PREPARING),
    [resources],
  )

  useEffect(() => {
    if (!hasPreparingResources) return

    const intervalID = window.setInterval(() => {
      void refreshResources({ silent: true })
    }, RESOURCE_AUTO_REFRESH_INTERVAL_MS)

    return () => {
      window.clearInterval(intervalID)
    }
  }, [hasPreparingResources, refreshResources])

  async function runResourceAction(key: string, action: () => Promise<unknown>) {
    setBusyKey(key)
    setError(undefined)

    try {
      await action()
      await refreshResources()
    } catch (resourceError) {
      setError(resourceError instanceof Error ? resourceError.message : String(resourceError))
    } finally {
      setBusyKey(undefined)
    }
  }

  async function onAddResource() {
    const sourcePath = await pickResourceFilePath()
    if (!sourcePath) return

    await runResourceAction(`add:${sourcePath}`, async () => {
      await addResource(directory, {
        sourcePath,
      })
    })
  }

  async function confirmRemovePendingResource() {
    const pending = resourcePendingRemoval
    if (!pending) return

    setResourcePendingRemoval(undefined)
    await runResourceAction(pending.id, async () => {
      await removeResource(directory, {
        resourceKey: pending.id,
      })
    })
  }

  return (
    <div className={`flex h-full min-h-0 flex-col gap-3 p-3 ${className ?? ""}`} style={style}>
      <div className="flex items-start justify-between gap-3 pb-2">
        <div className="min-w-0 space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground leading-none">
            Resources
          </p>
          <p className="text-xs text-muted-foreground line-clamp-2">
            Add notebook-local resource packs, refresh their extracted content, and keep aliases
            stable.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="px-2"
            onClick={() => void refreshResources()}
            disabled={loading}
            title="Refresh resources"
          >
            <RefreshCwIcon className={`size-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" onClick={() => void onAddResource()} disabled={loading}>
            <PlusIcon className="mr-1.5 size-4" />
            Add
          </Button>
        </div>
      </div>

      {error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto space-y-2 pb-2">
        {sortedResources.length > 0 ? (
          sortedResources.map((resource) => {
            const isBusy = busyKey === resource.id
            return (
              <Card
                key={resource.id}
                size="sm"
                className="relative group gap-0 py-0 transition-colors hover:border-border hover:bg-accent/5"
              >
                <CardContent className="px-4 py-3">
                  <div className="flex min-w-0 flex-1 items-start gap-4 pr-6">
                    <div className="flex size-10 shrink-0 flex-col items-center justify-between overflow-hidden rounded-md border border-border/50 bg-muted/40 pt-2 text-muted-foreground">
                      <ResourceIcon format={resource.format} />
                      <div className="flex w-full items-center justify-center bg-secondary py-[3px] text-[8px] font-bold uppercase leading-none text-secondary-foreground">
                        {resource.format}
                      </div>
                    </div>
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium leading-none">
                          {resource.alias}
                        </p>
                        {resource.status !== "ready" && (
                          <Badge
                            variant={statusVariant(resource.status)}
                            className="flex shrink-0 items-center gap-1"
                          >
                            {resource.status === RESOURCE_STATUS_PREPARING && (
                              <Loader2Icon className="size-3 animate-spin" />
                            )}
                            {titleCaseLabel(resource.status)}
                          </Badge>
                        )}
                      </div>
                      {(resource.preparedAt || resource.status === "error") && (
                        <div className="flex items-center gap-2">
                          {resource.status === "error" ? (
                            <span className="flex items-center gap-1 text-[11px] font-medium text-destructive">
                              <AlertCircleIcon className="size-3" />
                              Processing failed
                            </span>
                          ) : resource.preparedAt ? (
                            <p className="text-[11px] text-muted-foreground">
                              {new Date(resource.preparedAt).toLocaleString(undefined, {
                                dateStyle: "medium",
                                timeStyle: "short",
                              })}
                            </p>
                          ) : null}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="absolute right-1.5 top-1.5 flex items-center gap-0.5">
                    <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                      {resource.status === "error" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="size-7 p-0 text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            void runResourceAction(resource.id, async () => {
                              await rebuildResource(directory, { resourceKey: resource.id })
                            })
                          }}
                          title="Retry"
                          disabled={isBusy}
                        >
                          <RefreshCwIcon className="size-3.5" />
                        </Button>
                      )}
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                          aria-label={`Options for ${resource.alias}`}
                          disabled={isBusy}
                        >
                          <EllipsisIcon className="size-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onSelect={() => {
                            const nextAlias = window
                              .prompt("Rename resource", resource.alias)
                              ?.trim()
                            if (!nextAlias || nextAlias === resource.alias) return
                            void runResourceAction(resource.id, async () => {
                              await renameResource(directory, {
                                resourceKey: resource.id,
                                alias: nextAlias,
                              })
                            })
                          }}
                        >
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => {
                            void runResourceAction(resource.id, async () => {
                              await rebuildResource(directory, {
                                resourceKey: resource.id,
                              })
                            })
                          }}
                        >
                          Rebuild
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() => {
                            setResourcePendingRemoval(resource)
                          }}
                        >
                          Remove
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardContent>
              </Card>
            )
          })
        ) : loading ? (
          <div className="space-y-2">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/70 bg-background/50 px-4 py-10 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <PlusIcon className="size-6 text-muted-foreground" />
            </div>
            <h3 className="mt-4 text-sm font-medium leading-none">No resources added</h3>
            <p className="mt-1.5 max-w-[200px] text-xs text-muted-foreground">
              Add notebook-local resource packs to give Buddy more context.
            </p>
            <Button
              size="sm"
              className="mt-5"
              onClick={() => void onAddResource()}
              disabled={loading}
            >
              <PlusIcon className="mr-1.5 size-4" />
              Add Resource
            </Button>
          </div>
        )}
      </div>

      <AlertDialog
        open={resourcePendingRemoval !== undefined}
        onOpenChange={(open) => {
          if (!open) setResourcePendingRemoval(undefined)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove resource</AlertDialogTitle>
            <AlertDialogDescription className="break-all text-left">
              {resourcePendingRemoval ? (
                <>
                  Remove <span className="font-mono">"{resourcePendingRemoval.alias}"</span> and
                  delete its files from notebook resources?
                </>
              ) : (
                "Remove this resource and delete its files?"
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="outline" size="default">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              size="default"
              onClick={() => void confirmRemovePendingResource()}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
