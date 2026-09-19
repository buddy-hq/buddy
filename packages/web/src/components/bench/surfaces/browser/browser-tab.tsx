import { useCallback, useRef, useState, type WebViewHTMLAttributes } from "react"
import { IN_APP_BROWSER_BLANK_URL, isAllowedInAppBrowserUrl } from "@buddy/browser-contract"
import { Button } from "@buddy/ui"
import {
  DEFAULT_IN_APP_BROWSER_PROFILE_ID,
  inAppBrowserProfilePartition,
} from "@buddy/browser-contract/profiles"
import { usePlatform, type InAppBrowserPlatform } from "@/context/platform"
import { useBenchSurfaceActive } from "@/components/bench/bench-surface-activity"
import type { BenchTarget } from "@/lib/bench-navigation"
import { BrowserAddressBar } from "./browser-address-bar"
import { BrowserPageError } from "./browser-error-page"
import { BrowserMoreMenu } from "./browser-more-menu"
import { BrowserNewTabPage } from "./browser-new-tab-page"
import { BrowserProfileLabel, BrowserToolbar } from "./browser-toolbar"
import { BrowserZoomBadge } from "./browser-zoom-badge"
import { useBrowserBenchContext } from "./use-browser-bench-context"
import { useBrowserPage } from "./use-browser-page"
import { useBrowserPageControls } from "./use-browser-page-controls"
import { useBrowserProfileName } from "./use-browser-profile-name"
import { useBrowserShortcuts } from "./use-browser-shortcuts"
import { useBrowserVisitRecording } from "./use-browser-visit-recording"
import { useClearBrowserProfileData } from "./use-clear-browser-profile-data"
import {
  retryInAppBrowserSettingsHydration,
  useInAppBrowserSettingsHydrationStatus,
  useInAppBrowserSettingsStore,
} from "@/state/in-app-browser-settings-store"
import type { InAppBrowserWebview } from "./in-app-browser-webview"

const OPEN_FAILED_NOTICE = "The page could not be opened."
function createWebviewPopupAttribute(): WebViewHTMLAttributes<HTMLWebViewElement> {
  const attributes: WebViewHTMLAttributes<HTMLWebViewElement> = {}
  // React 18 drops unknown boolean DOM attributes, while Electron needs this attribute before
  // guest attachment. Reflect preserves the runtime string without weakening the owner type.
  Reflect.set(attributes, "allowpopups", "true")
  return attributes
}

const WEBVIEW_POPUP_ATTRIBUTE = createWebviewPopupAttribute()

export function BrowserTab(props: {
  directory: string
  target: Extract<BenchTarget, { type: "browser" }>
  browser: InAppBrowserPlatform
}) {
  const hydrationStatus = useInAppBrowserSettingsHydrationStatus()
  if (hydrationStatus === "hydrating") {
    return (
      <div
        aria-busy="true"
        data-component="browser-bench-surface"
        className="h-full min-h-0 bg-background-base"
      />
    )
  }
  if (hydrationStatus === "failed") {
    return (
      <div
        role="alert"
        data-component="browser-bench-surface"
        className="flex h-full min-h-0 flex-col items-center justify-center gap-3 bg-background-base p-6 text-center"
      >
        <p className="text-sm text-text-weak">Browser settings could not be loaded.</p>
        <Button variant="outline" onClick={() => void retryInAppBrowserSettingsHydration()}>
          Try again
        </Button>
      </div>
    )
  }
  return <HydratedBrowserTab {...props} />
}

