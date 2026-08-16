import { parseTJsonObject, parseTString } from "@/components/chat/tools/types"
import { isSameBenchTarget, readBenchTabTarget, type BenchTabTarget } from "@/lib/bench-targets"

export type BenchTab = {
  key: string
  target: BenchTabTarget
}

export type BenchTabSelection = {
  tabs: BenchTab[]
  activeTabKey: string | null
}

const EMPTY_BENCH_TAB_TITLES = new Map<string, string>()

export function benchTabKey(target: BenchTabTarget): string {
  if (target.type === "session") {
    return `session:${encodeURIComponent(target.sessionID)}`
  }
  if (target.type === "workspace-file") {
    return `file:${target.viewer}:${encodeURIComponent(target.path)}`
  }

  return `object:${target.ref.kind}:${encodeURIComponent(target.ref.objectID)}:${encodeURIComponent(target.viewID)}`
}

export function benchTabFallbackTitle(target: BenchTabTarget): string {
  if (target.type === "session") return "Subagent"
  if (target.type === "workspace-file") {
    return target.path.replaceAll("\\", "/").split("/").at(-1) ?? target.path
  }

  switch (target.ref.kind) {
    case "resource":
      return "Resource"
    case "whiteboard":
      return "Whiteboard"
    case "mermaid":
      return "Diagram"
    case "html-widget":
      return "Widget"
    case "figure":
    case "freeform-figure":
      return "Figure"
    case "media-presentation":
      return "Presentation"
    case "question-set":
      return "Question set"
    case "flashcard-deck":
      return "Flashcards"
  }
}

export function resolveBenchTabTitle(
  tab: BenchTab,
  objectTitles: ReadonlyMap<string, string>,
  sessionTitles: ReadonlyMap<string, string> = EMPTY_BENCH_TAB_TITLES,
): string {
  if (tab.target.type === "session") {
    return sessionTitles.get(tab.target.sessionID) ?? benchTabFallbackTitle(tab.target)
  }
  if (tab.target.type === "object") {
    return objectTitles.get(tab.target.ref.objectID) ?? benchTabFallbackTitle(tab.target)
  }
  return benchTabFallbackTitle(tab.target)
}

export function readBenchTab<TValue>(value: TValue): BenchTab | undefined {
  const record = parseTJsonObject(value)
  if (!record) return undefined
  const key = parseTString(record.key)
  if (key === undefined) return undefined
  const target = readBenchTabTarget(record.target)
  if (!target || key !== benchTabKey(target)) return undefined
  return { key, target }
}

export function areBenchTabsEqual(left: readonly BenchTab[], right: readonly BenchTab[]): boolean {
  return (
    left.length === right.length &&
    left.every((tab, index) => {
      const candidate = right[index]
      return candidate?.key === tab.key && isSameBenchTarget(candidate.target, tab.target)
    })
  )
}

export function upsertBenchTab(
  tabs: readonly BenchTab[],
  target: BenchTabTarget,
): BenchTabSelection {
  const key = benchTabKey(target)
  const index = tabs.findIndex((tab) => tab.key === key)
  if (index < 0) {
    return {
      tabs: [...tabs, { key, target }],
      activeTabKey: key,
    }
  }

  const existing = tabs[index]
  if (existing?.target === target) {
    return { tabs: [...tabs], activeTabKey: key }
  }

  return {
    tabs: tabs.map((tab) => (tab.key === key ? { key, target } : tab)),
    activeTabKey: key,
  }
}

export function closeBenchTab(input: {
  tabs: readonly BenchTab[]
  activeTabKey: string | null
  tabKey: string
}): BenchTabSelection {
  const closingIndex = input.tabs.findIndex((tab) => tab.key === input.tabKey)
  if (closingIndex < 0) {
    return { tabs: [...input.tabs], activeTabKey: input.activeTabKey }
  }

  const tabs = input.tabs.filter((tab) => tab.key !== input.tabKey)
  if (input.activeTabKey !== input.tabKey) {
    return { tabs, activeTabKey: input.activeTabKey }
  }

  return {
    tabs,
    activeTabKey: tabs[Math.min(closingIndex, tabs.length - 1)]?.key ?? null,
  }
}

export function closeOtherBenchTabs(input: {
  tabs: readonly BenchTab[]
  tabKey: string
}): BenchTabSelection {
  const tab = input.tabs.find((candidate) => candidate.key === input.tabKey)
  if (!tab) return { tabs: [...input.tabs], activeTabKey: null }
  return { tabs: [tab], activeTabKey: tab.key }
}

export function closeBenchTabsToRight(input: {
  tabs: readonly BenchTab[]
  activeTabKey: string | null
  tabKey: string
}): BenchTabSelection {
  const tabIndex = input.tabs.findIndex((tab) => tab.key === input.tabKey)
  if (tabIndex < 0 || tabIndex === input.tabs.length - 1) {
    return { tabs: [...input.tabs], activeTabKey: input.activeTabKey }
  }

  const tabs = input.tabs.slice(0, tabIndex + 1)
  const activeTabKey = tabs.some((tab) => tab.key === input.activeTabKey)
    ? input.activeTabKey
    : input.tabKey
  return { tabs, activeTabKey }
}

export function closeAllBenchTabs(): BenchTabSelection {
  return { tabs: [], activeTabKey: null }
}
