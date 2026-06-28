import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react"
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  measureElement as measureVirtualElement,
  useVirtualizer,
  type VirtualItem,
} from "@tanstack/react-virtual"
import { useDropzone, type DropEvent } from "react-dropzone"
import {
  AppWindowIcon,
  FileTextIcon,
  HelpCircleIcon,
  ImageIcon,
  LayoutTemplateIcon,
  Layers2Icon,
  Loader2Icon,
  PlusIcon,
  UploadIcon,
} from "lucide-react"
import { Button, FolderIcon, Skeleton } from "@buddy/ui"
import buddyStateEmptyBooksUrl from "../../../../../../assets/mascot/buddy-state-empty-books.png"
import buddyStateEmptyDiagramsUrl from "../../../../../../assets/mascot/buddy-state-empty-diagrams.png"
import buddyStateEmptyExercisesUrl from "../../../../../../assets/mascot/buddy-state-empty-exercises.png"
import buddyStateEmptyFlashcardsUrl from "../../../../../../assets/mascot/buddy-state-empty-flashcards.png"
import { language } from "@/context/language"
import { getPlatform } from "@/context/platform"
import { stringifyError } from "@/lib/api-client"
import { getFlashcardDueCount, type FlashcardDueCounts } from "@/lib/flashcard"
import type { ObjectsViewResponse } from "@buddy/sdk/types"
import { pickResourceFilePath } from "@/lib/resource-file-picker"
import { fileExtensionFromPath } from "@/lib/workspace-file-paths"
import { addResource } from "@/state/resource-actions"
import {
  invalidateResourcesQueries,
  type ResourceOpenOptions,
  resourcesQueryOptions,
} from "@/state/resources-query"
import {
  objectFlashcardDeckPayloadQueryOptions,
  objectMermaidPayloadQueryOptions,
  objectQuestionSetPayloadQueryOptions,
  objectViewQueryOptions,
  workspaceObjectsQueryKeys,
  workspaceObjectsQueryOptions,
} from "@/state/workspace-objects-query"
import {
  VIRTUAL_MERMAID_CARD_ESTIMATE_PX,
  VIRTUAL_MERMAID_OVERSCAN,
} from "@/components/virtualization/virtualization-defaults"
import { MermaidDiagram } from "@/components/chat/tools/render/mermaid/mermaid-diagram"
import { MermaidToolCard } from "@/components/chat/tools/render/mermaid/mermaid-tool-card"
import {
  QuestionMarkdown,
  buildQuestionMarkdownCacheKey,
} from "@/components/chat/tools/render/question-set/question-markdown"
import { resolveAssetUrl } from "@/lib/resource-url"
import type { BenchTarget } from "@/lib/bench-navigation"
import {
  ResourceCardGrid,
  type ResourceCardTarget,
} from "@/components/layout/chat-left-sidebar/resource-card-grid"
import { useInvalidateQueryOnChatIdle } from "@/components/layout/use-invalidate-query-on-chat-idle"
import { getFilename } from "../sidebar-helpers"
import {
  MEDIA_LIBRARY_KINDS,
  createBenchObjectTarget,
  countMediaObjectsByDirectory,
  getFlashcardDeckObjectSummary,
  selectFlashcardDeckObjects,
  selectHtmlWidgetObjects,
  selectMediaLibraryObjects,
  selectMermaidObjects,
  selectQuestionSetObjects,
  selectWorkspaceObjectLoadErrors,
  workspaceObjectLoadErrorKey,
  type FlashcardDeckObjectSummary,
  type FlashcardDeckLibraryObject,
  type HtmlWidgetLibraryObject,
  type MediaLibraryObject,
  type MermaidLibraryObject,
  type QuestionSetLibraryObject,
  type WorkspaceObjectLoadError,
} from "./library-object-selectors"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LibraryTab = "resources" | "flashcards" | "question-sets" | "widgets" | "diagrams" | "media"

export type LibraryPanelResourceTarget = ResourceCardTarget

type QuestionSetObjectListItem = QuestionSetLibraryObject
type HtmlWidgetObjectListItem = HtmlWidgetLibraryObject
type MediaGalleryObjectViewData = Extract<
  ObjectsViewResponse["data"],
  { renderer: "media-gallery" }
>
type FigureObjectViewData = Extract<ObjectsViewResponse["data"], { renderer: "figure" }>
type HtmlWidgetObjectViewData = Extract<ObjectsViewResponse["data"], { renderer: "html-widget" }>

type LibraryPanelProps = {
  directories: string[]
  onOpen: (request: LibraryOpenRequest) => Promise<LibraryOpenOutcome>
  initialTab?: LibraryTab
}

export type LibraryOpenOutcome = "opened" | "focused" | "blocked" | "failed"

export type LibraryOpenRequest =
  | { type: "object"; directory: string; target: BenchTarget }
  | {
      type: "resource"
      directory: string
      resource: LibraryPanelResourceTarget
      options?: ResourceOpenOptions
    }

