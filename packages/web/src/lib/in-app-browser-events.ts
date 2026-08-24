import { z } from "zod"
import {
  type InAppBrowserFavicon,
  isInAppBrowserTargetUrl,
  normalizeInAppBrowserTitle,
} from "@buddy/browser-contract"
import type { InAppBrowserTabRuntime } from "@/state/in-app-browser-tabs-store"

const IN_APP_BROWSER_ABORTED_LOAD_ERROR_CODE = -3
const IN_APP_BROWSER_GENERIC_LOAD_ERROR = "The page could not be loaded."

const inAppBrowserFailedLoadEventSchema = z.object({
  errorCode: z.number(),
  errorDescription: z.string(),
  isMainFrame: z.boolean(),
})

export function inAppBrowserMainFrameLoadFailure(event: Event): string | null {
  const result = inAppBrowserFailedLoadEventSchema.safeParse(event)
  if (!result.success) return IN_APP_BROWSER_GENERIC_LOAD_ERROR
  if (
    !result.data.isMainFrame ||
    result.data.errorCode === IN_APP_BROWSER_ABORTED_LOAD_ERROR_CODE
  ) {
    return null
  }
  return result.data.errorDescription || IN_APP_BROWSER_GENERIC_LOAD_ERROR
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
        favicon: inAppBrowserFaviconForUrl(current.favicon, url),
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
