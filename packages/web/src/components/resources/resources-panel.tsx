import type { CSSProperties } from "react"
import { useEffect, useMemo, useState } from "react"
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
} from "@buddy/ui"
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

export function ResourcesPanel(props: ResourcesPanelProps) {
  const [resources, setResources] = useState<ResourceRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const [busyKey, setBusyKey] = useState<string | undefined>(undefined)
  const [resourcePendingRemoval, setResourcePendingRemoval] = useState<ResourceRecord | undefined>(undefined)

  async function refreshResources(input?: { silent?: boolean }) {
    const silent = input?.silent === true
    if (!silent) {
      setLoading(true)
      setError(undefined)
    }

    try {
      const next = await loadResources(props.directory)
      setResources(next)
    } catch (resourceError) {
      setError(resourceError instanceof Error ? resourceError.message : String(resourceError))
    } finally {
      if (!silent) {
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    void refreshResources()
  }, [props.directory, props.refreshToken])

  const sortedResources = useMemo(
    () => [...resources].sort((left, right) => left.alias.localeCompare(right.alias)),
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
  }, [hasPreparingResources, props.directory])

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
      await addResource(props.directory, {
        sourcePath,
      })
    })
  }

  async function confirmRemovePendingResource() {
    const pending = resourcePendingRemoval
    if (!pending) return

    setResourcePendingRemoval(undefined)
    await runResourceAction(pending.id, async () => {
      await removeResource(props.directory, {
        resourceKey: pending.id,
      })
    })
  }

  return (
    <div className={`flex h-full min-h-0 flex-col gap-3 p-3 ${props.className ?? ""}`} style={props.style}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Resources</p>
          <p className="text-xs text-muted-foreground">
            Add notebook-local resource packs, refresh their extracted content, and keep aliases stable.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => void refreshResources()} disabled={loading}>
          {loading ? "Loading..." : "Refresh"}
        </Button>
      </div>

      <Card size="sm" className="gap-0 py-0">
        <CardContent className="space-y-3 px-3 py-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Add resource</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Choose any file. Buddy stages it in notebook `resources/` and prepares it.
            </p>
          </div>
          <div className="flex items-center justify-end">
            <Button onClick={() => void onAddResource()} disabled={loading}>
              Add resource
            </Button>
          </div>
        </CardContent>
      </Card>

      {error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto space-y-2">
        {sortedResources.length > 0 ? (
          sortedResources.map((resource) => {
            const isBusy = busyKey === resource.id
            return (
              <Card key={resource.id} size="sm" className="gap-0 py-0">
                <CardContent className="space-y-3 px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-medium">{resource.alias}</p>
                        <Badge variant={statusVariant(resource.status)}>{titleCaseLabel(resource.status)}</Badge>
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Format {resource.format}
                        {resource.packKey ? ` · Pack ${resource.packKey}` : ""}
                      </p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                          aria-label={`Options for ${resource.alias}`}
                          disabled={isBusy}
                        >
                          <EllipsisIcon className="size-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onSelect={() => {
                            const nextAlias = window.prompt("Rename resource", resource.alias)?.trim()
                            if (!nextAlias || nextAlias === resource.alias) return
                            void runResourceAction(resource.id, async () => {
                              await renameResource(props.directory, {
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
                              await rebuildResource(props.directory, {
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

                  {resource.preparedAt ? (
                    <p className="text-[11px] text-muted-foreground">Prepared {resource.preparedAt}</p>
                  ) : null}
                </CardContent>
              </Card>
            )
          })
        ) : loading ? (
          <div className="rounded-lg border border-border/70 bg-background p-3 text-sm text-muted-foreground">
            Loading resources...
          </div>
        ) : (
          <div className="rounded-lg border border-border/70 bg-background p-3 text-sm text-muted-foreground">
            No resources have been registered in this notebook yet.
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
                  Remove{" "}
                  <span className="font-mono">
                    "{resourcePendingRemoval.alias}"
                  </span>{" "}
                  and delete its files from notebook resources?
                </>
              ) : "Remove this resource and delete its files?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="outline" size="default">Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" size="default" onClick={() => void confirmRemovePendingResource()}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
