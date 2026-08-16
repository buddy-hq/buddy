import { useCallback, useLayoutEffect, useRef } from "react"
import {
  readWorkspaceDrawerUiState,
  writeWorkspaceDrawerUiState,
} from "@/state/workspace-drawer-ui-state"

const SCROLL_RESTORE_TOLERANCE_PX = 0.5

/**
 * Restores and records a scroll container's position across unmounts.
 *
 * Restoration cannot be a single assignment on mount. Drawers deliberately mount empty and load
 * their listings asynchronously, so at that moment the container has no scroll height and the
 * browser clamps any offset to zero. The saved offset is therefore held as an *intent* and
 * reapplied as content arrives, until it lands or the container proves it cannot reach it.
 *
 * The same reasoning applies on the way out: a container that is still empty must not overwrite a
 * good saved offset with the zero it happens to be showing.
 */
export function useDurableScrollTop(key: string) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const pendingRestoreRef = useRef<number | undefined>(undefined)
  const restoredRef = useRef(false)
  const lastProgrammaticScrollTopRef = useRef<number | undefined>(undefined)

  useLayoutEffect(() => {
    restoredRef.current = false
    lastProgrammaticScrollTopRef.current = undefined
    pendingRestoreRef.current = key ? readWorkspaceDrawerUiState(key)?.scrollTop : undefined
    const container = containerRef.current
    if (!container || !key) return
    let resizeObserver: ResizeObserver | undefined
    let mutationObserver: MutationObserver | undefined

    function applyPendingRestore(): void {
      const target = pendingRestoreRef.current
      const element = containerRef.current
      if (target === undefined || !element) return
      element.scrollTop = target
      if (Math.abs(element.scrollTop - target) <= SCROLL_RESTORE_TOLERANCE_PX) {
        pendingRestoreRef.current = undefined
        restoredRef.current = true
        lastProgrammaticScrollTopRef.current = undefined
        resizeObserver?.disconnect()
        mutationObserver?.disconnect()
        return
      }
      // The browser clamps to the current scroll height, so a short content tree silently lands
      // somewhere else. Only treat the restore as done once the offset actually took.
      lastProgrammaticScrollTopRef.current = element.scrollTop
    }

    applyPendingRestore()

    // ResizeObserver catches an existing list growing; MutationObserver catches an empty/skeleton
    // tree being replaced with the real list. Both are needed because the scroll container itself
    // usually keeps a fixed height while only its scrollHeight changes.
    resizeObserver =
      pendingRestoreRef.current !== undefined && "ResizeObserver" in globalThis
        ? new globalThis.ResizeObserver(applyPendingRestore)
        : undefined
    resizeObserver?.observe(container)
    for (const child of container.children) {
      resizeObserver?.observe(child)
    }
    mutationObserver =
      pendingRestoreRef.current !== undefined && "MutationObserver" in globalThis
        ? new globalThis.MutationObserver((records) => {
            for (const record of records) {
              for (const addedNode of record.addedNodes) {
                if (addedNode instanceof Element) resizeObserver?.observe(addedNode)
              }
            }
            applyPendingRestore()
          })
        : undefined
    mutationObserver?.observe(container, {
      childList: true,
      subtree: true,
    })

    return () => {
      resizeObserver?.disconnect()
      mutationObserver?.disconnect()
      // An unmount before the restore landed must not replace the saved offset with the zero this
      // container is currently showing.
      if (!restoredRef.current && pendingRestoreRef.current !== undefined) return
      writeWorkspaceDrawerUiState(key, { scrollTop: container.scrollTop })
    }
  }, [key])

  const onScroll = useCallback(() => {
    const container = containerRef.current
    if (!container || !key) return
    if (
      pendingRestoreRef.current !== undefined &&
      lastProgrammaticScrollTopRef.current === container.scrollTop
    ) {
      lastProgrammaticScrollTopRef.current = undefined
      return
    }
    // A user scroll supersedes any restore still waiting for content.
    pendingRestoreRef.current = undefined
    lastProgrammaticScrollTopRef.current = undefined
    restoredRef.current = true
    writeWorkspaceDrawerUiState(key, { scrollTop: container.scrollTop })
  }, [key])

  return { containerRef, onScroll }
}
