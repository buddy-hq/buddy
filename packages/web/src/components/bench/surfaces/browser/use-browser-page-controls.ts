import { useCallback, useEffect, useState } from "react"
import {
  DEFAULT_IN_APP_BROWSER_ZOOM_FACTOR,
  stepInAppBrowserZoomFactor,
  type InAppBrowserAppearance,
  type InAppBrowserAppearanceRequest,
  type InAppBrowserCommandResult,
  type InAppBrowserZoomFactor,
} from "@buddy/browser-contract"
import type { InAppBrowserPlatform } from "@/context/platform"
import { useInAppBrowserAudioStore } from "@/state/in-app-browser-audio-store"
import { useInAppBrowserSettingsStore } from "@/state/in-app-browser-settings-store"
import type { WithInAppBrowserWebview } from "./in-app-browser-webview"
import type { InAppBrowserWebview } from "./in-app-browser-webview"

type TAppearanceFailedReason = Extract<InAppBrowserCommandResult, { _tag: "failed" }>["reason"]
type TAppearanceApplyFailure =
  | { readonly _tag: "command"; readonly reason: TAppearanceFailedReason }
  | { readonly _tag: "rejected"; readonly cause: unknown }

const appearanceRequests = new Map<string, Promise<void>>()

function appearanceRequestKey(request: InAppBrowserAppearanceRequest): string {
  return `${request.webContentsID}:${request.appearance}`
}

function logInAppBrowserAppearanceFailure(
  request: InAppBrowserAppearanceRequest,
  failure: TAppearanceApplyFailure,
): void {
  console.error("[in-app-browser] appearance.failed", {
    webContentsID: request.webContentsID,
    appearance: request.appearance,
    ...(failure._tag === "command" ? { reason: failure.reason } : { cause: failure.cause }),
  })
}

/**
 * Apply guest appearance and log a structured failure once per in-flight request.
 *
 * @param setAppearance - Platform appearance command.
 * @param request - Guest webContents and appearance to apply.
 * @returns Settles after the command completes. Failures are logged, not thrown or toasted.
 */
export function applyInAppBrowserAppearance(
  setAppearance: InAppBrowserPlatform["setAppearance"],
  request: InAppBrowserAppearanceRequest,
): Promise<void> {
  const key = appearanceRequestKey(request)
  const existing = appearanceRequests.get(key)
  if (existing) return existing

  const pending = (async () => {
    try {
      const result = await setAppearance(request)
      if (result._tag === "failed") {
        logInAppBrowserAppearanceFailure(request, { _tag: "command", reason: result.reason })
      }
    } catch (cause) {
      logInAppBrowserAppearanceFailure(request, { _tag: "rejected", cause })
    }
  })().finally(() => {
    if (appearanceRequests.get(key) === pending) appearanceRequests.delete(key)
  })
  appearanceRequests.set(key, pending)
  return pending
}

export function useBrowserPageControls(input: {
  tabID: string
  browser: InAppBrowserPlatform
  webContentsID: number | null
  pageUrl: string
  withWebview: WithInAppBrowserWebview
}) {
  const { tabID, browser, webContentsID, pageUrl, withWebview } = input
  const [zoomFactor, setZoomFactor] = useState<InAppBrowserZoomFactor>(
    () => useInAppBrowserSettingsStore.getState().defaultZoomFactor,
  )
  const [appearance, setAppearance] = useState<InAppBrowserAppearance>(
    () => useInAppBrowserSettingsStore.getState().defaultAppearance,
  )
  const muted = useInAppBrowserAudioStore((state) => state.byTabID[tabID]?.muted ?? false)

  // Chromium resets zoom per site and per guest, so the tab's zoom is reapplied.
  useEffect(() => {
    if (webContentsID === null) return
    withWebview((webview) => webview.setZoomFactor(zoomFactor))
  }, [pageUrl, webContentsID, withWebview, zoomFactor])

  useEffect(() => {
    if (webContentsID === null) return
    withWebview((webview) => webview.setAudioMuted(muted))
  }, [muted, webContentsID, withWebview])

  useEffect(() => {
    if (webContentsID === null) return
    void applyInAppBrowserAppearance(browser.setAppearance, { webContentsID, appearance })
  }, [appearance, browser, webContentsID])

  useEffect(() => {
    if (webContentsID === null) return
    return browser.onAudio((message) => {
      if (message.webContentsID !== webContentsID) return
      useInAppBrowserAudioStore.getState().setAudible(tabID, message.audible)
    })
  }, [browser, tabID, webContentsID])

  useEffect(() => () => useInAppBrowserAudioStore.getState().removeTab(tabID), [tabID])

  const synchronizeAttachedState = useCallback(
    (webview: InAppBrowserWebview, attachedWebContentsID: number): void => {
      webview.setZoomFactor(zoomFactor)
      webview.setAudioMuted(muted)
      void applyInAppBrowserAppearance(browser.setAppearance, {
        webContentsID: attachedWebContentsID,
        appearance,
      })
    },
    [appearance, browser, muted, zoomFactor],
  )

  const zoomIn = useCallback(() => {
    setZoomFactor((current) => stepInAppBrowserZoomFactor(current, "in"))
  }, [])
  const zoomOut = useCallback(() => {
    setZoomFactor((current) => stepInAppBrowserZoomFactor(current, "out"))
  }, [])
  const resetZoom = useCallback(() => setZoomFactor(DEFAULT_IN_APP_BROWSER_ZOOM_FACTOR), [])

  return {
    zoomFactor,
    zoomIn,
    zoomOut,
    resetZoom,
    appearance,
    setAppearance,
    synchronizeAttachedState,
  }
}
