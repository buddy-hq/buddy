import { useCallback, useEffect, useMemo, useState } from "react"
import { Badge, Button, Collapsible, CollapsibleContent, CollapsibleTrigger } from "@buddy/ui"
import {
  BookOpenIcon,
  ChevronDownIcon,
  FileTextIcon,
  Loader2Icon,
  PlusIcon,
  RefreshCwIcon,
} from "lucide-react"
import { language } from "@/context/language"
import { pickResourceFilePath } from "@/lib/resource-file-picker"
import {
  fileExtensionFromPath,
  fileNameFromPath,
  normalizeRelativePath,
} from "@/lib/workspace-file-paths"
import { findWorkspaceFiles } from "@/state/chat-actions"
import {
  addResource,
  loadResources,
  rebuildResource,
  type ResourceRecord,
} from "@/state/resource-actions"

type ChatLeftSidebarResourcesSectionProps = {
  directory: string
  refreshToken?: number
  onOpenResource: (directory: string, resource: SidebarResourceTarget) => void
  defaultOpen?: boolean
  className?: string
}

type DiscoveredResource = {
  path: string
  name: string
  extension: "pdf" | "epub"
}

type ResourceListItem = {
  key: string
  path: string
  name: string
  extension: "pdf" | "epub"
  status: ResourceViewStatus
  resourceID?: string
}

export type SidebarResourceTarget = Pick<
  ResourceListItem,
  "path" | "name" | "resourceID" | "status"
>

type ResourceViewStatus = ResourceRecord["status"] | "unprocessed"

type ResourceCacheEntry = {
  resources: ResourceListItem[]
  refreshToken: number | undefined
}

const RESOURCE_EXTENSIONS = new Set(["pdf", "epub"])
const CACHE_TOKEN_FALLBACK = -1
const MAX_DISCOVERY_RESULTS = 200
const COLLAPSED_RESOURCE_COUNT = 5
const RESOURCE_CACHE_BY_DIRECTORY = new Map<string, ResourceCacheEntry>()

function isResourceFilePath(filepath: string): filepath is string {
  return RESOURCE_EXTENSIONS.has(fileExtensionFromPath(filepath))
}

function toDiscoveredResource(path: string): DiscoveredResource | undefined {
  const normalizedPath = normalizeRelativePath(path)
  const extension = fileExtensionFromPath(normalizedPath)
  if (extension !== "pdf" && extension !== "epub") return undefined
  return {
    path: normalizedPath,
    name: fileNameFromPath(normalizedPath),
    extension,
  }
}

async function discoverWorkspaceResources(directory: string): Promise<DiscoveredResource[]> {
  const matches = await Promise.all(
    ["pdf", "epub"].map(async (extension) =>
      findWorkspaceFiles(directory, `.${extension}`, {
        includeDirectories: false,
        limit: MAX_DISCOVERY_RESULTS,
      }),
    ),
  )

  const discovered = new Map<string, DiscoveredResource>()
  for (const matchGroup of matches) {
    for (const match of matchGroup) {
      const resource = toDiscoveredResource(match)
      if (!resource) continue
      discovered.set(resource.path, resource)
    }
  }

  return [...discovered.values()].toSorted((left, right) => left.path.localeCompare(right.path))
}

function buildProcessedResourceByPath(records: ResourceRecord[]) {
  const map: Record<string, ResourceRecord> = {}
  for (const record of records) {
    const sourceRelpath = normalizeRelativePath(record.sourceRelpath)
    if (sourceRelpath) {
      map[sourceRelpath] = record
    }
    if (record.sourceOriginRelpath) {
      const sourceOriginRelpath = normalizeRelativePath(record.sourceOriginRelpath)
      if (sourceOriginRelpath) {
        map[sourceOriginRelpath] = record
      }
    }
  }
  return map
}

function normalizeRenderableResourcePath(path: string | undefined) {
  if (!path) return undefined
  const normalized = normalizeRelativePath(path)
  if (!normalized) return undefined
  return isResourceFilePath(normalized) ? normalized : undefined
}

function extensionFromRecordFormat(format: string): "pdf" | "epub" | undefined {
  if (format === "pdf") return "pdf"
  if (format === "epub") return "epub"
  return undefined
}

