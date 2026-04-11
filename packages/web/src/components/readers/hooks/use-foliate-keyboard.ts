import { useCallback, useEffect } from "react"
import type * as React from "react"
import type { KeyboardEvent as ReactKeyboardEvent } from "react"
import { isEditingTarget } from "../utils/foliate-helpers"

export interface UseFoliateKeyboardOptions {
  onOpenSearch: (query: string) => void
  onToggleBookmark: () => void
  onOpenLocation: () => void
  onOpenPreferences: () => void
  onHelp: () => void
  onHistoryBack: () => void
  onHistoryForward: () => void
  onCloseOverlays: () => void
  searchQueryRef: React.MutableRefObject<string>
  rootRef: React.MutableRefObject<HTMLElement | null>
}

export function useFoliateKeyboard(options: UseFoliateKeyboardOptions) {
  const {
    onOpenSearch,
    onToggleBookmark,
    onOpenLocation,
    onOpenPreferences,
    onHelp,
    onHistoryBack,
    onHistoryForward,
    onCloseOverlays,
    searchQueryRef,
    rootRef,
  } = options

  const handleShortcut = useCallback(
    (event: KeyboardEvent | ReactKeyboardEvent<HTMLElement>) => {
      if (isEditingTarget(event.target)) return
      const key = event.key
      const command = event.metaKey || event.ctrlKey
      if (command && key.toLowerCase() === "f") {
        event.preventDefault()
        onOpenSearch(searchQueryRef.current)
        return
      }
      if (command && key.toLowerCase() === "d") {
        event.preventDefault()
        onToggleBookmark()
        return
      }
      if (command && key.toLowerCase() === "l") {
        event.preventDefault()
        onOpenLocation()
        return
      }
      if (command && key === ",") {
        event.preventDefault()
        onOpenPreferences()
        return
      }
      if (event.altKey && key === "ArrowLeft") {
        event.preventDefault()
        onHistoryBack()
        return
      }
      if (event.altKey && key === "ArrowRight") {
        event.preventDefault()
        onHistoryForward()
        return
      }
      if (key === "?" || (event.shiftKey && key === "/")) {
        event.preventDefault()
        onHelp()
        return
      }
      if (key === "Escape") {
        onCloseOverlays()
      }
    },
    [
      onCloseOverlays,
      onHelp,
      onHistoryBack,
      onHistoryForward,
      onOpenLocation,
      onOpenPreferences,
      onOpenSearch,
      onToggleBookmark,
      searchQueryRef,
    ],
  )

  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    const listener = (event: KeyboardEvent) => handleShortcut(event)
    root.addEventListener("keydown", listener)
    return () => root.removeEventListener("keydown", listener)
  }, [rootRef, handleShortcut])

  return { handleShortcut }
}
