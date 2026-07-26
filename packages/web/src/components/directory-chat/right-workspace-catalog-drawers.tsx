import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { workspaceDrawerUiKey } from "@/state/workspace-drawer-ui-state"
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query"
import { useSearch } from "@tanstack/react-router"
import {
  Button,
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Popover,
  PopoverAnchor,
  PopoverContent,
  ToggleGroup,
  ToggleGroupItem,
  cn,
  toast,
} from "@buddy/ui"
import {
  ChevronDownIcon,
  Clock3Icon,
  ListChecksIcon,
  Loader2Icon,
  PlusIcon,
  PlayIcon,
  RefreshCwIcon,
  ShapesIcon,
  Trash2Icon,
  UploadIcon,
} from "@/icons/app-icons"
import type { ObjectsViewResponse } from "@buddy/sdk/types"
import { language } from "@/context/language"
import { stringifyError } from "@/lib/api-client"
import { getFlashcardDueCount } from "@/lib/flashcard"
import { resolveAssetUrl } from "@/lib/resource-url"
import { pickResourceFilePath } from "@/lib/resource-file-picker"
import { addResource, rebuildResource, removeResource } from "@/state/resource-actions"
import { useChatStore } from "@/state/chat-store"
import {
  invalidateResourcesQueries,
  resourcesQueryOptions,
  type ResourceListItem,
  type ResourceOpenOptions,
} from "@/state/resources-query"
import {
  objectFlashcardDeckPayloadQueryOptions,
  objectMermaidPayloadQueryOptions,
  objectQuestionSetPayloadQueryOptions,
  objectViewQueryOptions,
  workspaceObjectsQueryKeys,
  workspaceObjectsQueryOptions,
} from "@/state/workspace-objects-query"
import { useInvalidateQueryOnChatIdle } from "@/components/layout/use-invalidate-query-on-chat-idle"
import { MermaidDiagram } from "@/components/media/renderers/mermaid/mermaid-diagram"
import { HtmlWidgetFrame } from "@/components/media/renderers/html-widget-frame"
import { relativeTime } from "@/components/layout/sidebar-helpers"
import { resolveHtmlWidgetViewport, type HtmlWidgetPresentation } from "@/lib/html-widgets"
import {
  MEDIA_LIBRARY_KINDS,
  createBenchObjectTarget,
  getFlashcardDeckObjectSummary,
  selectFlashcardDeckObjects,
  selectHtmlWidgetObjects,
  selectMediaLibraryObjects,
  selectMermaidObjects,
  selectQuestionSetObjects,
  selectWorkspaceObjectLoadErrors,
  type FlashcardDeckLibraryObject,
  type HtmlWidgetLibraryObject,
  type MediaLibraryObject,
  type MermaidLibraryObject,
  type QuestionSetLibraryObject,
  type WorkspaceObjectIndexItem,
} from "@/components/layout/chat-left-sidebar/library-object-selectors"
import type {
  RightWorkspaceOpenOutcome,
  RightWorkspaceOpenRequest,
  RightWorkspaceResourceTarget,
} from "./right-workspace-open"
import {
  RightWorkspaceDrawerShell,
  RightWorkspaceListSkeleton,
  RightWorkspaceSectionLabel,
  RightWorkspaceVirtualList,
} from "./right-workspace-drawer-ui"
import { RightWorkspaceResourceDropzone } from "./right-workspace-resource-dropzone"
import {
  ObjectCard,
  ObjectRow,
  ObjectShelf,
  ObjectTile,
} from "@/components/objects/object-presentation"
import { describeObject } from "@/components/objects/describe-object"
import {
  OBJECT_ROW_HEIGHT_PX,
  OBJECT_STATUS_ERROR,
  OBJECT_STATUS_MISSING,
  OBJECT_STATUS_PREPARING,
  OBJECT_STATUS_READY,
  OBJECT_THUMBNAIL_COVER,
  OBJECT_THUMBNAIL_IMAGE,
  OBJECT_VARIANT_LG,
  OBJECT_VARIANT_MD,
  OBJECT_VARIANT_TILE,
  objectCardHeightPx,
  objectShelfHeightPx,
  type ObjectModel,
  type ObjectStatus,
  type ObjectVariant,
} from "@/components/objects/types"
import type { MediaAction } from "@/components/media/types"
import type { BenchObjectKind, BenchTarget } from "@/lib/bench-targets"

type CatalogDrawerProps = {
  directory: string
  onClose: () => void
  onOpen: (request: RightWorkspaceOpenRequest) => Promise<RightWorkspaceOpenOutcome>
}

type CreationsDrawerProps = CatalogDrawerProps & {
  onCreate: () => void
}

type PracticeFilter = "all" | "flashcards" | "question-sets"
type CreationFilter = "all" | "widgets" | "diagrams" | "media"

type PracticeFeedItem =
  | { kind: "flashcards"; object: FlashcardDeckLibraryObject }
  | { kind: "question-sets"; object: QuestionSetLibraryObject }

/**
 * Sources are split by density: the newest few are covers, so the drawer opens
 * on a shelf a reader recognises at a glance, and the rest are rows carrying the
 * same cover downsampled into the visual slot. One virtual row holds one shelf.
 */
type SourceFeedRow =
  | { type: "shelf"; key: string; resources: readonly ResourceListItem[] }
  | { type: "row"; key: string; resource: ResourceListItem }

export type CreationFeedItem =
  | { kind: "widgets"; object: HtmlWidgetLibraryObject }
  | { kind: "diagrams"; object: MermaidLibraryObject }
  | { kind: "media"; object: MediaLibraryObject }

type FigureViewData = Extract<ObjectsViewResponse["data"], { renderer: "figure" }>
type HtmlWidgetViewData = Extract<ObjectsViewResponse["data"], { renderer: "html-widget" }>
type MediaGalleryViewData = Extract<ObjectsViewResponse["data"], { renderer: "media-gallery" }>

type CreationPreviewState = {
  item: CreationFeedItem
  open: boolean
}

type CreationPreviewDimensions = {
  widthClass: string
  aspectClass: string | null
}

