import { useEffect, useRef, useState, type ReactNode } from "react"
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  measureElement as measureVirtualElement,
  useVirtualizer,
  type VirtualItem,
} from "@tanstack/react-virtual"
import { useDropzone, type DropEvent } from "react-dropzone"
import {
  FileTextIcon,
  HelpCircleIcon,
  LayoutTemplateIcon,
  Layers2Icon,
  LibraryBigIcon,
  Loader2Icon,
  PlusIcon,
  UploadIcon,
} from "lucide-react"
import { Badge, Button, FolderIcon, Skeleton } from "@buddy/ui"
import buddyStateEmptyBooksUrl from "../../../../../../assets/mascot/buddy-state-empty-books.png"
import buddyStateEmptyDiagramsUrl from "../../../../../../assets/mascot/buddy-state-empty-diagrams.png"
import buddyStateEmptyExercisesUrl from "../../../../../../assets/mascot/buddy-state-empty-exercises.png"
import buddyStateEmptyFlashcardsUrl from "../../../../../../assets/mascot/buddy-state-empty-flashcards.png"
import { FlashcardReviewDialog } from "@/components/flashcard/flashcard-review-dialog"
import { language } from "@/context/language"
import { getPlatform } from "@/context/platform"
import { stringifyError } from "@/lib/api-client"
import {
  getFlashcardDueCount,
  isFlashcardReviewAvailable,
  type FlashcardDueCounts,
} from "@/lib/flashcard"
import { pickResourceFilePath } from "@/lib/resource-file-picker"
import { fileExtensionFromPath } from "@/lib/workspace-file-paths"
import { addResource } from "@/state/resource-actions"
import { useUiPreferences } from "@/state/ui-preferences"
import { invalidateResourcesQueries, resourcesQueryOptions } from "@/state/resources-query"
import { useWorkspaceQuestionSetPanelStore } from "@/state/workspace-question-set-panel-store"
import {
  workspaceArtifactsQueryKeys,
  workspaceFlashcardDecksQueryOptions,
  workspaceMermaidArtifactsQueryOptions,
  workspaceQuestionSetArtifactsQueryOptions,
} from "@/state/workspace-artifacts-query"
import {
  VIRTUAL_MERMAID_CARD_ESTIMATE_PX,
  VIRTUAL_MERMAID_OVERSCAN,
} from "@/components/virtualization/virtualization-defaults"
import { MermaidDiagram } from "@/components/chat/tools/render/mermaid/mermaid-diagram"
import { MermaidToolCard } from "@/components/chat/tools/render/mermaid/mermaid-tool-card"
import {
  ResourceCardGrid,
  type ResourceCardTarget,
} from "@/components/layout/chat-left-sidebar/resource-card-grid"
import { useInvalidateQueryOnChatIdle } from "@/components/layout/use-invalidate-query-on-chat-idle"
import { getFilename } from "../sidebar-helpers"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LibraryTab = "resources" | "flashcards" | "question-sets" | "diagrams"

export type LibraryPanelResourceTarget = ResourceCardTarget

type LibraryPanelProps = {
  directories: string[]
  onOpenResource: (directory: string, resource: LibraryPanelResourceTarget) => void
  onOpenQuestionSet: (directory: string, artifactID: string, selectedArtifactID?: string) => void
  initialTab?: LibraryTab
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SHELF_SKELETON_COUNT = 4
const LOADING_PLACEHOLDER_DELAY_MS = 180
const LIBRARY_TAB_MIN_HEIGHT_CLASS = "min-h-[22rem]"
const EMPTY_STATE_IMAGE_PRELOAD_QUERY_KEY = "library-empty-state-image"
const EMPTY_STATE_IMAGE_STALE_TIME_MS = 60 * 60 * 1000
const EMPTY_STATE_IMAGE_GC_TIME_MS = 24 * 60 * 60 * 1000
const MULTI_NOTEBOOK_BATCH_SIZE = 5
const MULTI_NOTEBOOK_ROW_PREVIEW_COUNT = 2
const RESOURCE_PREVIEW_ROW_COUNT = 2
const MERMAID_EAGER_HYDRATION_COUNT = 2
const MERMAID_HYDRATION_ROOT_MARGIN = "320px 0px"
const DIAGRAMS_GROUP_HEADER_ESTIMATE_PX = 36
const DIAGRAMS_GROUP_HEADER_ROW_CLASS = "pb-3"
const DIAGRAMS_EMPTY_NOTEBOOK_SEPARATOR_ESTIMATE_PX = 52
const DIAGRAMS_EMPTY_NOTEBOOK_ROW_ESTIMATE_PX = 88
const RESOURCE_GRID_SM_BREAKPOINT_PX = 640
const RESOURCE_GRID_LG_BREAKPOINT_PX = 1024
const RESOURCE_GRID_XL_BREAKPOINT_PX = 1280
const RESOURCE_GRID_BASE_COLUMNS = 2
const RESOURCE_GRID_SM_COLUMNS = 3
const RESOURCE_GRID_LG_COLUMNS = 4
const RESOURCE_GRID_XL_COLUMNS = 5
const RESOURCE_EXTENSIONS = new Set(["pdf", "epub"])
const WINDOWS_DRIVE_ABSOLUTE_PATH_REGEX = /^[A-Za-z]:[/\\]/
const WINDOWS_UNC_ABSOLUTE_PATH_REGEX = /^[/\\]{2}[^/\\]+[/\\]+[^/\\]+/
const FILE_URI_PROTOCOL = "file:"
const URI_LIST_MIME_TYPE = "text/uri-list"
const PLAIN_TEXT_MIME_TYPE = "text/plain"
const RESOURCE_DROP_PATH_UNAVAILABLE_ERROR_MESSAGE =
  "Couldn't read dropped file path. Use Add resource to select the file."

const EMPTY_STATE_MASCOT_URLS = [
  buddyStateEmptyBooksUrl,
  buddyStateEmptyFlashcardsUrl,
  buddyStateEmptyExercisesUrl,
  buddyStateEmptyDiagramsUrl,
] as const

const LIBRARY_TABS: { tab: LibraryTab; labelKey: string }[] = [
  { tab: "resources", labelKey: "sidebar.libraryTabResources" },
  { tab: "flashcards", labelKey: "sidebar.libraryTabFlashcards" },
  { tab: "question-sets", labelKey: "sidebar.libraryTabQuestionSets" },
  { tab: "diagrams", labelKey: "sidebar.libraryTabDiagrams" },
]

// ---------------------------------------------------------------------------
// Shared shelf skeleton
// ---------------------------------------------------------------------------

function ShelfCardSkeleton() {
  return (
    <div className="flex w-full flex-col gap-2">
      <Skeleton className="aspect-[3/4] w-full rounded-lg" />
      <Skeleton className="h-3.5 w-3/4 rounded" />
    </div>
  )
}

function ShelfRowSkeleton() {
  return (
    <div className="flex w-full flex-col gap-2">
      <Skeleton className="h-16 w-full rounded-lg" />
    </div>
  )
}

function NotebookShelfHeader(props: { label: string; count?: number; loading: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <FolderIcon className="size-4 shrink-0 text-text-weaker" />
      <span className="truncate text-sm font-medium text-text-base">{props.label}</span>
      {!props.loading && props.count !== undefined ? (
        <span className="text-xs text-text-weaker">{props.count}</span>
      ) : null}
    </div>
  )
}

function NotebookShelfError(props: { message: string }) {
  return (
    <p className="rounded-lg border border-border-critical-base/40 bg-surface-critical-base/10 px-3 py-2 text-xs text-icon-critical-base">
      {props.message}
    </p>
  )
}

function NotebookShelfInlineEmptyState(props: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border-weaker-base bg-surface-weak/40 px-3 py-4 text-sm text-text-weak">
      {props.message}
    </div>
  )
}

