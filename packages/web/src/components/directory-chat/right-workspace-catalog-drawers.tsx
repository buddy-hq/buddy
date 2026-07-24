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
  AppWindowIcon,
  BookOpenIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  Clock3Icon,
  FileImageIcon,
  ImagesIcon,
  Layers3Icon,
  ListChecksIcon,
  Loader2Icon,
  PlusIcon,
  PlayIcon,
  RefreshCwIcon,
  ShapesIcon,
  Trash2Icon,
  UploadIcon,
  WorkflowIcon,
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
import { ResourceCover } from "@/components/resources/resource-cover"
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
} from "@/components/layout/chat-left-sidebar/library-object-selectors"
import type {
  RightWorkspaceOpenOutcome,
  RightWorkspaceOpenRequest,
  RightWorkspaceResourceTarget,
} from "./right-workspace-open"
import {
  RightWorkspaceDrawerShell,
  RightWorkspaceListRow,
  RightWorkspaceListSkeleton,
  RightWorkspaceSectionLabel,
  RightWorkspaceVirtualList,
} from "./right-workspace-drawer-ui"
import { RightWorkspaceResourceDropzone } from "./right-workspace-resource-dropzone"

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

export type CreationFeedItem =
  | { kind: "widgets"; object: HtmlWidgetLibraryObject }
  | { kind: "diagrams"; object: MermaidLibraryObject }
  | { kind: "media"; object: MediaLibraryObject }

type CreationPreviewState = {
  item: CreationFeedItem
  open: boolean
}

type FigureViewData = Extract<ObjectsViewResponse["data"], { renderer: "figure" }>
type HtmlWidgetViewData = Extract<ObjectsViewResponse["data"], { renderer: "html-widget" }>
type MediaGalleryViewData = Extract<ObjectsViewResponse["data"], { renderer: "media-gallery" }>

const CREATION_PREVIEW_PREFETCH_DELAY_MS = 120
const CREATION_PREVIEW_OPEN_DELAY_MS = 500
const CREATION_PREVIEW_CLOSE_DELAY_MS = 150
const HTML_WIDGET_RUNTIME_VIEW_ID = "runtime"
const MEDIA_GALLERY_VIEW_ID = "gallery"
const RENDERED_OBJECT_VIEW_ID = "rendered"
const STICKY_READING_RESET_DELAY_MS = 500
const EMPTY_RESOURCE_ITEMS: ResourceListItem[] = []

type CreationPreviewDimensions = {
  widthClass: string
  aspectClass: string | null
}

const CREATION_PREVIEW_DIMENSIONS: Record<CreationFeedItem["kind"], CreationPreviewDimensions> = {
  // Widgets carry their own viewport dimensions; the inline frame sets the aspect
  // ratio from the widget data, so we only constrain the width here.
  widgets: { widthClass: "w-96", aspectClass: null },
  // Mermaid diagrams vary in shape — wider and taller to show flowchart structure.
  diagrams: { widthClass: "w-96", aspectClass: "aspect-[4/3]" },
  // Figures and media galleries — moderate 16:9 preview with object-contain.
  media: { widthClass: "w-80", aspectClass: "aspect-video" },
}

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

