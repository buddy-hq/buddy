import { useEffect } from "react"
import {
  INCOGNITO_IN_APP_BROWSER_PROFILE_ID,
  type InAppBrowserProfileID,
} from "@buddy/browser-contract/profiles"
import { useInAppBrowserHistoryStore } from "@/state/in-app-browser-history-store"
import type { InAppBrowserTabRuntime } from "@/state/in-app-browser-tabs-store"

export function useBrowserVisitRecording(input: {
  directory: string
  profileID: InAppBrowserProfileID
  runtime: InAppBrowserTabRuntime
}) {
  const { directory, profileID } = input
  const { url, title, loading } = input.runtime
  const failed = input.runtime.error !== null

  useEffect(() => {
    if (profileID === INCOGNITO_IN_APP_BROWSER_PROFILE_ID || loading || failed) return
    useInAppBrowserHistoryStore
      .getState()
      .recordVisit({ directory, url, title, visitedAt: Date.now() })
  }, [directory, failed, loading, profileID, title, url])
}
