import {
  CITATION_SCHEMA_VERSION,
  type Citation,
  type WebCitationSource,
} from "@buddy/citation-contract"
import type {
  InAppBrowserCitationCapture,
  InAppBrowserCitationPoint,
  InAppBrowserCitationRect,
} from "@buddy/browser-contract"
import {
  parseInAppBrowserProfileID,
  resolveInAppBrowserProfiles,
  type InAppBrowserProfileID,
} from "@buddy/browser-contract/profiles"
import type { RefObject } from "react"
import type { InAppBrowserPlatform } from "@/context/platform"
import type { BenchTabTarget, BenchTarget } from "@/lib/bench-navigation"
import type { BenchTab } from "@/lib/bench-tabs"
import type { CitationCommentSource } from "@/lib/citations/comment-request"
import { detachedCitationCommentRect } from "@/lib/citations/comment-source"
import {
  BENCH_ROUTE_STATUS_OPEN,
  workspacePresentationSlotForChat,
  type DirectoryWorkspaceStoreState,
} from "@/state/directory-workspace-store"
import { useInAppBrowserSettingsStore } from "@/state/in-app-browser-settings-store"
import { useInAppBrowserTabsStore } from "@/state/in-app-browser-tabs-store"

export type BrowserBenchTarget = Extract<BenchTarget, { type: "browser" }>

export type WebCitation = Citation & { readonly source: WebCitationSource }

type WebCitationRevealer = (citation: WebCitation) => Promise<void>

export type WebCitationMarkListener = {
  moved(rect: InAppBrowserCitationRect): void
  lost(): void
}

const HASH_ROUTE_PATTERN = /^#[!/]/u
const TEXT_FRAGMENT_DIRECTIVE = ":~:"

const webCitationRevealers = new Map<string, WebCitationRevealer>()

export function registerWebCitationRevealer(
  tabID: string,
  revealer: WebCitationRevealer,
): () => void {
  webCitationRevealers.set(tabID, revealer)
  return () => {
    if (webCitationRevealers.get(tabID) === revealer) webCitationRevealers.delete(tabID)
  }
}

export function webCitationRevealer(tabID: string): WebCitationRevealer | undefined {
  return webCitationRevealers.get(tabID)
}

export function createWebCitationID(): string {
  const random = Math.random().toString(36).slice(2, 10)
  return `web_sel_${Date.now().toString(36)}_${random}`
}

export function createWebCitation(input: {
  id: string
  capture: InAppBrowserCitationCapture
  profileID: InAppBrowserProfileID
}): WebCitation {
  const { capture } = input
  return {
    schemaVersion: CITATION_SCHEMA_VERSION,
    id: input.id,
    excerpt: capture.excerpt,
    source: {
      kind: "web",
      url: capture.url,
      profileID: input.profileID,
      selector: capture.selector,
    },
    presentation: Object.assign(
      { title: capture.title },
      capture.headingPath?.length ? { headingPath: [...capture.headingPath] } : undefined,
    ),
  }
}

function webCitationPageKey(url: string): string {
  try {
    const parsed = new URL(url)
    const fragment = parsed.hash.split(TEXT_FRAGMENT_DIRECTIVE)[0] ?? ""
    parsed.hash = HASH_ROUTE_PATTERN.test(fragment) ? fragment : ""
    return parsed.href
  } catch {
    return url
  }
}

export function isSameWebCitationPage(left: string, right: string): boolean {
  return webCitationPageKey(left) === webCitationPageKey(right)
}

export function resolveWebCitationProfileID(input: {
  profileID: string | undefined
  knownProfileIDs: readonly string[]
  defaultProfileID: InAppBrowserProfileID
}): InAppBrowserProfileID {
  const profileID = parseInAppBrowserProfileID(input.profileID)
  return profileID && input.knownProfileIDs.includes(profileID) ? profileID : input.defaultProfileID
}