/** Hover-render geometry for the tail. The featured band renders inline instead. */
const CREATION_PREVIEW_DIMENSIONS: Record<CreationFeedItem["kind"], CreationPreviewDimensions> = {
  widgets: { widthClass: "w-96", aspectClass: null },
  diagrams: { widthClass: "w-96", aspectClass: "aspect-[4/3]" },
  media: { widthClass: "w-80", aspectClass: "aspect-video" },
}

const CREATION_PREVIEW_PREFETCH_DELAY_MS = 120
const CREATION_PREVIEW_OPEN_DELAY_MS = 500
const CREATION_PREVIEW_CLOSE_DELAY_MS = 150
const HTML_WIDGET_RUNTIME_VIEW_ID = "runtime"
const MEDIA_GALLERY_VIEW_ID = "gallery"
const RENDERED_OBJECT_VIEW_ID = "rendered"
const STICKY_READING_RESET_DELAY_MS = 500
const EMPTY_RESOURCE_ITEMS: ResourceListItem[] = []

/** Drawer width minus the shell's horizontal padding, for row height estimation. */
const RIGHT_WORKSPACE_DRAWER_CONTENT_WIDTH_PX = 380

const RESOURCE_OBJECT_KIND: BenchObjectKind = "resource"
/** The shelf adds columns as the drawer widens, so this is a count, not a shape. */
const SOURCE_FEATURED_COUNT = 6
/** Separates the cover band from the rows; the virtual list's own row gap is tight. */
const SOURCE_SHELF_BOTTOM_GAP_PX = 16
const SOURCE_PROCESS_ACTION_ID = "process"
const SOURCE_SHELF_ROW_KEY = "shelf"
const SOURCE_RESUME_META = "Resume reading"

function normalizeSearch(value: string): string {
  return value.trim().toLocaleLowerCase()
}

function includesSearch(value: string, search: string): boolean {
  return !search || value.toLocaleLowerCase().includes(search)
}

function formatTimestamp(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return relativeTime(parsed.getTime())
}

function resourceStatusLabel(status: ResourceListItem["status"]): string {
  if (status === "unprocessed") return language.t("sidebar.resourcesUnprocessed")
  if (status === "preparing") return language.t("sidebar.resourcesPreparing")
  if (status === "ready") return language.t("sidebar.resourcesReady")
  if (status === "stale") return language.t("sidebar.resourcesStale")
  if (status === "unsupported") return language.t("sidebar.resourcesUnsupported")
  return language.t("sidebar.resourcesError")
}

function resourceActionLabel(status: ResourceListItem["status"]): string {
  if (status === "ready") return language.t("resourcesPanel.rebuild")
  if (status === "preparing") return language.t("sidebar.resourcesPreparing")
  return language.t("sidebar.resourcesProcess")
}

function resourceMetadata(resource: ResourceListItem): string {
  return `${resource.extension.toUpperCase()} · ${resourceStatusLabel(resource.status)}`
}

/**
 * Every state except ready earns a badge — but only on a tile, which has no
 * detail line of its own. A row states the same thing in its meta, so badging it
 * there would just say "Unprocessed" twice.
 */
function resourceBadge(resource: ResourceListItem, busy: boolean): string | undefined {
  if (busy || resource.status === "preparing") return language.t("sidebar.resourcesPreparing")
  if (resource.status === "ready") return undefined
  return resourceStatusLabel(resource.status)
}

/** Six index statuses onto the four the presentation language distinguishes. */
function workspaceObjectStatus(status: WorkspaceObjectIndexItem["status"]): ObjectStatus {
  if (status === "preparing") return OBJECT_STATUS_PREPARING
  if (status === "error" || status === "unsupported") return OBJECT_STATUS_ERROR
  if (status === "unavailable") return OBJECT_STATUS_MISSING
  return OBJECT_STATUS_READY
}

function resourceObjectStatus(resource: ResourceListItem, busy: boolean): ObjectStatus {
  if (busy || resource.status === "preparing") return OBJECT_STATUS_PREPARING
  if (resource.status === "error" || resource.status === "unsupported") return OBJECT_STATUS_ERROR
  return OBJECT_STATUS_READY
}

/** An unprocessed source has no object yet, but the file on disk is still the thing. */
function resourceBenchTarget(resource: ResourceListItem): BenchTarget {
  if (resource.objectID) return createBenchObjectTarget(RESOURCE_OBJECT_KIND, resource.objectID)
  return { type: "workspace-file", path: resource.path, viewer: "file" }
}

function describeResource(
  directory: string,
  resource: ResourceListItem,
  busy: boolean,
  variant: ObjectVariant,
): ObjectModel {
  const status = resourceObjectStatus(resource, busy)
  const detail = resourceMetadata(resource)
  const badge = variant === OBJECT_VARIANT_TILE ? resourceBadge(resource, busy) : undefined

  return describeObject({
    target: resourceBenchTarget(resource),
    kind: RESOURCE_OBJECT_KIND,
    title: resource.title || resource.name,
    meta: [detail],
    // The cover carries the relpath rather than a URL; ResourceCover fetches it
    // itself and renders the same artwork at tile and thumbnail size.
    thumbnail: {
      source: OBJECT_THUMBNAIL_COVER,
      directory,
      ...(resource.coverRelpath ? { coverRelpath: resource.coverRelpath } : {}),
      extension: resource.extension,
      fileName: resource.name,
    },
    ...(badge ? { badge } : {}),
    ...(status === OBJECT_STATUS_ERROR ? { statusMessage: detail } : {}),
    status,
  })
}

function toSourceFeedRows(resources: readonly ResourceListItem[]): SourceFeedRow[] {
  const featured = resources.slice(0, SOURCE_FEATURED_COUNT)
  const rows: SourceFeedRow[] = []

  // One band, not one per shelf row: the grid's own gutter then runs in both
  // directions, instead of the virtual list's tighter row gap cutting across it.
  if (featured.length > 0) {
    rows.push({ type: "shelf", key: SOURCE_SHELF_ROW_KEY, resources: featured })
  }

  for (const resource of resources.slice(SOURCE_FEATURED_COUNT)) {
    rows.push({ type: "row", key: resource.key, resource })
  }

  return rows
}

