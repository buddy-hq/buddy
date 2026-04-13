import { useCallback, useEffect, useMemo, useState, useRef } from "react"
import { useDropzone, type DropEvent } from "react-dropzone"
import {
  Badge,
  Button,
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@buddy/ui"
import {
  Loader2Icon,
  PlusIcon,
  RefreshCwIcon,
  FileTextIcon,
  CheckIcon,
  AlertTriangleIcon,
  UploadIcon,
} from "lucide-react"
import { apiFetch } from "@/lib/api-client"
import { getPlatform } from "@/context/platform"
import { language } from "@/context/language"
import { buildProjectFileRawUrl } from "@/lib/project-file-raw-url"
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
  coverRelpath?: string
  title?: string
  author?: string
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
const RESOURCE_AUTO_REFRESH_INTERVAL_MS = 1500
const RESOURCE_CACHE_BY_DIRECTORY = new Map<string, ResourceCacheEntry>()
const WINDOWS_DRIVE_ABSOLUTE_PATH_REGEX = /^[A-Za-z]:[/\\]/
const WINDOWS_UNC_ABSOLUTE_PATH_REGEX = /^[/\\]{2}[^/\\]+[/\\]+[^/\\]+/
const FILE_URI_PROTOCOL = "file:"
const URI_LIST_MIME_TYPE = "text/uri-list"
const PLAIN_TEXT_MIME_TYPE = "text/plain"
const RESOURCE_DROP_PATH_UNAVAILABLE_ERROR_MESSAGE =
  "Couldn't read dropped file path. Use Add resource to select the file."

function isResourceFilePath(filepath: string): filepath is string {
  return RESOURCE_EXTENSIONS.has(fileExtensionFromPath(filepath))
}

function isAbsoluteFilesystemPath(path: string) {
  return (
    path.startsWith("/") ||
    WINDOWS_DRIVE_ABSOLUTE_PATH_REGEX.test(path) ||
    WINDOWS_UNC_ABSOLUTE_PATH_REGEX.test(path)
  )
}

function normalizeFilesystemPath(path: string) {
  return path.trim().replaceAll("\\", "/")
}

function readFilePathValue(file: File) {
  const pathValue = Reflect.get(file, "path")
  if (typeof pathValue !== "string") return undefined
  return normalizeFilesystemPath(pathValue)
}

function parsePathFromFileUri(input: string) {
  const trimmed = input.trim()
  if (!trimmed.toLowerCase().startsWith(FILE_URI_PROTOCOL)) return undefined

  try {
    const url = new URL(trimmed)
    if (url.protocol !== FILE_URI_PROTOCOL) return undefined

    const decodedPath = decodeURIComponent(url.pathname)
    if (!decodedPath) return undefined

    if (url.host && url.host !== "localhost") {
      return normalizeFilesystemPath(`//${url.host}${decodedPath}`)
    }

    if (/^\/[A-Za-z]:/.test(decodedPath)) {
      return normalizeFilesystemPath(decodedPath.slice(1))
    }

    return normalizeFilesystemPath(decodedPath)
  } catch {
    return undefined
  }
}

function parseDropDataTransferUris(rawText: string) {
  const paths: string[] = []
  for (const line of rawText.split(/\r?\n/g)) {
    const trimmedLine = line.trim()
    if (!trimmedLine || trimmedLine.startsWith("#")) continue
    const parsedPath = parsePathFromFileUri(trimmedLine)
    if (parsedPath) {
      paths.push(parsedPath)
    }
  }
  return paths
}

function isDataTransfer(value: unknown): value is DataTransfer {
  if (!value || typeof value !== "object") return false
  return "files" in value && "getData" in value
}

function readDataTransferFromDropEvent(event: DropEvent) {
  if (Array.isArray(event)) return undefined
  if (!event || typeof event !== "object") return undefined

  const directDataTransfer = Reflect.get(event, "dataTransfer")
  if (isDataTransfer(directDataTransfer)) {
    return directDataTransfer
  }

  const nativeEvent = Reflect.get(event, "nativeEvent")
  if (!nativeEvent || typeof nativeEvent !== "object") return undefined

  const nativeDataTransfer = Reflect.get(nativeEvent, "dataTransfer")
  if (isDataTransfer(nativeDataTransfer)) {
    return nativeDataTransfer
  }

  return undefined
}

async function extractAbsoluteResourcePathsFromDrop(input: {
  acceptedFiles: File[]
  event: DropEvent
  resolveDroppedFilePath?: (file: File) => Promise<string | null> | string | null
  consumeDroppedFilePaths?: () => Promise<string[]> | string[]
}) {
  const droppedPaths = new Set<string>()
  const filesNeedingResolution = new Set<File>()

  const addPath = (rawPath: string | undefined) => {
    if (!rawPath) return
    const normalizedPath = normalizeFilesystemPath(rawPath)
    if (!normalizedPath) return
    if (!isAbsoluteFilesystemPath(normalizedPath)) return
    if (!isResourceFilePath(normalizedPath)) return
    droppedPaths.add(normalizedPath)
  }

  for (const file of input.acceptedFiles) {
    const resolvedPath = readFilePathValue(file)
    addPath(resolvedPath)
    if (!resolvedPath) {
      filesNeedingResolution.add(file)
    }
  }

  const dataTransfer = readDataTransferFromDropEvent(input.event)
  const consumedDroppedFilePaths = input.consumeDroppedFilePaths
  if (consumedDroppedFilePaths) {
    try {
      const cachedPaths = await consumedDroppedFilePaths()
      for (const cachedPath of cachedPaths) {
        addPath(cachedPath)
      }
    } catch {
      // Falls back to event/file inspection below.
    }
  }

  const fileList = dataTransfer?.files
  if (fileList) {
    for (const file of Array.from(fileList)) {
      const resolvedPath = readFilePathValue(file)
      addPath(resolvedPath)
      if (!resolvedPath) {
        filesNeedingResolution.add(file)
      }
    }
  }

  const resolveDroppedFilePath = input.resolveDroppedFilePath
  if (resolveDroppedFilePath) {
    for (const file of filesNeedingResolution) {
      try {
        const resolvedPath = await resolveDroppedFilePath(file)
        addPath(resolvedPath ?? undefined)
      } catch {
        continue
      }
    }
  }

  const droppedUriList = dataTransfer?.getData(URI_LIST_MIME_TYPE)
  if (droppedUriList) {
    for (const parsedPath of parseDropDataTransferUris(droppedUriList)) {
      addPath(parsedPath)
    }
  }

  const droppedText = dataTransfer?.getData(PLAIN_TEXT_MIME_TYPE)
  if (droppedText) {
    for (const parsedPath of parseDropDataTransferUris(droppedText)) {
      addPath(parsedPath)
    }
  }

  return [...droppedPaths]
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
      ...(mapped?.coverRelpath ? { coverRelpath: mapped.coverRelpath } : {}),
      ...(mapped?.title ? { title: mapped.title } : {}),
      ...(mapped?.author ? { author: mapped.author } : {}),
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
      ...(record.coverRelpath ? { coverRelpath: record.coverRelpath } : {}),
      ...(record.title ? { title: record.title } : {}),
      ...(record.author ? { author: record.author } : {}),
    })
    seenPaths.add(resolvedPath)
    seenResourceIDs.add(record.id)
  }

  return items.toSorted((left, right) => left.path.localeCompare(right.path))
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

