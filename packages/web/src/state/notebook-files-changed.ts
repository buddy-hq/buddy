import { useEffect } from "react"
import { useQueryClient, type QueryClient } from "@tanstack/react-query"
import { probeWorkspaceFileRaw } from "@/lib/workspace-file-media"
import { invalidateWorkspaceFileMetadata } from "@/state/bench-surface-query"
import { reloadNotebookFileIndex } from "@/state/notebook-file-search"
import { invalidateProjectExplorerListings } from "@/state/project-explorer-query"
import { invalidateResourceDiscovery } from "@/state/resources-query"

const NOTEBOOK_FILES_CHANGED_WINDOW_MS = 1_000

type NotebookFilesChangedWindow = { again: boolean; resources: boolean }
type NotebookFilesChangedListener = () => void

const changeWindowsByClient = new WeakMap<QueryClient, Map<string, NotebookFilesChangedWindow>>()
const listenersByDirectory = new Map<string, Set<NotebookFilesChangedListener>>()

function refreshNotebookFileViews(
  queryClient: QueryClient,
  directory: string,
  resources: boolean,
): Promise<void> {
  const refreshed = Promise.all([
    reloadNotebookFileIndex(queryClient, directory),
    invalidateProjectExplorerListings(queryClient, directory),
    resources ? invalidateResourceDiscovery(queryClient, directory) : undefined,
    invalidateWorkspaceFileMetadata(queryClient, directory),
  ]).then(() => undefined)
  // One failing subscriber must not keep the others, or the views above, from refreshing.
  for (const listener of listenersByDirectory.get(directory) ?? []) {
    try {
      listener()
    } catch (error) {
      console.error("A notebook files-changed listener failed", error)
    }
  }
  return refreshed
}

/**
 * `resources: false` skips the PDF and EPUB rescan for changes that cannot add or remove one,
 * such as text edits.
 */
export function notifyNotebookFilesChanged(
  queryClient: QueryClient,
  directory: string,
  options?: { resources?: boolean },
): Promise<void> {
  const resources = options?.resources ?? true
  const changeWindows =
    changeWindowsByClient.get(queryClient) ?? new Map<string, NotebookFilesChangedWindow>()
  changeWindowsByClient.set(queryClient, changeWindows)
  const openWindow = changeWindows.get(directory)
  if (openWindow) {
    openWindow.again = true
    openWindow.resources ||= resources
    return Promise.resolve()
  }
  const changeWindow: NotebookFilesChangedWindow = { again: false, resources: false }
  changeWindows.set(directory, changeWindow)
  const closeWindow = () => {
    if (!changeWindow.again) {
      changeWindows.delete(directory)
      return
    }
    const trailingResources = changeWindow.resources
    changeWindow.again = false
    changeWindow.resources = false
    void refreshNotebookFileViews(queryClient, directory, trailingResources)
    setTimeout(closeWindow, NOTEBOOK_FILES_CHANGED_WINDOW_MS)
  }
  setTimeout(closeWindow, NOTEBOOK_FILES_CHANGED_WINDOW_MS)
  return refreshNotebookFileViews(queryClient, directory, resources)
}

export function subscribeNotebookFilesChanged(
  directory: string,
  listener: NotebookFilesChangedListener,
): () => void {
  const listeners = listenersByDirectory.get(directory) ?? new Set<NotebookFilesChangedListener>()
  listenersByDirectory.set(directory, listeners)
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) listenersByDirectory.delete(directory)
  }
}

export function useNotebookFilesChangedListener(
  directory: string | undefined,
  listener: NotebookFilesChangedListener,
) {
  useEffect(() => {
    if (!directory) return
    return subscribeNotebookFilesChanged(directory, listener)
  }, [directory, listener])
}

export function useNotifyNotebookFilesChangedOnWindowFocus(directory: string | undefined) {
  const queryClient = useQueryClient()
  useEffect(() => {
    if (!directory) return
    const notify = () => void notifyNotebookFilesChanged(queryClient, directory)
    window.addEventListener("focus", notify)
    return () => window.removeEventListener("focus", notify)
  }, [directory, queryClient])
}

export async function confirmNotebookFileAvailable(input: {
  queryClient: QueryClient
  directory: string
  path: string
}): Promise<boolean> {
  const probe = await probeWorkspaceFileRaw({ directory: input.directory, path: input.path })
  if (probe.status !== "missing") return true
  void notifyNotebookFilesChanged(input.queryClient, input.directory)
  return false
}