/** Process and remove stay reachable from both densities, so it wraps either one. */
function SourceContextMenu(props: {
  resource: ResourceListItem
  busy: boolean
  onProcess: (resource: ResourceListItem) => void
  onDelete: (resource: ResourceListItem) => void
  children: ReactNode
}) {
  const { resource } = props
  const canProcess =
    resource.status !== "preparing" &&
    (resource.status !== "ready" || resource.objectID !== undefined)

  return (
    <ContextMenu>
      <ContextMenuTrigger className="block w-full">{props.children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuGroup>
          {canProcess ? (
            <ContextMenuItem disabled={props.busy} onSelect={() => props.onProcess(resource)}>
              <RefreshCwIcon aria-hidden />
              {resourceActionLabel(resource.status)}
            </ContextMenuItem>
          ) : null}
          {resource.objectID ? (
            <ContextMenuItem
              variant="destructive"
              disabled={props.busy}
              onSelect={() => props.onDelete(resource)}
            >
              <Trash2Icon aria-hidden />
              {language.t("resourcesPanel.remove")}
            </ContextMenuItem>
          ) : null}
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  )
}

function CatalogError(props: { message: string }) {
  return (
    <p className="rounded-lg border border-border-critical-base bg-surface-critical-weak px-3 py-2 text-xs text-text-critical-strong">
      {props.message}
    </p>
  )
}

function EmptyInventory(props: {
  icon: typeof ShapesIcon
  title: string
  description: string
  action?: ReactNode
}) {
  const Icon = props.icon

  return (
    <Empty className="min-h-72">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon aria-hidden />
        </EmptyMedia>
        <EmptyTitle>{props.title}</EmptyTitle>
        <EmptyDescription>{props.description}</EmptyDescription>
      </EmptyHeader>
      {props.action ? <EmptyContent>{props.action}</EmptyContent> : null}
    </Empty>
  )
}

function RecentSortLabel() {
  return (
    <span className="ml-auto inline-flex h-8 items-center gap-1.5 px-2 text-xs font-medium text-text-weak">
      <Clock3Icon className="size-4" aria-hidden />
      Recent
    </span>
  )
}

function useStickyReadingPath() {
  const search = useSearch({ strict: false })
  const readingPath = "path" in search && typeof search.path === "string" ? search.path : undefined
  const [stickyReadingPath, setStickyReadingPath] = useState<string | undefined>(readingPath)

  useEffect(() => {
    if (readingPath) {
      setStickyReadingPath(readingPath)
      return
    }

    const timeout = window.setTimeout(() => {
      setStickyReadingPath(undefined)
    }, STICKY_READING_RESET_DELAY_MS)
    return () => window.clearTimeout(timeout)
  }, [readingPath])

  return stickyReadingPath
}

export function SourcesDrawer(props: CatalogDrawerProps) {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState("")
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null)
  const [isAdding, setIsAdding] = useState(false)
  const [busyKeys, setBusyKeys] = useState<Set<string>>(() => new Set())
  const [actionError, setActionError] = useState<string>()
  const resourcesQuery = useQuery(resourcesQueryOptions(props.directory))
  const resources = resourcesQuery.data?.items ?? EMPTY_RESOURCE_ITEMS
  const stickyReadingPath = useStickyReadingPath()
  const lastOpenedReadingResource = useChatStore(
    (state) => state.lastOpenedReadingResourceByDirectory[props.directory],
  )
  const normalizedSearch = normalizeSearch(search)
  const visibleResources = useMemo(
    () =>
      resources.filter((resource) =>
        includesSearch(
          `${resource.title ?? ""} ${resource.name} ${resource.extension}`,
          normalizedSearch,
        ),
      ),
    [normalizedSearch, resources],
  )
  const feedRows = useMemo(() => toSourceFeedRows(visibleResources), [visibleResources])
  // Resolved against the list so the resume row gets the real cover and state,
  // and so a source deleted since it was last read stops being offered.
  const resumeResource =
    lastOpenedReadingResource && lastOpenedReadingResource.path !== stickyReadingPath
      ? resources.find((item) => item.path === lastOpenedReadingResource.path)
      : undefined

  async function addPaths(paths: readonly string[]) {
    if (isAdding || paths.length === 0) return
    setActionError(undefined)
    setIsAdding(true)
    try {
      for (const sourcePath of paths) {
        await addResource(props.directory, { sourcePath })
      }
      await invalidateResourcesQueries(queryClient, props.directory)
    } catch (error) {
      const message = stringifyError(error)
      setActionError(message)
      toast.error(message)
    } finally {
      setIsAdding(false)
    }
  }

  async function addFromPicker() {
    const sourcePath = await pickResourceFilePath()
    if (sourcePath) await addPaths([sourcePath])
  }

  async function processResource(resource: ResourceListItem) {
    if (busyKeys.has(resource.key)) return
    setBusyKeys((current) => new Set(current).add(resource.key))
    setActionError(undefined)
    try {
      if (resource.objectID) {
        await rebuildResource(props.directory, { resourceKey: resource.objectID })
      } else {
        await addResource(props.directory, { sourcePath: resource.path })
      }
      await invalidateResourcesQueries(queryClient, props.directory)
    } catch (error) {
      const message = stringifyError(error)
      setActionError(message)
      toast.error(message)
    } finally {
      setBusyKeys((current) => {
        const next = new Set(current)
        next.delete(resource.key)
        return next
      })
    }
  }

  async function deleteResource(resource: ResourceListItem) {
    if (!resource.objectID || busyKeys.has(resource.key)) return
    const confirmed = window.confirm(
      language.t("resourcesPanel.removeResourceQuestion", {
        alias: resource.title || resource.name,
      }),
    )
    if (!confirmed) return

    setBusyKeys((current) => new Set(current).add(resource.key))
    setActionError(undefined)
    try {
      await removeResource(props.directory, { resourceKey: resource.objectID })
      await invalidateResourcesQueries(queryClient, props.directory)
    } catch (error) {
      const message = stringifyError(error)
      setActionError(message)
      toast.error(message)
    } finally {
      setBusyKeys((current) => {
        const next = new Set(current)
        next.delete(resource.key)
        return next
      })
    }
  }

  function openResource(resource: RightWorkspaceResourceTarget, options?: ResourceOpenOptions) {
    void props.onOpen({
      type: "resource",
      directory: props.directory,
      resource,
      ...(options ? { options } : {}),
    })
  }

  function openResourceItem(resource: ResourceListItem) {
    openResource({
      path: resource.path,
      name: resource.name,
      ...(resource.objectID ? { objectID: resource.objectID } : {}),
      status: resource.status,
    })
  }

  function describe(resource: ResourceListItem, variant: ObjectVariant): ObjectModel {
    return describeResource(props.directory, resource, busyKeys.has(resource.key), variant)
  }

  /**
   * A row states its condition in its meta line, so repeating it as a badge said
   * "Unprocessed" twice. What a non-ready source actually needs is the verb.
   */
  function sourceActions(resource: ResourceListItem): MediaAction[] {
    if (resource.status === "ready") return []
    const pending = busyKeys.has(resource.key) || resource.status === "preparing"

    return [
      {
        id: SOURCE_PROCESS_ACTION_ID,
        label: resourceActionLabel(resource.status),
        icon: RefreshCwIcon,
        disabled: pending,
        loading: pending,
        onSelect: () => void processResource(resource),
      },
    ]
  }

  return (
    <RightWorkspaceDrawerShell
      durableScrollKey={workspaceDrawerUiKey({ directory: props.directory, drawer: "sources" })}
      title="Sources"
      searchLabel="Search sources…"
      searchValue={search}
      scrollRef={setScrollElement}
      action={{
        label: isAdding
          ? language.t("sidebar.resourcesPreparing")
          : language.t("sidebar.resourcesAdd"),
        icon: isAdding ? Loader2Icon : PlusIcon,
        busy: isAdding,
        onClick: () => void addFromPicker(),
      }}
      toolbar={
        <div className="flex flex-col gap-3">
          {resumeResource ? (
            <div className="flex flex-col gap-2">
              <RightWorkspaceSectionLabel>Continue</RightWorkspaceSectionLabel>
              <ObjectRow
                model={{
                  ...describe(resumeResource, OBJECT_VARIANT_LG),
                  meta: [SOURCE_RESUME_META],
                }}
                variant={OBJECT_VARIANT_LG}
                disabled={busyKeys.has(resumeResource.key)}
                onOpen={() => openResourceItem(resumeResource)}
              />
            </div>
          ) : null}
          <RightWorkspaceSectionLabel>
            {visibleResources.length} {visibleResources.length === 1 ? "source" : "sources"}
          </RightWorkspaceSectionLabel>
          {actionError ? <CatalogError message={actionError} /> : null}
        </div>
      }
      onSearchValueChange={setSearch}
      onClose={props.onClose}
    >
      <RightWorkspaceResourceDropzone
        enabled={!isAdding}
        onAddPaths={addPaths}
        onError={(message) => setActionError(message || undefined)}
      >
        {resourcesQuery.isPending ? <RightWorkspaceListSkeleton /> : null}
        {!resourcesQuery.isPending && resourcesQuery.error ? (
          <CatalogError message={stringifyError(resourcesQuery.error)} />
        ) : null}
        {!resourcesQuery.isPending && !resourcesQuery.error && visibleResources.length === 0 ? (
          <EmptyInventory
            icon={UploadIcon}
            title={resources.length === 0 ? "No sources yet" : "No matching sources"}
            description={
              resources.length === 0
                ? "Add a PDF or EPUB to read and use with Buddy."
                : "Try a different search."
            }
            action={
              resources.length === 0 ? (
                <Button type="button" onClick={() => void addFromPicker()}>
                  <PlusIcon data-icon="inline-start" aria-hidden />
                  Add source
                </Button>
              ) : undefined
            }
          />
        ) : null}
        {!resourcesQuery.isPending && feedRows.length > 0 ? (
          <RightWorkspaceVirtualList
            items={feedRows}
            scrollElement={scrollElement}
            getKey={(row) => row.key}
            estimateSize={(index) => {
              const row = feedRows[index]
              if (row?.type !== "shelf") return OBJECT_ROW_HEIGHT_PX[OBJECT_VARIANT_LG]
              return (
                objectShelfHeightPx(RIGHT_WORKSPACE_DRAWER_CONTENT_WIDTH_PX, row.resources.length) +
                SOURCE_SHELF_BOTTOM_GAP_PX
              )
            }}
            renderItem={(row) =>
              row.type === "shelf" ? (
                <div style={{ paddingBottom: SOURCE_SHELF_BOTTOM_GAP_PX }}>
                  <ObjectShelf>
                    {row.resources.map((resource) => (
                      <SourceContextMenu
                        key={resource.key}
                        resource={resource}
                        busy={busyKeys.has(resource.key)}
                        onProcess={(item) => void processResource(item)}
                        onDelete={(item) => void deleteResource(item)}
                      >
                        <ObjectTile
                          className="w-full"
                          model={describe(resource, OBJECT_VARIANT_TILE)}
                          active={stickyReadingPath === resource.path}
                          disabled={busyKeys.has(resource.key)}
                          onOpen={() => openResourceItem(resource)}
                        />
                      </SourceContextMenu>
                    ))}
                  </ObjectShelf>
                </div>
              ) : (
                <SourceContextMenu
                  resource={row.resource}
                  busy={busyKeys.has(row.resource.key)}
                  onProcess={(item) => void processResource(item)}
                  onDelete={(item) => void deleteResource(item)}
                >
                  <ObjectRow
                    model={describe(row.resource, OBJECT_VARIANT_LG)}
                    variant={OBJECT_VARIANT_LG}
                    actions={sourceActions(row.resource)}
                    active={stickyReadingPath === row.resource.path}
                    disabled={busyKeys.has(row.resource.key)}
                    onOpen={() => openResourceItem(row.resource)}
                  />
                </SourceContextMenu>
              )
            }
          />
        ) : null}
      </RightWorkspaceResourceDropzone>
    </RightWorkspaceDrawerShell>
  )
}

