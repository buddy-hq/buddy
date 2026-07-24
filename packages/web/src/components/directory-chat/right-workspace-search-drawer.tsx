import { useEffect, useMemo, useRef, useState, type ComponentType } from "react"
import { workspaceDrawerUiKey } from "@/state/workspace-drawer-ui-state"
import { useQuery } from "@tanstack/react-query"
import { isMarkdownBenchPath } from "@buddy/workspace-file-policy"
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
  ShapesIcon,
  type AppIcon,
} from "@/icons/app-icons"
import type { SessionInfo } from "@/state/chat-types"
import {
  NOTEBOOK_SEARCH_DEBOUNCE_MS,
  NOTEBOOK_SEARCH_MAX_QUERY_LENGTH,
  NOTEBOOK_SEARCH_MIN_QUERY_LENGTH,
  NOTEBOOK_SEARCH_RECENT_RESULT_LIMIT,
  NOTEBOOK_SEARCH_RESULT_KINDS,
  type NotebookSearchFilter,
  type NotebookSearchResult,
  type NotebookSearchResultKind,
  type RemoteNotebookSearchResult,
  searchNotebookResults,
  searchRemoteNotebookEntities,
} from "@/state/notebook-search"
import {
  processedResourcesQueryOptions,
  resourceFileExtensionFromFormat,
} from "@/state/resources-query"
import { workspaceObjectsQueryOptions } from "@/state/workspace-objects-query"
import { whiteboardSessionPeekQueryOptions } from "@/components/whiteboard/whiteboard-query"
import { ResourceCover } from "@/components/resources/resource-cover"
import { createBenchObjectTarget } from "@/components/layout/chat-left-sidebar/library-object-selectors"
import {
  notebookSearchResultFromWorkspaceObject,
  notebookSearchTimestampMetadata,
  parseNotebookSearchTimestamp,
} from "./right-workspace-search-results"
import {
  fileExtensionFromPath,
  fileNameFromPath,
  normalizeRelativePath,
} from "@/lib/workspace-file-paths"
import { parseSubagentSession } from "@/lib/session-family"
import type { RightWorkspaceOpenOutcome, RightWorkspaceOpenRequest } from "./right-workspace-open"
import {
  RightWorkspaceDrawerShell,
  RightWorkspaceListRow,
  RightWorkspaceListSkeleton,
  RightWorkspaceSectionLabel,
  RightWorkspaceVirtualList,
} from "./right-workspace-drawer-ui"

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

type RemoteSearchState =
  | { status: "idle" }
  | { status: "loading"; query: string }
  | { status: "ready"; query: string; data: RemoteNotebookSearchResult }

const SEARCH_KIND_DEFINITIONS: SearchKindDefinition[] = [
  { kind: "thread", label: "Chats", icon: MessageSquareTextIcon },
  { kind: "source", label: "Sources", icon: BookOpenIcon },
  { kind: "creation", label: "Creations", icon: ShapesIcon },
  { kind: "practice", label: "Practice", icon: BrainIcon },
  { kind: "board", label: "Boards", icon: PresentationIcon },
  { kind: "file", label: "Files", icon: FileIcon },
]

const EMPTY_REMOTE_SEARCH_RESULT: RemoteNotebookSearchResult = {
  sessions: [],
  files: [],
  fileScanPartial: false,
  failedProviders: ["threads", "files"],
}

function titleCaseStatus(value: string): string {
  return `${value.slice(0, 1).toLocaleUpperCase()}${value.slice(1)}`
}

function isNotebookSearchFilter(value: string): value is NotebookSearchFilter {
  return value === "all" || NOTEBOOK_SEARCH_RESULT_KINDS.some((candidate) => candidate === value)
}

function searchFilterLabel(filter: NotebookSearchFilter): string {
  if (filter === "all") return "All types"
  return (
    SEARCH_KIND_DEFINITIONS.find((definition) => definition.kind === filter)?.label ?? "All types"
  )
}

function resultIcon(kind: NotebookSearchResultKind): ComponentType {
  return SEARCH_KIND_DEFINITIONS.find((definition) => definition.kind === kind)?.icon ?? FileIcon
}

