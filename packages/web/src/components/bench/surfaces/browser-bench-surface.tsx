import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { Button, Input } from "@buddy/ui"
import {
  inAppBrowserDisplayUrl,
  inAppBrowserFallbackTitle,
  normalizeInAppBrowserUrl,
} from "@buddy/browser-contract"
import { ArrowLeftIcon, ArrowRightIcon, Globe, RefreshCwIcon } from "@/icons/app-icons"
import { usePlatform } from "@/context/platform"
import { useRegisterBenchContextProvider } from "@/components/bench/bench-route-context"
import { useInAppBrowserTabsStore } from "@/state/in-app-browser-tabs-store"
import type { InAppBrowserTabRuntime } from "@/state/in-app-browser-tabs-store"
import type { BenchTarget } from "@/lib/bench-navigation"
import {
  createInAppBrowserNavigationTracker,
  inAppBrowserFaviconForUrl,
  inAppBrowserMainFrameLoadFailure,
  inAppBrowserRuntimeAfterLoadStopped,
  readInAppBrowserWebviewSnapshot,
  runTrackedInAppBrowserNavigation,
  type InAppBrowserWebviewStateReader,
} from "@/lib/in-app-browser-events"
import "./browser-bench-surface.css"

type InAppBrowserWebview = HTMLElement &
  InAppBrowserWebviewStateReader & {
    loadURL(url: string): Promise<void>
    goBack(): void
    goForward(): void
    reload(): void
  }