function isPracticeFilter(value: string): value is PracticeFilter {
  return value === "all" || value === "flashcards" || value === "question-sets"
}

function PracticeRow(props: {
  directory: string
  item: PracticeFeedItem
  onOpen: CatalogDrawerProps["onOpen"]
}) {
  if (props.item.kind === "flashcards") {
    return <FlashcardPracticeRow {...props} item={props.item.object} />
  }
  return <QuestionSetPracticeRow {...props} item={props.item.object} />
}

function FlashcardPracticeRow(props: {
  directory: string
  item: FlashcardDeckLibraryObject
  onOpen: CatalogDrawerProps["onOpen"]
}) {
  const detailQuery = useQuery({
    ...objectFlashcardDeckPayloadQueryOptions({
      directory: props.directory,
      objectID: props.item.objectID,
    }),
    refetchOnMount: false,
  })
  const detail = detailQuery.data
  const summary = detail ? getFlashcardDeckObjectSummary(detail) : undefined
  const dueCount = summary ? getFlashcardDueCount(summary.dueCounts) : 0
  const metadata = summary
    ? `${summary.cardCount} ${summary.cardCount === 1 ? "card" : "cards"} · ${
        dueCount > 0 ? `${dueCount} due` : "No cards due"
      }`
    : detailQuery.error
      ? stringifyError(detailQuery.error)
      : "Loading deck…"
  const model = describeObject({
    target: createBenchObjectTarget(props.item.kind, props.item.objectID),
    kind: props.item.kind,
    title: detail?.title ?? props.item.title,
    meta: [metadata],
    status: workspaceObjectStatus(props.item.status),
    ...(dueCount > 0 ? { badge: `${dueCount} due` } : {}),
  })

  return (
    <ObjectRow
      model={model}
      variant={OBJECT_VARIANT_MD}
      onOpen={() =>
        void props.onOpen({
          type: "object",
          directory: props.directory,
          target: createBenchObjectTarget(props.item.kind, props.item.objectID),
        })
      }
    />
  )
}

