import { useCallback } from "react"
import { toast } from "@buddy/ui"
import type { InAppBrowserProfileID } from "@buddy/browser-contract/profiles"
import type { InAppBrowserPlatform } from "@/context/platform"

const CLEARABLE_DATA_LABELS = { cookies: "cookies", cache: "cache" } as const

export function useClearBrowserProfileData(input: {
  browser: InAppBrowserPlatform
  profileID: InAppBrowserProfileID
  profileName: string
}) {
  const { browser, profileID, profileName } = input
  return useCallback(
    (data: keyof typeof CLEARABLE_DATA_LABELS) => {
      const label = CLEARABLE_DATA_LABELS[data]
      const report = (done: boolean) => {
        if (done) toast.success(`Cleared ${label} for ${profileName}`)
        else toast.error(`Could not clear ${label} for ${profileName}`)
      }
      void browser.clearProfileData({ profileID, data }).then(
        (result) => report(result._tag === "done"),
        () => report(false),
      )
    },
    [browser, profileID, profileName],
  )
}
