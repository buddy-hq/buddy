import { z } from "zod"
import {
  type InAppBrowserFavicon,
  isAllowedInAppBrowserUrl,
  isInAppBrowserTargetUrl,
  normalizeInAppBrowserTitle,
} from "@buddy/browser-contract"
import type { InAppBrowserTabRuntime } from "@/state/in-app-browser-tabs-store"

const IN_APP_BROWSER_ABORTED_LOAD_ERROR_CODE = -3
const UNKNOWN_LOAD_FAILURE: InAppBrowserLoadFailure = { code: 0, description: "", url: null }

const inAppBrowserFailedLoadEventSchema = z.object({
  errorCode: z.number(),
  errorDescription: z.string(),
  isMainFrame: z.boolean(),
  validatedURL: z.string().optional(),
})

const inAppBrowserStartedNavigationEventSchema = z.object({
  isMainFrame: z.boolean(),
  url: z.string(),
})

export type InAppBrowserLoadFailure = {
  code: number
  description: string
  url: string | null
}

export function inAppBrowserMainFrameLoadFailure(event: Event): InAppBrowserLoadFailure | null {
  const result = inAppBrowserFailedLoadEventSchema.safeParse(event)
  if (!result.success) return UNKNOWN_LOAD_FAILURE
  if (
    !result.data.isMainFrame ||
    result.data.errorCode === IN_APP_BROWSER_ABORTED_LOAD_ERROR_CODE
  ) {
    return null
  }
  return {
    code: result.data.errorCode,
    description: result.data.errorDescription,
    url:
      result.data.validatedURL && isInAppBrowserTargetUrl(result.data.validatedURL)
        ? result.data.validatedURL
        : null,
  }
}

export function inAppBrowserMainFrameNavigationStart(event: Event): string | null {
  const result = inAppBrowserStartedNavigationEventSchema.safeParse(event)
  if (!result.success || !result.data.isMainFrame) return null
  return isInAppBrowserTargetUrl(result.data.url) ? result.data.url : null
}

export function shouldApplyInAppBrowserSnapshot(input: {
  pendingUrl: string | null
  pendingNavigationObserved: boolean
  observedUrl: string
  confirmedNavigation: boolean
}): boolean {
  if (!input.pendingUrl || input.observedUrl === input.pendingUrl) return true
  return input.confirmedNavigation && input.pendingNavigationObserved
}

export type InAppBrowserWebviewStateReader = {
  canGoBack(): boolean
  canGoForward(): boolean
  getTitle(): string
  getURL(): string
  getWebContentsId(): number
  isLoading(): boolean
}

export type InAppBrowserWebviewSnapshot = {
  webContentsID: number
  runtime: InAppBrowserTabRuntime
}

export function inAppBrowserRuntimeAfterLoadStopped(
  current: InAppBrowserTabRuntime,
  observed: InAppBrowserTabRuntime | undefined,
): InAppBrowserTabRuntime {
  if (current.error) {
    return {
      ...(observed ?? current),
      url: current.url,
      title: current.title,
      favicon: current.favicon,
      loading: false,
      error: current.error,
    }
  }
  return {
    ...(observed ?? current),
    loading: false,
    error: current.error,
  }
}

export function inAppBrowserFaviconForUrl(
  favicon: InAppBrowserFavicon | null,
  url: string,
): InAppBrowserFavicon | null {
  if (!favicon) return null
  try {
    return new URL(favicon.pageUrl).origin === new URL(url).origin ? favicon : null
  } catch {
    return null
  }
}

/**
 * Store a guest-captured favicon on the tab runtime.
 *
 * Main already binds `pageUrl` to the guest document origin. Requiring the typed
 * or pre-redirect runtime URL to match drops icons for redirects such as
 * gmail.com → mail.google.com.
 */
export function inAppBrowserRuntimeAfterFavicon(
  current: InAppBrowserTabRuntime,
  favicon: InAppBrowserFavicon,
): InAppBrowserTabRuntime {
  return { ...current, favicon }
}

export function readInAppBrowserWebviewSnapshot(
  webview: InAppBrowserWebviewStateReader,
  current: InAppBrowserTabRuntime,
): InAppBrowserWebviewSnapshot | null {
  try {
    const webContentsID = webview.getWebContentsId()
    if (!Number.isSafeInteger(webContentsID) || webContentsID <= 0) return null
    const observedUrl = webview.getURL()
    const url = isInAppBrowserTargetUrl(observedUrl) ? observedUrl : current.url
    return {
      webContentsID,
      runtime: {
        ...current,
        url,
        title: normalizeInAppBrowserTitle(webview.getTitle(), url),
        loading: webview.isLoading(),
        canGoBack: webview.canGoBack(),
        canGoForward: webview.canGoForward(),
        // Keep the captured icon until an HTTP document is committed. Filtering
        // against the typed/pre-redirect URL (gmail.com vs mail.google.com) or
        // about:blank during load is what left Gmail on the globe fallback.
        favicon:
          webview.isLoading() || !isAllowedInAppBrowserUrl(observedUrl)
            ? current.favicon
            : inAppBrowserFaviconForUrl(current.favicon, observedUrl),
      },
    }
  } catch {
    return null
  }
}

export type InAppBrowserNavigationTracker = {
  begin(): number
  isCurrent(generation: number): boolean
}

export function createInAppBrowserNavigationTracker(): InAppBrowserNavigationTracker {
  let generation = 0
  return {
    begin() {
      generation += 1
      return generation
    },
    isCurrent(candidate) {
      return candidate === generation
    },
  }
}

export async function runTrackedInAppBrowserNavigation(input: {
  url: string
  tracker: InAppBrowserNavigationTracker
  loadURL: (url: string) => Promise<void>
  onCurrentFailure: () => void
}): Promise<void> {
  const generation = input.tracker.begin()
  try {
    await input.loadURL(input.url)
  } catch {
    if (input.tracker.isCurrent(generation)) input.onCurrentFailure()
  }
}