function QuestionSetPracticeRow(props: {
  directory: string
  item: QuestionSetLibraryObject
  onOpen: CatalogDrawerProps["onOpen"]
}) {
  const detailQuery = useQuery({
    ...objectQuestionSetPayloadQueryOptions({
      directory: props.directory,
      objectID: props.item.objectID,
    }),
    refetchOnMount: false,
  })
  const count = detailQuery.data?.questions.length
  const metadata = detailQuery.error
    ? stringifyError(detailQuery.error)
    : `${count === undefined ? "Loading" : count} ${
        count === 1 ? "question" : "questions"
      } · ${formatTimestamp(detailQuery.data?.createdAt ?? props.item.updatedAt)}`
  const model = describeObject({
    target: createBenchObjectTarget(props.item.kind, props.item.objectID),
    kind: props.item.kind,
    title: props.item.title,
    meta: [metadata],
    status: workspaceObjectStatus(props.item.status),
  })

  return (
    <ObjectRow
      model={model}
      variant={OBJECT_VARIANT_MD}
      onOpen={() =>
        void props.onOpen({
          type: "object",
          directory: props.directory,
          target: createBenchObjectTarget(props.item.kind, props.item.objectID),
        })
      }
    />
  )
}

export function PracticeDrawer(props: CatalogDrawerProps) {
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<PracticeFilter>("all")
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null)
  const objectsQuery = useQuery(workspaceObjectsQueryOptions(props.directory))
  useInvalidateQueryOnChatIdle({
    directory: props.directory,
    queryKey: workspaceObjectsQueryKeys.all(props.directory),
  })
  const flashcards = selectFlashcardDeckObjects(objectsQuery)
  const questionSets = selectQuestionSetObjects(objectsQuery)
  const deckDetailQueries = useQueries({
    queries: flashcards.map((deck) => ({
      ...objectFlashcardDeckPayloadQueryOptions({
        directory: props.directory,
        objectID: deck.objectID,
      }),
      refetchOnMount: false,
    })),
  })
  const totalDue = deckDetailQueries.reduce((total, query) => {
    if (!query.data) return total
    return total + getFlashcardDueCount(getFlashcardDeckObjectSummary(query.data).dueCounts)
  }, 0)
  const firstDueDeckIndex = deckDetailQueries.findIndex((query) => {
    if (!query.data) return false
    return getFlashcardDueCount(getFlashcardDeckObjectSummary(query.data).dueCounts) > 0
  })
  const firstReviewDeck = firstDueDeckIndex >= 0 ? flashcards[firstDueDeckIndex] : undefined
  const normalizedSearch = normalizeSearch(search)
  const items = useMemo(() => {
    const combined: PracticeFeedItem[] = [
      ...flashcards.map((object): PracticeFeedItem => ({ kind: "flashcards", object })),
      ...questionSets.map((object): PracticeFeedItem => ({ kind: "question-sets", object })),
    ]
    return combined
      .filter((item) => filter === "all" || item.kind === filter)
      .filter((item) => includesSearch(item.object.title, normalizedSearch))
      .toSorted((left, right) => right.object.updatedAt.localeCompare(left.object.updatedAt))
  }, [filter, flashcards, normalizedSearch, questionSets])
  const loadErrors = selectWorkspaceObjectLoadErrors(objectsQuery, [
    "flashcard-deck",
    "question-set",
  ])

  return (
    <RightWorkspaceDrawerShell
      durableScrollKey={workspaceDrawerUiKey({ directory: props.directory, drawer: "practice" })}
      title="Practice"
      searchLabel="Search practice…"
      searchValue={search}
      scrollRef={setScrollElement}
      toolbar={
        <div className="flex flex-col gap-3">
          <RightWorkspaceSectionLabel>Ready to review</RightWorkspaceSectionLabel>
          <div className="flex items-center gap-3 rounded-lg border border-border-interactive-base bg-surface-interactive-weak p-3">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="text-lg font-semibold text-text-strong">{totalDue} due</p>
              <p className="text-xs text-text-weak">
                {flashcards.length} {flashcards.length === 1 ? "deck" : "decks"} ·{" "}
                {questionSets.length} {questionSets.length === 1 ? "question set" : "question sets"}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              disabled={!firstReviewDeck}
              onClick={() => {
                if (!firstReviewDeck) return
                void props.onOpen({
                  type: "object",
                  directory: props.directory,
                  target: createBenchObjectTarget("flashcard-deck", firstReviewDeck.objectID),
                })
              }}
            >
              <PlayIcon data-icon="inline-start" aria-hidden />
              Start
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <ToggleGroup
              type="single"
              value={filter}
              variant="outline"
              size="sm"
              aria-label="Filter practice items"
              onValueChange={(value) => {
                if (isPracticeFilter(value)) setFilter(value)
              }}
            >
              <ToggleGroupItem value="all">All</ToggleGroupItem>
              <ToggleGroupItem value="flashcards">Cards</ToggleGroupItem>
              <ToggleGroupItem value="question-sets">Questions</ToggleGroupItem>
            </ToggleGroup>
            <RecentSortLabel />
          </div>
          <RightWorkspaceSectionLabel>
            {items.length} practice {items.length === 1 ? "item" : "items"}
          </RightWorkspaceSectionLabel>
          {objectsQuery.error ? (
            <CatalogError message={stringifyError(objectsQuery.error)} />
          ) : null}
          {loadErrors.map((error) => (
            <CatalogError
              key={`${error.kind}:${error.objectID}:${error.path}`}
              message={error.message}
            />
          ))}
        </div>
      }
      onSearchValueChange={setSearch}
      onClose={props.onClose}
    >
      {objectsQuery.isPending ? <RightWorkspaceListSkeleton /> : null}
      {!objectsQuery.isPending && !objectsQuery.error && items.length === 0 ? (
        <EmptyInventory
          icon={ListChecksIcon}
          title={flashcards.length + questionSets.length === 0 ? "No practice yet" : "No matches"}
          description={
            flashcards.length + questionSets.length === 0
              ? "Ask Buddy to create flashcards or a question set."
              : "Try another search or filter."
          }
        />
      ) : null}
      {items.length > 0 ? (
        <RightWorkspaceVirtualList
          items={items}
          scrollElement={scrollElement}
          getKey={(item) => `${item.kind}:${item.object.objectID}`}
          estimateSize={OBJECT_ROW_HEIGHT_PX[OBJECT_VARIANT_MD]}
          renderItem={(item) => (
            <PracticeRow directory={props.directory} item={item} onOpen={props.onOpen} />
          )}
        />
      ) : null}
    </RightWorkspaceDrawerShell>
  )
}