function resourcePath(record: {
  readerPath?: string
  sourceOriginRelpath?: string
  sourceRelpath: string
}): string {
  return record.readerPath ?? record.sourceOriginRelpath ?? record.sourceRelpath
}

function resourceExtension(record: {
  format: string
  readerPath?: string
  sourceOriginRelpath?: string
  sourceRelpath: string
}) {
  const fromFormat = resourceFileExtensionFromFormat(record.format)
  if (fromFormat) return fromFormat
  const extension = fileExtensionFromPath(resourcePath(record))
  return extension === "pdf" || extension === "epub" ? extension : undefined
}

function sessionSearchResult(session: SessionInfo): NotebookSearchResult {
  const updatedAt = session.time.updated ?? session.time.created
  return {
    id: `thread:${session.id}`,
    kind: "thread",
    title: session.title,
    metadata: notebookSearchTimestampMetadata("Chat", updatedAt),
    updatedAtMs: updatedAt,
    target: { type: "thread", sessionID: session.id },
  }
}

function fileSearchResult(path: string): NotebookSearchResult {
  const extension = fileExtensionFromPath(path)
  const name = fileNameFromPath(path)
  const normalizedPath = normalizeRelativePath(path) ?? path
  const parentPath = normalizedPath.includes("/")
    ? normalizedPath.slice(0, normalizedPath.lastIndexOf("/"))
    : "Notebook root"

  if (extension === "pdf" || extension === "epub") {
    return {
      id: `source-file:${normalizedPath}`,
      kind: "source",
      title: name,
      metadata: `${extension.toUpperCase()} · Unprocessed`,
      keywords: normalizedPath,
      updatedAtMs: 0,
      target: {
        type: "resource",
        path: normalizedPath,
        name,
        status: "unprocessed",
      },
      resourceVisual: { extension },
    }
  }

  return {
    id: `file:${normalizedPath}`,
    kind: "file",
    title: name,
    metadata: `File · ${parentPath}`,
    keywords: normalizedPath,
    updatedAtMs: 0,
    target: {
      type: "file",
      path: normalizedPath,
      viewer: isMarkdownBenchPath(normalizedPath) ? "markdown" : "file",
    },
  }
}

