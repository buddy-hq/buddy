import { useEffect } from "react"
import { usePlatform } from "@/context/platform"
import { useRightWorkspaceOpen } from "@/components/directory-chat/right-workspace-open"
import { BENCH_MODE_REQUEST_POLICY } from "@/lib/bench-navigation"
import { createInAppBrowserBenchTarget } from "@/lib/bench-targets"
import { resolveInAppBrowserLinkDestination } from "@/lib/in-app-browser-link-target"
import {
  useInAppBrowserSettingsStore,
  waitForInAppBrowserSettingsHydration,
} from "@/state/in-app-browser-settings-store"

const EXTERNAL_LINK_SELECTOR = "a.external-link"

export function useInAppBrowserLinkRouting(directory: string) {
  const platform = usePlatform()
  const browserAvailable = platform.inAppBrowser !== undefined
  const openBenchTab = useRightWorkspaceOpen({ mode: BENCH_MODE_REQUEST_POLICY })

  useEffect(() => {
    if (!browserAvailable) return
    const handleClick = (event: MouseEvent) => {
      if (event.button !== 0 || !(event.target instanceof Element)) return
      const link = event.target.closest(EXTERNAL_LINK_SELECTOR)
      if (!(link instanceof HTMLAnchorElement)) return
      if (event.metaKey || event.ctrlKey) return
      event.preventDefault()
      event.stopPropagation()
      void waitForInAppBrowserSettingsHydration().then(async (hydrated) => {
        if (!hydrated) {
          platform.openLink(link.href)
          return
        }
        const settings = useInAppBrowserSettingsStore.getState()
        const destination = resolveInAppBrowserLinkDestination({
          url: link.href,
          linkTarget: settings.linkTarget,
          browserAvailable,
          modified: false,
        })
        if (destination !== "browser") {
          platform.openLink(link.href)
          return
        }
        const outcome = await openBenchTab({
          type: "object",
          directory,
          target: createInAppBrowserBenchTarget(link.href, settings.defaultProfileID),
        })
        if (outcome === "failed") platform.openLink(link.href)
      })
    }
    document.addEventListener("click", handleClick, true)
    return () => document.removeEventListener("click", handleClick, true)
  }, [browserAvailable, directory, openBenchTab, platform])
}