function EmptyNotebookSection(props: { children: ReactNode }) {
  return (
    <div className="border-t border-border-base/60 pt-4">
      <div className="space-y-6 opacity-60">{props.children}</div>
    </div>
  )
}

function getResourcePreviewColumns(width: number) {
  if (width >= RESOURCE_GRID_XL_BREAKPOINT_PX) {
    return RESOURCE_GRID_XL_COLUMNS
  }

  if (width >= RESOURCE_GRID_LG_BREAKPOINT_PX) {
    return RESOURCE_GRID_LG_COLUMNS
  }

  if (width >= RESOURCE_GRID_SM_BREAKPOINT_PX) {
    return RESOURCE_GRID_SM_COLUMNS
  }

  return RESOURCE_GRID_BASE_COLUMNS
}

function getResourcePreviewCount(width: number) {
  return getResourcePreviewColumns(width) * RESOURCE_PREVIEW_ROW_COUNT
}

function useResourcePreviewCount() {
  const [previewCount, setPreviewCount] = useState(() =>
    typeof window === "undefined"
      ? RESOURCE_GRID_XL_COLUMNS * RESOURCE_PREVIEW_ROW_COUNT
      : getResourcePreviewCount(window.innerWidth),
  )

  useEffect(() => {
    const updatePreviewCount = () => {
      setPreviewCount(getResourcePreviewCount(window.innerWidth))
    }

    updatePreviewCount()
    window.addEventListener("resize", updatePreviewCount)

    return () => {
      window.removeEventListener("resize", updatePreviewCount)
    }
  }, [])

  return previewCount
}

function useShelfPagination(totalCount: number, pageSize?: number) {
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

function partitionNotebookDirectories(input: {
  directories: string[]
  isEmpty: (index: number) => boolean
}) {
  const directoriesWithItems: string[] = []
  const emptyDirectories: string[] = []

  input.directories.forEach((directory, index) => {
    if (input.isEmpty(index)) {
      emptyDirectories.push(directory)
      return
    }

    directoriesWithItems.push(directory)
  })

  return {
    directoriesWithItems,
    emptyDirectories,
  }
}

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

function ShelfShowMoreButton(props: { count: number; onClick: () => void }) {
  return (
    <div className="pt-1">
      <Button type="button" variant="ghost" size="sm" onClick={props.onClick}>
        {language.t("sidebar.libraryShowMoreCount", { count: props.count })}
      </Button>
    </div>
  )
}

function ResourcesToolbar(props: { busy: boolean; onAddResource: () => void; error?: string }) {
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button type="button" onClick={props.onAddResource} disabled={props.busy}>
          {props.busy ? (
            <Loader2Icon data-icon="inline-start" className="size-4 animate-spin" />
          ) : (
            <PlusIcon data-icon="inline-start" className="size-4" />
          )}
          {props.busy
            ? language.t("sidebar.resourcesPreparing")
            : language.t("sidebar.resourcesAdd")}
        </Button>
      </div>
      {props.error ? <NotebookShelfError message={props.error} /> : null}
    </div>
  )
}

