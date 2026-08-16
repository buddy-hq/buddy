import { useMemo, useState } from "react"
import { workspaceDrawerUiKey } from "@/state/workspace-drawer-ui-state"
import { useQuery } from "@tanstack/react-query"
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  SlidersHorizontalIcon,
} from "@buddy/ui"
import {
  BookOpenIcon,
  BrainIcon,
  ChevronDownIcon,
  FileIcon,
  MessageSquareTextIcon,
  PresentationIcon,
  SearchIcon,
  type AppIcon,
} from "@/icons/app-icons"
import * as AppIcons from "@/icons/app-icons"
import type { SessionInfo } from "@/state/chat-types"
import {
  NOTEBOOK_SEARCH_FILTER_ALL,
  NOTEBOOK_SEARCH_MAX_QUERY_LENGTH,
  NOTEBOOK_SEARCH_MIN_QUERY_LENGTH,
  NOTEBOOK_SEARCH_RESULT_KINDS,
  type NotebookSearchFilter,
  type NotebookSearchResult,
  type NotebookSearchResultKind,
} from "@/state/notebook-search"
import { useNotebookSearch } from "@/state/use-notebook-search"
import { workspaceObjectsQueryOptions } from "@/state/workspace-objects-query"
import {
  selectHtmlWidgetObjects,
  selectMediaLibraryObjects,
  selectMermaidObjects,
} from "@/components/layout/chat-left-sidebar/library-object-selectors"
import { ObjectCard, ObjectRow } from "@/components/objects/object-presentation"
import { describeNotebookSearchResult } from "@/components/objects/describe-search-result"
import {
  OBJECT_ROW_HEIGHT_PX,
  OBJECT_VARIANT_MD,
  objectCardHeightPx,
} from "@/components/objects/types"
import { RIGHT_WORKSPACE_DRAWER_CONTENT_WIDTH_PX } from "@/lib/directory-chat/right-workspace-layout"
import { CreationPreviewVisual, type CreationFeedItem } from "./right-workspace-catalog-drawers"
import {
  notebookSearchOpenRequest,
  type RightWorkspaceOpenOutcome,
  type RightWorkspaceOpenRequest,
} from "./right-workspace-open"
import {
  RightWorkspaceDrawerShell,
  RightWorkspaceListSkeleton,
  RightWorkspaceSectionLabel,
  RightWorkspaceVirtualList,
} from "./right-workspace-drawer-ui"

const FigureGlyph = AppIcons["ShapesIcon"]

type RightWorkspaceSearchDrawerProps = {
  directory: string
  sessionID?: string
  sessions: SessionInfo[]
  onClose: () => void
  onOpen: (request: RightWorkspaceOpenRequest) => Promise<RightWorkspaceOpenOutcome>
  onOpenThread: (sessionID: string) => Promise<boolean>
}

type SearchKindDefinition = {
  kind: NotebookSearchResultKind
  label: string
  icon: AppIcon
}

const SEARCH_FILTER_ALL_LABEL = "All types"

const SEARCH_KIND_DEFINITIONS: SearchKindDefinition[] = [
  { kind: "thread", label: "Chats", icon: MessageSquareTextIcon },
  { kind: "source", label: "Sources", icon: BookOpenIcon },
  { kind: "creation", label: "Creations", icon: FigureGlyph },
  { kind: "practice", label: "Practice", icon: BrainIcon },
  { kind: "board", label: "Boards", icon: PresentationIcon },
  { kind: "file", label: "Files", icon: FileIcon },
]

const SEARCH_FEATURED_COUNT = 3

function isNotebookSearchFilter(value: string): value is NotebookSearchFilter {
  return (
    value === NOTEBOOK_SEARCH_FILTER_ALL ||
    NOTEBOOK_SEARCH_RESULT_KINDS.some((candidate) => candidate === value)
  )
}

function searchFilterLabel(filter: NotebookSearchFilter): string {
  if (filter === NOTEBOOK_SEARCH_FILTER_ALL) return SEARCH_FILTER_ALL_LABEL
  return (
    SEARCH_KIND_DEFINITIONS.find((definition) => definition.kind === filter)?.label ??
    SEARCH_FILTER_ALL_LABEL
  )
}

