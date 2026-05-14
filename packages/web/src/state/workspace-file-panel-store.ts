import { create } from "zustand"
import { normalizeRelativePath } from "@/lib/workspace-file-paths"

export type WorkspaceFilePanelMediaKind =
  | "image"
  | "pdf"
  | "presentation"
  | "document"
  | "spreadsheet"
  | "video"
  | "audio"
  | "archive"
  | "other"

export type WorkspaceFilePanelRenderMode = "image" | "audio" | "video" | "pdf" | "file"

export type WorkspaceFilePanelItem = {
  path: string
  absolutePath?: string
}

type WorkspaceFilePanelStore = {
  selectedPathByDirectory: Record<string, string | undefined>
  selectedItemByDirectory: Record<string, WorkspaceFilePanelItem | undefined>
  pendingOpenByDirectory: Record<string, WorkspaceFilePanelItem | undefined>
  pendingAutoOpenByDirectory: Record<string, WorkspaceFilePanelItem | undefined>
  openFile: (directory: string, item: WorkspaceFilePanelItem) => void
  queueFileOpen: (
    directory: string,
    item: WorkspaceFilePanelItem,
    input?: { autoOpen?: boolean },
  ) => void
  consumePendingOpen: (directory: string) => WorkspaceFilePanelItem | undefined
  consumePendingAutoOpen: (directory: string) => WorkspaceFilePanelItem | undefined
  closeFile: (directory: string) => void
}

function omitRecordKey<T>(input: Record<string, T>, keyToOmit: string): Record<string, T> {
  const { [keyToOmit]: _omitted, ...rest } = input
  return rest
}

function normalizeWorkspaceFilePanelPath(path: string) {
  return normalizeRelativePath(path).replace(/^(?:\.\/)+/u, "")
}

function normalizeWorkspaceFilePanelItem(item: WorkspaceFilePanelItem): WorkspaceFilePanelItem {
  const absolutePath = item.absolutePath?.trim()
  return {
    path: normalizeWorkspaceFilePanelPath(item.path),
    ...(absolutePath ? { absolutePath } : {}),
  }
}

export const useWorkspaceFilePanelStore = create<WorkspaceFilePanelStore>()((set, get) => ({
  selectedPathByDirectory: {},
  selectedItemByDirectory: {},
  pendingOpenByDirectory: {},
  pendingAutoOpenByDirectory: {},
  openFile(directory, item) {
    const nextItem = normalizeWorkspaceFilePanelItem(item)
    set((state) => ({
      selectedPathByDirectory: {
        ...state.selectedPathByDirectory,
        [directory]: nextItem.path,
      },
      selectedItemByDirectory: {
        ...state.selectedItemByDirectory,
        [directory]: nextItem,
      },
      pendingOpenByDirectory: omitRecordKey(state.pendingOpenByDirectory, directory),
      pendingAutoOpenByDirectory: omitRecordKey(state.pendingAutoOpenByDirectory, directory),
    }))
  },
  queueFileOpen(directory, item, input) {
    const nextItem = normalizeWorkspaceFilePanelItem(item)
    set((state) => ({
      pendingOpenByDirectory: {
        ...state.pendingOpenByDirectory,
        [directory]: nextItem,
      },
      pendingAutoOpenByDirectory:
        input?.autoOpen === true
          ? {
              ...state.pendingAutoOpenByDirectory,
              [directory]: nextItem,
            }
          : state.pendingAutoOpenByDirectory,
    }))
  },
  consumePendingOpen(directory) {
    const item = get().pendingOpenByDirectory[directory]
    if (!item) return undefined

    set((state) => ({
      pendingOpenByDirectory: omitRecordKey(state.pendingOpenByDirectory, directory),
    }))

    return item
  },
  consumePendingAutoOpen(directory) {
    const item = get().pendingAutoOpenByDirectory[directory]
    if (!item) return undefined

    set((state) => ({
      pendingAutoOpenByDirectory: omitRecordKey(state.pendingAutoOpenByDirectory, directory),
    }))

    return item
  },
  closeFile(directory) {
    set((state) => ({
      selectedPathByDirectory: omitRecordKey(state.selectedPathByDirectory, directory),
      selectedItemByDirectory: omitRecordKey(state.selectedItemByDirectory, directory),
      pendingOpenByDirectory: omitRecordKey(state.pendingOpenByDirectory, directory),
      pendingAutoOpenByDirectory: omitRecordKey(state.pendingAutoOpenByDirectory, directory),
    }))
  },
}))