function creationFilterLabel(filter: CreationFilter): string {
  if (filter === "widgets") return "Widgets"
  if (filter === "diagrams") return "Diagrams"
  if (filter === "media") return "Media"
  return "All types"
}

function creationKindLabel(item: CreationFeedItem): string {
  if (item.kind === "widgets") return "Widget"
  if (item.kind === "diagrams") return "Diagram"
  if (item.object.kind === "media-presentation") return "Media"
  return "Figure"
}

function creationViewID(item: CreationFeedItem): string {
  if (item.kind === "widgets") return HTML_WIDGET_RUNTIME_VIEW_ID
  if (item.kind === "diagrams") return RENDERED_OBJECT_VIEW_ID
  return item.object.kind === "media-presentation" ? MEDIA_GALLERY_VIEW_ID : RENDERED_OBJECT_VIEW_ID
}

export function CreationPreviewVisual(props: { directory: string; item: CreationFeedItem }) {
  if (props.item.kind === "widgets") {
    return <WidgetCreationPreview directory={props.directory} object={props.item.object} />
  }
  if (props.item.kind === "diagrams") {
    return <DiagramCreationPreview directory={props.directory} object={props.item.object} />
  }
  return <MediaCreationPreview directory={props.directory} object={props.item.object} />
}

function WidgetCreationPreview(props: { directory: string; object: HtmlWidgetLibraryObject }) {
  const viewQuery = useQuery(
    objectViewQueryOptions({
      directory: props.directory,
      kind: "html-widget",
      objectID: props.object.objectID,
      viewID: HTML_WIDGET_RUNTIME_VIEW_ID,
    }),
  )
  const data: HtmlWidgetViewData | undefined =
    viewQuery.data?.data.renderer === "html-widget" ? viewQuery.data.data : undefined

  if (!data) return <RightWorkspaceListSkeleton count={1} />

  const viewport = resolveHtmlWidgetViewport(data.viewportPreset)
  if (!viewport) return <RightWorkspaceListSkeleton count={1} />

  const widget: HtmlWidgetPresentation = {
    objectID: props.object.objectID,
    kind: "html-widget",
    title: props.object.title,
    sourceRoot: data.sourceRoot,
    entryPath: data.entryPath,
    sourceVersion: data.sourceVersion,
    viewport,
    runtimeUrl: data.runtimeUrl,
  }

  // The inline frame scales the iframe to the widget's intrinsic viewport
  // dimensions and sets the aspect ratio from the viewport data, so the
  // preview fits without scrollbars.
  return (
    <HtmlWidgetFrame
      widget={widget}
      mode="inline"
      showStateOverlay={false}
      className="pointer-events-none rounded-md"
    />
  )
}

function DiagramCreationPreview(props: { directory: string; object: MermaidLibraryObject }) {
  const detailQuery = useQuery(
    objectMermaidPayloadQueryOptions({
      directory: props.directory,
      objectID: props.object.objectID,
    }),
  )

  if (!detailQuery.data) return <RightWorkspaceListSkeleton count={1} />

  return (
    <div className="pointer-events-none h-full overflow-hidden rounded-md bg-background-base p-2">
      <MermaidDiagram
        directory={props.directory}
        objectID={props.object.objectID}
        source={detailQuery.data.source}
        alt=""
        presentation="static"
        hideLoadingPlaceholder
        hideFullscreenAction
        renderWrapper={(diagramElement) => <div className="h-full w-full">{diagramElement}</div>}
      />
    </div>
  )
}

function MediaCreationPreview(props: { directory: string; object: MediaLibraryObject }) {
  const viewID =
    props.object.kind === "media-presentation" ? MEDIA_GALLERY_VIEW_ID : RENDERED_OBJECT_VIEW_ID
  const viewQuery = useQuery(
    objectViewQueryOptions({
      directory: props.directory,
      kind: props.object.kind,
      objectID: props.object.objectID,
      viewID,
    }),
  )
  const figure: FigureViewData | undefined =
    viewQuery.data?.data.renderer === "figure" ? viewQuery.data.data : undefined
  const gallery: MediaGalleryViewData | undefined =
    viewQuery.data?.data.renderer === "media-gallery" ? viewQuery.data.data : undefined
  const galleryItem =
    gallery?.items.find((item) => item.availability === "available" && item.rawUrl) ??
    gallery?.items.find((item) => item.rawUrl)
  const src = figure?.svgUrl
    ? resolveAssetUrl(figure.svgUrl)
    : galleryItem?.rawUrl
      ? resolveAssetUrl(galleryItem.rawUrl)
      : undefined

  if (!src) return <RightWorkspaceListSkeleton count={1} />
  if (galleryItem?.mediaType === "video") {
    return (
      <video
        src={src}
        muted
        playsInline
        preload="metadata"
        className="pointer-events-none h-full w-full rounded-md object-contain"
      />
    )
  }

  return (
    <img src={src} alt="" className="pointer-events-none h-full w-full rounded-md object-contain" />
  )
}

