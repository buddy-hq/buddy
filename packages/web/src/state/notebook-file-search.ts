import { useCallback, useEffect, useMemo } from "react"
import {
  isCancelledError,
  queryOptions,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query"
import { getBuddyClient, requireBuddyData } from "@/lib/buddy-client"
import { rankNotebookFilePaths } from "@/state/notebook-file-ranking"

/** Queries shorter than two characters stay local. */
export const NOTEBOOK_FILE_SEARCH_MIN_QUERY_LENGTH = 2
/** Maximum candidates returned by the file provider. */
export const NOTEBOOK_FILE_SEARCH_RESULT_LIMIT = 50

const NO_MATCHES: readonly string[] = []

/** Shared key for the notebook's file list, which every file search surface ranks locally. */
export function notebookFileIndexQueryKey(directory: string) {
  return ["notebook-file-index", directory] as const
}

async function fetchNotebookFileIndex(directory: string, signal?: AbortSignal) {
  // Every load is a fresh walk. Cached paths keep rendering while it runs,
  // so freshness never delays results.
  return requireBuddyData(
    await getBuddyClient(directory).find.notebookFileIndex({ directory }, { signal }),
  )
}

/** Stale on arrival: each surface that opens revalidates the list in the background. */
export function notebookFileIndexQueryOptions(directory: string) {
  return queryOptions({
    queryKey: notebookFileIndexQueryKey(directory),
    queryFn: ({ signal }) => fetchNotebookFileIndex(directory, signal),
    staleTime: 0,
    retry: false,
    // The notebook files-changed signal owns refocus reloads; a second refetch would be cancelled mid-walk.
    refetchOnWindowFocus: false,
  })
}

/**
 * Loads the file index in the background when a notebook opens, so even its first search ranks
 * from memory. A warm index is left alone; search surfaces revalidate it when they open.
 */
export function useWarmNotebookFileIndex(directory: string) {
  const queryClient = useQueryClient()
  useEffect(() => {
    if (queryClient.getQueryData(notebookFileIndexQueryKey(directory)) !== undefined) return
    void queryClient.prefetchQuery(notebookFileIndexQueryOptions(directory))
  }, [directory, queryClient])
}

export async function reloadNotebookFileIndex(queryClient: QueryClient, directory: string) {
  const queryKey = notebookFileIndexQueryKey(directory)
  // A first load that is still running would be joined rather than restarted, and its walk
  // may already have passed the change being reported.
  const firstLoadRunning =
    queryClient.getQueryData(queryKey) === undefined && queryClient.isFetching({ queryKey }) > 0
  if (firstLoadRunning) {
    await queryClient.cancelQueries({ queryKey })
    // Invalidation only restarts loads that a surface is watching, so a warm-up restarts here.
    void queryClient.prefetchQuery(notebookFileIndexQueryOptions(directory))
  }
  await queryClient.invalidateQueries({ queryKey })
}

/** One file index and ranking for the explorer, notebook search, and quick open. */
export function useNotebookFileSearch(input: {
  directory: string
  query: string
  enabled?: boolean
}) {
  const queryClient = useQueryClient()
  const query = input.query.trim()
  const enabled = input.enabled ?? true
  const canSearch = enabled && query.length >= NOTEBOOK_FILE_SEARCH_MIN_QUERY_LENGTH
  // Load as soon as the surface opens so the first keystroke already has paths to rank.
  const index = useQuery({ ...notebookFileIndexQueryOptions(input.directory), enabled })
  const matches = useMemo(
    () =>
      canSearch && index.data
        ? rankNotebookFilePaths({
            query,
            paths: index.data.paths,
            limit: NOTEBOOK_FILE_SEARCH_RESULT_LIMIT,
          })
        : NO_MATCHES,
    [canSearch, index.data, query],
  )

  const refresh = useCallback(async () => {
    try {
      await queryClient.refetchQueries(
        { queryKey: notebookFileIndexQueryKey(input.directory), exact: true },
        { throwOnError: true },
      )
    } catch (error) {
      // A change-triggered reload replaced this one; its result arrives the same way.
      if (!isCancelledError(error)) throw error
    }
  }, [input.directory, queryClient])

  return {
    matches,
    partial: canSearch && index.data?.partial === true,
    // Only the very first load blocks results; later reloads run behind cached paths.
    searching: canSearch && index.isPending,
    error: canSearch && index.isError,
    refresh,
  }
}