export function BrowserBenchSurface(props: {
  directory: string
  target: Extract<BenchTarget, { type: "browser" }>
}) {
  const platform = usePlatform()
  const browser = platform.inAppBrowser
  const webviewRef = useRef<InAppBrowserWebview | null>(null)
  const navigationTrackerRef = useRef(createInAppBrowserNavigationTracker())
  const [webContentsID, setWebContentsID] = useState<number | null>(null)
  const [webviewGeneration, setWebviewGeneration] = useState(0)
  const [webviewSource, setWebviewSource] = useState(props.target.url)
  const [crashed, setCrashed] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [address, setAddress] = useState(inAppBrowserDisplayUrl(props.target.url))
  const [runtime, setRuntimeState] = useState<InAppBrowserTabRuntime>(() => ({
    url: props.target.url,
    title: inAppBrowserFallbackTitle(props.target.url),
    loading: browser !== undefined,
    canGoBack: false,
    canGoForward: false,
    favicon: null,
    error: browser ? null : "Browser requires Buddy desktop.",
  }))
  const runtimeRef = useRef(runtime)
  const updateRuntime = useCallback(
    (update: (current: InAppBrowserTabRuntime) => InAppBrowserTabRuntime): void => {
      const next = update(runtimeRef.current)
      runtimeRef.current = next
      setRuntimeState(next)
    },
    [],
  )

  useEffect(() => {
    useInAppBrowserTabsStore.getState().setTab(props.target.tabID, runtime)
  }, [props.target.tabID, runtime])

  useEffect(
    () => () => {
      useInAppBrowserTabsStore.getState().removeTab(props.target.tabID)
    },
    [props.target.tabID],
  )

  useEffect(() => {
    if (!browser || webContentsID === null) return
    return browser.onMessage((message) => {
      if (message.webContentsID !== webContentsID) return
      setNotice(message.message)
    })
  }, [browser, webContentsID])

  useEffect(() => {
    if (!browser || webContentsID === null) return
    return browser.onFavicon((message) => {
      if (message.webContentsID !== webContentsID) return
      updateRuntime((current) => {
        const favicon = inAppBrowserFaviconForUrl(message.favicon, current.url)
        return favicon ? { ...current, favicon } : current
      })
    })
  }, [browser, updateRuntime, webContentsID])

  const contextProvider = useMemo(
    () => ({
      read: () => ({
        targetStatus: runtime.error
          ? ("error" as const)
          : runtime.loading
            ? ("loading" as const)
            : ("ready" as const),
        title: runtime.title,
        browser: { url: runtime.url, loading: runtime.loading },
        metadata: [
          "surface: browser",
          "control: user-only",
          `loading: ${runtime.loading ? "yes" : "no"}`,
        ],
        content:
          "This is a live Browser tab controlled by the user. The agent knows its URL and status but cannot read or operate the page.",
        refs: [
          {
            kind: "url" as const,
            value: runtime.url,
            note: "Current URL in the selected Browser tab.",
          },
        ],
        hints: [
          "Use inapp_browser_open to open another URL in a new visible Browser tab.",
          "Do not claim to see, click, type in, or inspect the web page.",
        ],
      }),
    }),
    [runtime],
  )
  useRegisterBenchContextProvider({ target: props.target, provider: contextProvider })

  const syncFromWebview = useCallback(() => {
    const webview = webviewRef.current
    if (!webview) return
    const snapshot = readInAppBrowserWebviewSnapshot(webview, runtimeRef.current)
    if (snapshot) updateRuntime(() => snapshot.runtime)
  }, [updateRuntime])

  const setWebviewRef = useCallback((webview: InAppBrowserWebview | null) => {
    if (webview && !webview.hasAttribute("allowpopups")) {
      webview.setAttribute("allowpopups", "true")
    }
    webviewRef.current = webview
  }, [])

  useEffect(() => {
    const webview = webviewRef.current
    if (!webview) return

    let disposed = false
    const synchronizeAttachedState = () => {
      if (disposed) return
      const snapshot = readInAppBrowserWebviewSnapshot(webview, runtimeRef.current)
      if (!snapshot) return
      setCrashed(false)
      setWebContentsID(snapshot.webContentsID)
      updateRuntime(() => snapshot.runtime)
    }
    const didAttach = () => {
      setCrashed(false)
      synchronizeAttachedState()
    }
    const didStartLoading = () => {
      setNotice(null)
      updateRuntime((current) => ({ ...current, loading: true, error: null }))
    }
    const didStopLoading = () => {
      const current = runtimeRef.current
      const snapshot = readInAppBrowserWebviewSnapshot(webview, current)
      updateRuntime(() => inAppBrowserRuntimeAfterLoadStopped(current, snapshot?.runtime))
    }
    const didNavigate = () => {
      const url = webview.getURL()
      if (url) setAddress(inAppBrowserDisplayUrl(url))
      const current = runtimeRef.current
      const snapshot = readInAppBrowserWebviewSnapshot(webview, current)
      const next = snapshot?.runtime ?? current
      updateRuntime(() => (next.error === null ? next : { ...next, error: null }))
    }
    const pageTitleUpdated = () => syncFromWebview()
    const didFailLoad = (event: Event) => {
      const message = inAppBrowserMainFrameLoadFailure(event)
      if (!message) return
      updateRuntime((current) => ({ ...current, loading: false, error: message }))
    }
    const renderProcessGone = () => {
      setWebContentsID(null)
      setCrashed(true)
      updateRuntime((current) => ({
        ...current,
        loading: false,
        error: "The page crashed. Reload to try again.",
      }))
    }

    webview.addEventListener("did-attach", didAttach)
    webview.addEventListener("dom-ready", didAttach)
    webview.addEventListener("did-start-loading", didStartLoading)
    webview.addEventListener("did-stop-loading", didStopLoading)
    webview.addEventListener("did-navigate", didNavigate)
    webview.addEventListener("did-navigate-in-page", didNavigate)
    webview.addEventListener("page-title-updated", pageTitleUpdated)
    webview.addEventListener("did-fail-load", didFailLoad)
    webview.addEventListener("render-process-gone", renderProcessGone)
    synchronizeAttachedState()
    queueMicrotask(synchronizeAttachedState)
    return () => {
      disposed = true
      webview.removeEventListener("did-attach", didAttach)
      webview.removeEventListener("dom-ready", didAttach)
      webview.removeEventListener("did-start-loading", didStartLoading)
      webview.removeEventListener("did-stop-loading", didStopLoading)
      webview.removeEventListener("did-navigate", didNavigate)
      webview.removeEventListener("did-navigate-in-page", didNavigate)
      webview.removeEventListener("page-title-updated", pageTitleUpdated)
      webview.removeEventListener("did-fail-load", didFailLoad)
      webview.removeEventListener("render-process-gone", renderProcessGone)
    }
  }, [syncFromWebview, updateRuntime, webviewGeneration])

  function reload(): void {
    setNotice(null)
    if (!crashed) {
      webviewRef.current?.reload()
      return
    }
    setCrashed(false)
    setWebviewSource(runtimeRef.current.url)
    updateRuntime((current) => ({ ...current, loading: true, error: null }))
    setWebviewGeneration((generation) => generation + 1)
  }

  function navigate(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    const url = normalizeInAppBrowserUrl(address)
    if (!url) {
      setNotice("Enter a valid HTTP or HTTPS address.")
      return
    }
    setNotice(null)
    setAddress(url)
    updateRuntime((current) => ({ ...current, url, loading: true, error: null }))
    const webview = webviewRef.current
    if (!webview) return
    void runTrackedInAppBrowserNavigation({
      url,
      tracker: navigationTrackerRef.current,
      loadURL: (nextUrl) => webview.loadURL(nextUrl),
      onCurrentFailure: () => {
        updateRuntime((current) => ({
          ...current,
          loading: false,
          error: "The page could not be opened.",
        }))
      },
    })
  }

  const surfaceMessage = runtime.error ?? notice

  if (!browser) {
    return (
      <div className="flex h-full items-center justify-center bg-background-base p-8">
        <div className="max-w-sm text-center">
          <Globe className="mx-auto mb-3 size-6 text-icon-base" />
          <p className="text-sm font-medium text-text-strong">Browser requires Buddy desktop.</p>
          <p className="mt-1 text-sm text-text-weak">
            Open this notebook in the Buddy app to browse here.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      data-component="browser-bench-surface"
      className="flex h-full min-h-0 flex-col bg-background-base"
    >
      <form
        className="flex h-10 shrink-0 items-center gap-1 border-b border-border-weaker-base px-2"
        onSubmit={navigate}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Back"
          title="Back"
          disabled={!runtime.canGoBack}
          onClick={() => webviewRef.current?.goBack()}
        >
          <ArrowLeftIcon className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Forward"
          title="Forward"
          disabled={!runtime.canGoForward}
          onClick={() => webviewRef.current?.goForward()}
        >
          <ArrowRightIcon className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Reload"
          title="Reload"
          onClick={reload}
        >
          <RefreshCwIcon className={runtime.loading ? "size-4 animate-spin" : "size-4"} />
        </Button>
        <Input
          aria-label="Address"
          placeholder="Search or enter URL"
          value={address}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="h-7 min-w-0 flex-1 rounded-md bg-surface-base px-3 text-sm shadow-none"
          onChange={(event) => setAddress(event.target.value)}
          onFocus={(event) => event.currentTarget.select()}
        />
      </form>
      {surfaceMessage ? (
        <div
          role="status"
          className="shrink-0 border-b border-border-weaker-base bg-surface-base px-3 py-2 text-xs text-text-weak"
        >
          {surfaceMessage}
        </div>
      ) : null}
      <webview
        key={webviewGeneration}
        ref={setWebviewRef}
        allowpopups
        src={webviewSource}
        partition={browser.partition}
        webpreferences={browser.webPreferences}
        className="min-h-0 flex-1 bg-white"
        data-browser-tab-id={props.target.tabID}
      />
    </div>
  )
}
