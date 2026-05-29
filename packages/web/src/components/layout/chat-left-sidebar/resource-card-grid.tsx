import { useCallback, useEffect, useRef, useState } from "react"
import { motion } from "motion/react"
import { ResourceCoverButton } from "@/components/resources/resource-cover"
import { useQueryClient } from "@tanstack/react-query"
import { useSearch } from "@tanstack/react-router"
import {
  Badge,
  Button,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@buddy/ui"
import {
  AlertTriangleIcon,
  BookOpenIcon,
  CheckIcon,
  FileTextIcon,
  Loader2Icon,
  RefreshCwIcon,
} from "lucide-react"
import { language } from "@/context/language"
import { stringifyError } from "@/lib/api-client"
import { addResource, rebuildResource, removeResource } from "@/state/resource-actions"
import { useChatStore } from "@/state/chat-store"
import {
  invalidateResourcesQueries,
  type ResourceListItem,
  type ResourceOpenOptions,
  type ResourceReadingTarget,
  type ResourceViewStatus,
} from "@/state/resources-query"

const SHOW_MORE_BUTTON_CLASS = "pt-1"
const SHOW_MORE_BATCH_LABEL_KEY = "sidebar.libraryShowMoreCount"
const STICKY_READING_RESET_DELAY_MS = 500
const CONTEXT_MENU_WIDTH_CLASS = "w-48"

export type ResourceCardTarget = ResourceReadingTarget

type ResourceCardGridProps = {
  directory: string
  resources: ResourceListItem[]
  onOpenResource: (
    directory: string,
    resource: ResourceCardTarget,
    options?: ResourceOpenOptions,
  ) => void
  pageSize?: number
}

function resourceStatusLabel(status: ResourceViewStatus) {
  if (status === "unprocessed") return language.t("sidebar.resourcesUnprocessed")
  if (status === "preparing") return language.t("sidebar.resourcesPreparing")
  if (status === "ready") return language.t("sidebar.resourcesReady")
  if (status === "stale") return language.t("sidebar.resourcesStale")
  if (status === "unsupported") return language.t("sidebar.resourcesUnsupported")
  return language.t("sidebar.resourcesError")
}

function actionLabelForStatus(status: ResourceViewStatus) {
  if (status === "ready") return language.t("resourcesPanel.rebuild")
  if (status === "preparing") return language.t("sidebar.resourcesPreparing")
  return language.t("sidebar.resourcesProcess")
}

function useVisibleResourceCount(totalCount: number, pageSize?: number) {
  const [visibleCount, setVisibleCount] = useState(() =>
    pageSize === undefined ? totalCount : Math.min(pageSize, totalCount),
  )

  useEffect(() => {
    setVisibleCount((current) => {
      if (pageSize === undefined) {
        return totalCount
      }

      return Math.min(Math.max(current, pageSize), totalCount)
    })
  }, [pageSize, totalCount])

  const remainingCount = Math.max(totalCount - visibleCount, 0)
  const nextBatchCount = pageSize === undefined ? 0 : Math.min(pageSize, remainingCount)

  return {
    visibleCount,
    nextBatchCount,
    canShowMore: nextBatchCount > 0,
    showMore: () => {
      if (pageSize === undefined) return
      setVisibleCount((current) => Math.min(current + pageSize, totalCount))
    },
  }
}

function ResourceHoverPopover({
  resource,
  displayName,
}: {
  resource: ResourceListItem
  displayName: string
}) {
  const [open, setOpen] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleMouseEnter = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    setOpen(true)
  }

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setOpen(false)
    }, 150)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div
          className="flex size-6 items-center justify-center rounded-full bg-surface-base/80 text-text-strong shadow-sm backdrop-blur-md hover:bg-surface-base"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <FileTextIcon className="size-3" />
        </div>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-64 p-3 shadow-md"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div className="flex flex-col gap-1.5 break-all text-xs">
          <span className="font-medium leading-snug text-text-strong">{displayName}</span>
          {resource.author ? <span className="text-text-weak">{resource.author}</span> : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function ResourceStatusIndicator({
  status,
  isBusy,
}: {
  status: ResourceViewStatus
  isBusy: boolean
}) {
  if (isBusy || status === "preparing") {
    return (
      <div className="flex size-6 items-center justify-center rounded-full bg-surface-base shadow-sm">
        <Loader2Icon className="size-3.5 animate-spin text-text-weak" />
      </div>
    )
  }

  if (status === "stale") {
    return (
      <Badge
        variant="outline"
        className="h-5 border-border-warning-base bg-background-base/80 px-2 py-0 text-[10px] font-bold uppercase tracking-wider text-text-warning-strong shadow-sm backdrop-blur-md"
      >
        {resourceStatusLabel(status)}
      </Badge>
    )
  }

  if (status === "ready") {
    return (
      <div className="flex size-6 items-center justify-center rounded-full bg-surface-base shadow-sm">
        <CheckIcon className="size-3.5 text-icon-success-base" />
      </div>
    )
  }

  if (status === "error") {
    return (
      <div
        className="flex size-6 items-center justify-center rounded-full bg-surface-critical-base shadow-sm"
        title="Error"
      >
        <AlertTriangleIcon className="size-3.5 text-text-critical-strong" />
      </div>
    )
  }

  return (
    <div
      className="flex size-6 items-center justify-center rounded-full bg-surface-base shadow-sm"
      title={resourceStatusLabel(status)}
    >
      <FileTextIcon className="size-3.5 text-text-weak" />
    </div>
  )
}

export function ResourceCardGrid(props: ResourceCardGridProps) {
  const queryClient = useQueryClient()
  const search = useSearch({ strict: false }) as { path?: string }
  const readingPath = search.path
  const [stickyReadingPath, setStickyReadingPath] = useState<string | undefined>(readingPath)
  const [busyKeys, setBusyKeys] = useState<Set<string>>(() => new Set())
  const [actionError, setActionError] = useState<string | undefined>(undefined)
  const lastOpenedReadingResource = useChatStore((state) =>
    props.directory ? state.lastOpenedReadingResourceByDirectory[props.directory] : undefined,
  )
  const resumeReadingResource =
    lastOpenedReadingResource && lastOpenedReadingResource.path !== stickyReadingPath
      ? lastOpenedReadingResource
      : undefined
  const { visibleCount, nextBatchCount, canShowMore, showMore } = useVisibleResourceCount(
    props.resources.length,
    props.pageSize,
  )

  useEffect(() => {
    if (readingPath) {
      setStickyReadingPath(readingPath)
      return
    }

    const timer = window.setTimeout(() => {
      setStickyReadingPath(undefined)
    }, STICKY_READING_RESET_DELAY_MS)

    return () => {
      window.clearTimeout(timer)
    }
  }, [readingPath])

  const onProcessResource = useCallback(
    async (resource: ResourceListItem) => {
      setBusyKeys((current) => new Set(current).add(resource.key))
      setActionError(undefined)
      try {
        if (resource.resourceID) {
          await rebuildResource(props.directory, { resourceKey: resource.resourceID })
        } else {
          await addResource(props.directory, { sourcePath: resource.path })
        }
        await invalidateResourcesQueries(queryClient, props.directory)
      } catch (resourceError) {
        setActionError(stringifyError(resourceError))
      } finally {
        setBusyKeys((current) => {
          const next = new Set(current)
          next.delete(resource.key)
          return next
        })
      }
    },
    [props.directory, queryClient],
  )

  const onRemoveResource = useCallback(
    async (resource: ResourceListItem) => {
      if (!resource.resourceID) {
        return
      }

      const removeQuestion = language.t("resourcesPanel.removeResourceQuestion", {
        alias: resource.title || resource.name,
      })
      if (!window.confirm(removeQuestion)) {
        return
      }

      setBusyKeys((current) => new Set(current).add(resource.key))
      setActionError(undefined)
      try {
        await removeResource(props.directory, { resourceKey: resource.resourceID })
        await invalidateResourcesQueries(queryClient, props.directory)
      } catch (resourceError) {
        setActionError(stringifyError(resourceError))
      } finally {
        setBusyKeys((current) => {
          const next = new Set(current)
          next.delete(resource.key)
          return next
        })
      }
    },
    [props.directory, queryClient],
  )

  const visibleResources = props.resources.slice(0, visibleCount)

  return (
    <div className="space-y-3">
      {actionError ? (
        <div className="rounded-lg border border-border-critical-weak bg-surface-critical-base p-4 text-center text-sm text-text-critical-strong">
          {actionError}
        </div>
      ) : null}

      {resumeReadingResource ? (
        <button
          type="button"
          onClick={() =>
            props.onOpenResource(props.directory, {
              path: resumeReadingResource.path,
              name: resumeReadingResource.name,
              ...(resumeReadingResource.resourceID
                ? { resourceID: resumeReadingResource.resourceID }
                : {}),
            })
          }
          className="flex w-full items-center justify-between rounded-lg border border-border-info-weak bg-surface-info-base px-4 py-2.5 text-left text-sm transition-colors hover:bg-surface-info-hover"
        >
          <span className="flex items-center gap-2 text-text-info-strong">
            <BookOpenIcon className="size-4" />
            Resume reading
          </span>
          <span className="truncate text-text-info-weak">{resumeReadingResource.name}</span>
        </button>
      ) : null}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {visibleResources.map((resource) => {
          const processLabel = actionLabelForStatus(resource.status)
          const isBusy = busyKeys.has(resource.key)
          const canProcess =
            !!processLabel && (resource.status !== "ready" || !!resource.resourceID)
          const isReading = stickyReadingPath === resource.path
          const displayName = resource.title || resource.name

          return (
            <ContextMenu key={resource.key}>
              <ContextMenuTrigger asChild>
                <motion.div
                  layoutId={isReading ? "resource-view" : undefined}
                  className="relative"
                >
                  <ResourceCoverButton
                    directory={props.directory}
                    coverRelpath={resource.coverRelpath}
                    title={resource.title}
                    extension={resource.extension}
                    ariaLabel={language.t("sidebar.openResource", { name: displayName })}
                    onClick={() =>
                      props.onOpenResource(props.directory, {
                        path: resource.path,
                        name: resource.name,
                        ...(resource.resourceID ? { resourceID: resource.resourceID } : {}),
                        status: resource.status,
                      })
                    }
                  />

                  <div className="pointer-events-none absolute left-2 top-2 z-10 flex gap-1">
                    <ResourceStatusIndicator status={resource.status} isBusy={isBusy} />
                  </div>

                  <div className="absolute right-2 bottom-2 z-10">
                    <ResourceHoverPopover resource={resource} displayName={displayName} />
                  </div>
                </motion.div>
              </ContextMenuTrigger>
              <ContextMenuContent className={CONTEXT_MENU_WIDTH_CLASS}>
                {canProcess && processLabel ? (
                  <ContextMenuItem
                    disabled={isBusy || resource.status === "preparing"}
                    onSelect={() => {
                      void onProcessResource(resource)
                    }}
                  >
                    {isBusy || resource.status === "preparing" ? (
                      <Loader2Icon className="mr-2 size-3.5 animate-spin" />
                    ) : (
                      <RefreshCwIcon className="mr-2 size-3.5" />
                    )}
                    {processLabel}
                  </ContextMenuItem>
                ) : null}
                {resource.resourceID ? (
                  <ContextMenuItem
                    variant="destructive"
                    disabled={isBusy}
                    onSelect={() => {
                      void onRemoveResource(resource)
                    }}
                  >
                    {language.t("resourcesPanel.remove")}
                  </ContextMenuItem>
                ) : null}
              </ContextMenuContent>
            </ContextMenu>
          )
        })}
      </div>

      {canShowMore ? (
        <div className={SHOW_MORE_BUTTON_CLASS}>
          <Button type="button" variant="ghost" size="sm" onClick={showMore}>
            {language.t(SHOW_MORE_BATCH_LABEL_KEY, { count: nextBatchCount })}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