function ResourceCoverThumbnail({
  directory,
  coverRelpath,
  title,
  extension,
}: {
  directory: string
  coverRelpath?: string
  title?: string
  extension: "pdf" | "epub"
}) {
  const [objectUrl, setObjectUrl] = useState<string | undefined>(undefined)

  useEffect(() => {
    let fetchedObjectUrl: string | undefined
    if (!coverRelpath) {
      setObjectUrl(undefined)
      return
    }
    setObjectUrl(undefined)
    const abortController = new AbortController()
    const request = buildProjectFileRawUrl(directory, coverRelpath)

    apiFetch(request.endpoint, {
      directory: request.directory,
      signal: abortController.signal,
    })
      .then(async (response) => {
        if (!response.ok) return
        const blob = await response.blob()
        if (abortController.signal.aborted) return
        fetchedObjectUrl = URL.createObjectURL(blob)
        setObjectUrl(fetchedObjectUrl)
      })
      .catch(() => {})

    return () => {
      abortController.abort()
      if (fetchedObjectUrl) {
        URL.revokeObjectURL(fetchedObjectUrl)
      }
    }
  }, [directory, coverRelpath])

  const displayName = title || extension.toUpperCase()

  if (objectUrl) {
    return <img src={objectUrl} alt={displayName} className="size-full object-cover" />
  }

  return (
    <div className="flex size-full flex-col items-center justify-center bg-surface-raised-stronger px-4 text-center">
      <div className="mb-3 flex size-12 items-center justify-center rounded-xl bg-surface-base shadow-sm ring-1 ring-border-weaker-base">
        <FileTextIcon className="size-6 text-text-weaker" />
      </div>
      <span className="text-[10px] font-bold uppercase tracking-widest text-text-weaker mb-1 opacity-50">
        {extension}
      </span>
      <span className="line-clamp-3 text-[11px] font-medium leading-relaxed text-text-stronger">
        {title || extension.toUpperCase()}
      </span>
    </div>
  )
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
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
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
          className="flex size-6 items-center justify-center rounded-full bg-surface-base/80 hover:bg-surface-base shadow-sm backdrop-blur-md text-text-strong cursor-default"
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
        className="h-5 px-2 py-0 text-[10px] shadow-sm backdrop-blur-md bg-background-base/80 border-border-warning-base text-text-warning-strong uppercase tracking-wider font-bold"
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

export function ChatLeftSidebarResourcesSection(props: ChatLeftSidebarResourcesSectionProps) {
  const { directory, onOpenResource, refreshToken } = props
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const [resources, setResources] = useState<ResourceListItem[]>(() => {
    return RESOURCE_CACHE_BY_DIRECTORY.get(directory)?.resources ?? []
  })
  const [busyKeys, setBusyKeys] = useState<Set<string>>(() => new Set())

  const refresh = useCallback(
    async (options?: { force?: boolean; silent?: boolean }) => {
      const silent = options?.silent === true
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

      if (!silent) {
        setLoading(true)
        setError(undefined)
      }
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
        if (!silent) {
          setLoading(false)
        }
      }
    },
    [directory, refreshToken],
  )

  useEffect(() => {
    void refresh()
  }, [refresh, refreshToken])

  const hasPreparingResources = useMemo(
    () => resources.some((resource) => resource.status === "preparing"),
    [resources],
  )

  useEffect(() => {
    if (!hasPreparingResources) return

    const intervalID = window.setInterval(() => {
      void refresh({ force: true, silent: true })
    }, RESOURCE_AUTO_REFRESH_INTERVAL_MS)

    return () => {
      window.clearInterval(intervalID)
    }
  }, [hasPreparingResources, refresh])

  const onAddPaths = useCallback(
    async (paths: string[]) => {
      let hasAdded = false
      for (const sourcePath of paths) {
        const operationKey = `add:${sourcePath}`
        setBusyKeys((current) => new Set(current).add(operationKey))
        try {
          await addResource(directory, { sourcePath })
          hasAdded = true
        } catch (resourceError) {
          setError(resourceError instanceof Error ? resourceError.message : String(resourceError))
        } finally {
          setBusyKeys((current) => {
            const next = new Set(current)
            next.delete(operationKey)
            return next
          })
        }
      }
      if (hasAdded) {
        await refresh({ force: true })
      }
    },
    [directory, refresh],
  )

  const onAddResource = useCallback(async () => {
    const sourcePath = await pickResourceFilePath()
    if (sourcePath) {
      await onAddPaths([sourcePath])
    }
  }, [onAddPaths])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (acceptedFiles, fileRejections, event) => {
      void (async () => {
        setError(undefined)
        const sourcePaths = await extractAbsoluteResourcePathsFromDrop({
          acceptedFiles,
          event,
          consumeDroppedFilePaths: getPlatform().consumeDroppedFilePaths,
          resolveDroppedFilePath: getPlatform().resolveDroppedFilePath,
        })
        if (sourcePaths.length > 0) {
          await onAddPaths(sourcePaths)
          return
        }

        if (fileRejections.length > 0) {
          const firstError = fileRejections[0]?.errors[0]
          if (firstError?.message) {
            setError(firstError.message)
          }
          return
        }

        if (acceptedFiles.length > 0) {
          setError(RESOURCE_DROP_PATH_UNAVAILABLE_ERROR_MESSAGE)
        }
      })()
    },
    noClick: true,
    accept: {
      "application/pdf": [".pdf"],
      "application/epub+zip": [".epub"],
    },
  })

  const isAdding = [...busyKeys].some((key) => key.startsWith("add:"))

  const onProcessResource = useCallback(
    async (resource: ResourceListItem) => {
      setBusyKeys((current) => new Set(current).add(resource.key))
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
        setBusyKeys((current) => {
          const next = new Set(current)
          next.delete(resource.key)
          return next
        })
      }
    },
    [directory, refresh],
  )

  return (
    <div
      {...getRootProps()}
      className={`relative flex flex-1 flex-col gap-6 w-full h-full min-h-[60vh] ${props.className ?? ""}`.trim()}
    >
      <input {...getInputProps()} />

      {isDragActive && (
        <div className="absolute inset-x-0 -top-2 bottom-0 z-50 flex items-center justify-center bg-background-base/80 backdrop-blur-sm border-2 border-dashed border-border-interactive-base rounded-2xl m-1 animate-in fade-in zoom-in-95 duration-200">
          <div className="flex flex-col items-center gap-3">
            <div className="flex size-16 items-center justify-center rounded-full bg-surface-interactive-weak text-icon-interactive-base shadow-sm ring-1 ring-border-interactive-base animate-bounce">
              <UploadIcon className="size-8" />
            </div>
            <div className="text-center">
              <p className="text-base font-semibold text-text-strong">Drop files to add</p>
              <p className="text-sm text-text-weak mt-1 font-medium">
                Add PDF or EPUB to your workspace
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between pb-3 border-b border-border-base">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-text-strong">
            {language.t("sidebar.resources")}
          </h2>
          <p className="text-[13px] text-text-weak mt-0.5">
            Workspace documents and uploaded resources
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              void refresh({ force: true })
            }}
            disabled={loading}
          >
            {loading ? (
              <Loader2Icon data-icon="inline-start" className="size-3.5 animate-spin" />
            ) : (
              <RefreshCwIcon data-icon="inline-start" className="size-3.5" />
            )}
            {language.t("sidebar.resourcesRefresh")}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              void onAddResource()
            }}
            disabled={isAdding}
          >
            {isAdding ? (
              <Loader2Icon data-icon="inline-start" className="size-3.5 animate-spin" />
            ) : (
              <PlusIcon data-icon="inline-start" className="size-3.5" />
            )}
            {language.t("sidebar.resourcesAdd")}
          </Button>
        </div>
      </div>

      {error ? (
        <div className="p-4 rounded-lg bg-surface-critical-base text-sm text-text-critical-strong border border-border-critical-weak text-center">
          {error}
        </div>
      ) : null}

      {resources.length === 0 && !loading ? (
        <div className="py-16 flex flex-col items-center justify-center border-2 border-dashed border-border-base rounded-xl bg-surface-weak/30 transition-all hover:bg-surface-weak/50">
          <FileTextIcon className="size-12 text-text-weaker mb-4" />
          <p className="text-text-strong font-medium text-[15px]">
            {language.t("sidebar.resourcesEmpty")}
          </p>
          <p className="text-sm text-text-weak mt-1 max-w-sm text-center">
            Upload a PDF or EPUB to add it to your workspace resources and easily jump between your
            documents and conversations.
          </p>
          <Button className="mt-6" onClick={() => void onAddResource()}>
            <PlusIcon data-icon="inline-start" className="size-4" />
            {language.t("sidebar.resourcesAdd")}
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {resources.map((resource) => {
            const processLabel = actionLabelForStatus(resource.status)
            const isBusy = busyKeys.has(resource.key)
            const canProcess =
              !!processLabel && (resource.status !== "ready" || !!resource.resourceID)
            const displayName = resource.title || resource.name

            return (
              <ContextMenu key={resource.key}>
                <ContextMenuTrigger asChild>
                  <div className="relative flex overflow-hidden rounded-xl border border-border-weaker-base bg-surface-base aspect-[3/4]">
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
                      className="absolute inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                    >
                      <ResourceCoverThumbnail
                        directory={directory}
                        coverRelpath={resource.coverRelpath}
                        title={resource.title}
                        extension={resource.extension}
                      />
                    </button>

                    <div className="pointer-events-none absolute left-2 top-2 z-10 flex gap-1">
                      <ResourceStatusIndicator status={resource.status} isBusy={isBusy} />
                    </div>

                    <div className="absolute right-2 bottom-2 z-10">
                      <ResourceHoverPopover resource={resource} displayName={displayName} />
                    </div>
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-48">
                  {canProcess && processLabel ? (
                    <ContextMenuItem
                      disabled={isBusy || resource.status === "preparing"}
                      onSelect={() => void onProcessResource(resource)}
                    >
                      {isBusy || resource.status === "preparing" ? (
                        <Loader2Icon className="mr-2 size-3.5 animate-spin" />
                      ) : (
                        <RefreshCwIcon className="mr-2 size-3.5" />
                      )}
                      {processLabel}
                    </ContextMenuItem>
                  ) : null}
                </ContextMenuContent>
              </ContextMenu>
            )
          })}
        </div>
      )}
    </div>
  )
}