function buildResourceListItems(input: {
  discovered: DiscoveredResource[]
  processed: ResourceRecord[]
}) {
  const processedByPath = buildProcessedResourceByPath(input.processed)
  const discoveredPaths = new Set(input.discovered.map((resource) => resource.path))
  const items: ResourceListItem[] = []
  const seenPaths = new Set<string>()
  const seenResourceIDs = new Set<string>()

  for (const discoveredResource of input.discovered) {
    const mapped = processedByPath[discoveredResource.path]
    const preferredPath = normalizeRenderableResourcePath(mapped?.sourceOriginRelpath)
    const shouldSkipDiscoveredResource =
      !!mapped?.id &&
      (seenResourceIDs.has(mapped.id) ||
        (preferredPath !== undefined &&
          preferredPath !== discoveredResource.path &&
          discoveredPaths.has(preferredPath)))
    if (shouldSkipDiscoveredResource) {
      seenPaths.add(discoveredResource.path)
      continue
    }

    items.push({
      key: discoveredResource.path,
      path: discoveredResource.path,
      name: discoveredResource.name,
      extension: discoveredResource.extension,
      status: mapped?.status ?? "unprocessed",
      ...(mapped ? { resourceID: mapped.id } : {}),
    })
    seenPaths.add(discoveredResource.path)
    if (mapped?.id) {
      seenResourceIDs.add(mapped.id)
    }
  }

  for (const record of input.processed) {
    const sourceOriginPath = normalizeRenderableResourcePath(record.sourceOriginRelpath)
    const sourcePath = normalizeRenderableResourcePath(record.sourceRelpath)
    const resolvedPath = sourceOriginPath ?? sourcePath
    if (!resolvedPath) continue
    if (seenPaths.has(resolvedPath)) continue

    const extension =
      (isResourceFilePath(resolvedPath) ? fileExtensionFromPath(resolvedPath) : undefined) ??
      extensionFromRecordFormat(record.format)
    if (extension !== "pdf" && extension !== "epub") continue

    items.push({
      key: `record:${record.id}`,
      path: resolvedPath,
      name: fileNameFromPath(resolvedPath) || record.alias,
      extension,
      status: record.status,
      resourceID: record.id,
    })
    seenPaths.add(resolvedPath)
    seenResourceIDs.add(record.id)
  }

  return items.toSorted((left, right) => left.path.localeCompare(right.path))
}

function badgeVariantForStatus(
  status: ResourceViewStatus,
): "outline" | "secondary" | "destructive" {
  if (status === "ready") return "secondary"
  if (status === "error") return "destructive"
  return "outline"
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
  if (status === "ready") return undefined
  if (status === "preparing") return language.t("sidebar.resourcesPreparing")
  return language.t("sidebar.resourcesProcess")
}

