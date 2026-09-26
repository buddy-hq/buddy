import { useEffect, useMemo, useState, type CSSProperties, type WebViewHTMLAttributes } from "react"
import {
  inAppBrowserProfilePartition,
  resolveInAppBrowserProfiles,
} from "@buddy/browser-contract/profiles"
import { usePlatform, type InAppBrowserPlatform } from "@/context/platform"
import { BENCH_WEBVIEW_OFFSCREEN_OFFSET_PX } from "@/components/bench/bench-surface-host"
import { getLiveDirectoryWorkspace } from "@/lib/directory-workspace-registry"
import { useBrowserPage } from "./use-browser-page"
import { useBrowserPageControls } from "./use-browser-page-controls"
import { useBrowserVisitRecording } from "./use-browser-visit-recording"
import {
  useInAppBrowserSettingsHydrationStatus,
  useInAppBrowserSettingsStore,
} from "@/state/in-app-browser-settings-store"
import {
  useHostedBrowserStore,
  type BrowserSurfaceRect,
  type HostedBrowserPage,
} from "@/state/hosted-browser-store"
import type { BenchTarget } from "@/lib/bench-targets"
import { useChatStore, type ChatStore } from "@/state/chat-store"
import { useInAppBrowserAudioStore } from "@/state/in-app-browser-audio-store"

type BrowserTarget = Extract<BenchTarget, { type: "browser" }>

function webviewPopupAttribute(): WebViewHTMLAttributes<HTMLWebViewElement> {
  const attributes: WebViewHTMLAttributes<HTMLWebViewElement> = {}
  // Electron reads this attribute before attaching the guest; React drops a boolean custom prop.
  Reflect.set(attributes, "allowpopups", "true")
  return attributes
}

const WEBVIEW_POPUP_ATTRIBUTE = webviewPopupAttribute()
const HOSTED_BROWSER_VIEW_TRANSITION_NAME = "buddy-bench-browser-page"

function hostedWebviewStyle(
  rect: BrowserSurfaceRect | null,
  visible: boolean,
  clipRight: number,
  keepPaintable: boolean,
): CSSProperties {
  return {
    position: "fixed",
    left: visible && rect ? rect.x : BENCH_WEBVIEW_OFFSCREEN_OFFSET_PX,
    top: visible && rect ? rect.y : BENCH_WEBVIEW_OFFSCREEN_OFFSET_PX,
    width: rect?.width ?? 1280,
    height: rect?.height ?? 800,
    zIndex: 5,
    pointerEvents: visible ? "auto" : "none",
    visibility: visible || keepPaintable ? undefined : "hidden",
    backgroundColor: "white",
    clipPath: visible && clipRight > 0 ? `inset(0 ${clipRight}px 0 0)` : undefined,
    viewTransitionName: visible && rect ? HOSTED_BROWSER_VIEW_TRANSITION_NAME : undefined,
  }
}

function releaseRemovedSessionTargets(state: ChatStore, previous: ChatStore): void {
  if (state.directories === previous.directories) return
  const hosted = useHostedBrowserStore.getState()
  for (const directory of Object.keys(hosted.slotsByDirectory)) {
    const nextSessions = state.directories[directory]?.sessions
    const previousSessions = previous.directories[directory]?.sessions
    if (!nextSessions || !previousSessions || nextSessions === previousSessions) continue
    if (getLiveDirectoryWorkspace(directory)) continue
    const nextSessionIDs = new Set(nextSessions.map((session) => session.id))
    const removedSessionIDs = previousSessions
      .filter((session) => !nextSessionIDs.has(session.id))
      .map((session) => session.id)
    if (removedSessionIDs.length > 0) hosted.removeSessionTargets(directory, removedSessionIDs)
  }
}

