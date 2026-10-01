import { useCallback, useEffect, useMemo } from "react"
import {
  isCancelledError,
  queryOptions,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query"
import { getBuddyClient, requireBuddyData } from "@/lib/buddy-client"
import { buildProjectFileRawParameters } from "@/lib/project-file-raw-url"
import { rankNotebookFilePaths } from "@/state/notebook-file-ranking"

/** Queries shorter than two characters stay local. */
export const NOTEBOOK_FILE_SEARCH_MIN_QUERY_LENGTH = 2
/** Maximum candidates returned by the file provider. */
export const NOTEBOOK_FILE_SEARCH_RESULT_LIMIT = 50

const NO_MATCHES: readonly string[] = []
/** After a reload, later changes in this window share one more reload at its end. */
const NOTEBOOK_FILE_INDEX_RELOAD_WINDOW_MS = 1_000

type NotebookFileIndexReloadWindow = { again: boolean }
const reloadWindowsByClient = new WeakMap<QueryClient, Map<string, NotebookFileIndexReloadWindow>>()
// Every open search hears the same focus event; the first one to handle it reloads for all.
const focusReloads = new WeakMap<Event, Set<string>>()

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
    // The window focus listener below owns refocus reloads; a second refetch would be cancelled mid-walk.
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

async function reloadNotebookFileIndex(queryClient: QueryClient, directory: string) {
  const queryKey = notebookFileIndexQueryKey(directory)
  // A first load that is still running would be joined rather than restarted, and its walk
  // may already have passed the change being reported.
  if (queryClient.getQueryData(queryKey) === undefined)
    await queryClient.cancelQueries({ queryKey })
  await queryClient.invalidateQueries({ queryKey })
}

/**
 * Reloads the file list wherever search is open; closed surfaces reload when they next open.
 * A burst of changes, such as a bulk delete or a busy agent turn, reloads at once and then at
 * most once per window, always ending with a reload that sees the last change.
 */
export function invalidateNotebookFileIndex(
  queryClient: QueryClient,
  directory: string,
): Promise<void> {
  const reloadWindows =
    reloadWindowsByClient.get(queryClient) ?? new Map<string, NotebookFileIndexReloadWindow>()
  reloadWindowsByClient.set(queryClient, reloadWindows)
  const openWindow = reloadWindows.get(directory)
  if (openWindow) {
    openWindow.again = true
    return Promise.resolve()
  }
  const reloadWindow: NotebookFileIndexReloadWindow = { again: false }
  reloadWindows.set(directory, reloadWindow)
  const closeWindow = () => {
    if (!reloadWindow.again) {
      reloadWindows.delete(directory)
      return
    }
    reloadWindow.again = false
    void reloadNotebookFileIndex(queryClient, directory)
    setTimeout(closeWindow, NOTEBOOK_FILE_INDEX_RELOAD_WINDOW_MS)
  }
  setTimeout(closeWindow, NOTEBOOK_FILE_INDEX_RELOAD_WINDOW_MS)
  return reloadNotebookFileIndex(queryClient, directory)
}

/** Whether a notebook file still exists; unknown when the check itself fails. */
async function notebookFileExists(input: {
  directory: string
  path: string
}): Promise<boolean | undefined> {
  try {
    const response = await getBuddyClient(input.directory).headApiFileRawFileName(
      buildProjectFileRawParameters(input.path),
    )
    if (response.response?.ok) return true
    return response.response?.status === 404 ? false : undefined
  } catch {
    return undefined
  }
}

/**
 * False only when a file offered from the cached index is gone, which also drops it from
 * the index. A failed check never blocks opening.
 */
export async function confirmNotebookFileAvailable(input: {
  queryClient: QueryClient
  directory: string
  path: string
}): Promise<boolean> {
  if ((await notebookFileExists(input)) !== false) return true
  void invalidateNotebookFileIndex(input.queryClient, input.directory)
  return false
}

export function notebookFileMissingMessage(path: string): string {
  return `${path.split("/").at(-1) ?? path} was moved or deleted.`
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
  useEffect(() => {
    if (!enabled) return
    // Files made in other apps send no event, so returning to Buddy reloads the index.
    const reload = (event: Event) => {
      const reloaded = focusReloads.get(event) ?? new Set<string>()
      focusReloads.set(event, reloaded)
      if (reloaded.has(input.directory)) return
      reloaded.add(input.directory)
      void invalidateNotebookFileIndex(queryClient, input.directory)
    }
    window.addEventListener("focus", reload)
    return () => window.removeEventListener("focus", reload)
  }, [enabled, input.directory, queryClient])
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