export function ChatLeftSidebarResourcesSection(props: ChatLeftSidebarResourcesSectionProps) {
  const { directory, onOpenResource, refreshToken } = props
  const [open, setOpen] = useState(props.defaultOpen ?? false)
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const [resources, setResources] = useState<ResourceListItem[]>(() => {
    return RESOURCE_CACHE_BY_DIRECTORY.get(directory)?.resources ?? []
  })
  const [busyKey, setBusyKey] = useState<string | undefined>(undefined)

  const refresh = useCallback(
    async (options?: { force?: boolean }) => {
      const cached = RESOURCE_CACHE_BY_DIRECTORY.get(directory)
      if (!options?.force && cached) {
        const cachedToken = cached.refreshToken ?? CACHE_TOKEN_FALLBACK
        const nextToken = refreshToken ?? CACHE_TOKEN_FALLBACK
        if (cachedToken === nextToken) {
          setResources(cached.resources)
          setError(undefined)
          setLoading(false)
          return
        }
      }

      setLoading(true)
      setError(undefined)
      try {
        const [discovered, processed] = await Promise.all([
          discoverWorkspaceResources(directory),
          loadResources(directory),
        ])
        const nextResources = buildResourceListItems({ discovered, processed })
        RESOURCE_CACHE_BY_DIRECTORY.set(directory, {
          resources: nextResources,
          refreshToken,
        })
        setResources(nextResources)
      } catch (resourceError) {
        setError(resourceError instanceof Error ? resourceError.message : String(resourceError))
      } finally {
        setLoading(false)
      }
    },
    [directory, refreshToken],
  )

  useEffect(() => {
    if (!open) return
    void refresh()
  }, [open, refresh, refreshToken])

  const resourceCountLabel = useMemo(() => {
    if (resources.length === 0) return undefined
    return resources.length.toLocaleString()
  }, [resources.length])
  const visibleResources = expanded ? resources : resources.slice(0, COLLAPSED_RESOURCE_COUNT)
  const hasMoreResources = resources.length > COLLAPSED_RESOURCE_COUNT

  const onAddResource = useCallback(async () => {
    const sourcePath = await pickResourceFilePath()
    if (!sourcePath) return
    setBusyKey(`add:${sourcePath}`)
    try {
      await addResource(directory, { sourcePath })
      await refresh({ force: true })
    } catch (resourceError) {
      setError(resourceError instanceof Error ? resourceError.message : String(resourceError))
    } finally {
      setBusyKey(undefined)
    }
  }, [directory, refresh])

  const onProcessResource = useCallback(
    async (resource: ResourceListItem) => {
      setBusyKey(resource.key)
      setError(undefined)
      try {
        if (resource.resourceID) {
          await rebuildResource(directory, { resourceKey: resource.resourceID })
        } else {
          await addResource(directory, { sourcePath: resource.path })
        }
        await refresh({ force: true })
      } catch (resourceError) {
        setError(resourceError instanceof Error ? resourceError.message : String(resourceError))
      } finally {
        setBusyKey(undefined)
      }
    },
    [directory, refresh],
  )

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className={`mb-4 ${props.className ?? ""}`.trim()}
    >
      <div className="group/resources">
        <div className="mb-1 flex items-center justify-between px-2 text-text-weak">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex min-w-0 items-center gap-1.5 text-left text-xs text-text-weak transition-colors duration-160 group-hover/resources:text-text-base"
            >
              <span>{language.t("sidebar.resources")}</span>
              {resourceCountLabel ? (
                <Badge variant="outline" className="h-4 min-w-4 px-1 text-[10px] font-medium">
                  {resourceCountLabel}
                </Badge>
              ) : null}
              <ChevronDownIcon
                className={`size-3 transition-transform duration-150 ${open ? "rotate-0" : "-rotate-90"}`}
              />
            </button>
          </CollapsibleTrigger>
          <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover/resources:opacity-100">
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              title={language.t("sidebar.resourcesRefresh")}
              onClick={() => {
                void refresh({ force: true })
              }}
              disabled={loading}
            >
              {loading ? (
                <Loader2Icon className="size-3.5 animate-spin" />
              ) : (
                <RefreshCwIcon className="size-3.5" />
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              title={language.t("sidebar.resourcesAdd")}
              onClick={() => {
                void onAddResource()
              }}
              disabled={busyKey?.startsWith("add:")}
            >
              {busyKey?.startsWith("add:") ? (
                <Loader2Icon className="size-3.5 animate-spin" />
              ) : (
                <PlusIcon className="size-3.5" />
              )}
            </Button>
          </div>
        </div>
        <CollapsibleContent className="space-y-1.5 px-1 pb-1">
          {error ? <p className="px-2 text-xs text-icon-critical-base">{error}</p> : null}
          {resources.length === 0 && !loading ? (
            <p className="px-2 py-1 text-xs text-text-weak">
              {language.t("sidebar.resourcesEmpty")}
            </p>
          ) : null}
          {visibleResources.map((resource) => {
            const processLabel = actionLabelForStatus(resource.status)
            const isBusy = busyKey === resource.key
            const canProcess = resource.status !== "ready"
            return (
              <div
                key={resource.key}
                className="rounded-md border border-border-weaker-base bg-background-base/55 px-2 py-1.5"
              >
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      onOpenResource(directory, {
                        path: resource.path,
                        name: resource.name,
                        ...(resource.resourceID ? { resourceID: resource.resourceID } : {}),
                        status: resource.status,
                      })
                    }
                    className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-surface-raised-base/70"
                    title={resource.path}
                  >
                    {resource.extension === "epub" ? (
                      <BookOpenIcon className="size-3.5 text-text-weak" />
                    ) : (
                      <FileTextIcon className="size-3.5 text-text-weak" />
                    )}
                    <span className="min-w-0 truncate text-xs text-text-base">{resource.name}</span>
                  </button>
                  {canProcess && processLabel ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() => {
                        void onProcessResource(resource)
                      }}
                      disabled={isBusy || resource.status === "preparing"}
                    >
                      {isBusy || resource.status === "preparing" ? (
                        <Loader2Icon className="size-3 animate-spin" />
                      ) : null}
                      {processLabel}
                    </Button>
                  ) : null}
                </div>
                <div className="mt-1 flex items-center justify-between gap-2 px-1">
                  <Badge variant={badgeVariantForStatus(resource.status)} className="text-[10px]">
                    {resourceStatusLabel(resource.status)}
                  </Badge>
                  <span className="truncate text-[10px] text-text-weak">{resource.path}</span>
                </div>
              </div>
            )
          })}
          {hasMoreResources ? (
            <button
              type="button"
              className="ml-2 px-1 py-1 text-xs text-text-weaker hover:text-text-base transition-all active:scale-95"
              onClick={() => {
                setExpanded((current) => !current)
              }}
            >
              {expanded ? language.t("sidebar.showLess") : language.t("sidebar.showMore")}
            </button>
          ) : null}
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}