function HostedBrowserPage(props: {
  pageKey: string
  directory: string
  target: BrowserTarget
  browser: InAppBrowserPlatform
}) {
  const defaultProfileID = useInAppBrowserSettingsStore((state) => state.defaultProfileID)
  const defaultSearchEngine = useInAppBrowserSettingsStore((state) => state.defaultSearchEngine)
  const [profileID] = useState(() => props.target.profileID ?? defaultProfileID)
  const profileAvailable = useInAppBrowserSettingsStore((state) =>
    resolveInAppBrowserProfiles(state.userProfiles).some((profile) => profile.id === profileID),
  )
  const keepPaintable = usePlatform().os === "macos"
  const surface = useHostedBrowserStore((state) => state.surfacesByKey[props.pageKey])
  const visible = surface?.visible ?? false
  const page = useBrowserPage({
    tabID: props.target.tabID,
    initialUrl: props.target.url,
    searchEngine: defaultSearchEngine,
    browser: props.browser,
  })
  const withWebview = page.withWebview
  const controls = useBrowserPageControls({
    tabID: props.target.tabID,
    profileID,
    browser: props.browser,
    webContentsID: page.webContentsID,
    observedPageUrl: page.observedPageUrl,
    withWebview,
    audioSuspended: !surface?.owner,
  })
  useEffect(() => {
    if (visible) return
    withWebview((webview) => webview.blur())
  }, [withWebview, visible])
  useBrowserVisitRecording({ directory: props.directory, profileID, runtime: page.runtime })
  useEffect(() => {
    const webContentsID = page.webContentsID
    if (webContentsID === null) return
    return props.browser.onAudio((message) => {
      if (message.webContentsID === webContentsID) {
        useInAppBrowserAudioStore.getState().setAudible(props.target.tabID, message.audible)
      }
    })
  }, [page.webContentsID, props.browser, props.target.tabID])
  useEffect(
    () => () => useInAppBrowserAudioStore.getState().removeTab(props.target.tabID),
    [props.target.tabID],
  )
  const pageState: HostedBrowserPage = useMemo(
    () => ({
      profileID,
      runtime: page.runtime,
      notice: page.notice,
      webContentsID: page.webContentsID,
      observedPageUrl: page.observedPageUrl,
      withWebview: page.withWebview,
      navigateUrl: page.navigateUrl,
      submitInput: page.submitInput,
      reload: page.reload,
      hardReload: page.hardReload,
      controls,
    }),
    [
      profileID,
      page.runtime,
      page.notice,
      page.webContentsID,
      page.observedPageUrl,
      page.withWebview,
      page.navigateUrl,
      page.submitInput,
      page.reload,
      page.hardReload,
      controls,
    ],
  )
  useEffect(() => {
    useHostedBrowserStore.getState().setPage(props.pageKey, pageState)
  }, [pageState, props.pageKey])
  useEffect(() => () => useHostedBrowserStore.getState().removePage(props.pageKey), [props.pageKey])

  return (
    <div
      data-hosted-browser-tab-id={props.target.tabID}
      {...(keepPaintable ? { "data-keep-webview-paintable": "true" } : {})}
      aria-hidden={visible ? undefined : true}
      {...(visible ? {} : { inert: "" })}
      style={hostedWebviewStyle(
        surface?.rect ?? null,
        visible,
        surface?.clipRight ?? 0,
        keepPaintable,
      )}
    >
      {profileAvailable ? (
        <webview
          key={`${inAppBrowserProfilePartition(profileID)}:${page.webviewKey}`}
          ref={page.setWebviewRef}
          {...WEBVIEW_POPUP_ATTRIBUTE}
          src={page.webviewSource}
          partition={inAppBrowserProfilePartition(profileID)}
          webpreferences={props.browser.webPreferences}
          className="absolute inset-0 h-full w-full"
          data-browser-tab-id={props.target.tabID}
        />
      ) : null}
    </div>
  )
}

function ReadyHostedBrowserHost(props: { browser: InAppBrowserPlatform }) {
  const targetsByKey = useHostedBrowserStore((state) => state.targetsByKey)
  const openProjects = useChatStore((state) => state.openProjects)
  const targets = useMemo(
    () =>
      Object.entries(targetsByKey).filter(([, entry]) => openProjects.includes(entry.directory)),
    [openProjects, targetsByKey],
  )
  return (
    <div className="contents" data-hosted-browser-host>
      {targets.map(([pageKey, entry]) => (
        <HostedBrowserPage
          key={pageKey}
          pageKey={pageKey}
          directory={entry.directory}
          target={entry.target}
          browser={props.browser}
        />
      ))}
    </div>
  )
}

/** Owns all live browser guests outside the routed notebook layout. */
export function HostedBrowserHost() {
  const browser = usePlatform().inAppBrowser
  const hydration = useInAppBrowserSettingsHydrationStatus()
  useEffect(() => useChatStore.subscribe(releaseRemovedSessionTargets), [])
  if (!browser || hydration !== "hydrated") return null
  return <ReadyHostedBrowserHost browser={browser} />
}
