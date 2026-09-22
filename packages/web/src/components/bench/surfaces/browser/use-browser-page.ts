import { useCallback, useEffect, useRef, useState } from "react"
import {
  inAppBrowserFallbackTitle,
  isInAppBrowserTargetUrl,
  normalizeInAppBrowserTitle,
  normalizeInAppBrowserUrl,
} from "@buddy/browser-contract"
import type { InAppBrowserPlatform } from "@/context/platform"
import {
  INITIAL_IN_APP_BROWSER_CRASH_RECOVERY_STATE,
  planInAppBrowserCrashRecovery,
} from "@/lib/in-app-browser-crash-recovery"
import {
  resolveInAppBrowserInput,
  type InAppBrowserSearchEngine,
  type RejectedInAppBrowserInput,
} from "@/lib/in-app-browser-search"
import {
  createInAppBrowserNavigationTracker,
  inAppBrowserMainFrameLoadFailure,
  inAppBrowserMainFrameNavigationStart,
  inAppBrowserRuntimeAfterFavicon,
  inAppBrowserRuntimeAfterLoadStopped,
  readInAppBrowserWebviewSnapshot,
  runTrackedInAppBrowserNavigation,
  shouldApplyInAppBrowserSnapshot,
} from "@/lib/in-app-browser-events"
import {
  useInAppBrowserTabsStore,
  type InAppBrowserTabRuntime,
} from "@/state/in-app-browser-tabs-store"
import type { InAppBrowserWebview, WithInAppBrowserWebview } from "./in-app-browser-webview"

const INVALID_ADDRESS_NOTICE = "Enter a valid HTTP or HTTPS address."

function rejectedInputNotice(reason: RejectedInAppBrowserInput["reason"]): string {
  if (reason === "empty") return "Enter a search or address."
  if (reason === "too-long") return "That search or address is too long."
  if (reason === "unsupported-protocol") return "This address type is not supported."
  return INVALID_ADDRESS_NOTICE
}