/**
 * Split density: the top few creations render the artifact inline, the rest are
 * rows. The featured band IS the render budget — it is structural, so no cap
 * has to be imposed after the fact, and the virtualiser only mounts what is
 * on screen.
 */
const CREATION_FEATURED_COUNT = 3

function describeCreation(item: CreationFeedItem): ObjectModel {
  const { object } = item
  return describeObject({
    target: createBenchObjectTarget(object.kind, object.objectID),
    kind: object.kind,
    title: object.title,
    meta: [creationKindLabel(item), formatTimestamp(object.updatedAt)],
    status: workspaceObjectStatus(object.status),
  })
}

/**
 * Resolves a real image thumbnail for the kinds that earn one.
 *
 * Only media presentations and figures reach here, and only while their row is
 * on screen — the list virtualises, so the view fetch is naturally budgeted by
 * visibility rather than by an imposed cap. Diagrams and widgets keep the
 * glyph: at row scale a render is unreadable and costs far more than an <img>.
 */
function useCreationRowModel(directory: string, item: CreationFeedItem): ObjectModel {
  const wantsThumbnail = item.kind === "media"
  const viewQuery = useQuery({
    ...objectViewQueryOptions({
      directory,
      kind: item.object.kind,
      objectID: item.object.objectID,
      viewID: creationViewID(item),
    }),
    enabled: wantsThumbnail,
  })

  return useMemo(() => {
    const model = describeCreation(item)
    if (!wantsThumbnail) return model

    const figure: FigureViewData | undefined =
      viewQuery.data?.data.renderer === "figure" ? viewQuery.data.data : undefined
    const gallery: MediaGalleryViewData | undefined =
      viewQuery.data?.data.renderer === "media-gallery" ? viewQuery.data.data : undefined
    const galleryItem = gallery?.items.find(
      (entry) => entry.availability === "available" && entry.rawUrl && entry.mediaType !== "video",
    )
    const rawSrc = figure?.svgUrl ?? galleryItem?.rawUrl
    if (!rawSrc) return model

    return {
      ...model,
      thumbnail: {
        source: OBJECT_THUMBNAIL_IMAGE,
        src: resolveAssetUrl(rawSrc),
        alt: "",
      },
    }
  }, [item, viewQuery.data, wantsThumbnail])
}

/**
 * Tail row: a plain ObjectRow that still reveals the full render on hover, the
 * way the drawer did before split density. The featured cards do not need this
 * — they already render inline.
 */
function CreationTailRow(props: {
  directory: string
  item: CreationFeedItem
  preview: CreationPreviewState | undefined
  onOpen: (item: CreationFeedItem) => void
  onPreviewIntent: (item: CreationFeedItem) => void
  onPreviewEnd: () => void
  onPreviewKeepOpen: () => void
  onPreviewOpenChange: (open: boolean) => void
}) {
  const model = useCreationRowModel(props.directory, props.item)
  const previewActive =
    props.preview?.item.kind === props.item.kind &&
    props.preview.item.object.objectID === props.item.object.objectID
  const dimensions = CREATION_PREVIEW_DIMENSIONS[props.item.kind]

  return (
    <Popover open={previewActive && props.preview?.open} onOpenChange={props.onPreviewOpenChange}>
      <PopoverAnchor asChild>
        <div
          onPointerEnter={(event) => {
            if (event.pointerType === "touch") return
            props.onPreviewIntent(props.item)
          }}
          onPointerLeave={props.onPreviewEnd}
          onFocus={() => props.onPreviewIntent(props.item)}
          onBlur={props.onPreviewEnd}
        >
          <ObjectRow
            model={model}
            variant={OBJECT_VARIANT_MD}
            onOpen={() => props.onOpen(props.item)}
          />
        </div>
      </PopoverAnchor>
      {previewActive ? (
        <PopoverContent
          side="left"
          align="center"
          sideOffset={12}
          className={cn(dimensions.aspectClass, dimensions.widthClass, "p-2")}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onPointerEnter={props.onPreviewKeepOpen}
          onPointerLeave={props.onPreviewEnd}
        >
          <button
            type="button"
            aria-label={`Open ${props.item.object.title} on the Bench`}
            className="block h-full w-full rounded-md outline-none focus-visible:ring-2 focus-visible:ring-border-interactive-base"
            onClick={() => props.onOpen(props.item)}
          >
            <CreationPreviewVisual directory={props.directory} item={props.item} />
          </button>
        </PopoverContent>
      ) : null}
    </Popover>
  )
}