function resourceBadge(resource: ResourceListItem, busy: boolean): string | undefined {
  if (busy || resource.status === "preparing") return language.t("sidebar.resourcesPreparing")
  if (resource.status === "stale" || resource.status === "error") {
    return resourceStatusLabel(resource.status)
  }
  return undefined
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
  const resumeReadingResource =
    lastOpenedReadingResource && lastOpenedReadingResource.path !== stickyReadingPath
      ? lastOpenedReadingResource
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
          {resumeReadingResource ? (
            <div className="flex flex-col gap-2">
              <RightWorkspaceSectionLabel>Continue</RightWorkspaceSectionLabel>
              <Button
                type="button"
                variant="secondary"
                className="h-auto w-full justify-start px-3 py-3 text-left"
                onClick={() =>
                  openResource({
                    path: resumeReadingResource.path,
                    name: resumeReadingResource.name,
                    ...(resumeReadingResource.objectID
                      ? { objectID: resumeReadingResource.objectID }
                      : {}),
                  })
                }
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-surface-interactive-weak text-text-interactive-base">
                  <BookOpenIcon aria-hidden />
                </span>
                <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
                  <span className="w-full truncate text-sm">{resumeReadingResource.name}</span>
                  <span className="text-xs font-normal text-text-weak">Resume reading</span>
                </span>
                <ChevronRightIcon className="ml-auto" aria-hidden />
              </Button>
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
        {!resourcesQuery.isPending && visibleResources.length > 0 ? (
          <RightWorkspaceVirtualList
            items={visibleResources}
            scrollElement={scrollElement}
            getKey={(resource) => resource.key}
            renderItem={(resource) => {
              const busy = busyKeys.has(resource.key)
              const processLabel = resourceActionLabel(resource.status)
              const canProcess =
                resource.status !== "preparing" &&
                (resource.status !== "ready" || resource.objectID !== undefined)

              return (
                <ContextMenu>
                  <ContextMenuTrigger asChild>
                    <RightWorkspaceListRow
                      visual={
                        <ResourceCover
                          directory={props.directory}
                          coverRelpath={resource.coverRelpath}
                          title={resource.title}
                          extension={resource.extension}
                          presentation="thumbnail"
                          className="h-11 w-8 shrink-0"
                        />
                      }
                      title={resource.title || resource.name}
                      metadata={resourceMetadata(resource)}
                      badge={resourceBadge(resource, busy)}
                      active={stickyReadingPath === resource.path}
                      disabled={busy}
                      onClick={() =>
                        openResource({
                          path: resource.path,
                          name: resource.name,
                          ...(resource.objectID ? { objectID: resource.objectID } : {}),
                          status: resource.status,
                        })
                      }
                    />
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuGroup>
                      {canProcess ? (
                        <ContextMenuItem
                          disabled={busy}
                          onSelect={() => void processResource(resource)}
                        >
                          <RefreshCwIcon aria-hidden />
                          {processLabel}
                        </ContextMenuItem>
                      ) : null}
                      {resource.objectID ? (
                        <ContextMenuItem
                          variant="destructive"
                          disabled={busy}
                          onSelect={() => void deleteResource(resource)}
                        >
                          <Trash2Icon aria-hidden />
                          {language.t("resourcesPanel.remove")}
                        </ContextMenuItem>
                      ) : null}
                    </ContextMenuGroup>
                  </ContextMenuContent>
                </ContextMenu>
              )
            }}
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

  return (
    <RightWorkspaceListRow
      icon={Layers3Icon}
      title={detail?.title ?? props.item.title}
      metadata={metadata}
      badge={dueCount > 0 ? `${dueCount} due` : undefined}
      onClick={() =>
        void props.onOpen({
          type: "object",
          directory: props.directory,
          target: createBenchObjectTarget("flashcard-deck", props.item.objectID),
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

  return (
    <RightWorkspaceListRow
      icon={ListChecksIcon}
      title={props.item.title}
      metadata={metadata}
      onClick={() =>
        void props.onOpen({
          type: "object",
          directory: props.directory,
          target: createBenchObjectTarget("question-set", props.item.objectID),
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

function creationIcon(item: CreationFeedItem) {
  if (item.kind === "widgets") return AppWindowIcon
  if (item.kind === "diagrams") return WorkflowIcon
  if (item.object.kind === "media-presentation") return ImagesIcon
  return FileImageIcon
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

function CreationRow(props: {
  directory: string
  item: CreationFeedItem
  preview: CreationPreviewState | undefined
  onOpen: (item: CreationFeedItem) => void
  onPreviewIntent: (item: CreationFeedItem) => void
  onPreviewEnd: () => void
  onPreviewKeepOpen: () => void
  onPreviewOpenChange: (open: boolean) => void
}) {
  const previewActive =
    props.preview?.item.kind === props.item.kind &&
    props.preview.item.object.objectID === props.item.object.objectID
  const dimensions = CREATION_PREVIEW_DIMENSIONS[props.item.kind]

  return (
    <Popover open={previewActive && props.preview?.open} onOpenChange={props.onPreviewOpenChange}>
      <PopoverAnchor asChild>
        <RightWorkspaceListRow
          icon={creationIcon(props.item)}
          title={props.item.object.title}
          metadata={`${creationKindLabel(props.item)} · ${formatTimestamp(
            props.item.object.updatedAt,
          )}`}
          onClick={() => props.onOpen(props.item)}
          onPreviewIntent={() => props.onPreviewIntent(props.item)}
          onPreviewEnd={props.onPreviewEnd}
        />
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

  useEffect(
    () => () => {
      clearPreviewTimers()
    },
    [],
  )

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
          renderItem={(item) => (
            <CreationRow
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
          )}
        />
      ) : null}
    </RightWorkspaceDrawerShell>
  )
}