function HydratedBrowserTab(props: {
  directory: string
  target: Extract<BenchTarget, { type: "browser" }>
  browser: InAppBrowserPlatform
}) {
  const { directory, target, browser } = props
  const platform = usePlatform()
  const surfaceActive = useBenchSurfaceActive()
  const defaultProfileID = useInAppBrowserSettingsStore((state) => state.defaultProfileID)
  const [profileID] = useState(() => target.profileID ?? defaultProfileID)
  const profileName = useBrowserProfileName(profileID)
  const [addressFocusRequest, setAddressFocusRequest] = useState(0)
  const attachedStateSynchronizerRef = useRef<
    ((webview: InAppBrowserWebview, webContentsID: number) => void) | null
  >(null)
  const synchronizeAttachedState = useCallback(
    (webview: InAppBrowserWebview, webContentsID: number) => {
      attachedStateSynchronizerRef.current?.(webview, webContentsID)
    },
    [],
  )
  const page = useBrowserPage({
    tabID: target.tabID,
    initialUrl: target.url,
    browser,
    onAttached: synchronizeAttachedState,
  })
  const { runtime, withWebview } = page
  const controls = useBrowserPageControls({
    tabID: target.tabID,
    browser,
    webContentsID: page.webContentsID,
    pageUrl: runtime.url,
    withWebview,
  })
  attachedStateSynchronizerRef.current = controls.synchronizeAttachedState
  const clearProfileData = useClearBrowserProfileData({ browser, profileID, profileName })
  const handleShortcutKeyDown = useBrowserShortcuts({
    browser,
    active: surfaceActive,
    platform: platform.os ?? "linux",
    webContentsID: page.webContentsID,
    handlers: {
      reload: page.reload,
      focusAddress: () => setAddressFocusRequest((request) => request + 1),
      zoomIn: controls.zoomIn,
      zoomOut: controls.zoomOut,
      zoomReset: controls.resetZoom,
    },
  })
  useBrowserBenchContext({ target, runtime })
  useBrowserVisitRecording({ directory, profileID, runtime })

  const partition = inAppBrowserProfilePartition(profileID)
  const pageUrl = runtime.url
  const status = runtime.error?._tag === "open-failed" ? OPEN_FAILED_NOTICE : page.notice

  return (
    <div
      data-component="browser-bench-surface"
      className="flex h-full min-h-0 flex-col bg-background-base"
      onKeyDown={handleShortcutKeyDown}
    >
      <BrowserToolbar
        canGoBack={runtime.canGoBack}
        canGoForward={runtime.canGoForward}
        loading={runtime.loading}
        onBack={() => withWebview((webview) => webview.goBack())}
        onForward={() => withWebview((webview) => webview.goForward())}
        onReload={page.reload}
      >
        <BrowserAddressBar
          pageUrl={pageUrl}
          focusRequest={addressFocusRequest}
          onNavigate={page.navigate}
          onOpenExternal={
            isAllowedInAppBrowserUrl(pageUrl) ? () => platform.openLink(pageUrl) : undefined
          }
        />
        {profileID === DEFAULT_IN_APP_BROWSER_PROFILE_ID ? null : (
          <BrowserProfileLabel name={profileName} />
        )}
        <BrowserMoreMenu
          zoomFactor={controls.zoomFactor}
          onZoomIn={controls.zoomIn}
          onZoomOut={controls.zoomOut}
          onResetZoom={controls.resetZoom}
          appearance={controls.appearance}
          onAppearanceChange={controls.setAppearance}
          onHardReload={page.hardReload}
          onOpenDevTools={() => withWebview((webview) => webview.openDevTools())}
          onClearCookies={() => clearProfileData("cookies")}
          onClearCache={() => clearProfileData("cache")}
        />
      </BrowserToolbar>
      {status ? (
        <div
          role="status"
          className="shrink-0 border-b border-border-weaker-base bg-surface-base px-3 py-2 text-xs text-text-weak"
        >
          {status}
        </div>
      ) : null}
      <div className="relative min-h-0 flex-1">
        <webview
          key={`${partition}:${page.webviewKey}`}
          ref={page.setWebviewRef}
          {...WEBVIEW_POPUP_ATTRIBUTE}
          src={page.webviewSource}
          partition={partition}
          webpreferences={browser.webPreferences}
          className="absolute inset-0 bg-white"
          data-browser-tab-id={target.tabID}
        />
        {pageUrl === IN_APP_BROWSER_BLANK_URL && runtime.error === null ? (
          <BrowserNewTabPage directory={directory} onOpen={page.navigate} />
        ) : null}
        <BrowserPageError error={runtime.error} onReload={page.reload} />
        <BrowserZoomBadge zoomFactor={controls.zoomFactor} />
      </div>
    </div>
  )
}