export function selectWebCitationTab(input: {
  tabs: readonly BenchTab[]
  activeTarget: BenchTabTarget | undefined
  pageUrls: ReadonlyMap<string, string>
  url: string
  profileID: InAppBrowserProfileID
  defaultProfileID: InAppBrowserProfileID
}): BrowserBenchTarget | undefined {
  const matches = input.tabs.flatMap((tab) => {
    const target = tab.target
    if (target.type !== "browser") return []
    if ((target.profileID ?? input.defaultProfileID) !== input.profileID) return []
    const pageUrl = input.pageUrls.get(target.tabID) ?? target.url
    return isSameWebCitationPage(pageUrl, input.url) ? [target] : []
  })
  const active = input.activeTarget
  return (
    matches.find((target) => active?.type === "browser" && active.tabID === target.tabID) ??
    matches[0]
  )
}

export function resolveWebCitationTarget(input: {
  workspace: Pick<DirectoryWorkspaceStoreState, "slots" | "activeChatKey">
  source: WebCitationSource
}) {
  const settings = useInAppBrowserSettingsStore.getState()
  const profileID = resolveWebCitationProfileID({
    profileID: input.source.profileID,
    knownProfileIDs: resolveInAppBrowserProfiles(settings.userProfiles).map(
      (profile) => profile.id,
    ),
    defaultProfileID: settings.defaultProfileID,
  })
  const slot = workspacePresentationSlotForChat(
    input.workspace.slots,
    input.workspace.activeChatKey,
  )
  const pageUrls = new Map<string, string>()
  for (const [tabID, runtime] of Object.entries(useInAppBrowserTabsStore.getState().byTabID)) {
    pageUrls.set(tabID, runtime.url)
  }
  const openTab = selectWebCitationTab({
    tabs: slot.tabs,
    activeTarget: slot.route.status === BENCH_ROUTE_STATUS_OPEN ? slot.route.target : undefined,
    pageUrls,
    url: input.source.url,
    profileID,
    defaultProfileID: settings.defaultProfileID,
  })
  return { profileID, openTab }
}

export function hostPointFromGuest(
  point: InAppBrowserCitationPoint,
  webviewRect: DOMRect,
  zoomFactor: number,
): InAppBrowserCitationPoint {
  return { x: webviewRect.left + point.x * zoomFactor, y: webviewRect.top + point.y * zoomFactor }
}

export function hostRectFromGuest(
  rect: InAppBrowserCitationRect,
  webviewRect: DOMRect,
  zoomFactor: number,
): DOMRect {
  return new DOMRect(
    webviewRect.left + rect.x * zoomFactor,
    webviewRect.top + rect.y * zoomFactor,
    rect.width * zoomFactor,
    rect.height * zoomFactor,
  )
}

export function browserCitationCommentSource(input: {
  browser: Pick<InAppBrowserPlatform, "markCitation" | "unmarkCitation">
  webContentsID: number
  excerpt: string
  source: WebCitationSource
  rect: InAppBrowserCitationRect
  pageAreaRef: RefObject<HTMLElement | null>
  readZoomFactor: () => number
  markListeners: Map<string, WebCitationMarkListener>
}): CitationCommentSource {
  let rect = input.rect
  return {
    getBoundingClientRect() {
      const pageArea = input.pageAreaRef.current
      if (!pageArea) return detachedCitationCommentRect()
      return hostRectFromGuest(rect, pageArea.getBoundingClientRect(), input.readZoomFactor())
    },
    get contextElement() {
      return input.pageAreaRef.current ?? document.documentElement
    },
    mark(onUnavailable) {
      const markID = crypto.randomUUID()
      let disposed = false
      const dispose = () => {
        if (disposed) return
        disposed = true
        input.markListeners.delete(markID)
        void input.browser.unmarkCitation({ webContentsID: input.webContentsID, markID })
      }
      const unavailable = () => {
        if (disposed) return
        dispose()
        onUnavailable()
      }
      input.markListeners.set(markID, {
        moved: (next) => {
          rect = next
        },
        lost: unavailable,
      })
      void input.browser
        .markCitation({
          webContentsID: input.webContentsID,
          markID,
          excerpt: input.excerpt,
          selector: input.source.selector,
        })
        .then((result) => {
          if (result["_tag"] !== "found") unavailable()
        }, unavailable)
      return dispose
    },
  }
}
