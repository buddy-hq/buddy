import { create } from "zustand"
import type { InAppBrowserFavicon } from "@buddy/browser-contract"

export type InAppBrowserTabRuntime = {
  url: string
  title: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  favicon: InAppBrowserFavicon | null
  error: string | null
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
    left.error === right.error
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