export function RightWorkspaceSearchDrawer(props: RightWorkspaceSearchDrawerProps) {
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<NotebookSearchFilter>(NOTEBOOK_SEARCH_FILTER_ALL)
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null)
  const objectsQuery = useQuery(workspaceObjectsQueryOptions(props.directory))
  const search = useNotebookSearch({
    directory: props.directory,
    query,
    filter,
    sessions: props.sessions,
  })
  const widgets = selectHtmlWidgetObjects(objectsQuery)
  const diagrams = selectMermaidObjects(objectsQuery)
  const media = selectMediaLibraryObjects(objectsQuery)
  /** The objects a featured card can actually render, indexed for lookup by ID. */
  const creationItems = useMemo(() => {
    const items = new Map<string, CreationFeedItem>()
    for (const object of widgets) items.set(object.objectID, { kind: "widgets", object })
    for (const object of diagrams) items.set(object.objectID, { kind: "diagrams", object })
    for (const object of media) items.set(object.objectID, { kind: "media", object })
    return items
  }, [diagrams, media, widgets])
  const searchIncomplete = search.incomplete

  function openResult(result: NotebookSearchResult) {
    const request = notebookSearchOpenRequest({ result, directory: props.directory })
    if (!request) {
      if (result.target.type !== "thread") return
      const { sessionID } = result.target
      void props.onOpenThread(sessionID).then((opened) => {
        if (opened) props.onClose()
      })
      return
    }
    void props.onOpen(request)
  }

  /** Only the promoted band can be a card, so the estimate follows the same rule. */
  function searchResultEstimate(index: number): number {
    return index < SEARCH_FEATURED_COUNT
      ? objectCardHeightPx(RIGHT_WORKSPACE_DRAWER_CONTENT_WIDTH_PX)
      : OBJECT_ROW_HEIGHT_PX[OBJECT_VARIANT_MD]
  }

  /**
   * Split density without reordering: a result keeps its rank, and the top few
   * are promoted to cards only when they have something to show. A chat or a
   * plain file at rank one stays a row rather than spending a card on a glyph.
   */
  function renderResult(result: NotebookSearchResult, index: number) {
    const model = describeNotebookSearchResult({ result, directory: props.directory })
    const creation =
      result.target.type === "object" ? creationItems.get(result.target.objectID) : undefined
    const featured =
      index < SEARCH_FEATURED_COUNT && (creation !== undefined || model.thumbnail !== undefined)

    if (!featured) {
      return (
        <ObjectRow model={model} variant={OBJECT_VARIANT_MD} onOpen={() => openResult(result)} />
      )
    }

    return (
      <ObjectCard
        {...Object.assign(
          {
            model,
            allowLive: creation !== undefined,
            onOpen: () => openResult(result),
          },
          creation
            ? { preview: <CreationPreviewVisual directory={props.directory} item={creation} /> }
            : undefined,
        )}
      />
    )
  }

  return (
    <RightWorkspaceDrawerShell
      durableScrollKey={workspaceDrawerUiKey({ directory: props.directory, drawer: "search" })}
      title="Search"
      searchLabel="Search this notebook…"
      searchValue={query}
      searchPending={search.searching}
      searchAutoFocus
      searchMaxLength={NOTEBOOK_SEARCH_MAX_QUERY_LENGTH}
      scrollRef={setScrollElement}
      toolbar={
        search.hasQuery ? (
          <div className="flex items-center justify-between gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="sm">
                  <SlidersHorizontalIcon data-icon="inline-start" aria-hidden />
                  {searchFilterLabel(filter)}
                  <ChevronDownIcon data-icon="inline-end" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuGroup>
                  <DropdownMenuRadioGroup
                    value={filter}
                    onValueChange={(value) => {
                      if (isNotebookSearchFilter(value)) setFilter(value)
                    }}
                  >
                    <DropdownMenuRadioItem value={NOTEBOOK_SEARCH_FILTER_ALL}>
                      {SEARCH_FILTER_ALL_LABEL}
                    </DropdownMenuRadioItem>
                    {SEARCH_KIND_DEFINITIONS.map((definition) => (
                      <DropdownMenuRadioItem key={definition.kind} value={definition.kind}>
                        {definition.label}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <p className="text-xs text-text-weaker" aria-live="polite">
              {search.searching
                ? "Searching…"
                : `${search.results.length} ${search.results.length === 1 ? "result" : "results"}`}
            </p>
          </div>
        ) : undefined
      }
      onSearchValueChange={setQuery}
    >
      {!search.hasQuery ? (
        <section className="flex flex-col gap-1">
          <RightWorkspaceSectionLabel>Recent in this notebook</RightWorkspaceSectionLabel>
          {search.catalogPending ? (
            <RightWorkspaceListSkeleton />
          ) : search.recents.length > 0 ? (
            <RightWorkspaceVirtualList
              items={search.recents}
              scrollElement={scrollElement}
              getKey={(result) => result.id}
              estimateSize={searchResultEstimate}
              renderItem={renderResult}
            />
          ) : (
            <Empty className="min-h-72">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <SearchIcon aria-hidden />
                </EmptyMedia>
                <EmptyTitle>Nothing to search yet</EmptyTitle>
                <EmptyDescription>
                  Chats, sources, creations, practice, boards, and files appear here.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </section>
      ) : !search.canSearch ? (
        <Empty className="min-h-72">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchIcon aria-hidden />
            </EmptyMedia>
            <EmptyTitle>Keep typing</EmptyTitle>
            <EmptyDescription>
              Enter at least {NOTEBOOK_SEARCH_MIN_QUERY_LENGTH} characters to search.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : search.searching ? (
        <RightWorkspaceListSkeleton count={5} />
      ) : search.results.length > 0 ? (
        <div className="flex flex-col gap-2">
          {searchIncomplete ? (
            <p className="px-1 text-xs text-text-weaker">
              {search.failedProviders.length > 0
                ? "Some result types could not be searched."
                : "Showing the best matches from a bounded file scan."}
            </p>
          ) : null}
          <RightWorkspaceVirtualList
            items={search.results}
            scrollElement={scrollElement}
            getKey={(result) => result.id}
            estimateSize={searchResultEstimate}
            renderItem={renderResult}
          />
        </div>
      ) : (
        <Empty className="min-h-72">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchIcon aria-hidden />
            </EmptyMedia>
            <EmptyTitle>
              {searchIncomplete ? "Search incomplete" : "No notebook matches"}
            </EmptyTitle>
            <EmptyDescription>
              {searchIncomplete
                ? "Some result types could not be searched. Try again."
                : "Try another title, filename, or a different result type."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </RightWorkspaceDrawerShell>
  )
}
