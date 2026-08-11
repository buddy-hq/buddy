import { useEffect, useMemo, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import type { SessionInfo } from "@/state/chat-types"
import {
  NOTEBOOK_SEARCH_DEBOUNCE_MS,
  NOTEBOOK_SEARCH_FILTER_ALL,
  NOTEBOOK_SEARCH_MIN_QUERY_LENGTH,
  NOTEBOOK_SEARCH_RECENT_RESULT_LIMIT,
  searchNotebookResults,
  searchRemoteNotebookEntities,
  type NotebookSearchFilter,
  type NotebookSearchResult,
  type RemoteNotebookSearchResult,
} from "@/state/notebook-search"
import {
  notebookSearchResultFromFilePath,
  notebookSearchResultFromResource,
  notebookSearchResultFromSession,
  notebookSearchResultFromWorkspaceObject,
  parseNotebookSearchTimestamp,
} from "@/state/notebook-search-results"
import { processedResourcesQueryOptions } from "@/state/resources-query"
import { workspaceObjectsQueryOptions } from "@/state/workspace-objects-query"
import { parseSubagentSession } from "@/lib/session-family"
import { normalizeRelativePath } from "@/lib/workspace-file-paths"

type RemoteSearchState =
  | { status: "idle" }
  | { status: "loading"; query: string }
  | { status: "ready"; query: string; data: RemoteNotebookSearchResult }

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
  results: NotebookSearchResult[]
  recents: NotebookSearchResult[]
  /** Some provider failed or the file scan was bounded, so results may be short. */
  incomplete: boolean
  failedProviders: RemoteNotebookSearchResult["failedProviders"]
}

const EMPTY_REMOTE_SEARCH_RESULT: RemoteNotebookSearchResult = {
  sessions: [],
  files: [],
  fileScanPartial: false,
  failedProviders: ["threads", "files"],
}

const NO_FAILED_PROVIDERS: RemoteNotebookSearchResult["failedProviders"] = []

/**
 * One notebook search, shared by every surface that offers one.
 *
 * The notebook catalog (objects and processed sources) is scored locally while
 * chats and unindexed files come from a debounced remote pass; both halves are
 * ranked together by `searchNotebookResults`. Recents are the same catalog with
 * an empty query, so a surface never grows a second, differently-ordered list.
 */
export function useNotebookSearch(input: NotebookSearchInput): NotebookSearch {
  const requestSequenceRef = useRef(0)
  const [remoteState, setRemoteState] = useState<RemoteSearchState>({ status: "idle" })
  const enabled = input.enabled ?? true
  const includeThreads = input.sessions !== undefined
  const objectsQuery = useQuery({
    ...workspaceObjectsQueryOptions(input.directory),
    enabled,
  })
  const resourcesQuery = useQuery({
    ...processedResourcesQueryOptions(input.directory),
    enabled,
  })
  const normalizedQuery = input.query.trim()
  const hasQuery = normalizedQuery.length > 0
  const canSearch = enabled && normalizedQuery.length >= NOTEBOOK_SEARCH_MIN_QUERY_LENGTH

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
        directory: input.directory,
        query: normalizedQuery,
        signal: controller.signal,
        includeThreads,
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
  }, [canSearch, includeThreads, input.directory, normalizedQuery])

  const sessions = input.sessions
  const localResults = useMemo(() => {
    const objectUpdatedAtByID = new Map(
      (objectsQuery.data?.objects ?? []).map((object) => [
        object.objectID,
        parseNotebookSearchTimestamp(object.updatedAt),
      ]),
    )
    const resourceResults = (resourcesQuery.data ?? []).map((resource) =>
      notebookSearchResultFromResource(resource, objectUpdatedAtByID.get(resource.objectID)),
    )
    const objectResults = (objectsQuery.data?.objects ?? []).flatMap((object) => {
      const result = notebookSearchResultFromWorkspaceObject(object)
      return result ? [result] : []
    })
    const threadResults = (sessions ?? [])
      .filter((session) => parseSubagentSession(session).agent === undefined)
      .map(notebookSearchResultFromSession)
    return [...resourceResults, ...objectResults, ...threadResults]
  }, [objectsQuery.data?.objects, resourcesQuery.data, sessions])

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

  const remoteData =
    remoteState.status === "ready" && remoteState.query === normalizedQuery
      ? remoteState.data
      : undefined

  const remoteResults = useMemo(() => {
    if (!remoteData) return []
    const threadResults = remoteData.sessions.map(notebookSearchResultFromSession)
    const fileResults = remoteData.files
      .map((path) => normalizeRelativePath(path) ?? path)
      .filter((path) => !processedResourcePaths.has(path))
      .map(notebookSearchResultFromFilePath)
    return [...threadResults, ...fileResults]
  }, [processedResourcePaths, remoteData])

  const results = useMemo(
    () =>
      canSearch && remoteData
        ? searchNotebookResults({
            query: normalizedQuery,
            filter: input.filter,
            results: [...localResults, ...remoteResults],
          })
        : [],
    [canSearch, input.filter, localResults, normalizedQuery, remoteData, remoteResults],
  )

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

  return {
    query: normalizedQuery,
    hasQuery,
    canSearch,
    searching: canSearch && remoteData === undefined,
    catalogPending: enabled && (objectsQuery.isPending || resourcesQuery.isPending),
    results,
    recents,
    incomplete:
      remoteData !== undefined &&
      (remoteData.fileScanPartial || remoteData.failedProviders.length > 0),
    failedProviders: remoteData?.failedProviders ?? NO_FAILED_PROVIDERS,
  }
}
