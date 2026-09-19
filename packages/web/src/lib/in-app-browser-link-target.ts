import { isAllowedInAppBrowserUrl } from "@buddy/browser-contract"
import type { InAppBrowserLinkTarget } from "@/lib/in-app-browser-settings"

export function resolveInAppBrowserLinkDestination(input: {
  url: string
  linkTarget: InAppBrowserLinkTarget
  browserAvailable: boolean
  modified: boolean
}): InAppBrowserLinkTarget {
  if (input.modified || input.linkTarget !== "browser" || !input.browserAvailable) return "system"
  return isAllowedInAppBrowserUrl(input.url) ? "browser" : "system"
}
