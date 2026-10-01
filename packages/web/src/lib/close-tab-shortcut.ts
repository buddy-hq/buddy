import { useEffect } from "react"
import { create } from "zustand"
import { usePlatform } from "@/context/platform"
import { useShortcutCommand } from "@/lib/use-shortcut-command"

const useCloseTabClaims = create<{ claims: number }>(() => ({ claims: 0 }))

/** While mounted and enabled, Mod+W closes the caller's tab instead of the window. */
export function useClaimCloseTabShortcut(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    useCloseTabClaims.setState((state) => ({ claims: state.claims + 1 }))
    return () => useCloseTabClaims.setState((state) => ({ claims: state.claims - 1 }))
  }, [enabled])
}

/**
 * On macOS, Mod+W with no tab to close closes the window, as a browser does with its last tab.
 * Other platforms keep the key for the page.
 */
export function useCloseWindowShortcut() {
  const platform = usePlatform()
  const claimed = useCloseTabClaims((state) => state.claims > 0)
  useShortcutCommand("bench.closeTab", () => platform.closeWindow?.(), {
    enabled: platform.os === "macos" && platform.closeWindow !== undefined && !claimed,
  })
}
