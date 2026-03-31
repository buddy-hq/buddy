import { useCallback, useEffect, useMemo, useRef, useState } from "react"
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
import { language } from "@/context/language"
import {
  addResource,
  loadResources,
  rebuildResource,
  removeResource,
  renameResource,
  type ResourceRecord,
} from "@/state/resource-actions"
import {
  VIRTUAL_DEFAULT_OVERSCAN,
  VIRTUAL_RESOURCE_MIN_ITEMS,
  VIRTUAL_RESOURCE_ROW_ESTIMATE_PX,
} from "@/components/virtualization/virtualization-defaults"
import { VirtualizedRows } from "@/components/virtualization/virtualized-rows"
import { pickResourceFilePath } from "../../lib/resource-file-picker"

type ResourcesPanelProps = {
  directory: string
  refreshToken?: number
  className?: string
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
  const { directory, refreshToken, className } = props
  const [resources, setResources] = useState<ResourceRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const [busyKey, setBusyKey] = useState<string | undefined>(undefined)
  const [resourcePendingRemoval, setResourcePendingRemoval] = useState<ResourceRecord | undefined>(
    undefined,
  )
  const resourcesListRef = useRef<HTMLDivElement>(null)

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

  function renderResourceCard(resource: ResourceRecord) {
    const isBusy = busyKey === resource.id
    return (
      <Card
        size="sm"
        data-component="resources-item"
        data-resource-id={resource.id}
        data-resource-status={resource.status}
        className="relative group gap-0 py-0 transition-colors hover:border-border-base hover:bg-surface-base-hover/5"
      >
        <CardContent className="px-4 py-3">
          <div className="flex min-w-0 flex-1 items-start gap-4 pr-6">
            <div className="flex size-10 shrink-0 flex-col items-center justify-between overflow-hidden rounded-md border border-border-base/50 bg-surface-weak/40 pt-2 text-text-weak">
              <ResourceIcon format={resource.format} />
              <div className="flex w-full items-center justify-center bg-button-secondary-base py-[3px] text-[8px] font-bold uppercase leading-none text-text-strong">
                {resource.format}
              </div>
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-medium leading-none">{resource.alias}</p>
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
                    <span className="flex items-center gap-1 text-[11px] font-medium text-icon-critical-base">
                      <AlertCircleIcon className="size-3" />
                      {language.t("resourcesPanel.processingFailed")}
                    </span>
                  ) : resource.preparedAt ? (
                    <p className="text-[11px] text-text-weak">
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
                  data-action="resources-retry"
                  data-resource-id={resource.id}
                  variant="ghost"
                  size="sm"
                  className="size-7 p-0 text-text-weak hover:text-text-base"
                  onClick={() => {
                    void runResourceAction(resource.id, async () => {
                      await rebuildResource(directory, { resourceKey: resource.id })
                    })
                  }}
                  title={language.t("resourcesPanel.retry")}
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
                  data-action="resources-item-menu"
                  data-resource-id={resource.id}
                  className="inline-flex size-7 items-center justify-center rounded-md text-text-weak transition-colors hover:bg-surface-base-hover hover:text-text-base disabled:pointer-events-none disabled:opacity-50"
                  aria-label={language.t("resourcesPanel.optionsForResource", {
                    alias: resource.alias,
                  })}
                  disabled={isBusy}
                >
                  <EllipsisIcon className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  data-action="resources-rename"
                  onSelect={() => {
                    const nextAlias = window
                      .prompt(language.t("resourcesPanel.renamePromptTitle"), resource.alias)
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
                  {language.t("resourcesPanel.rename")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  data-action="resources-rebuild"
                  onSelect={() => {
                    void runResourceAction(resource.id, async () => {
                      await rebuildResource(directory, {
                        resourceKey: resource.id,
                      })
                    })
                  }}
                >
                  {language.t("resourcesPanel.rebuild")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  data-action="resources-remove"
                  variant="destructive"
                  onSelect={() => {
                    setResourcePendingRemoval(resource)
                  }}
                >
                  {language.t("resourcesPanel.remove")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div
      data-component="resources-panel"
      className={`flex h-full min-h-0 flex-col gap-3 p-3 ${className ?? ""}`}
    >
      {sortedResources.length > 0 && (
        <div className="flex w-full shrink-0 items-center justify-end gap-1.5 pb-2">
          <Button
            data-action="resources-refresh"
            variant="ghost"
            size="sm"
            className="px-2"
            onClick={() => void refreshResources()}
            disabled={loading}
            title={language.t("resourcesPanel.refreshResources")}
          >
            <RefreshCwIcon className={`size-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button
            data-action="resources-add"
            size="sm"
            onClick={() => void onAddResource()}
            disabled={loading}
          >
            <PlusIcon className="mr-1.5 size-4" />
            {language.t("resourcesPanel.add")}
          </Button>
        </div>
      )}

      {error ? (
        <p className="rounded-md border border-border-critical-base/40 bg-surface-critical-base/10 px-2 py-1.5 text-xs text-icon-critical-base">
          {error}
        </p>
      ) : null}

      <div ref={resourcesListRef} className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-2">
        {sortedResources.length > 0 ? (
          sortedResources.length >= VIRTUAL_RESOURCE_MIN_ITEMS ? (
            <VirtualizedRows
              items={sortedResources}
              getItemKey={(resource) => resource.id}
              estimateSize={() => VIRTUAL_RESOURCE_ROW_ESTIMATE_PX}
              getScrollElement={() => resourcesListRef.current}
              overscan={VIRTUAL_DEFAULT_OVERSCAN}
              measure
              renderItem={(resource, index) => (
                <div className={index === sortedResources.length - 1 ? "" : "pb-2"}>
                  {renderResourceCard(resource)}
                </div>
              )}
            />
          ) : (
            <div className="space-y-2">
              {sortedResources.map((resource) => (
                <div key={resource.id}>{renderResourceCard(resource)}</div>
              ))}
            </div>
          )
        ) : loading ? (
          <div className="space-y-2">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : (
          <button
            type="button"
            data-action="resources-empty-add"
            onClick={() => void onAddResource()}
            disabled={loading}
            className="group mt-1 flex w-full min-h-0 flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border-base/40 bg-surface-weak/5 px-4 py-10 text-center transition-all hover:border-border-base/80 hover:bg-surface-weak/30"
          >
            <div className="mb-4 flex size-10 items-center justify-center rounded-full bg-surface-weak transition-transform group-hover:scale-105 group-hover:shadow-sm">
              <PlusIcon className="size-4 text-text-weak transition-colors group-hover:text-text-base" />
            </div>
            <h3 className="text-[13px] font-medium text-text-base transition-colors group-hover:text-text-strong">
              {language.t("resourcesPanel.addResource")}
            </h3>
            <p className="mt-1.5 max-w-[180px] text-[12px] leading-relaxed text-text-weak transition-colors group-hover:text-text-weak/90">
              {language.t("resourcesPanel.emptyDescription")}
            </p>
          </button>
        )}
      </div>

      <AlertDialog
        open={resourcePendingRemoval !== undefined}
        onOpenChange={(open) => {
          if (!open) setResourcePendingRemoval(undefined)
        }}
      >
        <AlertDialogContent data-component="resources-remove-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>{language.t("resourcesPanel.removeResourceTitle")}</AlertDialogTitle>
            <AlertDialogDescription className="break-all text-left">
              {resourcePendingRemoval
                ? language.t("resourcesPanel.removeResourceQuestion", {
                    alias: resourcePendingRemoval.alias,
                  })
                : language.t("resourcesPanel.removeResourceFallbackQuestion")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              data-action="resources-remove-cancel"
              variant="outline"
              size="default"
            >
              {language.t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              data-action="resources-remove-confirm"
              variant="destructive"
              size="default"
              onClick={() => void confirmRemovePendingResource()}
            >
              {language.t("resourcesPanel.remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
