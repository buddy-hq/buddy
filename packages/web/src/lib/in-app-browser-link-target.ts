import { isAllowedInAppBrowserUrl } from "@buddy/browser-contract"
import type { InAppBrowserLinkTarget } from "@/lib/in-app-browser-settings"

export type InAppBrowserLinkClick = {
  url: string
  linkTarget: InAppBrowserLinkTarget
  browserAvailable: boolean
  modified: boolean
}

export function resolveInAppBrowserLinkDestination(
  input: InAppBrowserLinkClick,
): InAppBrowserLinkTarget {
  if (input.modified || input.linkTarget !== "browser" || !input.browserAvailable) return "system"
  return isAllowedInAppBrowserUrl(input.url) ? "browser" : "system"
}

export function shouldOfferInAppBrowserForLink(input: InAppBrowserLinkClick): boolean {
  if (input.modified || input.linkTarget !== "system" || !input.browserAvailable) return false
  return isAllowedInAppBrowserUrl(input.url)
}
