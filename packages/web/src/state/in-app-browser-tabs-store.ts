import { create } from "zustand"
import type { InAppBrowserFavicon } from "@buddy/browser-contract"

export type InAppBrowserPageError =
  | {
      readonly _tag: "load-failed"
      readonly url: string
      readonly code: number
      readonly description: string
    }
  | { readonly _tag: "open-failed" }
  | { readonly _tag: "crashed" }
  | { readonly _tag: "unavailable" }

export type InAppBrowserTabRuntime = {
  url: string
  title: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  favicon: InAppBrowserFavicon | null
  error: InAppBrowserPageError | null
}

export type InAppBrowserTabContextRuntime = Pick<
  InAppBrowserTabRuntime,
  "url" | "title" | "loading"
>

type InAppBrowserTabsState = {
  byTabID: Record<string, InAppBrowserTabRuntime>
  setTab(tabID: string, runtime: InAppBrowserTabRuntime): void
  removeTab(tabID: string): void
}

function samePageError(
  left: InAppBrowserPageError | null,
  right: InAppBrowserPageError | null,
): boolean {
  if (left === null || right === null) return left === right
  if (left["_tag"] === "load-failed" && right["_tag"] === "load-failed") {
    return (
      left.url === right.url && left.code === right.code && left.description === right.description
    )
  }
  return left["_tag"] === right["_tag"]
}

function sameRuntime(
  left: InAppBrowserTabRuntime | undefined,
  right: InAppBrowserTabRuntime,
): boolean {
  return (
    left?.url === right.url &&
    left.title === right.title &&
    left.loading === right.loading &&
    left.canGoBack === right.canGoBack &&
    left.canGoForward === right.canGoForward &&
    left.favicon?.dataUrl === right.favicon?.dataUrl &&
    left.favicon?.pageUrl === right.favicon?.pageUrl &&
    left.favicon?.capturedAt === right.favicon?.capturedAt &&
    samePageError(left.error, right.error)
  )
}

export const useInAppBrowserTabsStore = create<InAppBrowserTabsState>((set) => ({
  byTabID: {},
  setTab(tabID, runtime) {
    set((state) =>
      sameRuntime(state.byTabID[tabID], runtime)
        ? state
        : { byTabID: { ...state.byTabID, [tabID]: runtime } },
    )
  },
  removeTab(tabID) {
    set((state) => {
      if (!(tabID in state.byTabID)) return state
      const { [tabID]: _removed, ...byTabID } = state.byTabID
      return { byTabID }
    })
  },
}))

export function inAppBrowserTabTitle(tabID: string): string | undefined {
  return useInAppBrowserTabsStore.getState().byTabID[tabID]?.title
}

export function inAppBrowserTabContextRuntime(
  tabID: string,
): InAppBrowserTabContextRuntime | undefined {
  const runtime = useInAppBrowserTabsStore.getState().byTabID[tabID]
  if (!runtime) return undefined
  return {
    url: runtime.url,
    title: runtime.title,
    loading: runtime.loading,
  }
}
