import { useLayoutEffect, type RefObject } from "react"
import type { ResizablePanelHandle } from "@buddy/ui"

const PANEL_SIZE_SYNC_EPSILON_PX = 0.5

export function useSyncResizablePanelSize(
  panelRef: RefObject<ResizablePanelHandle | null>,
  size: number | undefined,
) {
  useLayoutEffect(() => {
    if (size === undefined) {
      return
    }

    const panel = panelRef.current
    if (!panel) {
      return
    }

    if (Math.abs(panel.getSize().inPixels - size) <= PANEL_SIZE_SYNC_EPSILON_PX) {
      return
    }

    panel.resize(size)
  }, [panelRef, size])
}
