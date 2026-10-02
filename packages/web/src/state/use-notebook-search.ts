import { useEffect, useMemo, useState, useSyncExternalStore } from "react"
import { useQuery } from "@tanstack/react-query"
import type { SessionInfo } from "@/state/chat-types"
import {
  NOTEBOOK_SEARCH_DEBOUNCE_MS,
  NOTEBOOK_SEARCH_FILTER_ALL,
  NOTEBOOK_SEARCH_MIN_QUERY_LENGTH,
  NOTEBOOK_SEARCH_RECENT_RESULT_LIMIT,
  searchNotebookResults,
  searchNotebookCommands,
  type NotebookSearchCommand,
  type NotebookSearchCommandID,
  searchNotebookThreads,
  type NotebookSearchFilter,
  type NotebookSearchResult,
} from "@/state/notebook-search"
import {
  notebookSearchResultFromFilePath,
  notebookSearchResultFromNote,
  notebookSearchResultFromResource,
  notebookSearchResultFromSession,
  notebookSearchResultFromWorkspaceObject,
  parseNotebookSearchTimestamp,
} from "@/state/notebook-search-results"
import {
  findProcessedResourceByPath,
  processedResourcesQueryOptions,
} from "@/state/resources-query"
import { workspaceObjectsQueryOptions } from "@/state/workspace-objects-query"
import { parseSubagentSession, sessionTitlesByID } from "@/lib/session-family"
import { normalizeRelativePath } from "@/lib/workspace-file-paths"
import { notesLibraryQueryOptions } from "@/features/notes/queries"
import { useNotebookFileSearch } from "@/state/notebook-file-search"
import { useDirectoryWorkspaceOptional } from "@/components/directory-chat/directory-workspace-context"
import {
  useInAppBrowserTabsStore,
  type InAppBrowserTabRuntime,
} from "@/state/in-app-browser-tabs-store"
import { benchTabFallbackTitle, type BenchTab } from "@/lib/bench-tabs"
import { useInAppBrowserHistoryStore } from "@/state/in-app-browser-history-store"
import {
  normalizeInAppBrowserHistoryUrl,
  type InAppBrowserHistoryEntry,
} from "@/lib/in-app-browser-history"

const NO_OPEN_TABS: readonly BenchTab[] = []
const NO_BROWSER_RUNTIME: Record<string, InAppBrowserTabRuntime> = {}
const NO_BROWSER_HISTORY: readonly InAppBrowserHistoryEntry[] = []
const NO_SUBSCRIBE = () => () => undefined

function openTabResult(
  tab: BenchTab,
  titles: ReadonlyMap<string, string>,
  sessions: ReadonlyMap<string, string>,
  browserTitles: ReadonlyMap<string, string>,
  resourceVisuals: ReadonlyMap<string, NotebookSearchResult["resourceVisual"]>,
  browserVisits: ReadonlyMap<string, number>,
): NotebookSearchResult {
  const target = tab.target
  const kind: NotebookSearchResult["kind"] =
    target.type === "browser"
      ? "tab"
      : target.type === "session"
        ? "thread"
        : target.type === "workspace-file"
          ? target.root === "notes"
            ? "note"
            : "file"
          : target.ref.kind === "resource"
            ? "source"
            : target.ref.kind === "whiteboard"
              ? "board"
              : target.ref.kind === "question-set" || target.ref.kind === "flashcard-deck"
                ? "practice"
                : "creation"
  const title =
    target.type === "object"
      ? (titles.get(target.ref.objectID) ?? benchTabFallbackTitle(target))
      : target.type === "session"
        ? (sessions.get(target.sessionID) ?? benchTabFallbackTitle(target))
        : target.type === "browser"
          ? (browserTitles.get(target.tabID) ?? benchTabFallbackTitle(target))
          : benchTabFallbackTitle(target)
  const resourceVisual =
    target.type === "object" && target.ref.kind === "resource"
      ? resourceVisuals.get(target.ref.objectID)
      : undefined
  const result: NotebookSearchResult = {
    id: `open-tab:${tab.key}`,
    kind,
    title,
    metadata:
      target.type === "browser"
        ? (browserTitles.get(`${target.tabID}:url`) ?? target.url)
        : "Open tab",
    // A page's last visit; catalog items take their own time in `mergeCatalogIntoOpenTabs`. Files
    // and notes have no known time, so they rank after dated items.
    updatedAtMs:
      target.type === "browser"
        ? (browserVisits.get(
            normalizeInAppBrowserHistoryUrl(
              browserTitles.get(`${target.tabID}:url`) ?? target.url,
            ) ?? "",
          ) ?? 0)
        : 0,
    target: { type: "open-tab", tabKey: tab.key, target },
  }
  if (resourceVisual) result.resourceVisual = resourceVisual
  return result
}