const LibraryOpenContext = createContext<LibraryPanelProps["onOpen"] | undefined>(undefined)

function useLibraryOpen() {
  const open = useContext(LibraryOpenContext)
  if (!open) throw new Error("Library open callback is unavailable")
  return open
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
const HTML_WIDGET_ROW_PREVIEW_COUNT = 4
const MEDIA_ROW_PREVIEW_COUNT = 4
const HTML_WIDGET_RUNTIME_VIEW_ID = "runtime"
const MEDIA_GALLERY_VIEW_ID = "gallery"
const RENDERED_OBJECT_VIEW_ID = "rendered"
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
  { tab: "widgets", labelKey: "sidebar.libraryTabWidgets" },
  { tab: "diagrams", labelKey: "sidebar.libraryTabDiagrams" },
  { tab: "media", labelKey: "sidebar.libraryTabMedia" },
]

function formatTimestamp(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }
  return parsed.toLocaleString()
}

function formatHtmlWidgetViewportPreset(viewportPreset: string): string {
  return viewportPreset
    .split("_")
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function mediaGallerySubtitle(data: MediaGalleryObjectViewData): string {
  const itemCount = data.items.length
  return `${itemCount} ${itemCount === 1 ? "file" : "files"} · ${data.layout}`
}

function readFigureObjectSubtitle(data: FigureObjectViewData): string | undefined {
  return data.caption ?? data.alt ?? undefined
}

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
  onOpenResource: (
    directory: string,
    resource: LibraryPanelResourceTarget,
    options?: ResourceOpenOptions,
  ) => void
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
  onOpenResource: (
    directory: string,
    resource: LibraryPanelResourceTarget,
    options?: ResourceOpenOptions,
  ) => void
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
        <span className="rounded-sm bg-surface-warning-base/15 px-1.5 py-0.5 text-[11px] font-medium text-text-on-warning-subtle">
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

function FlashcardDeckObjectRow(props: { directory: string; deck: FlashcardDeckLibraryObject }) {
  const openLibrary = useLibraryOpen()
  const deckQuery = useQuery({
    ...objectFlashcardDeckPayloadQueryOptions({
      directory: props.directory,
      objectID: props.deck.objectID,
    }),
    refetchOnMount: false,
  })
  const detail = deckQuery.data
  const summary: FlashcardDeckObjectSummary | undefined = detail
    ? getFlashcardDeckObjectSummary(detail)
    : undefined
  const title = detail?.title ?? props.deck.title

  const content = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-text-base">{title}</p>
          {summary ? (
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-weak">
              <span>
                {language.t(
                  summary.noteCount === 1
                    ? "workspaceFlashcard.noteCount.one"
                    : "workspaceFlashcard.noteCount.other",
                  { count: summary.noteCount },
                )}
              </span>
              <span className="text-text-weaker">&middot;</span>
              <span>
                {language.t(
                  summary.cardCount === 1
                    ? "workspaceFlashcard.cardCount.one"
                    : "workspaceFlashcard.cardCount.other",
                  { count: summary.cardCount },
                )}
              </span>
            </div>
          ) : (
            <div className="mt-1 text-xs text-text-weak">
              {language.t("workspaceFlashcard.loadingDeck")}
            </div>
          )}
        </div>
        <Layers2Icon className="mt-0.5 size-4 shrink-0 text-text-weaker" />
      </div>
      {summary ? (
        <div className="mt-2">
          <FlashcardDueBadges dueCounts={summary.dueCounts} />
        </div>
      ) : null}
      {deckQuery.error ? (
        <p className="mt-2 text-xs text-icon-critical-base">{stringifyError(deckQuery.error)}</p>
      ) : null}
    </>
  )

  return (
    <button
      type="button"
      onClick={() => {
        void openLibrary({
          type: "object",
          directory: props.directory,
          target: createBenchObjectTarget("flashcard-deck", props.deck.objectID),
        })
      }}
      className="w-full rounded-lg border border-border-weaker-base bg-surface-base p-3 text-left shadow-sm transition-colors hover:border-border-hover hover:bg-surface-raised-base"
    >
      {content}
    </button>
  )
}

function FlashcardNotebookShelf(props: {
  directory: string
  showHeader: boolean
  pageSize?: number
  emptyMessage?: string
}) {
  const { directory, showHeader, pageSize, emptyMessage } = props
  const decksQuery = useQuery({
    ...workspaceObjectsQueryOptions(directory),
    refetchOnMount: false,
  })
  const decks = selectFlashcardDeckObjects(decksQuery)
  const loadErrors = selectWorkspaceObjectLoadErrors(decksQuery, ["flashcard-deck"])
  const loading = decksQuery.isPending
  const error = decksQuery.error ? stringifyError(decksQuery.error) : undefined
  const label = getFilename(directory)
  useInvalidateQueryOnChatIdle({
    directory,
    queryKey: workspaceObjectsQueryKeys.all(directory),
  })
  const { visibleCount, nextBatchCount, canShowMore, showMore } = useShelfPagination(
    decks.length,
    pageSize,
  )
  const visibleDecks = decks.slice(0, visibleCount)

  if (!loading && decks.length === 0 && loadErrors.length === 0 && !error) {
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
            : visibleDecks.map((deck) => (
                <FlashcardDeckObjectRow key={deck.objectID} directory={directory} deck={deck} />
              ))}
          {!loading && canShowMore ? (
            <ShelfShowMoreButton count={nextBatchCount} onClick={showMore} />
          ) : null}
          {error ? <NotebookShelfError message={error} /> : null}
          {loadErrors.map((loadError) => (
            <NotebookShelfError
              key={workspaceObjectLoadErrorKey(loadError)}
              message={loadError.message}
            />
          ))}
        </div>
      </div>
    </>
  )
}

