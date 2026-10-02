import { useMemo, useRef, useState, type CSSProperties } from "react"
import { createPortal } from "react-dom"
import { IN_APP_BROWSER_BLANK_URL, isAllowedInAppBrowserUrl } from "@buddy/browser-contract"
import { Button } from "@buddy/ui"
import { DEFAULT_IN_APP_BROWSER_PROFILE_ID } from "@buddy/browser-contract/profiles"
import { usePlatform, type InAppBrowserPlatform } from "@/context/platform"
import { useBenchSurfaceActive } from "@/components/bench/bench-surface-activity"
import { BenchStaticContextProvider } from "@/components/bench/bench-static-context-provider"
import type { BenchTarget } from "@/lib/bench-navigation"
import { inAppBrowserSearchEngineLabel } from "@/lib/in-app-browser-search"
import {
  hostedBrowserKey,
  useHostedBrowserStore,
  type HostedBrowserPage,
} from "@/state/hosted-browser-store"
import { BrowserAddressBar } from "./browser-address-bar"
import { BrowserPageError } from "./browser-error-page"
import { BrowserMoreMenu } from "./browser-more-menu"
import { BrowserNewTabPage } from "./browser-new-tab-page"
import { BrowserProfileLabel, BrowserToolbar } from "./browser-toolbar"
import { BrowserZoomBadge } from "./browser-zoom-badge"
import { useBrowserBenchContext } from "./use-browser-bench-context"
import { useBrowserCitations } from "./use-browser-citations"
import { BrowserSurfaceSlot } from "./browser-surface-slot"
import { useBrowserNewTabRequests } from "./use-browser-new-tab-requests"
import { useBrowserProfileName } from "./use-browser-profile-name"
import { useBrowserShortcuts } from "./use-browser-shortcuts"
import { useClearBrowserProfileData } from "./use-clear-browser-profile-data"
import {
  retryInAppBrowserSettingsHydration,
  useInAppBrowserSettingsHydrationStatus,
  useInAppBrowserSettingsStore,
} from "@/state/in-app-browser-settings-store"

const OPEN_FAILED_NOTICE = "The page could not be opened."
const BROWSER_SETTINGS_FAILED_METADATA = ["surface: browser", "surface_status: error"]

export function BrowserTab(props: {
  directory: string
  target: Extract<BenchTarget, { type: "browser" }>
  browser: InAppBrowserPlatform
}) {
  const hydrationStatus = useInAppBrowserSettingsHydrationStatus()
  const pageKey = hostedBrowserKey(props.directory, props.target.tabID)
  const page = useHostedBrowserStore((state) => state.pagesByKey[pageKey])
  const idleBrowser = useMemo(() => ({ url: props.target.url, loading: false }), [props.target.url])
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
      <BenchStaticContextProvider
        status="error"
        metadata={BROWSER_SETTINGS_FAILED_METADATA}
        content="This Browser tab is not showing its page because Browser settings could not be loaded. The user can retry from the tab."
        browser={idleBrowser}
      >
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
      </BenchStaticContextProvider>
    )
  }
  if (!page) {
    return <div aria-busy="true" data-component="browser-bench-surface" className="h-full" />
  }
  return <HydratedBrowserTab {...props} page={page} pageKey={pageKey} />
}

function HydratedBrowserTab(props: {
  directory: string
  target: Extract<BenchTarget, { type: "browser" }>
  browser: InAppBrowserPlatform
  page: HostedBrowserPage
  pageKey: string
}) {
  const { directory, target, browser } = props
  const platform = usePlatform()
  const surfaceActive = useBenchSurfaceActive()
  const defaultSearchEngine = useInAppBrowserSettingsStore((state) => state.defaultSearchEngine)
  const searchEngineLabel = inAppBrowserSearchEngineLabel(defaultSearchEngine)
  const profileID = props.page.profileID
  const profileName = useBrowserProfileName(profileID)
  const [addressFocusRequest, setAddressFocusRequest] = useState(0)
  const pageAreaRef = useRef<HTMLDivElement>(null)
  const page = props.page
  const { runtime, withWebview } = page
  const controls = page.controls
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
  useBrowserNewTabRequests({
    browser,
    directory,
    profileID,
    webContentsID: page.webContentsID,
    active: surfaceActive,
  })
  useBrowserBenchContext({ target, runtime })
  const citationToolbar = useBrowserCitations({
    directory,
    target,
    browser,
    profileID,
    webContentsID: page.webContentsID,
    runtime,
    zoomFactor: controls.zoomFactor,
    surfaceActive,
    pageAreaRef,
  })

  const pageUrl = runtime.url
  const status = runtime.error?.["_tag"] === "open-failed" ? OPEN_FAILED_NOTICE : page.notice
  const surface = useHostedBrowserStore((state) => state.surfacesByKey[props.pageKey])
  const overlayStyle: CSSProperties | undefined =
    surfaceActive && surface?.visible && surface.rect
      ? {
          position: "fixed",
          left: surface.rect.x,
          top: surface.rect.y,
          width: surface.rect.width,
          height: surface.rect.height,
          zIndex: 6,
          pointerEvents: "none",
          clipPath: surface.clipRight > 0 ? `inset(0 ${surface.clipRight}px 0 0)` : undefined,
        }
      : undefined

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
          searchEngineLabel={searchEngineLabel}
          onSubmitInput={page.submitInput}
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
        <BrowserSurfaceSlot directory={directory} tabID={target.tabID} visible={surfaceActive} />
      </div>
      {overlayStyle
        ? createPortal(
            <div ref={pageAreaRef} data-browser-page-overlay={target.tabID} style={overlayStyle}>
              {pageUrl === IN_APP_BROWSER_BLANK_URL && runtime.error === null ? (
                <div className="pointer-events-auto absolute inset-0">
                  <BrowserNewTabPage
                    directory={directory}
                    searchEngineLabel={searchEngineLabel}
                    onSubmitInput={page.submitInput}
                    onOpenUrl={page.navigateUrl}
                  />
                </div>
              ) : null}
              {runtime.error?.["_tag"] === "load-failed" ||
              runtime.error?.["_tag"] === "crashed" ? (
                <div className="pointer-events-auto absolute inset-0">
                  <BrowserPageError error={runtime.error} onReload={page.reload} />
                </div>
              ) : null}
              <BrowserZoomBadge zoomFactor={controls.zoomFactor} />
              {citationToolbar}
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
