import path from "node:path"
import { normalizeInAppBrowserTitle } from "@buddy/browser-contract"
import { BuddyObjectPath } from "../../../objects"
import type { BenchTabSummary } from "./context"

const BENCH_READ_CONTEXT_TAB_LIMIT = 20
const BENCH_TURN_CONTEXT_TAB_LIMIT = 6
const TAB_NUMBER_OFFSET = 1
const TAB_NUMBER_SEARCH_PATTERN = /^tab\s+(\d+)$/u

type ModelVisibleBenchTarget =
  | {
      type: "workspace-file"
      path: string
      absolutePath: string
      viewer: "markdown" | "file"
    }
  | {
      type: "browser"
      tabID: string
      url: string
    }
  | {
      type: "object"
      kind: Extract<BenchTabSummary["target"], { type: "object" }>["ref"]["kind"]
      objectID: string
      absolutePath: string
      revisionID?: string
      itemID?: string
      viewID: string
    }

type NumberedBenchTab = BenchTabSummary & {
  tabNumber: number
}

type ModelVisibleBenchTab = Pick<BenchTabSummary, "tabKey" | "title"> & {
  tabNumber: number
  selected?: true
  target?: ModelVisibleBenchTarget
}

type ModelVisibleBenchTabs = {
  openTabCount: number
  matchingTabCount: number
  omittedTabCount: number
  tabs: ModelVisibleBenchTab[]
}

type ModelVisibleSelectedBrowser = {
  tabID: string
  url: string
  title: string
  loading: boolean
}

type ModelVisibleBrowserTab = {
  tabNumber: number
  tabKey: string
  tabID: string
  title: string
  url: string
  selected?: true
  loading?: boolean
}

type ModelVisibleBrowserTabs = {
  openTabCount: number
  omittedTabCount: number
  tabs: ModelVisibleBrowserTab[]
}

function searchableTabValues(tab: NumberedBenchTab): string[] {
  const target = tab.target
  if (target.type === "workspace-file") {
    return [tab.title, tab.tabKey, `tab ${tab.tabNumber}`, target.type, target.path, target.viewer]
  }

  if (target.type === "browser") {
    return [tab.title, tab.tabKey, `tab ${tab.tabNumber}`, target.type, target.tabID, target.url]
  }

  return [
    tab.title,
    tab.tabKey,
    `tab ${tab.tabNumber}`,
    target.type,
    target.ref.kind,
    target.ref.objectID,
    target.ref.revisionID ?? "",
    target.ref.itemID ?? "",
    target.viewID,
  ]
}

function tabMatchesSearch(tab: NumberedBenchTab, normalizedSearch: string): boolean {
  const tabNumberMatch = TAB_NUMBER_SEARCH_PATTERN.exec(normalizedSearch)
  if (tabNumberMatch) {
    const searchedTabNumber = Number(tabNumberMatch[1])
    return Number.isSafeInteger(searchedTabNumber) && tab.tabNumber === searchedTabNumber
  }
  return searchableTabValues(tab).some((value) => value.toLowerCase().includes(normalizedSearch))
}

function benchTargetAbsolutePath(input: {
  directory: string
  target: Exclude<BenchTabSummary["target"], { type: "browser" }>
}): string {
  if (input.target.type === "workspace-file") {
    return path.resolve(input.directory, input.target.path)
  }
  if (input.target.ref.revisionID) {
    return BuddyObjectPath.revisionDirectory({
      directory: input.directory,
      kind: input.target.ref.kind,
      objectID: input.target.ref.objectID,
      revisionID: input.target.ref.revisionID,
    })
  }
  return BuddyObjectPath.objectDirectory(
    input.directory,
    input.target.ref.kind,
    input.target.ref.objectID,
  )
}

function modelVisibleTarget(input: {
  directory: string
  target: BenchTabSummary["target"]
  selectedBrowser?: ModelVisibleSelectedBrowser
}): ModelVisibleBenchTarget {
  const { target } = input
  if (target.type === "browser") {
    return {
      type: target.type,
      tabID: target.tabID,
      url: input.selectedBrowser?.tabID === target.tabID ? input.selectedBrowser.url : target.url,
    }
  }
  const absolutePath = benchTargetAbsolutePath({
    directory: input.directory,
    target,
  })
  if (target.type === "workspace-file") {
    return {
      type: target.type,
      path: target.path,
      absolutePath,
      viewer: target.viewer,
    }
  }
  return Object.assign(
    {
      type: target.type,
      kind: target.ref.kind,
      objectID: target.ref.objectID,
      absolutePath,
      viewID: target.viewID,
    },
    target.ref.revisionID ? { revisionID: target.ref.revisionID } : undefined,
    target.ref.itemID ? { itemID: target.ref.itemID } : undefined,
  )
}