export function CreationsDrawer(props: CreationsDrawerProps) {
  const queryClient = useQueryClient()
  const prefetchTimeoutRef = useRef<ReturnType<typeof setTimeout>>()
  const openTimeoutRef = useRef<ReturnType<typeof setTimeout>>()
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout>>()
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<CreationFilter>("all")
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null)
  const [preview, setPreview] = useState<CreationPreviewState>()
  const objectsQuery = useQuery(workspaceObjectsQueryOptions(props.directory))
  useInvalidateQueryOnChatIdle({
    directory: props.directory,
    queryKey: workspaceObjectsQueryKeys.all(props.directory),
  })
  const widgets = selectHtmlWidgetObjects(objectsQuery)
  const diagrams = selectMermaidObjects(objectsQuery)
  const media = selectMediaLibraryObjects(objectsQuery)
  const normalizedSearch = normalizeSearch(search)
  const items = useMemo(() => {
    const combined: CreationFeedItem[] = [
      ...widgets.map((object): CreationFeedItem => ({ kind: "widgets", object })),
      ...diagrams.map((object): CreationFeedItem => ({ kind: "diagrams", object })),
      ...media.map((object): CreationFeedItem => ({ kind: "media", object })),
    ]
    return combined
      .filter((item) => filter === "all" || item.kind === filter)
      .filter((item) => includesSearch(item.object.title, normalizedSearch))
      .toSorted((left, right) => right.object.updatedAt.localeCompare(left.object.updatedAt))
  }, [diagrams, filter, media, normalizedSearch, widgets])
  const loadErrors = selectWorkspaceObjectLoadErrors(objectsQuery, [
    "html-widget",
    "mermaid",
    ...MEDIA_LIBRARY_KINDS,
  ])

  function clearPreviewTimers() {
    if (prefetchTimeoutRef.current) clearTimeout(prefetchTimeoutRef.current)
    if (openTimeoutRef.current) clearTimeout(openTimeoutRef.current)
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current)
    prefetchTimeoutRef.current = undefined
    openTimeoutRef.current = undefined
    closeTimeoutRef.current = undefined
  }

  function prefetchCreation(item: CreationFeedItem) {
    if (item.kind === "diagrams") {
      return queryClient.prefetchQuery(
        objectMermaidPayloadQueryOptions({
          directory: props.directory,
          objectID: item.object.objectID,
        }),
      )
    }
    return queryClient.prefetchQuery(
      objectViewQueryOptions({
        directory: props.directory,
        kind: item.object.kind,
        objectID: item.object.objectID,
        viewID: creationViewID(item),
      }),
    )
  }

  function beginPreview(item: CreationFeedItem) {
    clearPreviewTimers()
    setPreview(undefined)
    prefetchTimeoutRef.current = setTimeout(() => {
      prefetchTimeoutRef.current = undefined
      void prefetchCreation(item)
    }, CREATION_PREVIEW_PREFETCH_DELAY_MS)
    openTimeoutRef.current = setTimeout(() => {
      openTimeoutRef.current = undefined
      setPreview({ item, open: true })
    }, CREATION_PREVIEW_OPEN_DELAY_MS)
  }

  function schedulePreviewClose() {
    if (prefetchTimeoutRef.current) clearTimeout(prefetchTimeoutRef.current)
    if (openTimeoutRef.current) clearTimeout(openTimeoutRef.current)
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current)
    prefetchTimeoutRef.current = undefined
    openTimeoutRef.current = undefined
    closeTimeoutRef.current = setTimeout(() => {
      closeTimeoutRef.current = undefined
      setPreview(undefined)
    }, CREATION_PREVIEW_CLOSE_DELAY_MS)
  }

  function keepPreviewOpen() {
    if (!closeTimeoutRef.current) return
    clearTimeout(closeTimeoutRef.current)
    closeTimeoutRef.current = undefined
  }

  function openCreation(item: CreationFeedItem) {
    clearPreviewTimers()
    setPreview(undefined)
    void props.onOpen({
      type: "object",
      directory: props.directory,
      target: createBenchObjectTarget(item.object.kind, item.object.objectID),
    })
  }

  return (
    <RightWorkspaceDrawerShell
      durableScrollKey={workspaceDrawerUiKey({ directory: props.directory, drawer: "creations" })}
      title="Creations"
      searchLabel="Search creations…"
      searchValue={search}
      scrollRef={setScrollElement}
      action={{
        label: "Create",
        icon: PlusIcon,
        onClick: props.onCreate,
      }}
      toolbar={
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="sm">
                  <ShapesIcon data-icon="inline-start" aria-hidden />
                  {creationFilterLabel(filter)}
                  <ChevronDownIcon data-icon="inline-end" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuGroup>
                  <DropdownMenuRadioGroup
                    value={filter}
                    onValueChange={(value) => {
                      if (
                        value === "all" ||
                        value === "widgets" ||
                        value === "diagrams" ||
                        value === "media"
                      ) {
                        setFilter(value)
                      }
                    }}
                  >
                    <DropdownMenuRadioItem value="all">All types</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="widgets">Widgets</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="diagrams">Diagrams</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="media">Media</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <RecentSortLabel />
          </div>
          <RightWorkspaceSectionLabel>Recent creations</RightWorkspaceSectionLabel>
          {objectsQuery.error ? (
            <CatalogError message={stringifyError(objectsQuery.error)} />
          ) : null}
          {loadErrors.map((error) => (
            <CatalogError
              key={`${error.kind}:${error.objectID}:${error.path}`}
              message={error.message}
            />
          ))}
        </div>
      }
      onSearchValueChange={setSearch}
      onClose={() => {
        clearPreviewTimers()
        props.onClose()
      }}
    >
      {objectsQuery.isPending ? <RightWorkspaceListSkeleton /> : null}
      {!objectsQuery.isPending && !objectsQuery.error && items.length === 0 ? (
        <EmptyInventory
          icon={ShapesIcon}
          title={
            widgets.length + diagrams.length + media.length === 0
              ? "No creations yet"
              : "No matches"
          }
          description={
            widgets.length + diagrams.length + media.length === 0
              ? "Widgets, diagrams, figures, and media created with Buddy appear here."
              : "Try another search or filter."
          }
        />
      ) : null}
      {items.length > 0 ? (
        <RightWorkspaceVirtualList
          items={items}
          scrollElement={scrollElement}
          getKey={(item) => `${item.object.kind}:${item.object.objectID}`}
          estimateSize={(index) =>
            index < CREATION_FEATURED_COUNT
              ? objectCardHeightPx(RIGHT_WORKSPACE_DRAWER_CONTENT_WIDTH_PX)
              : OBJECT_ROW_HEIGHT_PX[OBJECT_VARIANT_MD]
          }
          renderItem={(item, index) =>
            index < CREATION_FEATURED_COUNT ? (
              <ObjectCard
                model={describeCreation(item)}
                allowLive
                preview={<CreationPreviewVisual directory={props.directory} item={item} />}
                onOpen={() => openCreation(item)}
              />
            ) : (
              <CreationTailRow
                directory={props.directory}
                item={item}
                preview={preview}
                onOpen={openCreation}
                onPreviewIntent={beginPreview}
                onPreviewEnd={schedulePreviewClose}
                onPreviewKeepOpen={keepPreviewOpen}
                onPreviewOpenChange={(open) => {
                  if (!open) setPreview(undefined)
                }}
              />
            )
          }
        />
      ) : null}
    </RightWorkspaceDrawerShell>
  )
}
