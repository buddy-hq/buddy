import { useResizablePanelLayout, type ResizablePanelLayoutStorage } from "@buddy/ui"

const memoryResizablePanelLayoutStorage: ResizablePanelLayoutStorage = {
  getItem: () => null,
  setItem: () => undefined,
}

type PersistentResizablePanelLayout = {
  defaultLayout: Record<string, number> | undefined
  onLayoutChange: (layout: Record<string, number>) => void | undefined
  onLayoutChanged: (layout: Record<string, number>) => void | undefined
}

function getResizablePanelLayoutStorage() {
  if (typeof window !== "undefined" && typeof window.localStorage !== "undefined") {
    return window.localStorage
  }

  return memoryResizablePanelLayoutStorage
}

export function usePersistentResizablePanelLayout(input: {
  id: string
  panelIds: string[]
}): PersistentResizablePanelLayout {
  return useResizablePanelLayout({
    id: input.id,
    panelIds: input.panelIds,
    storage: getResizablePanelLayoutStorage(),
  })
}
