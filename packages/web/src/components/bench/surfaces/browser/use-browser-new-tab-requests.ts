import { useEffect, useRef } from "react"
import type { InAppBrowserProfileID } from "@buddy/browser-contract/profiles"
import type { InAppBrowserPlatform } from "@/context/platform"
import { BENCH_MODE_REQUEST_POLICY, useOpenBench } from "@/lib/bench-navigation"
import { createInAppBrowserBenchTarget } from "@/lib/bench-targets"

export function useBrowserNewTabRequests(input: {
  browser: InAppBrowserPlatform
  directory: string
  profileID: InAppBrowserProfileID
  webContentsID: number | null
  active: boolean
}) {
  const { browser, directory, profileID, webContentsID } = input
  const openBench = useOpenBench()
  const activeRef = useRef(input.active)
  activeRef.current = input.active

  useEffect(() => {
    if (webContentsID === null) return
    return browser.onNewTab((message) => {
      if (!activeRef.current || message.webContentsID !== webContentsID) return
      void openBench({
        directory,
        target: createInAppBrowserBenchTarget(message.url, profileID),
        mode: BENCH_MODE_REQUEST_POLICY,
        autoOpen: null,
      })
    })
  }, [browser, directory, openBench, profileID, webContentsID])
}