function matchingOpenTab(
  result: NotebookSearchResult,
  tabs: readonly BenchTab[],
): BenchTab | undefined {
  return tabs.find(({ target }) => {
    const searchTarget = result.target
    if (target.type === "object") {
      return (
        (searchTarget.type === "object" || searchTarget.type === "resource") &&
        target.ref.objectID === searchTarget.objectID
      )
    }
    if (target.type === "workspace-file") {
      return (
        (searchTarget.type === "file" &&
          target.root !== "notes" &&
          target.path === searchTarget.path) ||
        (searchTarget.type === "note" &&
          target.root === "notes" &&
          ((target.id !== undefined &&
            searchTarget.id !== undefined &&
            target.id === searchTarget.id) ||
            target.path === searchTarget.relativePath))
      )
    }
    return (
      target.type === "session" &&
      searchTarget.type === "thread" &&
      target.sessionID === searchTarget.sessionID
    )
  })
}

/** Keep provider-only matches searchable while opening the existing tab. */
export function promoteNotebookSearchResultToOpenTab(
  result: NotebookSearchResult,
  tabs: readonly BenchTab[],
): NotebookSearchResult {
  const tab = matchingOpenTab(result, tabs)
  if (!tab) return result
  return {
    ...result,
    id: `open-tab:${tab.key}`,
    metadata: "Open tab",
    target: { type: "open-tab", tabKey: tab.key, target: tab.target },
  }
}

export function mergeCatalogIntoOpenTabs(
  tabResults: readonly NotebookSearchResult[],
  catalogResults: readonly NotebookSearchResult[],
  tabs: readonly BenchTab[],
): NotebookSearchResult[] {
  const catalogTextByTabKey = new Map<string, string>()
  const catalogUpdatedAtByTabKey = new Map<string, number>()
  const unopenedResults = catalogResults.filter((result) => {
    const tab = matchingOpenTab(result, tabs)
    if (!tab) return true
    catalogTextByTabKey.set(
      tab.key,
      [catalogTextByTabKey.get(tab.key), result.title, result.metadata, result.keywords]
        .filter(Boolean)
        .join(" "),
    )
    catalogUpdatedAtByTabKey.set(
      tab.key,
      Math.max(catalogUpdatedAtByTabKey.get(tab.key) ?? 0, result.updatedAtMs),
    )
    return false
  })
  const openedResults = tabResults.map((result) => {
    if (result.target.type !== "open-tab") return result
    const catalogText = catalogTextByTabKey.get(result.target.tabKey)
    const updatedAtMs = Math.max(
      result.updatedAtMs,
      catalogUpdatedAtByTabKey.get(result.target.tabKey) ?? 0,
    )
    return catalogText || updatedAtMs !== result.updatedAtMs
      ? Object.assign(
          { ...result, updatedAtMs },
          catalogText ? { keywords: catalogText } : undefined,
        )
      : result
  })
  return [...openedResults, ...unopenedResults]
}

export type NotebookSearchInput = {
  directory: string
  query: string
  filter: NotebookSearchFilter
  /**
   * The chats this surface can open. Omitted where it cannot open one at all —
   * a Bench tab, for instance — which also stops the remote thread provider.
   */
  sessions?: readonly SessionInfo[]
  recentLimit?: number
  /** Off while the surface is closed, so nothing is fetched behind it. */
  enabled?: boolean
  /** Only actions this surface can execute are included. */
  commands?: readonly NotebookSearchCommandID[]
}

export type NotebookSearch = {
  /** The query with surrounding whitespace removed — what actually got searched. */
  query: string
  hasQuery: boolean
  /** The query is long enough to search with. */
  canSearch: boolean
  /** A search is in flight, or its results are for an older query. */
  searching: boolean
  /** The notebook catalog behind recents has not loaded yet. */
  catalogPending: boolean
  /** Resource identity is needed before an unprocessed PDF or EPUB can be offered. */
  resourcesPending: boolean
  results: NotebookSearchResult[]
  commands: NotebookSearchCommand[]
  recents: NotebookSearchResult[]
  /** Some provider failed or the file scan was bounded, so results may be short. */
  incomplete: boolean
  filesSearching: boolean
  filesPartial: boolean
  filesError: boolean
  refreshFiles: () => Promise<void>
  failedProviders: Array<"threads" | "files" | "notes">
}