function ResourceDropzone(props: {
  enabled: boolean
  onAddPaths: (paths: string[]) => Promise<void>
  onError: (message: string) => void
  children: ReactNode
}) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    disabled: !props.enabled,
    noClick: true,
    accept: {
      "application/pdf": [".pdf"],
      "application/epub+zip": [".epub"],
    },
    onDrop: (acceptedFiles, fileRejections, event) => {
      void (async () => {
        props.onError("")

        const sourcePaths = await extractAbsoluteResourcePathsFromDrop({
          acceptedFiles,
          event,
          consumeDroppedFilePaths: getPlatform().consumeDroppedFilePaths,
          resolveDroppedFilePath: getPlatform().resolveDroppedFilePath,
        })

        if (sourcePaths.length > 0) {
          await props.onAddPaths(sourcePaths)
          return
        }

        if (fileRejections.length > 0) {
          const firstError = fileRejections[0]?.errors[0]
          if (firstError?.message) {
            props.onError(firstError.message)
          }
          return
        }

        if (acceptedFiles.length > 0) {
          props.onError(RESOURCE_DROP_PATH_UNAVAILABLE_ERROR_MESSAGE)
        }
      })()
    },
  })

  return (
    <div {...getRootProps()} className="relative">
      <input {...getInputProps()} />

      {isDragActive ? (
        <div className="absolute inset-x-0 -top-2 bottom-0 z-50 m-1 flex items-center justify-center rounded-2xl border-2 border-dashed border-border-interactive-base bg-background-base/80 backdrop-blur-sm animate-in fade-in zoom-in-95 duration-200">
          <div className="flex flex-col items-center gap-3">
            <div className="flex size-16 items-center justify-center rounded-full bg-surface-interactive-weak text-icon-interactive-base shadow-sm ring-1 ring-border-interactive-base animate-bounce">
              <UploadIcon className="size-8" />
            </div>
            <div className="text-center">
              <p className="text-base font-semibold text-text-strong">Drop files to add</p>
              <p className="mt-1 text-sm font-medium text-text-weak">
                Add PDF or EPUB to your workspace
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {props.children}
    </div>
  )
}

async function preloadImageAsset(src: string) {
  await new Promise<void>((resolve, reject) => {
    const image = new Image()
    let settled = false

    const cleanup = () => {
      image.removeEventListener("load", handleLoad)
      image.removeEventListener("error", handleError)
    }

    const completeLoad = () => {
      if (settled) return
      settled = true
      cleanup()
      resolve()
    }

    const handleLoad = () => {
      completeLoad()
    }

    const handleError = () => {
      if (settled) return
      settled = true
      cleanup()
      reject(new Error(`Failed to preload image asset: ${src}`))
    }

    image.addEventListener("load", handleLoad)
    image.addEventListener("error", handleError)
    image.src = src

    if (image.complete) {
      completeLoad()
      return
    }

    if (typeof image.decode === "function") {
      void image
        .decode()
        .then(completeLoad)
        .catch(() => {
          // Keep the onload listener as a fallback for browsers that reject decode early.
        })
    }
  })

  return src
}

function LibraryTabErrorState(props: {
  icon: typeof Layers2Icon
  title: string
  description: string
  error?: string
  mascotUrl?: string
  mascotAlt?: string
  action?: {
    label: string
    busyLabel?: string
    busy?: boolean
    onClick: () => void
  }
}) {
  const Icon = props.icon

  return (
    <div
      className={`flex flex-col items-center justify-center py-12 text-center ${LIBRARY_TAB_MIN_HEIGHT_CLASS}`}
    >
      {props.mascotUrl ? (
        <img
          src={props.mascotUrl}
          alt={props.mascotAlt ?? ""}
          className="mb-5 w-48 max-w-full md:w-60"
        />
      ) : (
        <Icon className="mb-3 size-10 text-text-weaker" />
      )}
      <div className="max-w-md space-y-2">
        <p className="text-xl font-semibold tracking-tight text-text-strong md:text-2xl">
          {props.title}
        </p>
        {props.error ? (
          <p className="rounded-lg border border-border-critical-base/40 bg-surface-critical-base/10 px-3 py-2 text-sm leading-6 text-icon-critical-base">
            {props.error}
          </p>
        ) : (
          <p className="text-balance text-base leading-7 text-text-weak">{props.description}</p>
        )}
        {!props.error && props.action ? (
          <div className="pt-2">
            <Button
              type="button"
              onClick={props.action.onClick}
              disabled={props.action.busy}
              className="min-w-36"
            >
              {props.action.busy ? (
                <Loader2Icon data-icon="inline-start" className="size-4 animate-spin" />
              ) : (
                <PlusIcon data-icon="inline-start" className="size-4" />
              )}
              {props.action.busy
                ? (props.action.busyLabel ?? props.action.label)
                : props.action.label}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function useDelayedPending(isPending: boolean) {
  const [showLoadingState, setShowLoadingState] = useState(false)

  useEffect(() => {
    if (!isPending) {
      setShowLoadingState(false)
      return
    }

    const timeout = window.setTimeout(() => {
      setShowLoadingState(true)
    }, LOADING_PLACEHOLDER_DELAY_MS)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [isPending])

  return showLoadingState
}

function LoadingStateBuffer() {
  return <div aria-hidden className={LIBRARY_TAB_MIN_HEIGHT_CLASS} />
}

// ---------------------------------------------------------------------------
// Resource shelf
// ---------------------------------------------------------------------------

function ResourceNotebookShelf({
  directory,
  onOpenResource,
  showHeader,
  pageSize,
  emptyMessage,
}: {
  directory: string
  onOpenResource: (directory: string, resource: LibraryPanelResourceTarget) => void
  showHeader: boolean
  pageSize?: number
  emptyMessage?: string
}) {
  const resourcesQuery = useQuery({
    ...resourcesQueryOptions(directory),
    refetchOnMount: false,
  })
  const resources = resourcesQuery.data?.items ?? []
  const loading = resourcesQuery.isPending
  const error = resourcesQuery.error ? stringifyError(resourcesQuery.error) : undefined
  const label = getFilename(directory)
  const { visibleCount, nextBatchCount, canShowMore, showMore } = useShelfPagination(
    resources.length,
    pageSize,
  )
  const visibleResources = resources.slice(0, visibleCount)

  if (!loading && !error && resources.length === 0) {
    if (!emptyMessage) {
      return null
    }

    return (
      <div data-component="library-shelf" className="space-y-3">
        {showHeader ? <NotebookShelfHeader label={label} count={0} loading={false} /> : null}
        <NotebookShelfInlineEmptyState message={emptyMessage} />
      </div>
    )
  }

  return (
    <div data-component="library-shelf" className="space-y-3">
      {showHeader ? (
        <NotebookShelfHeader label={label} count={resources.length} loading={loading} />
      ) : null}

      {loading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: SHELF_SKELETON_COUNT }, (_, index) => (
            <ShelfCardSkeleton key={index} />
          ))}
        </div>
      ) : (
        <ResourceCardGrid
          directory={directory}
          resources={visibleResources}
          onOpenResource={onOpenResource}
        />
      )}
      {!loading && canShowMore ? (
        <ShelfShowMoreButton count={nextBatchCount} onClick={showMore} />
      ) : null}
      {error ? <NotebookShelfError message={error} /> : null}
    </div>
  )
}

function ResourcesTab({
  directories,
  onOpenResource,
}: {
  directories: string[]
  onOpenResource: (directory: string, resource: LibraryPanelResourceTarget) => void
}) {
  const queryClient = useQueryClient()
  const [isAddingResource, setIsAddingResource] = useState(false)
  const [addResourceError, setAddResourceError] = useState<string | undefined>(undefined)
  const isMultiNotebookView = directories.length > 1
  const resourcePreviewCount = useResourcePreviewCount()
  const shelfQueries = useQueries({
    queries: directories.map((directory) => resourcesQueryOptions(directory)),
  })

  const allLoading = shelfQueries.every((query) => query.isPending)
  const showLoadingState = useDelayedPending(allLoading)
  const totalResources = shelfQueries.reduce(
    (sum, query) => sum + (query.data?.items.length ?? 0),
    0,
  )
  const allLoaded = shelfQueries.every((query) => !query.isPending)
  const loadError = shelfQueries.find((query) => query.error)?.error
  const isEmpty = allLoaded && !loadError && totalResources === 0
  const singleDirectory = directories.length === 1 ? directories[0] : undefined
  const showNotebookHeaders = directories.length > 1
  const { directoriesWithItems, emptyDirectories } = partitionNotebookDirectories({
    directories,
    isEmpty: (index) => {
      const query = shelfQueries[index]
      if (!query || query.isPending || query.error) {
        return false
      }

      return (query.data?.items.length ?? 0) === 0
    },
  })

  const onAddPaths = async (sourcePaths: string[]) => {
    if (!singleDirectory || isAddingResource) return

    setAddResourceError(undefined)
    setIsAddingResource(true)

    let hasAdded = false

    try {
      for (const sourcePath of sourcePaths) {
        try {
          await addResource(singleDirectory, { sourcePath })
          hasAdded = true
        } catch (resourceError) {
          setAddResourceError(stringifyError(resourceError))
        }
      }

      if (hasAdded) {
        await invalidateResourcesQueries(queryClient, singleDirectory)
      }
    } catch (resourceError) {
      setAddResourceError(stringifyError(resourceError))
    } finally {
      setIsAddingResource(false)
    }
  }

  const onAddResource = async () => {
    const sourcePath = await pickResourceFilePath()
    if (!sourcePath) return

    await onAddPaths([sourcePath])
  }

  const wrapSingleNotebookResources = (content: ReactNode) => {
    if (!singleDirectory) {
      return content
    }

    return (
      <ResourceDropzone
        enabled={!isAddingResource}
        onAddPaths={onAddPaths}
        onError={(message) => {
          setAddResourceError(message || undefined)
        }}
      >
        {content}
      </ResourceDropzone>
    )
  }

  if (!isMultiNotebookView && allLoading && !showLoadingState) {
    return wrapSingleNotebookResources(<LoadingStateBuffer />)
  }

  if (!isMultiNotebookView && allLoading) {
    return wrapSingleNotebookResources(
      <div className={`space-y-6 ${LIBRARY_TAB_MIN_HEIGHT_CLASS}`}>
        {directories.slice(0, 3).map((directory) => (
          <div key={directory} className="space-y-3">
            <div className="flex items-center gap-2">
              <Skeleton className="size-4 rounded" />
              <Skeleton className="h-4 w-24 rounded" />
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {Array.from({ length: SHELF_SKELETON_COUNT }, (_, index) => (
                <ShelfCardSkeleton key={index} />
              ))}
            </div>
          </div>
        ))}
      </div>,
    )
  }

  if (!isMultiNotebookView && loadError) {
    return wrapSingleNotebookResources(
      <LibraryTabErrorState
        icon={FileTextIcon}
        title={language.t("sidebar.libraryEmpty")}
        description={language.t("sidebar.libraryEmptyDescription")}
        error={addResourceError ?? stringifyError(loadError)}
        mascotUrl={buddyStateEmptyBooksUrl}
        mascotAlt={`${language.t("routes.chat.productName")} sitting beside an empty bookshelf`}
      />,
    )
  }

  if (!isMultiNotebookView && isEmpty) {
    return wrapSingleNotebookResources(
      <LibraryTabErrorState
        icon={FileTextIcon}
        title={language.t("sidebar.libraryEmpty")}
        description={language.t("sidebar.libraryEmptyDescription")}
        error={addResourceError}
        mascotUrl={buddyStateEmptyBooksUrl}
        mascotAlt={`${language.t("routes.chat.productName")} sitting beside an empty bookshelf`}
        action={
          singleDirectory
            ? {
                label: language.t("sidebar.resourcesAdd"),
                busyLabel: language.t("sidebar.resourcesPreparing"),
                busy: isAddingResource,
                onClick: () => {
                  void onAddResource()
                },
              }
            : undefined
        }
      />,
    )
  }

  if (isMultiNotebookView) {
    return (
      <div className="space-y-6">
        {directoriesWithItems.map((directory) => (
          <ResourceNotebookShelf
            key={directory}
            directory={directory}
            onOpenResource={onOpenResource}
            showHeader
            pageSize={resourcePreviewCount}
            emptyMessage={language.t("sidebar.libraryNotebookResourcesEmpty")}
          />
        ))}
        {emptyDirectories.length > 0 ? (
          <EmptyNotebookSection>
            {emptyDirectories.map((directory) => (
              <ResourceNotebookShelf
                key={directory}
                directory={directory}
                onOpenResource={onOpenResource}
                showHeader
                pageSize={resourcePreviewCount}
                emptyMessage={language.t("sidebar.libraryNotebookResourcesEmpty")}
              />
            ))}
          </EmptyNotebookSection>
        ) : null}
      </div>
    )
  }

  return wrapSingleNotebookResources(
    <div className="space-y-6">
      {singleDirectory ? (
        <ResourcesToolbar
          busy={isAddingResource}
          error={addResourceError}
          onAddResource={() => {
            void onAddResource()
          }}
        />
      ) : null}
      {directories.map((directory) => (
        <ResourceNotebookShelf
          key={directory}
          directory={directory}
          onOpenResource={onOpenResource}
          showHeader={showNotebookHeaders}
        />
      ))}
    </div>,
  )
}

// ---------------------------------------------------------------------------
// Flashcard shelf
// ---------------------------------------------------------------------------

function FlashcardDueBadges(props: { dueCounts: FlashcardDueCounts }) {
  const { dueCounts } = props
  const total = getFlashcardDueCount(dueCounts)

  if (total === 0) {
    return (
      <span className="text-[11px] text-text-weaker">{language.t("workspaceFlashcard.noDue")}</span>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      {dueCounts.new > 0 ? (
        <span className="rounded-sm bg-surface-interactive-base/15 px-1.5 py-0.5 text-[11px] font-medium text-text-interactive-base">
          {language.t("workspaceFlashcard.dueNew", { count: dueCounts.new })}
        </span>
      ) : null}
      {dueCounts.learning > 0 ? (
        <span className="rounded-sm bg-surface-warning-base/15 px-1.5 py-0.5 text-[11px] font-medium text-icon-warning-base">
          {language.t("workspaceFlashcard.dueLearning", { count: dueCounts.learning })}
        </span>
      ) : null}
      {dueCounts.review > 0 ? (
        <span className="rounded-sm bg-surface-success-base/15 px-1.5 py-0.5 text-[11px] font-medium text-text-success-base">
          {language.t("workspaceFlashcard.dueReview", { count: dueCounts.review })}
        </span>
      ) : null}
    </div>
  )
}

function FlashcardNotebookShelf(props: {
  directory: string
  showHeader: boolean
  pageSize?: number
  emptyMessage?: string
}) {
  const { directory, showHeader, pageSize, emptyMessage } = props
  const queryClient = useQueryClient()
  const decksQuery = useQuery({
    ...workspaceFlashcardDecksQueryOptions(directory),
    refetchOnMount: false,
  })
  const decks = decksQuery.data?.decks ?? []
  const loading = decksQuery.isPending
  const error = decksQuery.error ? stringifyError(decksQuery.error) : undefined
  const label = getFilename(directory)
  const [reviewDeck, setReviewDeck] = useState<{ deckID: string; title: string } | null>(null)
  useInvalidateQueryOnChatIdle({
    directory,
    queryKey: workspaceArtifactsQueryKeys.flashcard(directory),
  })
  const { visibleCount, nextBatchCount, canShowMore, showMore } = useShelfPagination(
    decks.length,
    pageSize,
  )
  const visibleDecks = decks.slice(0, visibleCount)

  if (!loading && decks.length === 0 && !error) {
    if (!emptyMessage) {
      return null
    }

    return (
      <div data-component="library-flashcard-shelf" className="space-y-3">
        {showHeader ? <NotebookShelfHeader label={label} count={0} loading={false} /> : null}
        <NotebookShelfInlineEmptyState message={emptyMessage} />
      </div>
    )
  }

  return (
    <>
      <div data-component="library-flashcard-shelf" className="space-y-3">
        {showHeader ? (
          <NotebookShelfHeader label={label} count={decks.length} loading={loading} />
        ) : null}

        <div className="space-y-2">
          {loading
            ? Array.from({ length: 2 }, (_, index) => <ShelfRowSkeleton key={index} />)
            : visibleDecks.map((deck) => {
                const reviewAvailable = isFlashcardReviewAvailable(deck)
                const content = (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-text-base">{deck.title}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-weak">
                          <span>
                            {language.t(
                              deck.noteCount === 1
                                ? "workspaceFlashcard.noteCount.one"
                                : "workspaceFlashcard.noteCount.other",
                              { count: deck.noteCount },
                            )}
                          </span>
                          <span className="text-text-weaker">&middot;</span>
                          <span>
                            {language.t(
                              deck.cardCount === 1
                                ? "workspaceFlashcard.cardCount.one"
                                : "workspaceFlashcard.cardCount.other",
                              { count: deck.cardCount },
                            )}
                          </span>
                        </div>
                      </div>
                      <Layers2Icon className="mt-0.5 size-4 shrink-0 text-text-weaker" />
                    </div>
                    <div className="mt-2">
                      <FlashcardDueBadges dueCounts={deck.dueCounts} />
                    </div>
                  </>
                )

                return reviewAvailable ? (
                  <button
                    key={deck.deckID}
                    type="button"
                    onClick={() => setReviewDeck({ deckID: deck.deckID, title: deck.title })}
                    className="w-full rounded-lg border border-border-weaker-base bg-surface-base p-3 text-left shadow-sm transition-colors hover:border-border-hover hover:bg-surface-raised-base"
                  >
                    {content}
                  </button>
                ) : (
                  <div
                    key={deck.deckID}
                    className="rounded-lg border border-border-weaker-base bg-surface-base p-3 shadow-sm"
                  >
                    {content}
                  </div>
                )
              })}
          {!loading && canShowMore ? (
            <ShelfShowMoreButton count={nextBatchCount} onClick={showMore} />
          ) : null}
          {error ? <NotebookShelfError message={error} /> : null}
        </div>
      </div>

      {reviewDeck ? (
        <FlashcardReviewDialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setReviewDeck(null)
              void queryClient.invalidateQueries({
                queryKey: workspaceArtifactsQueryKeys.flashcard(directory),
              })
            }
          }}
          directory={directory}
          deckID={reviewDeck.deckID}
          deckTitle={reviewDeck.title}
        />
      ) : null}
    </>
  )
}