function FlashcardsTab({ directories }: { directories: string[] }) {
  const isMultiNotebookView = directories.length > 1
  const shelfQueries = useQueries({
    queries: directories.map((directory) => workspaceObjectsQueryOptions(directory)),
  })

  const allLoading = shelfQueries.every((query) => query.isPending)
  const showLoadingState = useDelayedPending(allLoading)
  const totalDecks = shelfQueries.reduce(
    (sum, query) => sum + selectFlashcardDeckObjects(query).length,
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

      return selectFlashcardDeckObjects(query).length === 0
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

function LibraryQuestionSetCard(props: {
  directory: string
  objectStub: QuestionSetObjectListItem
}) {
  const openLibrary = useLibraryOpen()
  const detailQuery = useQuery({
    ...objectQuestionSetPayloadQueryOptions({
      directory: props.directory,
      objectID: props.objectStub.objectID,
    }),
    refetchOnMount: false,
  })
  const questionSet = detailQuery.data
  const questionCount = questionSet?.questions.length
  const timestamp = questionSet?.createdAt ?? props.objectStub.updatedAt

  return (
    <>
      <button
        type="button"
        onClick={() => {
          void openLibrary({
            type: "object",
            directory: props.directory,
            target: createBenchObjectTarget("question-set", props.objectStub.objectID),
          })
        }}
        className="w-full rounded-lg border border-border-weaker-base bg-surface-base p-3 text-left shadow-sm transition-colors hover:border-border-hover hover:bg-surface-raised-base disabled:opacity-50"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <QuestionMarkdown
              text={props.objectStub.title}
              cacheKey={buildQuestionMarkdownCacheKey(
                "library-question-set-shelf",
                props.directory,
                props.objectStub.objectID,
                "title",
              )}
              variant="compact"
              className="text-sm font-medium text-text-base [&_p]:truncate [&_p]:overflow-hidden [&_p]:whitespace-nowrap"
            />
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-weak">
              {questionCount !== undefined ? (
                <>
                  <span>
                    {language.t(
                      questionCount === 1
                        ? "chatTools.questionCount.one"
                        : "chatTools.questionCount.other",
                      { count: questionCount },
                    )}
                  </span>
                  <span className="text-text-weaker">&middot;</span>
                </>
              ) : null}
              <span>{formatTimestamp(timestamp)}</span>
            </div>
            {detailQuery.error ? (
              <p className="mt-2 text-xs text-icon-critical-base">
                {stringifyError(detailQuery.error)}
              </p>
            ) : null}
          </div>
          <HelpCircleIcon className="mt-0.5 size-4 shrink-0 text-text-weaker" />
        </div>
      </button>
    </>
  )
}

function QuestionSetNotebookShelf(props: {
  directory: string
  showHeader: boolean
  pageSize?: number
  emptyMessage?: string
}) {
  const { directory, showHeader, pageSize, emptyMessage } = props
  const setsQuery = useQuery({
    ...workspaceObjectsQueryOptions(directory),
    refetchOnMount: false,
  })
  const sets = selectQuestionSetObjects(setsQuery)
  const loadErrors = selectWorkspaceObjectLoadErrors(setsQuery, ["question-set"])
  const loading = setsQuery.isPending
  const error = setsQuery.error ? stringifyError(setsQuery.error) : undefined
  const label = getFilename(directory)
  useInvalidateQueryOnChatIdle({
    directory,
    queryKey: workspaceObjectsQueryKeys.all(directory),
  })
  const { visibleCount, nextBatchCount, canShowMore, showMore } = useShelfPagination(
    sets.length,
    pageSize,
  )
  const visibleSets = sets.slice(0, visibleCount)

  if (!loading && sets.length === 0 && loadErrors.length === 0 && !error) {
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
          : visibleSets.map((object) => (
              <LibraryQuestionSetCard
                key={object.objectID}
                directory={directory}
                objectStub={object}
              />
            ))}
        {!loading && canShowMore ? (
          <ShelfShowMoreButton count={nextBatchCount} onClick={showMore} />
        ) : null}
        {error ? <NotebookShelfError message={error} /> : null}
        {loadErrors.map((loadError) => (
          <NotebookShelfError
            key={workspaceObjectLoadErrorKey(loadError)}
            message={loadError.message}
          />
        ))}
      </div>
    </div>
  )
}

function QuestionSetsTab(props: { directories: string[] }) {
  const { directories } = props
  const isMultiNotebookView = directories.length > 1
  const shelfQueries = useQueries({
    queries: directories.map((directory) => workspaceObjectsQueryOptions(directory)),
  })

  const allLoading = shelfQueries.every((query) => query.isPending)
  const showLoadingState = useDelayedPending(allLoading)
  const totalSets = shelfQueries.reduce(
    (sum, query) => sum + selectQuestionSetObjects(query).length,
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

      return selectQuestionSetObjects(query).length === 0
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
          showHeader={showNotebookHeaders}
        />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// HTML widgets shelf
// ---------------------------------------------------------------------------

function HtmlWidgetObjectRow(props: { directory: string; widget: HtmlWidgetObjectListItem }) {
  const openLibrary = useLibraryOpen()
  const viewQuery = useQuery({
    ...objectViewQueryOptions({
      directory: props.directory,
      kind: "html-widget",
      objectID: props.widget.objectID,
      viewID: HTML_WIDGET_RUNTIME_VIEW_ID,
    }),
    refetchOnMount: false,
  })
  const viewResponse = viewQuery.data
  const viewData: HtmlWidgetObjectViewData | undefined =
    viewResponse?.data.renderer === "html-widget" ? viewResponse.data : undefined
  const viewportLabel = viewData
    ? formatHtmlWidgetViewportPreset(viewData.viewportPreset)
    : HTML_WIDGET_RUNTIME_VIEW_ID
  const subtitle = viewData?.entryPath ?? viewData?.sourceVersion ?? viewportLabel

  return (
    <button
      type="button"
      className="flex w-full items-center gap-3 rounded-lg border border-border-base bg-background-base px-3 py-3 text-left shadow-sm transition-colors hover:bg-surface-weak/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-interactive-base"
      onClick={() => {
        void openLibrary({
          type: "object",
          directory: props.directory,
          target: createBenchObjectTarget("html-widget", props.widget.objectID),
        })
      }}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-weak text-icon-interactive-base">
        <AppWindowIcon className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-text-strong">
          {props.widget.title}
        </span>
        <span className="mt-0.5 block truncate text-xs text-text-weak">{subtitle}</span>
      </span>
      <span className="hidden shrink-0 rounded-md border border-border-base bg-surface-base px-2 py-1 text-[11px] font-medium text-text-weak sm:inline-flex">
        {viewportLabel}
      </span>
    </button>
  )
}

function HtmlWidgetsNotebookShelf(props: {
  directory: string
  showHeader: boolean
  pageSize?: number
  emptyMessage?: string
}) {
  const { directory, showHeader, pageSize, emptyMessage } = props
  const widgetsQuery = useQuery(workspaceObjectsQueryOptions(directory))
  const widgets = selectHtmlWidgetObjects(widgetsQuery)
  const loadErrors = selectWorkspaceObjectLoadErrors(widgetsQuery, ["html-widget"])
  const loading = widgetsQuery.isPending
  const error = widgetsQuery.error ? stringifyError(widgetsQuery.error) : undefined
  const label = getFilename(directory)
  useInvalidateQueryOnChatIdle({
    directory,
    queryKey: workspaceObjectsQueryKeys.all(directory),
  })
  const { visibleCount, nextBatchCount, canShowMore, showMore } = useShelfPagination(
    widgets.length,
    pageSize,
  )
  const visibleWidgets = widgets.slice(0, visibleCount)

  if (!loading && widgets.length === 0 && loadErrors.length === 0 && !error) {
    if (!emptyMessage) {
      return null
    }

    return (
      <div data-component="library-html-widget-shelf" className="space-y-3">
        {showHeader ? <NotebookShelfHeader label={label} count={0} loading={false} /> : null}
        <NotebookShelfInlineEmptyState message={emptyMessage} />
      </div>
    )
  }

  return (
    <div data-component="library-html-widget-shelf" className="space-y-3">
      {showHeader ? (
        <NotebookShelfHeader label={label} count={widgets.length} loading={loading} />
      ) : null}

      <div className="space-y-2">
        {loading
          ? Array.from({ length: 3 }, (_, index) => <ShelfRowSkeleton key={index} />)
          : visibleWidgets.map((widget) => (
              <HtmlWidgetObjectRow key={widget.objectID} directory={directory} widget={widget} />
            ))}
        {!loading && canShowMore ? (
          <ShelfShowMoreButton count={nextBatchCount} onClick={showMore} />
        ) : null}
        {error ? <NotebookShelfError message={error} /> : null}
        {loadErrors.map((loadError) => (
          <NotebookShelfError
            key={workspaceObjectLoadErrorKey(loadError)}
            message={loadError.message}
          />
        ))}
      </div>
    </div>
  )
}

function WidgetsTab(props: { directories: string[] }) {
  const { directories } = props
  const isMultiNotebookView = directories.length > 1
  const shelfQueries = useQueries({
    queries: directories.map((directory) => workspaceObjectsQueryOptions(directory)),
  })
  const allLoading = shelfQueries.every((query) => query.isPending)
  const showLoadingState = useDelayedPending(allLoading)
  const totalWidgets = shelfQueries.reduce(
    (sum, query) => sum + selectHtmlWidgetObjects(query).length,
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

      return selectHtmlWidgetObjects(query).length === 0
    },
  })

  if (!isMultiNotebookView && allLoading && !showLoadingState) {
    return <LoadingStateBuffer />
  }

  if (!isMultiNotebookView && allLoading) {
    return (
      <div className={`space-y-6 ${LIBRARY_TAB_MIN_HEIGHT_CLASS}`}>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Skeleton className="size-4 rounded" />
            <Skeleton className="h-4 w-24 rounded" />
          </div>
          <div className="space-y-2">
            {Array.from({ length: 3 }, (_, index) => (
              <ShelfRowSkeleton key={index} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (!isMultiNotebookView && allLoaded && totalWidgets === 0) {
    return (
      <LibraryTabErrorState
        icon={AppWindowIcon}
        title={language.t("sidebar.libraryWidgetsEmpty")}
        description={language.t("sidebar.libraryWidgetsEmptyDescription")}
        error={loadError ? stringifyError(loadError) : undefined}
        mascotUrl={buddyStateEmptyDiagramsUrl}
        mascotAlt={`${language.t("routes.chat.productName")} beside an app widget`}
      />
    )
  }

  if (isMultiNotebookView) {
    return (
      <div className="space-y-6">
        {directoriesWithItems.map((directory) => (
          <HtmlWidgetsNotebookShelf
            key={directory}
            directory={directory}
            showHeader
            pageSize={MULTI_NOTEBOOK_ROW_PREVIEW_COUNT}
            emptyMessage={language.t("sidebar.libraryNotebookWidgetsEmpty")}
          />
        ))}
        {emptyDirectories.length > 0 ? (
          <EmptyNotebookSection>
            {emptyDirectories.map((directory) => (
              <HtmlWidgetsNotebookShelf
                key={directory}
                directory={directory}
                showHeader
                pageSize={MULTI_NOTEBOOK_ROW_PREVIEW_COUNT}
                emptyMessage={language.t("sidebar.libraryNotebookWidgetsEmpty")}
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
        <HtmlWidgetsNotebookShelf
          key={directory}
          directory={directory}
          showHeader={showNotebookHeaders}
          pageSize={HTML_WIDGET_ROW_PREVIEW_COUNT}
        />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Media shelf
// ---------------------------------------------------------------------------

function MediaObjectRow(props: { object: MediaLibraryObject; directory: string }) {
  const openLibrary = useLibraryOpen()
  const viewID =
    props.object.kind === "media-presentation" ? MEDIA_GALLERY_VIEW_ID : RENDERED_OBJECT_VIEW_ID
  const viewQuery = useQuery({
    ...objectViewQueryOptions({
      directory: props.directory,
      kind: props.object.kind,
      objectID: props.object.objectID,
      viewID,
    }),
    refetchOnMount: false,
  })

  if (props.object.kind === "figure" || props.object.kind === "freeform-figure") {
    const viewResponse = viewQuery.data
    const figureData: FigureObjectViewData | undefined =
      viewResponse?.data.renderer === "figure" ? viewResponse.data : undefined
    const previewUrl = figureData?.svgUrl ? resolveAssetUrl(figureData.svgUrl) : undefined
    const subtitle = figureData
      ? (readFigureObjectSubtitle(figureData) ?? formatTimestamp(props.object.updatedAt))
      : formatTimestamp(props.object.updatedAt)

    return (
      <button
        type="button"
        onClick={() => {
          void openLibrary({
            type: "object",
            directory: props.directory,
            target: createBenchObjectTarget(props.object.kind, props.object.objectID),
          })
        }}
        className="flex w-full items-center gap-3 rounded-lg border border-border-base bg-background-base px-3 py-3 text-left shadow-sm transition-colors hover:bg-surface-weak/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-interactive-base"
      >
        <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border-base bg-surface-base">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt=""
              className="h-full w-full object-contain p-1"
              loading="lazy"
            />
          ) : (
            <ImageIcon className="size-4 text-text-weaker" aria-hidden />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-text-strong">
            {props.object.title}
          </span>
          <span className="mt-0.5 block truncate text-xs text-text-weak">{subtitle}</span>
        </span>
        <span className="hidden shrink-0 rounded-md border border-border-base bg-surface-base px-2 py-1 text-[11px] font-medium text-text-weak sm:inline-flex">
          SVG
        </span>
      </button>
    )
  }

  const viewResponse = viewQuery.data
  const galleryData: MediaGalleryObjectViewData | undefined =
    viewResponse?.data.renderer === "media-gallery" ? viewResponse.data : undefined
  const firstItem =
    galleryData?.items.find((item) => item.availability === "available") ?? galleryData?.items[0]
  const subtitle = firstItem?.fileName ?? (galleryData ? mediaGallerySubtitle(galleryData) : null)
  const badge = galleryData ? mediaGallerySubtitle(galleryData) : null

  return (
    <button
      type="button"
      onClick={() => {
        void openLibrary({
          type: "object",
          directory: props.directory,
          target: createBenchObjectTarget("media-presentation", props.object.objectID),
        })
      }}
      className="flex w-full items-center gap-3 rounded-lg border border-border-base bg-background-base px-3 py-3 text-left shadow-sm transition-colors hover:bg-surface-weak/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-interactive-base"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-weak text-icon-interactive-base">
        <FileTextIcon className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-text-strong">
          {props.object.title}
        </span>
        <span className="mt-0.5 block truncate text-xs text-text-weak">
          {subtitle ?? formatTimestamp(props.object.updatedAt)}
        </span>
      </span>
      <span className="hidden shrink-0 rounded-md border border-border-base bg-surface-base px-2 py-1 text-[11px] font-medium text-text-weak sm:inline-flex">
        {badge ?? MEDIA_GALLERY_VIEW_ID}
      </span>
    </button>
  )
}

function MediaNotebookShelf(props: {
  directory: string
  showHeader: boolean
  pageSize?: number
  emptyMessage?: string
}) {
  const { directory, showHeader, pageSize, emptyMessage } = props
  const mediaQuery = useQuery({
    ...workspaceObjectsQueryOptions(directory),
    refetchOnMount: false,
  })
  const objects = selectMediaLibraryObjects(mediaQuery)
  const loadErrors = selectWorkspaceObjectLoadErrors(mediaQuery, MEDIA_LIBRARY_KINDS)
  const loading = mediaQuery.isPending
  const error = mediaQuery.error
  const label = getFilename(directory)
  useInvalidateQueryOnChatIdle({
    directory,
    queryKey: workspaceObjectsQueryKeys.all(directory),
  })
  const { visibleCount, nextBatchCount, canShowMore, showMore } = useShelfPagination(
    objects.length,
    pageSize,
  )
  const visibleObjects = objects.slice(0, visibleCount)

  if (!loading && objects.length === 0 && loadErrors.length === 0 && !error) {
    if (!emptyMessage) {
      return null
    }

    return (
      <div data-component="library-media-shelf" className="space-y-3">
        {showHeader ? <NotebookShelfHeader label={label} count={0} loading={false} /> : null}
        <NotebookShelfInlineEmptyState message={emptyMessage} />
      </div>
    )
  }

  return (
    <div data-component="library-media-shelf" className="space-y-3">
      {showHeader ? (
        <NotebookShelfHeader label={label} count={objects.length} loading={loading} />
      ) : null}

      <div className="space-y-2">
        {loading
          ? Array.from({ length: 3 }, (_, index) => <ShelfRowSkeleton key={index} />)
          : visibleObjects.map((object) => (
              <MediaObjectRow
                key={`${object.kind}:${object.objectID}`}
                object={object}
                directory={directory}
              />
            ))}
        {!loading && canShowMore ? (
          <ShelfShowMoreButton count={nextBatchCount} onClick={showMore} />
        ) : null}
        {error ? <NotebookShelfError message={stringifyError(error)} /> : null}
        {loadErrors.map((loadError) => (
          <NotebookShelfError
            key={workspaceObjectLoadErrorKey(loadError)}
            message={loadError.message}
          />
        ))}
      </div>
    </div>
  )
}

function MediaTab(props: { directories: string[] }) {
  const { directories } = props
  const isMultiNotebookView = directories.length > 1
  const shelfQueries = useQueries({
    queries: directories.map((directory) => workspaceObjectsQueryOptions(directory)),
  })

  const allLoading = shelfQueries.every((query) => query.isPending)
  const showLoadingState = useDelayedPending(allLoading)
  const mediaCountByDirectory = countMediaObjectsByDirectory({
    directories,
    snapshots: shelfQueries,
  })
  const totalMedia = Array.from(mediaCountByDirectory.values()).reduce(
    (sum, count) => sum + count,
    0,
  )
  const allLoaded = shelfQueries.every((query) => !query.isPending)
  const loadError = shelfQueries.find((query) => query.error)?.error
  const showNotebookHeaders = directories.length > 1
  const { directoriesWithItems, emptyDirectories } = partitionNotebookDirectories({
    directories,
    isEmpty: (index) => (mediaCountByDirectory.get(directories[index] ?? "") ?? 0) === 0,
  })

  if (!isMultiNotebookView && allLoading && !showLoadingState) {
    return <LoadingStateBuffer />
  }

  if (!isMultiNotebookView && allLoading) {
    return (
      <div className={`space-y-6 ${LIBRARY_TAB_MIN_HEIGHT_CLASS}`}>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Skeleton className="size-4 rounded" />
            <Skeleton className="h-4 w-24 rounded" />
          </div>
          <div className="space-y-2">
            {Array.from({ length: 3 }, (_, index) => (
              <ShelfRowSkeleton key={index} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (!isMultiNotebookView && allLoaded && totalMedia === 0) {
    return (
      <LibraryTabErrorState
        icon={ImageIcon}
        title={language.t("sidebar.libraryMediaEmpty")}
        description={language.t("sidebar.libraryMediaEmptyDescription")}
        error={loadError ? stringifyError(loadError) : undefined}
        mascotUrl={buddyStateEmptyDiagramsUrl}
        mascotAlt={`${language.t("routes.chat.productName")} beside a media board`}
      />
    )
  }

  if (isMultiNotebookView) {
    return (
      <div className="space-y-6">
        {directoriesWithItems.map((directory) => (
          <MediaNotebookShelf
            key={directory}
            directory={directory}
            showHeader
            pageSize={MULTI_NOTEBOOK_ROW_PREVIEW_COUNT}
            emptyMessage={language.t("sidebar.libraryNotebookMediaEmpty")}
          />
        ))}
        {emptyDirectories.length > 0 ? (
          <EmptyNotebookSection>
            {emptyDirectories.map((directory) => (
              <MediaNotebookShelf
                key={directory}
                directory={directory}
                showHeader
                pageSize={MULTI_NOTEBOOK_ROW_PREVIEW_COUNT}
                emptyMessage={language.t("sidebar.libraryNotebookMediaEmpty")}
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
        <MediaNotebookShelf
          key={directory}
          directory={directory}
          showHeader={showNotebookHeaders}
          pageSize={MEDIA_ROW_PREVIEW_COUNT}
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
  objects: MermaidLibraryObject[]
  loadErrors: WorkspaceObjectLoadError[]
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
      kind: "object"
      key: string
      directory: string
      object: MermaidLibraryObject
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

function MermaidObjectPlaceholderCard(props: { object: MermaidLibraryObject }) {
  return (
    <MermaidToolCard
      title={props.object.title}
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

function LazyMermaidObjectCard(props: {
  directory: string
  object: MermaidLibraryObject
  initiallyHydrated: boolean
}) {
  const openLibrary = useLibraryOpen()
  const [hydrated, setHydrated] = useState(props.initiallyHydrated)
  const [inView, setInView] = useState(props.initiallyHydrated)
  const containerRef = useRef<HTMLDivElement>(null)
  const detailQuery = useQuery({
    ...objectMermaidPayloadQueryOptions({
      directory: props.directory,
      objectID: props.object.objectID,
    }),
    enabled: hydrated,
  })

  useEffect(() => {
    if (props.initiallyHydrated) {
      setHydrated(true)
      setInView(true)
      return
    }

    const element = containerRef.current
    if (!element || typeof IntersectionObserver === "undefined") {
      setHydrated(true)
      setInView(true)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((entry) => entry.isIntersecting)
        setInView(visible)
        if (visible) {
          setHydrated(true)
        }
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
  }, [props.initiallyHydrated])

  return (
    <div ref={containerRef}>
      {hydrated && detailQuery.data ? (
        <MermaidDiagram
          directory={props.directory}
          source={detailQuery.data.source}
          alt={detailQuery.data.alt}
          enabled={inView}
          renderPriority={1}
          showRawSourceOnError
          minimalActions
          onFullscreenOpen={() => {
            void openLibrary({
              type: "object",
              directory: props.directory,
              target: createBenchObjectTarget("mermaid", props.object.objectID),
            })
          }}
          renderWrapper={(diagramElement, actions) => (
            <MermaidToolCard
              title={detailQuery.data.alt}
              diagramType={detailQuery.data.diagramType}
              hideStatus
              contentClassName={MERMAID_SHELF_CARD_HEIGHT_CLASS}
              actions={actions}
            >
              <div className="h-full w-full p-3">{diagramElement}</div>
            </MermaidToolCard>
          )}
        />
      ) : hydrated && detailQuery.error ? (
        <MermaidToolCard
          title={props.object.title}
          hideStatus
          contentClassName={MERMAID_SHELF_CARD_HEIGHT_CLASS}
        >
          <div className="flex h-full w-full items-center justify-center bg-surface-critical-base/10 p-4 text-center text-xs text-icon-critical-base">
            {stringifyError(detailQuery.error)}
          </div>
        </MermaidToolCard>
      ) : (
        <MermaidObjectPlaceholderCard object={props.object} />
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
  const objectsQuery = useQuery(workspaceObjectsQueryOptions(directory))
  const objects = selectMermaidObjects(objectsQuery)
  const loadErrors = selectWorkspaceObjectLoadErrors(objectsQuery, ["mermaid"])
  const loading = objectsQuery.isPending
  const error = objectsQuery.error ? stringifyError(objectsQuery.error) : undefined
  const label = getFilename(directory)
  useInvalidateQueryOnChatIdle({
    directory,
    queryKey: workspaceObjectsQueryKeys.all(directory),
  })
  const { visibleCount, nextBatchCount, canShowMore, showMore } = useShelfPagination(
    objects.length,
    pageSize,
  )
  const visibleObjects = objects.slice(0, visibleCount)

  if (!loading && objects.length === 0 && loadErrors.length === 0 && !error) {
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
        <NotebookShelfHeader label={label} count={objects.length} loading={loading} />
      ) : null}

      <div className="space-y-3">
        {loading
          ? Array.from({ length: 2 }, (_, index) => <ShelfRowSkeleton key={index} />)
          : visibleObjects.map((object, index) => (
              <LazyMermaidObjectCard
                key={object.objectID}
                directory={directory}
                object={object}
                initiallyHydrated={index < eagerHydrationCount}
              />
            ))}
        {!loading && canShowMore ? (
          <ShelfShowMoreButton count={nextBatchCount} onClick={showMore} />
        ) : null}
        {error ? <NotebookShelfError message={error} /> : null}
        {loadErrors.map((loadError) => (
          <NotebookShelfError
            key={workspaceObjectLoadErrorKey(loadError)}
            message={loadError.message}
          />
        ))}
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
        const initialCount = Math.min(pageSize, group.objects.length)
        next[group.directory] =
          currentCount === undefined
            ? initialCount
            : Math.min(Math.max(currentCount, initialCount), group.objects.length)
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
      count: group.objects.length,
    })

    const visibleCount =
      input.visibleCounts[group.directory] ?? Math.min(input.pageSize, group.objects.length)
    const visibleObjects = group.objects.slice(0, visibleCount)

    visibleObjects.forEach((object, index) => {
      rows.push({
        kind: "object",
        key: `diagram:${object.objectID}`,
        directory: group.directory,
        object,
        hydrated: index < input.eagerHydrationCount,
      })
    })

    const remainingCount = Math.max(group.objects.length - visibleObjects.length, 0)
    const nextBatchCount = Math.min(input.pageSize, remainingCount)

    if (nextBatchCount > 0) {
      rows.push({
        kind: "show-more",
        key: `show-more:${group.directory}`,
        directory: group.directory,
        count: nextBatchCount,
        onClick: () => input.onShowMore(group.directory, group.objects.length),
      })
    }

    if (group.error) {
      rows.push({
        kind: "error",
        key: `error:${group.directory}`,
        message: group.error,
      })
    }

    group.loadErrors.forEach((loadError) => {
      rows.push({
        kind: "error",
        key: `load-error:${group.directory}:${workspaceObjectLoadErrorKey(loadError)}`,
        message: loadError.message,
      })
    })
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

  if (row.kind === "object") {
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

  if (row.kind === "object") {
    return (
      <LazyMermaidObjectCard
        directory={row.directory}
        object={row.object}
        initiallyHydrated={row.hydrated}
      />
    )
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
    queries: directories.map((directory) => workspaceObjectsQueryOptions(directory)),
  })

  const allLoading = shelfQueries.every((query) => query.isPending)
  const showLoadingState = useDelayedPending(allLoading)
  const totalObjects = shelfQueries.reduce(
    (sum, query) => sum + selectMermaidObjects(query).length,
    0,
  )
  const totalLoadErrors = shelfQueries.reduce(
    (sum, query) => sum + selectWorkspaceObjectLoadErrors(query, ["mermaid"]).length,
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

      return (
        selectMermaidObjects(query).length === 0 &&
        selectWorkspaceObjectLoadErrors(query, ["mermaid"]).length === 0
      )
    },
  })
  const diagramGroups = directoriesWithItems.map((directory) => {
    const queryIndex = directories.indexOf(directory)
    const query = queryIndex < 0 ? undefined : shelfQueries[queryIndex]
    return {
      directory,
      label: getFilename(directory),
      objects: selectMermaidObjects(query),
      loadErrors: selectWorkspaceObjectLoadErrors(query, ["mermaid"]),
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

  if (!isMultiNotebookView && allLoaded && totalObjects === 0 && totalLoadErrors === 0) {
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

export function LibraryPanel({ directories, onOpen, initialTab }: LibraryPanelProps) {
  const [activeTab, setActiveTab] = useState<LibraryTab>(initialTab ?? "resources")

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

  const openResource = (
    directory: string,
    resource: LibraryPanelResourceTarget,
    options?: ResourceOpenOptions,
  ) => {
    void onOpen({
      type: "resource",
      directory,
      resource,
      ...(options ? { options } : {}),
    })
  }

  return (
    <LibraryOpenContext.Provider value={onOpen}>
      <div data-component="library-panel" className="space-y-6">
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
          <ResourcesTab directories={directories} onOpenResource={openResource} />
        ) : null}

        {activeTab === "flashcards" ? <FlashcardsTab directories={directories} /> : null}

        {activeTab === "question-sets" ? <QuestionSetsTab directories={directories} /> : null}

        {activeTab === "widgets" ? <WidgetsTab directories={directories} /> : null}

        {activeTab === "diagrams" ? (
          <DiagramsTab directories={directories} active={activeTab === "diagrams"} />
        ) : null}

        {activeTab === "media" ? <MediaTab directories={directories} /> : null}
      </div>
    </LibraryOpenContext.Provider>
  )
}