/**
 * One notebook search, shared by every surface that offers one.
 *
 * The notebook catalog (objects, processed sources, and the file index) is scored
 * locally on every keystroke while chat and Notes content come from a debounced
 * remote pass; both halves are ranked together by `searchNotebookResults`. Recents are the same catalog with
 * an empty query, so a surface never grows a second, differently-ordered list.
 */
export function useNotebookSearch(input: NotebookSearchInput): NotebookSearch {
  const workspace = useDirectoryWorkspaceOptional()
  const openTabs = useSyncExternalStore(
    workspace?.store.subscribe ?? NO_SUBSCRIBE,
    () => {
      if (!workspace) return NO_OPEN_TABS
      const state = workspace.store.getState()
      return state.slots[state.activeChatKey]?.tabs ?? NO_OPEN_TABS
    },
    () => NO_OPEN_TABS,
  )
  const enabled = input.enabled ?? true
  // A closed surface (the composer between @mentions) must not re-render on every tab title or favicon update.
  const browserRuntime = useInAppBrowserTabsStore((state) =>
    enabled ? state.byTabID : NO_BROWSER_RUNTIME,
  )
  const browserHistory = useInAppBrowserHistoryStore((state) =>
    enabled ? (state.byDirectory[input.directory] ?? NO_BROWSER_HISTORY) : NO_BROWSER_HISTORY,
  )
  const includeThreads =
    input.sessions !== undefined && (input.filter === "all" || input.filter === "thread")
  const includeNotes = input.filter === "all" || input.filter === "note"
  // Catalogs render from cache immediately and revalidate whenever a search surface opens,
  // so something the agent just created joins the results without a wait.
  const objectsQuery = useQuery({
    ...workspaceObjectsQueryOptions(input.directory),
    enabled,
    staleTime: 0,
  })
  const resourcesQuery = useQuery({
    ...processedResourcesQueryOptions(input.directory),
    enabled,
    staleTime: 0,
  })
  const normalizedQuery = input.query.trim()
  const hasQuery = normalizedQuery.length > 0
  const canSearch = enabled && normalizedQuery.length >= NOTEBOOK_SEARCH_MIN_QUERY_LENGTH
  const fileSearch = useNotebookFileSearch({
    directory: input.directory,
    query: normalizedQuery,
    enabled:
      enabled && (input.filter === "all" || input.filter === "file" || input.filter === "source"),
  })
  const [debouncedQuery, setDebouncedQuery] = useState("")

  useEffect(() => {
    const timeout = setTimeout(
      () => setDebouncedQuery(normalizedQuery),
      NOTEBOOK_SEARCH_DEBOUNCE_MS,
    )
    return () => clearTimeout(timeout)
  }, [normalizedQuery])
  const currentQuery = debouncedQuery === normalizedQuery
  const threadQuery = useQuery({
    queryKey: ["notebook-thread-search", input.directory, debouncedQuery],
    queryFn: ({ signal }) =>
      searchNotebookThreads({ directory: input.directory, query: debouncedQuery, signal }),
    enabled: canSearch && currentQuery && includeThreads,
    staleTime: 30_000,
    retry: false,
  })
  // Notes use the exact provider and cache used by the Notes drawer. Saves,
  // captures, and deletions invalidate both surfaces together.
  const notesQuery = useQuery({
    ...notesLibraryQueryOptions(input.directory, debouncedQuery),
    enabled: canSearch && currentQuery && includeNotes,
    retry: false,
  })

  const sessions = input.sessions
  const localResults = useMemo(() => {
    const objectTitles = new Map(
      (objectsQuery.data?.objects ?? []).map((object) => [object.objectID, object.title]),
    )
    const sessionTitles = sessionTitlesByID(sessions ?? [])
    const browserTitles = new Map<string, string>()
    for (const tab of openTabs) {
      if (tab.target.type !== "browser") continue
      const runtime = browserRuntime[tab.target.tabID]
      if (runtime?.title) browserTitles.set(tab.target.tabID, runtime.title)
      if (runtime?.url) browserTitles.set(`${tab.target.tabID}:url`, runtime.url)
    }
    const objectUpdatedAtByID = new Map(
      (objectsQuery.data?.objects ?? []).map((object) => [
        object.objectID,
        parseNotebookSearchTimestamp(object.updatedAt),
      ]),
    )
    const resourceResults = (resourcesQuery.data ?? []).map((resource) =>
      notebookSearchResultFromResource(resource, objectUpdatedAtByID.get(resource.objectID)),
    )
    const resourceVisuals = new Map(
      resourceResults.flatMap((result) =>
        result.target.type === "resource" && result.target.objectID
          ? [[result.target.objectID, result.resourceVisual] as const]
          : [],
      ),
    )
    const browserVisits = new Map<string, number>()
    for (const visit of browserHistory) {
      browserVisits.set(visit.url, Math.max(browserVisits.get(visit.url) ?? 0, visit.visitedAt))
    }
    const tabResults = openTabs.map((tab) =>
      openTabResult(
        tab,
        objectTitles,
        sessionTitles,
        browserTitles,
        resourceVisuals,
        browserVisits,
      ),
    )
    const objectResults = (objectsQuery.data?.objects ?? []).flatMap((object) => {
      const result = notebookSearchResultFromWorkspaceObject(object)
      return result ? [result] : []
    })
    const threadResults = (sessions ?? [])
      .filter((session) => parseSubagentSession(session).agent === undefined)
      .map(notebookSearchResultFromSession)
    return mergeCatalogIntoOpenTabs(
      tabResults,
      [...resourceResults, ...objectResults, ...threadResults],
      openTabs,
    )
  }, [
    browserHistory,
    browserRuntime,
    objectsQuery.data?.objects,
    openTabs,
    resourcesQuery.data,
    sessions,
  ])

  const remoteThreads = currentQuery && includeThreads ? threadQuery.data : undefined
  const remoteNotes = currentQuery && includeNotes ? notesQuery.data?.notes : undefined
  const matchedFilePaths = useMemo(
    () => fileSearch.matches.map((path) => normalizeRelativePath(path) ?? path),
    [fileSearch.matches],
  )
  const remoteResults = useMemo(() => {
    const threadResults = (remoteThreads ?? []).map(notebookSearchResultFromSession)
    const fileResults = matchedFilePaths.map((path) => {
      const processed = findProcessedResourceByPath(resourcesQuery.data ?? [], path)
      if (!processed) return notebookSearchResultFromFilePath(path)
      const result = notebookSearchResultFromResource(processed)
      result.keywords = path
      result.matchTitle = path.split("/").at(-1)
      return result
    })
    const noteResults = (remoteNotes ?? []).map((note) => {
      const result = notebookSearchResultFromNote(note)
      result.providerMatchedQuery = normalizedQuery
      return result
    })
    return [...threadResults, ...fileResults, ...noteResults].map((result) =>
      promoteNotebookSearchResultToOpenTab(result, openTabs),
    )
  }, [matchedFilePaths, normalizedQuery, openTabs, remoteThreads, remoteNotes, resourcesQuery.data])

  const results = useMemo(() => {
    if (!canSearch) return []
    // A Media object that only wraps a notebook file gives way to that file's own hit.
    const filePaths = new Set(matchedFilePaths)
    const catalogResults = localResults.filter(
      (result) => result.presentsFile === undefined || !filePaths.has(result.presentsFile),
    )
    return searchNotebookResults({
      query: normalizedQuery,
      filter: input.filter,
      results: [...catalogResults, ...remoteResults],
    })
  }, [canSearch, input.filter, localResults, matchedFilePaths, normalizedQuery, remoteResults])

  const recentLimit = input.recentLimit ?? NOTEBOOK_SEARCH_RECENT_RESULT_LIMIT
  const recents = useMemo(
    () =>
      searchNotebookResults({
        query: "",
        filter: NOTEBOOK_SEARCH_FILTER_ALL,
        results: localResults,
        limit: recentLimit,
      }),
    [localResults, recentLimit],
  )

  const failedProviders: NotebookSearch["failedProviders"] = []
  if (currentQuery && includeThreads && threadQuery.isError) failedProviders.push("threads")
  if (currentQuery && includeNotes && notesQuery.isError) failedProviders.push("notes")
  if (fileSearch.error) failedProviders.push("files")
  return {
    commands: enabled
      ? searchNotebookCommands({
          query: normalizedQuery,
          filter: input.filter,
          available: input.commands ?? [],
        })
      : [],
    query: normalizedQuery,
    hasQuery,
    canSearch,
    // The debounce only matters while a remote provider (chats or Notes) may still add a stronger match.
    searching:
      canSearch &&
      ((!currentQuery && (includeThreads || includeNotes)) ||
        fileSearch.searching ||
        (includeThreads && threadQuery.isPending) ||
        (includeNotes && notesQuery.isPending)),
    catalogPending: enabled && (objectsQuery.isPending || resourcesQuery.isPending),
    resourcesPending: enabled && resourcesQuery.isPending,
    results,
    recents,
    incomplete: fileSearch.partial || failedProviders.length > 0,
    filesSearching: fileSearch.searching,
    filesPartial: fileSearch.partial,
    filesError: fileSearch.error,
    refreshFiles: fileSearch.refresh,
    failedProviders,
  }
}
