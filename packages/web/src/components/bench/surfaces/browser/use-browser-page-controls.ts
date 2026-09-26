import { useCallback, useEffect, useMemo, useState } from "react"
import {
  stepInAppBrowserZoomFactor,
  type InAppBrowserAppearance,
  type InAppBrowserAppearanceRequest,
  type InAppBrowserCommandResult,
  type InAppBrowserZoomFactor,
} from "@buddy/browser-contract"
import type { InAppBrowserProfileID } from "@buddy/browser-contract/profiles"
import type { InAppBrowserPlatform } from "@/context/platform"
import { inAppBrowserHostZoomFactor, parseInAppBrowserZoomHost } from "@/lib/in-app-browser-zoom"
import { useInAppBrowserAudioStore } from "@/state/in-app-browser-audio-store"
import { useInAppBrowserSettingsStore } from "@/state/in-app-browser-settings-store"
import type { WithInAppBrowserWebview } from "./in-app-browser-webview"

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
    ...(failure["_tag"] === "command" ? { reason: failure.reason } : { cause: failure.cause }),
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
      if (result["_tag"] === "failed") {
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
  profileID: InAppBrowserProfileID
  browser: InAppBrowserPlatform
  webContentsID: number | null
  observedPageUrl: string
  withWebview: WithInAppBrowserWebview
  audioSuspended: boolean
}) {
  const { tabID, profileID, browser, webContentsID, observedPageUrl, withWebview, audioSuspended } =
    input
  const zoomHost = parseInAppBrowserZoomHost(observedPageUrl)
  const defaultZoomFactor = useInAppBrowserSettingsStore((state) => state.defaultZoomFactor)
  const savedZoomFactor = useInAppBrowserSettingsStore((state) =>
    zoomHost
      ? inAppBrowserHostZoomFactor(state.zoomFactorsByProfile, profileID, zoomHost)
      : undefined,
  )
  const [hostlessZoomFactor, setHostlessZoomFactor] = useState<InAppBrowserZoomFactor | undefined>()
  const zoomFactor = zoomHost
    ? (savedZoomFactor ?? defaultZoomFactor)
    : (hostlessZoomFactor ?? defaultZoomFactor)
  const [appearance, setAppearance] = useState<InAppBrowserAppearance>(
    () => useInAppBrowserSettingsStore.getState().defaultAppearance,
  )
  const muted = useInAppBrowserAudioStore((state) => state.byTabID[tabID]?.muted ?? false)

  // Chromium resets zoom per site and per guest, so the profile-host preference is reapplied.
  useEffect(() => {
    if (webContentsID === null) return
    withWebview((webview) => webview.setZoomFactor(zoomFactor))
  }, [observedPageUrl, webContentsID, withWebview, zoomFactor])

  useEffect(() => {
    if (webContentsID === null) return
    withWebview((webview) => webview.setAudioMuted(muted || audioSuspended))
  }, [audioSuspended, muted, webContentsID, withWebview])

  useEffect(() => {
    if (webContentsID === null) return
    void applyInAppBrowserAppearance(browser.setAppearance, { webContentsID, appearance })
  }, [appearance, browser, webContentsID])

  const stepZoom = useCallback(
    (direction: "in" | "out") => {
      if (!zoomHost) {
        setHostlessZoomFactor((current) =>
          stepInAppBrowserZoomFactor(current ?? defaultZoomFactor, direction),
        )
        return
      }
      const state = useInAppBrowserSettingsStore.getState()
      const current =
        inAppBrowserHostZoomFactor(state.zoomFactorsByProfile, profileID, zoomHost) ??
        state.defaultZoomFactor
      const zoomFactor = stepInAppBrowserZoomFactor(current, direction)
      if (zoomFactor === state.defaultZoomFactor) {
        state.clearHostZoomFactor({ profileID, host: zoomHost })
        return
      }
      state.setHostZoomFactor({ profileID, host: zoomHost, zoomFactor })
    },
    [defaultZoomFactor, profileID, zoomHost],
  )
  const zoomIn = useCallback(() => stepZoom("in"), [stepZoom])
  const zoomOut = useCallback(() => stepZoom("out"), [stepZoom])
  const resetZoom = useCallback(() => {
    if (!zoomHost) {
      setHostlessZoomFactor(undefined)
      return
    }
    useInAppBrowserSettingsStore.getState().clearHostZoomFactor({
      profileID,
      host: zoomHost,
    })
  }, [profileID, zoomHost])

  return useMemo(
    () => ({
      zoomFactor,
      zoomIn,
      zoomOut,
      resetZoom,
      appearance,
      setAppearance,
    }),
    [zoomFactor, zoomIn, zoomOut, resetZoom, appearance],
  )
}
