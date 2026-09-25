import { useCallback } from "react"
import { toast } from "@buddy/ui"
import { usePlatform, type Platform } from "@/context/platform"
import { useRightWorkspaceOpen } from "@/components/directory-chat/right-workspace-open"
import { BENCH_MODE_REQUEST_POLICY } from "@/lib/bench-navigation"
import { createInAppBrowserBenchTarget } from "@/lib/bench-targets"
import {
  resolveInAppBrowserLinkDestination,
  shouldOfferInAppBrowserForLink,
  type InAppBrowserLinkClick,
} from "@/lib/in-app-browser-link-target"
import type { InAppBrowserLinkTarget } from "@/lib/in-app-browser-settings"
import {
  flushInAppBrowserSettings,
  useInAppBrowserSettingsStore,
  waitForInAppBrowserSettingsHydration,
} from "@/state/in-app-browser-settings-store"
import { useLinkDestinationDialogStore } from "@/state/link-destination-dialog-store"
import {
  markOneTimeNoticeSeen,
  ONE_TIME_NOTICE_LINK_DESTINATION,
  shouldShowOneTimeNotice,
} from "@/state/one-time-notices"

export type OpenLinkOptions = {
  readonly modified?: boolean
}

export type OpenLink = (url: string, options?: OpenLinkOptions) => void

function systemLinkModifierKey(os: Platform["os"]): string {
  return os === "macos" ? "⌘" : "Ctrl"
}

export async function chooseLinkTarget(input: {
  click: InAppBrowserLinkClick
  modifierKey: string
}): Promise<InAppBrowserLinkTarget | undefined> {
  if (
    !shouldOfferInAppBrowserForLink(input.click) ||
    !shouldShowOneTimeNotice(ONE_TIME_NOTICE_LINK_DESTINATION)
  ) {
    return input.click.linkTarget
  }
  const choice = await useLinkDestinationDialogStore
    .getState()
    .requestChoice({ url: input.click.url })
  if (choice === "cancel") return undefined
  markOneTimeNoticeSeen(ONE_TIME_NOTICE_LINK_DESTINATION)
  if (choice === "browser") {
    useInAppBrowserSettingsStore.getState().setLinkTarget("browser")
    void flushInAppBrowserSettings()
    toast("Links now open in Buddy", {
      description: `Hold ${input.modifierKey} while you click a link to open it in your default browser. You can change this anytime in Settings → Browser.`,
    })
  }
  return choice
}

export function useOpenLink(directory: string): OpenLink {
  const platform = usePlatform()
  const browserAvailable = platform.inAppBrowser !== undefined
  const openBenchTab = useRightWorkspaceOpen({ mode: BENCH_MODE_REQUEST_POLICY })

  return useCallback(
    (url: string, options?: OpenLinkOptions) => {
      if (!browserAvailable) {
        platform.openLink(url)
        return
      }
      void waitForInAppBrowserSettingsHydration().then(async (hydrated) => {
        if (!hydrated) {
          platform.openLink(url)
          return
        }
        const settings = useInAppBrowserSettingsStore.getState()
        const click: InAppBrowserLinkClick = {
          url,
          linkTarget: settings.linkTarget,
          modifiedLinkTarget: settings.modifiedLinkTarget,
          browserAvailable,
          modified: options?.modified === true,
        }
        const linkTarget = await chooseLinkTarget({
          click,
          modifierKey: systemLinkModifierKey(platform.os),
        })
        if (!linkTarget) return
        if (resolveInAppBrowserLinkDestination({ ...click, linkTarget }) !== "browser") {
          platform.openLink(url)
          return
        }
        const outcome = await openBenchTab({
          type: "object",
          directory,
          target: createInAppBrowserBenchTarget(url, settings.defaultProfileID),
        })
        if (outcome === "failed") platform.openLink(url)
      })
    },
    [browserAvailable, directory, openBenchTab, platform],
  )
}
