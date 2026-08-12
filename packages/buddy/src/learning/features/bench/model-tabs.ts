import path from "node:path"
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

function searchableTabValues(tab: NumberedBenchTab): string[] {
  const target = tab.target
  if (target.type === "workspace-file") {
    return [tab.title, tab.tabKey, `tab ${tab.tabNumber}`, target.type, target.path, target.viewer]
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
  target: BenchTabSummary["target"]
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
}): ModelVisibleBenchTarget {
  const absolutePath = benchTargetAbsolutePath(input)
  const { target } = input
  if (target.type === "workspace-file") {
    return {
      type: target.type,
      path: target.path,
      absolutePath,
      viewer: target.viewer,
    }
  }
  return {
    type: target.type,
    kind: target.ref.kind,
    objectID: target.ref.objectID,
    absolutePath,
    ...(target.ref.revisionID ? { revisionID: target.ref.revisionID } : {}),
    ...(target.ref.itemID ? { itemID: target.ref.itemID } : {}),
    viewID: target.viewID,
  }
}

function projectModelVisibleBenchTabs(input: {
  directory: string
  tabs: readonly BenchTabSummary[]
  selectedTabKey: string
  selectedTabTitle?: string
  limit: number
  tabSearch?: string
}): ModelVisibleBenchTabs {
  const numberedTabs = input.tabs.map((tab, index) =>
    tab.tabKey === input.selectedTabKey && input.selectedTabTitle
      ? {
          ...tab,
          title: input.selectedTabTitle,
          tabNumber: index + TAB_NUMBER_OFFSET,
        }
      : {
          ...tab,
          tabNumber: index + TAB_NUMBER_OFFSET,
        },
  )
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
      target: modelVisibleTarget({ directory: input.directory, target: tab.target }),
    }
  })

  return {
    openTabCount: input.tabs.length,
    matchingTabCount: matchingTabs.length,
    omittedTabCount: Math.max(0, matchingTabs.length - returnedMatchingTabCount),
    tabs,
  }
}

export {
  BENCH_READ_CONTEXT_TAB_LIMIT,
  BENCH_TURN_CONTEXT_TAB_LIMIT,
  benchTargetAbsolutePath,
  projectModelVisibleBenchTabs,
}
export type { ModelVisibleBenchTab, ModelVisibleBenchTabs }