function FlashcardsTab({ directories }: { directories: string[] }) {
  const isMultiNotebookView = directories.length > 1
  const shelfQueries = useQueries({
    queries: directories.map((directory) => workspaceFlashcardDecksQueryOptions(directory)),
  })

  const allLoading = shelfQueries.every((query) => query.isPending)
  const showLoadingState = useDelayedPending(allLoading)
  const totalDecks = shelfQueries.reduce((sum, query) => sum + (query.data?.decks.length ?? 0), 0)
  const allLoaded = shelfQueries.every((query) => !query.isPending)
  const loadError = shelfQueries.find((query) => query.error)?.error
  const showNotebookHeaders = directories.length > 1
  const { directoriesWithItems, emptyDirectories } = partitionNotebookDirectories({
    directories,
    isEmpty: (index) => {
      const query = shelfQueries[index]
      if (!query || query.isPending || query.error) {
        return false
      }

      return (query.data?.decks.length ?? 0) === 0
    },
  })

  if (!isMultiNotebookView && allLoading && !showLoadingState) {
    return <LoadingStateBuffer />
  }

  if (!isMultiNotebookView && allLoading) {
    return (
      <div className={`space-y-6 ${LIBRARY_TAB_MIN_HEIGHT_CLASS}`}>
        {directories.slice(0, 3).map((directory) => (
          <div key={directory} className="space-y-3">
            <div className="flex items-center gap-2">
              <Skeleton className="size-4 rounded" />
              <Skeleton className="h-4 w-24 rounded" />
            </div>
            <div className="space-y-2">
              {Array.from({ length: 2 }, (_, index) => (
                <ShelfRowSkeleton key={index} />
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (!isMultiNotebookView && allLoaded && totalDecks === 0) {
    return (
      <LibraryTabErrorState
        icon={Layers2Icon}
        title={language.t("sidebar.libraryFlashcardsEmpty")}
        description={language.t("sidebar.libraryFlashcardsEmptyDescription")}
        error={loadError ? stringifyError(loadError) : undefined}
        mascotUrl={buddyStateEmptyFlashcardsUrl}
        mascotAlt={`${language.t("routes.chat.productName")} holding flashcards`}
      />
    )
  }

  if (isMultiNotebookView) {
    return (
      <div className="space-y-6">
        {directoriesWithItems.map((directory) => (
          <FlashcardNotebookShelf
            key={directory}
            directory={directory}
            showHeader
            pageSize={MULTI_NOTEBOOK_ROW_PREVIEW_COUNT}
            emptyMessage={language.t("sidebar.libraryNotebookFlashcardsEmpty")}
          />
        ))}
        {emptyDirectories.length > 0 ? (
          <EmptyNotebookSection>
            {emptyDirectories.map((directory) => (
              <FlashcardNotebookShelf
                key={directory}
                directory={directory}
                showHeader
                pageSize={MULTI_NOTEBOOK_ROW_PREVIEW_COUNT}
                emptyMessage={language.t("sidebar.libraryNotebookFlashcardsEmpty")}
              />
            ))}
          </EmptyNotebookSection>
        ) : null}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {directories.map((directory) => (
        <FlashcardNotebookShelf
          key={directory}
          directory={directory}
          showHeader={showNotebookHeaders}
        />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Question set shelf
// ---------------------------------------------------------------------------

function QuestionSetNotebookShelf(props: {
  directory: string
  onOpenQuestionSet: (directory: string, artifactID: string, selectedArtifactID?: string) => void
  showHeader: boolean
  pageSize?: number
  emptyMessage?: string
}) {
  const { directory, onOpenQuestionSet, showHeader, pageSize, emptyMessage } = props
  const setsQuery = useQuery({
    ...workspaceQuestionSetArtifactsQueryOptions(directory),
    refetchOnMount: false,
  })
  const sets = setsQuery.data?.artifacts ?? []
  const loading = setsQuery.isPending
  const error = setsQuery.error ? stringifyError(setsQuery.error) : undefined
  const label = getFilename(directory)
  useInvalidateQueryOnChatIdle({
    directory,
    queryKey: workspaceArtifactsQueryKeys.questionSet(directory),
  })
  const selectedArtifactID = useWorkspaceQuestionSetPanelStore(
    (store) => store.selectedArtifactIDByDirectory[directory],
  )
  const rightSidebarOpen = useUiPreferences((store) => store.rightSidebarOpen)
  const rightSidebarTab = useUiPreferences((store) => store.rightSidebarTab)
  const { visibleCount, nextBatchCount, canShowMore, showMore } = useShelfPagination(
    sets.length,
    pageSize,
  )
  const visibleSets = sets.slice(0, visibleCount)

  if (!loading && sets.length === 0 && !error) {
    if (!emptyMessage) {
      return null
    }

    return (
      <div data-component="library-question-set-shelf" className="space-y-3">
        {showHeader ? <NotebookShelfHeader label={label} count={0} loading={false} /> : null}
        <NotebookShelfInlineEmptyState message={emptyMessage} />
      </div>
    )
  }

  return (
    <div data-component="library-question-set-shelf" className="space-y-3">
      {showHeader ? (
        <NotebookShelfHeader label={label} count={sets.length} loading={loading} />
      ) : null}

      <div className="space-y-2">
        {loading
          ? Array.from({ length: 2 }, (_, index) => <ShelfRowSkeleton key={index} />)
          : visibleSets.map((artifact) => (
              <button
                key={artifact.artifactID}
                type="button"
                onClick={() => {
                  onOpenQuestionSet(directory, artifact.artifactID, selectedArtifactID)
                }}
                className={`w-full rounded-lg border bg-surface-base p-3 text-left shadow-sm transition-colors ${
                  rightSidebarOpen &&
                  rightSidebarTab === "question-set" &&
                  selectedArtifactID === artifact.artifactID
                    ? "border-border-interactive-base bg-surface-raised-base"
                    : "border-border-weaker-base hover:border-border-hover hover:bg-surface-raised-base"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text-base">{artifact.title}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-weak">
                      <span>
                        {language.t(
                          artifact.questions.length === 1
                            ? "chatTools.questionCount.one"
                            : "chatTools.questionCount.other",
                          { count: artifact.questions.length },
                        )}
                      </span>
                      <span className="text-text-weaker">&middot;</span>
                      <span>{new Date(artifact.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {artifact.groupType}
                  </Badge>
                </div>
              </button>
            ))}
        {!loading && canShowMore ? (
          <ShelfShowMoreButton count={nextBatchCount} onClick={showMore} />
        ) : null}
        {error ? <NotebookShelfError message={error} /> : null}
      </div>
    </div>
  )
}

function QuestionSetsTab(props: {
  directories: string[]
  onOpenQuestionSet: (directory: string, artifactID: string, selectedArtifactID?: string) => void
}) {
  const { directories, onOpenQuestionSet } = props
  const isMultiNotebookView = directories.length > 1
  const shelfQueries = useQueries({
    queries: directories.map((directory) => workspaceQuestionSetArtifactsQueryOptions(directory)),
  })

  const allLoading = shelfQueries.every((query) => query.isPending)
  const showLoadingState = useDelayedPending(allLoading)
  const totalSets = shelfQueries.reduce(
    (sum, query) => sum + (query.data?.artifacts.length ?? 0),
    0,
  )
  const allLoaded = shelfQueries.every((query) => !query.isPending)
  const loadError = shelfQueries.find((query) => query.error)?.error
  const showNotebookHeaders = directories.length > 1
  const { directoriesWithItems, emptyDirectories } = partitionNotebookDirectories({
    directories,
    isEmpty: (index) => {
      const query = shelfQueries[index]
      if (!query || query.isPending || query.error) {
        return false
      }

      return (query.data?.artifacts.length ?? 0) === 0
    },
  })

  if (!isMultiNotebookView && allLoading && !showLoadingState) {
    return <LoadingStateBuffer />
  }

  if (!isMultiNotebookView && allLoading) {
    return (
      <div className={`space-y-6 ${LIBRARY_TAB_MIN_HEIGHT_CLASS}`}>
        {directories.slice(0, 3).map((directory) => (
          <div key={directory} className="space-y-3">
            <div className="flex items-center gap-2">
              <Skeleton className="size-4 rounded" />
              <Skeleton className="h-4 w-24 rounded" />
            </div>
            <div className="space-y-2">
              {Array.from({ length: 2 }, (_, index) => (
                <ShelfRowSkeleton key={index} />
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (!isMultiNotebookView && allLoaded && totalSets === 0) {
    return (
      <LibraryTabErrorState
        icon={HelpCircleIcon}
        title={language.t("sidebar.libraryQuestionSetsEmpty")}
        description={language.t("sidebar.libraryQuestionSetsEmptyDescription")}
        error={loadError ? stringifyError(loadError) : undefined}
        mascotUrl={buddyStateEmptyExercisesUrl}
        mascotAlt={`${language.t("routes.chat.productName")} holding an exercise clipboard`}
      />
    )
  }

  if (isMultiNotebookView) {
    return (
      <div className="space-y-6">
        {directoriesWithItems.map((directory) => (
          <QuestionSetNotebookShelf
            key={directory}
            directory={directory}
            onOpenQuestionSet={onOpenQuestionSet}
            showHeader
            pageSize={MULTI_NOTEBOOK_ROW_PREVIEW_COUNT}
            emptyMessage={language.t("sidebar.libraryNotebookQuestionSetsEmpty")}
          />
        ))}
        {emptyDirectories.length > 0 ? (
          <EmptyNotebookSection>
            {emptyDirectories.map((directory) => (
              <QuestionSetNotebookShelf
                key={directory}
                directory={directory}
                onOpenQuestionSet={onOpenQuestionSet}
                showHeader
                pageSize={MULTI_NOTEBOOK_ROW_PREVIEW_COUNT}
                emptyMessage={language.t("sidebar.libraryNotebookQuestionSetsEmpty")}
              />
            ))}
          </EmptyNotebookSection>
        ) : null}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {directories.map((directory) => (
        <QuestionSetNotebookShelf
          key={directory}
          directory={directory}
          onOpenQuestionSet={onOpenQuestionSet}
          showHeader={showNotebookHeaders}
        />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Diagrams shelf
// ---------------------------------------------------------------------------

const MERMAID_SHELF_CARD_HEIGHT_CLASS = "aspect-video min-h-[10rem] w-full"

type DiagramNotebookGroup = {
  directory: string
  label: string
  artifacts: {
    artifactID: string
    alt: string
    diagramType: string
    source: string
  }[]
  error?: string
}

type DiagramVirtualRow =
  | {
      kind: "group-header"
      key: string
      directory: string
      label: string
      count: number
    }
  | {
      kind: "artifact"
      key: string
      directory: string
      artifact: {
        artifactID: string
        alt: string
        diagramType: string
        source: string
      }
      hydrated: boolean
    }
  | {
      kind: "show-more"
      key: string
      directory: string
      count: number
      onClick: () => void
    }
  | {
      kind: "error"
      key: string
      message: string
    }
  | {
      kind: "empty-separator"
      key: string
    }
  | {
      kind: "empty-notebook"
      key: string
      label: string
      message: string
    }

function useLibraryScrollElement() {
  const rootRef = useRef<HTMLDivElement>(null)
  const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null)

  useEffect(() => {
    const nextScrollElement =
      rootRef.current?.closest<HTMLElement>("[data-library-scroll-container]") ??
      rootRef.current?.parentElement ??
      null
    setScrollElement(nextScrollElement ?? null)
  }, [])

  return {
    rootRef,
    scrollElement,
  }
}

function MermaidArtifactPlaceholderCard(props: { artifact: { alt: string; diagramType: string } }) {
  return (
    <MermaidToolCard
      title={props.artifact.alt}
      diagramType={props.artifact.diagramType}
      hideStatus
      contentClassName={MERMAID_SHELF_CARD_HEIGHT_CLASS}
    >
      <div className="flex h-full w-full items-center justify-center bg-surface-weak/10 p-3">
        <div className="space-y-3 text-center">
          <div className="mx-auto h-10 w-20 animate-pulse rounded-lg border border-border-base/50 bg-surface-raised-base/80 shadow-inner" />
          <p className="text-sm text-text-weak">
            {language.t("chatTools.mermaidDiagram.rendering")}
          </p>
        </div>
      </div>
    </MermaidToolCard>
  )
}

function LazyMermaidArtifactCard(props: {
  artifact: {
    artifactID: string
    alt: string
    diagramType: string
    source: string
  }
  initiallyHydrated: boolean
}) {
  const [hydrated, setHydrated] = useState(props.initiallyHydrated)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (props.initiallyHydrated) {
      setHydrated(true)
      return
    }

    if (hydrated) {
      return
    }

    const element = containerRef.current
    if (!element || typeof IntersectionObserver === "undefined") {
      setHydrated(true)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) {
          return
        }

        setHydrated(true)
        observer.disconnect()
      },
      {
        root: null,
        rootMargin: MERMAID_HYDRATION_ROOT_MARGIN,
      },
    )

    observer.observe(element)

    return () => {
      observer.disconnect()
    }
  }, [hydrated, props.initiallyHydrated])

  return (
    <div ref={containerRef}>
      {hydrated ? (
        <MermaidDiagram
          source={props.artifact.source}
          artifactID={props.artifact.artifactID}
          alt={props.artifact.alt}
          showRawSourceOnError
          minimalActions
          disableRevealAnimation
          renderWrapper={(diagramElement, actions) => (
            <MermaidToolCard
              title={props.artifact.alt}
              diagramType={props.artifact.diagramType}
              hideStatus
              contentClassName={MERMAID_SHELF_CARD_HEIGHT_CLASS}
              actions={actions}
            >
              <div className="h-full w-full p-3">{diagramElement}</div>
            </MermaidToolCard>
          )}
        />
      ) : (
        <MermaidArtifactPlaceholderCard artifact={props.artifact} />
      )}
    </div>
  )
}

function DiagramsNotebookShelf(props: {
  directory: string
  showHeader: boolean
  pageSize?: number
  emptyMessage?: string
  eagerHydrationCount?: number
}) {
  const { directory, showHeader, pageSize, emptyMessage, eagerHydrationCount = 0 } = props
  const artifactsQuery = useQuery(workspaceMermaidArtifactsQueryOptions(directory))
  const artifacts = artifactsQuery.data?.artifacts ?? []
  const loading = artifactsQuery.isPending
  const error = artifactsQuery.error ? stringifyError(artifactsQuery.error) : undefined
  const label = getFilename(directory)
  useInvalidateQueryOnChatIdle({
    directory,
    queryKey: workspaceArtifactsQueryKeys.mermaid(directory),
  })
  const { visibleCount, nextBatchCount, canShowMore, showMore } = useShelfPagination(
    artifacts.length,
    pageSize,
  )
  const visibleArtifacts = artifacts.slice(0, visibleCount)

  if (!loading && artifacts.length === 0 && !error) {
    if (!emptyMessage) {
      return null
    }

    return (
      <div data-component="library-diagram-shelf" className="space-y-3">
        {showHeader ? <NotebookShelfHeader label={label} count={0} loading={false} /> : null}
        <NotebookShelfInlineEmptyState message={emptyMessage} />
      </div>
    )
  }

  return (
    <div data-component="library-diagram-shelf" className="space-y-3">
      {showHeader ? (
        <NotebookShelfHeader label={label} count={artifacts.length} loading={loading} />
      ) : null}

      <div className="space-y-3">
        {loading
          ? Array.from({ length: 2 }, (_, index) => <ShelfRowSkeleton key={index} />)
          : visibleArtifacts.map((artifact, index) => (
              <LazyMermaidArtifactCard
                key={artifact.artifactID}
                artifact={artifact}
                initiallyHydrated={index < eagerHydrationCount}
              />
            ))}
        {!loading && canShowMore ? (
          <ShelfShowMoreButton count={nextBatchCount} onClick={showMore} />
        ) : null}
        {error ? <NotebookShelfError message={error} /> : null}
      </div>
    </div>
  )
}

function useVisibleDiagramCounts(groups: DiagramNotebookGroup[], pageSize: number) {
  const [visibleCounts, setVisibleCounts] = useState<Record<string, number>>({})

  useEffect(() => {
    setVisibleCounts((current) => {
      const next: Record<string, number> = {}

      for (const group of groups) {
        const currentCount = current[group.directory]
        const initialCount = Math.min(pageSize, group.artifacts.length)
        next[group.directory] =
          currentCount === undefined
            ? initialCount
            : Math.min(Math.max(currentCount, initialCount), group.artifacts.length)
      }

      return next
    })
  }, [groups, pageSize])

  const showMore = (directory: string, totalCount: number) => {
    setVisibleCounts((current) => ({
      ...current,
      [directory]: Math.min((current[directory] ?? pageSize) + pageSize, totalCount),
    }))
  }

  return {
    visibleCounts,
    showMore,
  }
}

function buildDiagramVirtualRows(input: {
  groups: DiagramNotebookGroup[]
  visibleCounts: Record<string, number>
  pageSize: number
  onShowMore: (directory: string, totalCount: number) => void
  emptyGroups: { directory: string; label: string }[]
  emptyMessage: string
  eagerHydrationCount: number
}) {
  const rows: DiagramVirtualRow[] = []

  for (const group of input.groups) {
    rows.push({
      kind: "group-header",
      key: `header:${group.directory}`,
      directory: group.directory,
      label: group.label,
      count: group.artifacts.length,
    })

    const visibleCount =
      input.visibleCounts[group.directory] ?? Math.min(input.pageSize, group.artifacts.length)
    const visibleArtifacts = group.artifacts.slice(0, visibleCount)

    visibleArtifacts.forEach((artifact, index) => {
      rows.push({
        kind: "artifact",
        key: `diagram:${artifact.artifactID}`,
        directory: group.directory,
        artifact,
        hydrated: index < input.eagerHydrationCount,
      })
    })

    const remainingCount = Math.max(group.artifacts.length - visibleArtifacts.length, 0)
    const nextBatchCount = Math.min(input.pageSize, remainingCount)

    if (nextBatchCount > 0) {
      rows.push({
        kind: "show-more",
        key: `show-more:${group.directory}`,
        directory: group.directory,
        count: nextBatchCount,
        onClick: () => input.onShowMore(group.directory, group.artifacts.length),
      })
    }

    if (group.error) {
      rows.push({
        kind: "error",
        key: `error:${group.directory}`,
        message: group.error,
      })
    }
  }

  if (input.emptyGroups.length > 0) {
    rows.push({
      kind: "empty-separator",
      key: "empty-separator",
    })

    input.emptyGroups.forEach((group) => {
      rows.push({
        kind: "empty-notebook",
        key: `empty:${group.directory}`,
        label: group.label,
        message: input.emptyMessage,
      })
    })
  }

  return rows
}

function getDiagramRowEstimate(row: DiagramVirtualRow) {
  if (row.kind === "group-header") {
    return DIAGRAMS_GROUP_HEADER_ESTIMATE_PX
  }

  if (row.kind === "artifact") {
    return VIRTUAL_MERMAID_CARD_ESTIMATE_PX
  }

  if (row.kind === "show-more" || row.kind === "error") {
    return 40
  }

  if (row.kind === "empty-separator") {
    return DIAGRAMS_EMPTY_NOTEBOOK_SEPARATOR_ESTIMATE_PX
  }

  return DIAGRAMS_EMPTY_NOTEBOOK_ROW_ESTIMATE_PX
}

function DiagramVirtualRowView(props: { row: DiagramVirtualRow }) {
  const { row } = props

  if (row.kind === "group-header") {
    return (
      <div className={DIAGRAMS_GROUP_HEADER_ROW_CLASS}>
        <NotebookShelfHeader label={row.label} count={row.count} loading={false} />
      </div>
    )
  }

  if (row.kind === "artifact") {
    return <LazyMermaidArtifactCard artifact={row.artifact} initiallyHydrated={row.hydrated} />
  }

  if (row.kind === "show-more") {
    return <ShelfShowMoreButton count={row.count} onClick={row.onClick} />
  }

  if (row.kind === "error") {
    return <NotebookShelfError message={row.message} />
  }

  if (row.kind === "empty-separator") {
    return <div className="border-t border-border-base/60 pt-4 opacity-60" />
  }

  return (
    <div className="opacity-60">
      <div data-component="library-diagram-empty-notebook" className="space-y-3">
        <NotebookShelfHeader label={row.label} count={0} loading={false} />
        <NotebookShelfInlineEmptyState message={row.message} />
      </div>
    </div>
  )
}

function VirtualizedDiagramsNotebookList(props: {
  groups: DiagramNotebookGroup[]
  emptyGroups: { directory: string; label: string }[]
  emptyMessage: string
  eagerHydrationCount: number
}) {
  const { rootRef, scrollElement } = useLibraryScrollElement()
  const { visibleCounts, showMore } = useVisibleDiagramCounts(
    props.groups,
    MULTI_NOTEBOOK_BATCH_SIZE,
  )
  const rows = buildDiagramVirtualRows({
    groups: props.groups,
    visibleCounts,
    pageSize: MULTI_NOTEBOOK_BATCH_SIZE,
    onShowMore: showMore,
    emptyGroups: props.emptyGroups,
    emptyMessage: props.emptyMessage,
    eagerHydrationCount: props.eagerHydrationCount,
  })

  const virtualizer = useVirtualizer<HTMLElement, HTMLDivElement>({
    count: rows.length,
    getScrollElement: () => scrollElement,
    getItemKey: (index) => rows[index]?.key ?? index,
    estimateSize: (index) => getDiagramRowEstimate(rows[index]!),
    measureElement: measureVirtualElement,
    overscan: VIRTUAL_MERMAID_OVERSCAN,
    gap: 12,
  })

  const virtualRows = virtualizer.getVirtualItems()

  return (
    <div ref={rootRef}>
      <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {virtualRows.map((virtualRow: VirtualItem) => {
          const row = rows[virtualRow.index]
          if (!row) {
            return null
          }

          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              className="absolute top-0 left-0 w-full"
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              <DiagramVirtualRowView row={row} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DiagramsTab(props: { directories: string[]; active: boolean }) {
  const { directories, active } = props
  const isMultiNotebookView = directories.length > 1
  const shelfQueries = useQueries({
    queries: directories.map((directory) => workspaceMermaidArtifactsQueryOptions(directory)),
  })

  const allLoading = shelfQueries.every((query) => query.isPending)
  const showLoadingState = useDelayedPending(allLoading)
  const totalArtifacts = shelfQueries.reduce(
    (sum, query) => sum + (query.data?.artifacts.length ?? 0),
    0,
  )
  const allLoaded = shelfQueries.every((query) => !query.isPending)
  const loadError = shelfQueries.find((query) => query.error)?.error
  const showNotebookHeaders = directories.length > 1
  const { directoriesWithItems, emptyDirectories } = partitionNotebookDirectories({
    directories,
    isEmpty: (index) => {
      const query = shelfQueries[index]
      if (!query || query.isPending || query.error) {
        return false
      }

      return (query.data?.artifacts.length ?? 0) === 0
    },
  })
  const diagramGroups = directoriesWithItems.map((directory) => {
    const queryIndex = directories.indexOf(directory)
    const query = queryIndex < 0 ? undefined : shelfQueries[queryIndex]
    return {
      directory,
      label: getFilename(directory),
      artifacts: query?.data?.artifacts ?? [],
      error: query?.error ? stringifyError(query.error) : undefined,
    } satisfies DiagramNotebookGroup
  })
  const emptyDiagramGroups = emptyDirectories.map((directory) => ({
    directory,
    label: getFilename(directory),
  }))

  if (!isMultiNotebookView && allLoading && !showLoadingState) {
    return <LoadingStateBuffer />
  }

  if (!isMultiNotebookView && allLoading) {
    return (
      <div className={`space-y-6 ${LIBRARY_TAB_MIN_HEIGHT_CLASS}`}>
        {directories.slice(0, 3).map((directory) => (
          <div key={directory} className="space-y-3">
            <div className="flex items-center gap-2">
              <Skeleton className="size-4 rounded" />
              <Skeleton className="h-4 w-24 rounded" />
            </div>
            <div className="space-y-2">
              {Array.from({ length: 2 }, (_, index) => (
                <ShelfRowSkeleton key={index} />
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (!isMultiNotebookView && allLoaded && totalArtifacts === 0) {
    return (
      <LibraryTabErrorState
        icon={LayoutTemplateIcon}
        title={language.t("sidebar.libraryDiagramsEmpty")}
        description={language.t("sidebar.libraryDiagramsEmptyDescription")}
        error={loadError ? stringifyError(loadError) : undefined}
        mascotUrl={buddyStateEmptyDiagramsUrl}
        mascotAlt={`${language.t("routes.chat.productName")} beside a diagrams board`}
      />
    )
  }

  if (isMultiNotebookView) {
    return (
      <VirtualizedDiagramsNotebookList
        groups={diagramGroups}
        emptyGroups={emptyDiagramGroups}
        emptyMessage={language.t("sidebar.libraryNotebookDiagramsEmpty")}
        eagerHydrationCount={active ? MERMAID_EAGER_HYDRATION_COUNT : 0}
      />
    )
  }

  return (
    <div className="space-y-6">
      {directories.map((directory) => (
        <DiagramsNotebookShelf
          key={directory}
          directory={directory}
          showHeader={showNotebookHeaders}
          eagerHydrationCount={active ? MERMAID_EAGER_HYDRATION_COUNT : 0}
        />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export function LibraryPanel({
  directories,
  onOpenResource,
  onOpenQuestionSet,
  initialTab,
}: LibraryPanelProps) {
  const [activeTab, setActiveTab] = useState<LibraryTab>(initialTab ?? "resources")
  const libraryTitle =
    directories.length === 1 ? getFilename(directories[0] ?? "") : language.t("sidebar.appLibrary")

  useEffect(() => {
    if (initialTab === undefined) {
      return
    }

    setActiveTab(initialTab)
  }, [initialTab])

  useQueries({
    queries: EMPTY_STATE_MASCOT_URLS.map((src) => ({
      queryKey: [EMPTY_STATE_IMAGE_PRELOAD_QUERY_KEY, src],
      queryFn: () => preloadImageAsset(src),
      staleTime: EMPTY_STATE_IMAGE_STALE_TIME_MS,
      gcTime: EMPTY_STATE_IMAGE_GC_TIME_MS,
    })),
  })

  const handleTabChange = (tab: LibraryTab) => {
    if (activeTab === tab) return

    setActiveTab(tab)
  }

  return (
    <div data-component="library-panel" className="space-y-6">
      <div className="flex items-center gap-2.5">
        <LibraryBigIcon className="size-5 text-text-weak" />
        <h2 className="text-base font-semibold text-text-strong">{libraryTitle}</h2>
      </div>

      <div className="flex gap-1 border-b border-border-base">
        {LIBRARY_TABS.map(({ tab, labelKey }) => (
          <button
            key={tab}
            type="button"
            className={`px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === tab
                ? "border-b-2 border-text-interactive-base text-text-interactive-base"
                : "text-text-weak hover:text-text-base"
            }`}
            onClick={() => handleTabChange(tab)}
          >
            {language.t(labelKey)}
          </button>
        ))}
      </div>

      {activeTab === "resources" ? (
        <ResourcesTab directories={directories} onOpenResource={onOpenResource} />
      ) : null}

      {activeTab === "flashcards" ? <FlashcardsTab directories={directories} /> : null}

      {activeTab === "question-sets" ? (
        <QuestionSetsTab directories={directories} onOpenQuestionSet={onOpenQuestionSet} />
      ) : null}

      {activeTab === "diagrams" ? (
        <DiagramsTab directories={directories} active={activeTab === "diagrams"} />
      ) : null}
    </div>
  )
}