export function RightWorkspaceSearchDrawer(props: RightWorkspaceSearchDrawerProps) {
  const requestSequenceRef = useRef(0)
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<NotebookSearchFilter>("all")
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null)
  const [remoteState, setRemoteState] = useState<RemoteSearchState>({ status: "idle" })
  const objectsQuery = useQuery(workspaceObjectsQueryOptions(props.directory))
  const resourcesQuery = useQuery(processedResourcesQueryOptions(props.directory))
  const boardQuery = useQuery({
    ...whiteboardSessionPeekQueryOptions(props.directory, props.sessionID ?? ""),
    enabled: props.sessionID !== undefined,
  })
  const normalizedQuery = query.trim()
  const hasQuery = normalizedQuery.length > 0
  const canSearch = normalizedQuery.length >= NOTEBOOK_SEARCH_MIN_QUERY_LENGTH

  useEffect(() => {
    const requestSequence = requestSequenceRef.current + 1
    requestSequenceRef.current = requestSequence
    if (!canSearch) {
      setRemoteState({ status: "idle" })
      return
    }

    setRemoteState({ status: "loading", query: normalizedQuery })
    const controller = new AbortController()
    const timeout = setTimeout(() => {
      void searchRemoteNotebookEntities({
        directory: props.directory,
        query: normalizedQuery,
        signal: controller.signal,
      })
        .then((data) => {
          if (requestSequenceRef.current !== requestSequence) return
          setRemoteState({ status: "ready", query: normalizedQuery, data })
        })
        .catch(() => {
          if (controller.signal.aborted || requestSequenceRef.current !== requestSequence) {
            return
          }
          setRemoteState({
            status: "ready",
            query: normalizedQuery,
            data: EMPTY_REMOTE_SEARCH_RESULT,
          })
        })
    }, NOTEBOOK_SEARCH_DEBOUNCE_MS)

    return () => {
      clearTimeout(timeout)
      controller.abort()
    }
  }, [canSearch, normalizedQuery, props.directory])

  const localResults = useMemo(() => {
    const objectUpdatedAtByID = new Map(
      (objectsQuery.data?.objects ?? []).map((object) => [
        object.objectID,
        parseNotebookSearchTimestamp(object.updatedAt),
      ]),
    )
    const resourceResults: NotebookSearchResult[] = []
    for (const resource of resourcesQuery.data ?? []) {
      const path = resourcePath(resource)
      const extension = resourceExtension(resource)
      const updatedAt =
        objectUpdatedAtByID.get(resource.objectID) ??
        parseNotebookSearchTimestamp(resource.preparedAt)
      const result: NotebookSearchResult = {
        id: `source:${resource.objectID}`,
        kind: "source",
        title: resource.title ?? resource.alias ?? fileNameFromPath(path),
        metadata: `${resource.format.toUpperCase()} · ${
          resource.author ?? titleCaseStatus(resource.status)
        }`,
        keywords: `${resource.sourceRelpath} ${resource.sourceOriginRelpath ?? ""}`,
        updatedAtMs: updatedAt,
        target: {
          type: "resource",
          path,
          name: fileNameFromPath(path) || resource.alias,
          objectID: resource.objectID,
          status: resource.status,
        },
      }
      if (extension) {
        result.resourceVisual = {
          extension,
          ...(resource.coverRelpath ? { coverRelpath: resource.coverRelpath } : {}),
        }
      }
      resourceResults.push(result)
    }
    const objectResults: NotebookSearchResult[] = (objectsQuery.data?.objects ?? []).flatMap(
      (object) => {
        const result = notebookSearchResultFromWorkspaceObject(object)
        return result ? [result] : []
      },
    )
    const threadResults = props.sessions
      .filter((session) => parseSubagentSession(session).agent === undefined)
      .map(sessionSearchResult)
    const board = boardQuery.data?.currentBoard
    const boardObjectID = boardQuery.data?.objectID
    const boardResults: NotebookSearchResult[] =
      board && boardObjectID
        ? [
            {
              id: `board:${boardObjectID}`,
              kind: "board",
              title: "Notebook board",
              metadata: notebookSearchTimestampMetadata(
                "Board",
                parseNotebookSearchTimestamp(board.updatedAt),
              ),
              updatedAtMs: parseNotebookSearchTimestamp(board.updatedAt),
              target: {
                type: "object",
                kind: "whiteboard",
                objectID: boardObjectID,
              },
            },
          ]
        : []

    return [...resourceResults, ...objectResults, ...threadResults, ...boardResults]
  }, [boardQuery.data, objectsQuery.data?.objects, props.sessions, resourcesQuery.data])

  const processedResourcePaths = useMemo(() => {
    const paths = new Set<string>()
    for (const resource of resourcesQuery.data ?? []) {
      for (const candidate of [
        resource.sourceRelpath,
        resource.sourceOriginRelpath,
        resource.readerPath,
      ]) {
        const normalized = candidate ? normalizeRelativePath(candidate) : undefined
        if (normalized) paths.add(normalized)
      }
    }
    return paths
  }, [resourcesQuery.data])

  const remoteResults = useMemo(() => {
    if (remoteState.status !== "ready" || remoteState.query !== normalizedQuery) return []
    const threadResults = remoteState.data.sessions.map(sessionSearchResult)
    const fileResults = remoteState.data.files
      .map((path) => normalizeRelativePath(path) ?? path)
      .filter((path) => !processedResourcePaths.has(path))
      .map(fileSearchResult)
    return [...threadResults, ...fileResults]
  }, [normalizedQuery, processedResourcePaths, remoteState])

  const visibleResults = useMemo(
    () =>
      canSearch && remoteState.status === "ready" && remoteState.query === normalizedQuery
        ? searchNotebookResults({
            query: normalizedQuery,
            filter,
            results: [...localResults, ...remoteResults],
          })
        : [],
    [canSearch, filter, localResults, normalizedQuery, remoteResults, remoteState],
  )
  const recentResults = useMemo(
    () =>
      searchNotebookResults({
        query: "",
        filter: "all",
        results: localResults,
        limit: NOTEBOOK_SEARCH_RECENT_RESULT_LIMIT,
      }),
    [localResults],
  )
  const isSearching =
    canSearch && (remoteState.status !== "ready" || remoteState.query !== normalizedQuery)
  const remoteData =
    remoteState.status === "ready" && remoteState.query === normalizedQuery
      ? remoteState.data
      : undefined
  const searchIncomplete =
    remoteData !== undefined &&
    (remoteData.fileScanPartial || remoteData.failedProviders.length > 0)

  function openResult(result: NotebookSearchResult) {
    if (result.target.type === "thread") {
      void props.onOpenThread(result.target.sessionID).then((opened) => {
        if (opened) props.onClose()
      })
      return
    }
    if (result.target.type === "resource") {
      void props.onOpen({
        type: "resource",
        directory: props.directory,
        resource: {
          path: result.target.path,
          name: result.target.name,
          ...(result.target.objectID ? { objectID: result.target.objectID } : {}),
          ...(result.target.status ? { status: result.target.status } : {}),
        },
      })
      return
    }
    if (result.target.type === "object") {
      void props.onOpen({
        type: "object",
        directory: props.directory,
        target: createBenchObjectTarget(result.target.kind, result.target.objectID),
      })
      return
    }
    void props.onOpen({
      type: "object",
      directory: props.directory,
      target: {
        type: "workspace-file",
        path: result.target.path,
        viewer: result.target.viewer,
      },
    })
  }

  function renderResult(result: NotebookSearchResult) {
    const Icon = resultIcon(result.kind)
    const presentation = result.resourceVisual
      ? {
          visual: (
            <ResourceCover
              directory={props.directory}
              coverRelpath={result.resourceVisual.coverRelpath}
              title={result.title}
              extension={result.resourceVisual.extension}
              presentation="thumbnail"
              className="h-11 w-8 shrink-0"
            />
          ),
        }
      : { icon: Icon }
    return (
      <RightWorkspaceListRow
        {...presentation}
        title={result.title}
        metadata={result.metadata}
        onClick={() => openResult(result)}
      />
    )
  }

  return (
    <RightWorkspaceDrawerShell
      durableScrollKey={workspaceDrawerUiKey({ directory: props.directory, drawer: "search" })}
      title="Search"
      searchLabel="Search this notebook…"
      searchValue={query}
      searchPending={isSearching}
      searchAutoFocus
      searchMaxLength={NOTEBOOK_SEARCH_MAX_QUERY_LENGTH}
      scrollRef={setScrollElement}
      toolbar={
        hasQuery ? (
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
                    <DropdownMenuRadioItem value="all">All types</DropdownMenuRadioItem>
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
              {isSearching
                ? "Searching…"
                : `${visibleResults.length} ${visibleResults.length === 1 ? "result" : "results"}`}
            </p>
          </div>
        ) : undefined
      }
      onSearchValueChange={setQuery}
      onClose={props.onClose}
    >
      {!hasQuery ? (
        <section className="flex flex-col gap-1">
          <RightWorkspaceSectionLabel>Recent in this notebook</RightWorkspaceSectionLabel>
          {objectsQuery.isPending || resourcesQuery.isPending ? (
            <RightWorkspaceListSkeleton />
          ) : recentResults.length > 0 ? (
            <RightWorkspaceVirtualList
              items={recentResults}
              scrollElement={scrollElement}
              getKey={(result) => result.id}
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
      ) : !canSearch ? (
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
      ) : isSearching ? (
        <RightWorkspaceListSkeleton count={5} />
      ) : visibleResults.length > 0 ? (
        <div className="flex flex-col gap-2">
          {searchIncomplete ? (
            <p className="px-1 text-xs text-text-weaker">
              {remoteData?.failedProviders.length
                ? "Some result types could not be searched."
                : "Showing the best matches from a bounded file scan."}
            </p>
          ) : null}
          <RightWorkspaceVirtualList
            items={visibleResults}
            scrollElement={scrollElement}
            getKey={(result) => result.id}
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
