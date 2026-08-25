import { isAllowedInAppBrowserUrl } from "@buddy/browser-contract"

type InAppBrowserNavigationEvent = {
  preventDefault(): void
}

export function guardInAppBrowserNavigation(input: {
  event: InAppBrowserNavigationEvent
  url: string
  onBlocked: () => void
}): boolean {
  if (isAllowedInAppBrowserUrl(input.url)) return true
  input.event.preventDefault()
  input.onBlocked()
  return false
}