function projectModelVisibleBenchTabs(input: {
  directory: string
  tabs: readonly BenchTabSummary[]
  selectedTabKey: string
  selectedTabTitle?: string
  selectedBrowser?: ModelVisibleSelectedBrowser
  limit: number
  tabSearch?: string
}): ModelVisibleBenchTabs {
  const selectedTitle = input.selectedTabTitle ?? input.selectedBrowser?.title
  const numberedTabs = input.tabs.map((tab, index) => {
    return tab.tabKey === input.selectedTabKey && selectedTitle
      ? {
          ...tab,
          title:
            tab.target.type === "browser"
              ? normalizeInAppBrowserTitle(
                  selectedTitle,
                  input.selectedBrowser?.url ?? tab.target.url,
                )
              : selectedTitle,
          tabNumber: index + TAB_NUMBER_OFFSET,
        }
      : {
          ...tab,
          title:
            tab.target.type === "browser"
              ? normalizeInAppBrowserTitle(tab.title, tab.target.url)
              : tab.title,
          tabNumber: index + TAB_NUMBER_OFFSET,
        }
  })
  const selectedTab = numberedTabs.find((tab) => tab.tabKey === input.selectedTabKey)
  const normalizedSearch = input.tabSearch?.trim().toLowerCase()
  const newestFirst = numberedTabs.toReversed()
  const matchingTabs = normalizedSearch
    ? newestFirst.filter((tab) => tabMatchesSearch(tab, normalizedSearch))
    : newestFirst
  const orderedTabs = [
    ...(selectedTab ? [selectedTab] : []),
    ...matchingTabs.filter((tab) => tab.tabKey !== selectedTab?.tabKey),
  ]
  const returnedTabs = orderedTabs.slice(0, input.limit)
  const returnedMatchingTabCount = normalizedSearch
    ? returnedTabs.filter((tab) => tabMatchesSearch(tab, normalizedSearch)).length
    : returnedTabs.length
  const tabs = returnedTabs.map((tab): ModelVisibleBenchTab => {
    const summary = {
      tabNumber: tab.tabNumber,
      tabKey: tab.tabKey,
      title: tab.title,
    }
    if (tab.tabKey !== input.selectedTabKey) return summary
    return {
      tabNumber: tab.tabNumber,
      tabKey: tab.tabKey,
      title: tab.title,
      selected: true,
      target: modelVisibleTarget(
        Object.assign(
          { directory: input.directory, target: tab.target },
          input.selectedBrowser ? { selectedBrowser: input.selectedBrowser } : undefined,
        ),
      ),
    }
  })

  return {
    openTabCount: input.tabs.length,
    matchingTabCount: matchingTabs.length,
    omittedTabCount: Math.max(0, matchingTabs.length - returnedMatchingTabCount),
    tabs,
  }
}

function projectModelVisibleBrowserTabs(input: {
  tabs: readonly BenchTabSummary[]
  selectedTabKey: string
  selectedBrowser?: ModelVisibleSelectedBrowser
  limit: number
}): ModelVisibleBrowserTabs {
  const browserTabs = input.tabs.flatMap((tab, index): ModelVisibleBrowserTab[] => {
    if (tab.target.type !== "browser") return []
    const liveSelected =
      tab.tabKey === input.selectedTabKey && input.selectedBrowser?.tabID === tab.target.tabID
        ? input.selectedBrowser
        : undefined
    const selectedMarker: Pick<ModelVisibleBrowserTab, "selected"> | undefined =
      tab.tabKey === input.selectedTabKey ? { selected: true } : undefined
    return [
      Object.assign(
        {
          tabNumber: index + TAB_NUMBER_OFFSET,
          tabKey: tab.tabKey,
          tabID: tab.target.tabID,
          title: normalizeInAppBrowserTitle(
            liveSelected?.title ?? tab.title,
            liveSelected?.url ?? tab.target.url,
          ),
          url: liveSelected?.url ?? tab.target.url,
        },
        selectedMarker,
        liveSelected ? { loading: liveSelected.loading } : undefined,
      ),
    ]
  })
  const selectedTab = browserTabs.find((tab) => tab.selected)
  const orderedTabs = [
    ...(selectedTab ? [selectedTab] : []),
    ...browserTabs.toReversed().filter((tab) => tab.tabKey !== selectedTab?.tabKey),
  ]
  return {
    openTabCount: browserTabs.length,
    omittedTabCount: Math.max(0, browserTabs.length - input.limit),
    tabs: orderedTabs.slice(0, input.limit),
  }
}

export {
  BENCH_READ_CONTEXT_TAB_LIMIT,
  BENCH_TURN_CONTEXT_TAB_LIMIT,
  benchTargetAbsolutePath,
  projectModelVisibleBrowserTabs,
  projectModelVisibleBenchTabs,
}
export type {
  ModelVisibleBenchTab,
  ModelVisibleBenchTabs,
  ModelVisibleBrowserTab,
  ModelVisibleBrowserTabs,
  ModelVisibleSelectedBrowser,
}