export function useBrowserPage(input: {
  tabID: string
  initialUrl: string
  searchEngine: InAppBrowserSearchEngine
  browser: InAppBrowserPlatform
  onAttached: (webview: InAppBrowserWebview, webContentsID: number, observedPageUrl: string) => void
}) {
  const { tabID, browser, onAttached } = input
  const webviewRef = useRef<InAppBrowserWebview | null>(null)
  const attachedWebviewRef = useRef<InAppBrowserWebview | null>(null)
  const pendingNavigationUrlRef = useRef<string | null>(null)
  const pendingNavigationStartedRef = useRef(false)
  const pendingNavigationObservedRef = useRef(false)
  const navigationTrackerRef = useRef(createInAppBrowserNavigationTracker())
  const crashRecoveryRef = useRef(INITIAL_IN_APP_BROWSER_CRASH_RECOVERY_STATE)
  const restartTimerRef = useRef<number | undefined>(undefined)
  const [webContentsID, setWebContentsID] = useState<number | null>(null)
  const [webviewGeneration, setWebviewGeneration] = useState(0)
  const [webviewSource, setWebviewSource] = useState(input.initialUrl)
  const [observedPageUrl, setObservedPageUrl] = useState(input.initialUrl)
  const [notice, setNotice] = useState<string | null>(null)
  const [runtime, setRuntimeState] = useState<InAppBrowserTabRuntime>(() => ({
    url: input.initialUrl,
    title: inAppBrowserFallbackTitle(input.initialUrl),
    loading: true,
    canGoBack: false,
    canGoForward: false,
    favicon: null,
    error: null,
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
    useInAppBrowserTabsStore.getState().setTab(tabID, runtime)
  }, [tabID, runtime])

  useEffect(
    () => () => {
      window.clearTimeout(restartTimerRef.current)
      useInAppBrowserTabsStore.getState().removeTab(tabID)
    },
    [tabID],
  )

  useEffect(() => {
    if (webContentsID === null) return
    return browser.onMessage((message) => {
      if (message.webContentsID !== webContentsID) return
      setNotice(message.message)
    })
  }, [browser, webContentsID])

  useEffect(() => {
    if (webContentsID === null) return
    return browser.onFavicon((message) => {
      if (message.webContentsID !== webContentsID) return
      updateRuntime((current) => inAppBrowserRuntimeAfterFavicon(current, message.favicon))
    })
  }, [browser, updateRuntime, webContentsID])

  const restartWebview = useCallback((url: string) => {
    attachedWebviewRef.current = null
    pendingNavigationStartedRef.current = false
    pendingNavigationObservedRef.current = false
    setWebContentsID(null)
    setWebviewSource(url)
    setWebviewGeneration((generation) => generation + 1)
  }, [])

  const loadNavigation = useCallback(
    (webview: InAppBrowserWebview, url: string): void => {
      void runTrackedInAppBrowserNavigation({
        url,
        tracker: navigationTrackerRef.current,
        loadURL: (nextUrl) => webview.loadURL(nextUrl),
        onCurrentFailure: () => {
          if (pendingNavigationUrlRef.current === url) {
            pendingNavigationUrlRef.current = null
            pendingNavigationStartedRef.current = false
            pendingNavigationObservedRef.current = false
          }
          updateRuntime((current) =>
            current.error
              ? current
              : { ...current, loading: false, error: { _tag: "open-failed" } },
          )
        },
      })
    },
    [updateRuntime],
  )

  useEffect(() => {
    const webview = webviewRef.current
    if (!webview) return

    let disposed = false
    const synchronizeAttachedState = () => {
      if (disposed) return
      const snapshot = readInAppBrowserWebviewSnapshot(webview, runtimeRef.current)
      if (!snapshot) return
      attachedWebviewRef.current = webview
      setObservedPageUrl(snapshot.runtime.url)
      onAttached(webview, snapshot.webContentsID, snapshot.runtime.url)
      setWebContentsID(snapshot.webContentsID)
      const pendingUrl = pendingNavigationUrlRef.current
      if (pendingUrl && snapshot.runtime.url !== pendingUrl) {
        updateRuntime(() => ({
          ...snapshot.runtime,
          url: pendingUrl,
          title: inAppBrowserFallbackTitle(pendingUrl),
          loading: true,
          favicon: null,
          error: null,
        }))
        if (!pendingNavigationStartedRef.current) {
          pendingNavigationStartedRef.current = true
          loadNavigation(webview, pendingUrl)
        }
        return
      }
      pendingNavigationUrlRef.current = null
      pendingNavigationStartedRef.current = false
      pendingNavigationObservedRef.current = false
      updateRuntime(() => snapshot.runtime)
    }
    const didStartNavigation = (event: Event) => {
      const pendingUrl = pendingNavigationUrlRef.current
      if (!pendingUrl) return
      if (inAppBrowserMainFrameNavigationStart(event) === pendingUrl) {
        pendingNavigationObservedRef.current = true
      }
    }
    const didStartLoading = () => {
      setNotice(null)
      updateRuntime((current) => ({ ...current, loading: true, error: null }))
    }
    const didStopLoading = () => {
      const current = runtimeRef.current
      const snapshot = readInAppBrowserWebviewSnapshot(webview, current)
      const pendingUrl = pendingNavigationUrlRef.current
      if (pendingUrl && !snapshot) return
      if (
        snapshot &&
        !shouldApplyInAppBrowserSnapshot({
          pendingUrl,
          pendingNavigationObserved: pendingNavigationObservedRef.current,
          observedUrl: snapshot.runtime.url,
          confirmedNavigation: false,
        })
      ) {
        return
      }
      if (pendingUrl) {
        pendingNavigationUrlRef.current = null
        pendingNavigationStartedRef.current = false
        pendingNavigationObservedRef.current = false
      }
      if (snapshot) setObservedPageUrl(snapshot.runtime.url)
      updateRuntime(() => inAppBrowserRuntimeAfterLoadStopped(current, snapshot?.runtime))
    }
    const didNavigate = () => {
      const current = runtimeRef.current
      const snapshot = readInAppBrowserWebviewSnapshot(webview, current)
      const pendingUrl = pendingNavigationUrlRef.current
      if (pendingUrl && !snapshot) return
      const next = snapshot?.runtime ?? current
      if (
        !shouldApplyInAppBrowserSnapshot({
          pendingUrl,
          pendingNavigationObserved: pendingNavigationObservedRef.current,
          observedUrl: next.url,
          confirmedNavigation: true,
        })
      ) {
        return
      }
      if (pendingUrl) {
        pendingNavigationUrlRef.current = null
        pendingNavigationStartedRef.current = false
        pendingNavigationObservedRef.current = false
      }
      if (snapshot) setObservedPageUrl(snapshot.runtime.url)
      updateRuntime(() => next)
    }
    const pageTitleUpdated = () => {
      const snapshot = readInAppBrowserWebviewSnapshot(webview, runtimeRef.current)
      const pendingUrl = pendingNavigationUrlRef.current
      if (
        snapshot &&
        !shouldApplyInAppBrowserSnapshot({
          pendingUrl,
          pendingNavigationObserved: pendingNavigationObservedRef.current,
          observedUrl: snapshot.runtime.url,
          confirmedNavigation: false,
        })
      ) {
        return
      }
      if (snapshot) {
        setObservedPageUrl(snapshot.runtime.url)
        updateRuntime(() => snapshot.runtime)
      }
    }
    const didFailLoad = (event: Event) => {
      const failure = inAppBrowserMainFrameLoadFailure(event)
      if (!failure) return
      const pendingUrl = pendingNavigationUrlRef.current
      if (pendingUrl && failure.url !== pendingUrl && !pendingNavigationObservedRef.current) {
        return
      }
      pendingNavigationUrlRef.current = null
      pendingNavigationStartedRef.current = false
      pendingNavigationObservedRef.current = false
      updateRuntime((current) => {
        const failedUrl = failure.url ?? current.url
        const url = isInAppBrowserTargetUrl(failedUrl) ? failedUrl : current.url
        return {
          ...current,
          url,
          title: normalizeInAppBrowserTitle("", url),
          favicon: null,
          loading: false,
          error: {
            _tag: "load-failed",
            url,
            code: failure.code,
            description: failure.description,
          },
        }
      })
    }
    const renderProcessGone = () => {
      if (restartTimerRef.current !== undefined) return
      attachedWebviewRef.current = null
      setWebContentsID(null)
      const plan = planInAppBrowserCrashRecovery(crashRecoveryRef.current, Date.now())
      if (plan["_tag"] === "give-up") {
        updateRuntime((current) => ({ ...current, loading: false, error: { _tag: "crashed" } }))
        return
      }
      crashRecoveryRef.current = plan.state
      updateRuntime((current) => ({ ...current, loading: true, error: null }))
      window.clearTimeout(restartTimerRef.current)
      restartTimerRef.current = window.setTimeout(() => {
        restartTimerRef.current = undefined
        restartWebview(runtimeRef.current.url)
      }, plan.delayMs)
    }

    webview.addEventListener("did-attach", synchronizeAttachedState)
    webview.addEventListener("dom-ready", synchronizeAttachedState)
    webview.addEventListener("did-start-loading", didStartLoading)
    webview.addEventListener("did-start-navigation", didStartNavigation)
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
      webview.removeEventListener("did-attach", synchronizeAttachedState)
      webview.removeEventListener("dom-ready", synchronizeAttachedState)
      webview.removeEventListener("did-start-loading", didStartLoading)
      webview.removeEventListener("did-start-navigation", didStartNavigation)
      webview.removeEventListener("did-stop-loading", didStopLoading)
      webview.removeEventListener("did-navigate", didNavigate)
      webview.removeEventListener("did-navigate-in-page", didNavigate)
      webview.removeEventListener("page-title-updated", pageTitleUpdated)
      webview.removeEventListener("did-fail-load", didFailLoad)
      webview.removeEventListener("render-process-gone", renderProcessGone)
    }
  }, [loadNavigation, onAttached, restartWebview, updateRuntime, webviewGeneration])

  const setWebviewRef = useCallback((webview: InAppBrowserWebview | null) => {
    if (webview === null) attachedWebviewRef.current = null
    webviewRef.current = webview
  }, [])

  const withWebview: WithInAppBrowserWebview = useCallback((action) => {
    const webview = webviewRef.current
    if (!webview) return
    try {
      action(webview)
    } catch {
      return
    }
  }, [])

  const commitNavigation = useCallback(
    (url: string): boolean => {
      setNotice(null)
      const current = runtimeRef.current
      updateRuntime((current) => ({ ...current, url, loading: true, error: null }))
      if (current.error?.["_tag"] === "crashed") {
        pendingNavigationUrlRef.current = null
        pendingNavigationObservedRef.current = false
        crashRecoveryRef.current = INITIAL_IN_APP_BROWSER_CRASH_RECOVERY_STATE
        restartWebview(url)
        return true
      }
      pendingNavigationUrlRef.current = url
      pendingNavigationStartedRef.current = false
      pendingNavigationObservedRef.current = false
      const webview = webviewRef.current
      if (!webview || attachedWebviewRef.current !== webview) return true
      pendingNavigationStartedRef.current = true
      loadNavigation(webview, url)
      return true
    },
    [loadNavigation, restartWebview, updateRuntime],
  )

  const navigateUrl = useCallback(
    (address: string): boolean => {
      const url = normalizeInAppBrowserUrl(address)
      if (!url) {
        setNotice(INVALID_ADDRESS_NOTICE)
        return false
      }
      return commitNavigation(url)
    },
    [commitNavigation],
  )

  const submitInput = useCallback(
    (value: string): boolean => {
      const resolution = resolveInAppBrowserInput(value, input.searchEngine)
      if (resolution["_tag"] === "rejected") {
        setNotice(rejectedInputNotice(resolution.reason))
        return false
      }
      return commitNavigation(resolution.url)
    },
    [commitNavigation, input.searchEngine],
  )

  const reload = useCallback(() => {
    setNotice(null)
    const current = runtimeRef.current
    if (current.error?.["_tag"] !== "crashed") {
      withWebview((webview) => webview.reload())
      return
    }
    crashRecoveryRef.current = INITIAL_IN_APP_BROWSER_CRASH_RECOVERY_STATE
    updateRuntime((latest) => ({ ...latest, loading: true, error: null }))
    restartWebview(current.url)
  }, [restartWebview, updateRuntime, withWebview])

  const hardReload = useCallback(() => {
    setNotice(null)
    const current = runtimeRef.current
    if (current.error?.["_tag"] !== "crashed") {
      withWebview((webview) => webview.reloadIgnoringCache())
      return
    }
    crashRecoveryRef.current = INITIAL_IN_APP_BROWSER_CRASH_RECOVERY_STATE
    updateRuntime((latest) => ({ ...latest, loading: true, error: null }))
    restartWebview(current.url)
  }, [restartWebview, updateRuntime, withWebview])

  return {
    setWebviewRef,
    webviewKey: webviewGeneration,
    webviewSource,
    webContentsID,
    observedPageUrl,
    runtime,
    notice,
    withWebview,
    navigateUrl,
    submitInput,
    reload,
    hardReload,
  }
}
