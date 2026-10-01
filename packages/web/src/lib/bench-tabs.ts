import { parseTJsonObject, parseTString } from "@/components/chat/tools/types"
import { inAppBrowserFallbackTitle } from "@buddy/browser-contract"
import { isSameBenchTarget, readBenchTabTarget, type BenchTabTarget } from "@/lib/bench-targets"
import { BENCH_WORKSPACE_ROOT_NOTES } from "@/lib/bench-targets"
import { normalizeInAppBrowserHistoryUrl } from "@/lib/in-app-browser-history"

export type BenchTab = {
  key: string
  target: BenchTabTarget
}

export type BenchTabSelection = {
  tabs: BenchTab[]
  activeTabKey: string | null
}

/** Reuse the live page URL, which can differ from the URL that created its tab. */
export function existingBrowserTabTarget(input: {
  tabs: readonly BenchTab[]
  target: Extract<BenchTabTarget, { type: "browser" }>
  runtimeUrls: Readonly<Record<string, { url: string } | undefined>>
}): Extract<BenchTabTarget, { type: "browser" }> | undefined {
  const url = normalizeInAppBrowserHistoryUrl(input.target.url)
  if (!url) return undefined
  const match = input.tabs.find(
    (tab) =>
      tab.target.type === "browser" &&
      (tab.target.profileID ?? "default") === (input.target.profileID ?? "default") &&
      normalizeInAppBrowserHistoryUrl(
        input.runtimeUrls[tab.target.tabID]?.url ?? tab.target.url,
      ) === url,
  )
  return match?.target.type === "browser" ? match.target : undefined
}

const EMPTY_BENCH_TAB_TITLES = new Map<string, string>()
const EMPTY_BENCH_TAB_KEY_PREFIX = "new-tab:"

export const EMPTY_BENCH_TAB_TITLE = "New tab"

export function createEmptyBenchTabID(): string {
  return crypto.randomUUID()
}

/** A New tab shares the tab key space, so the agent can list and focus it like an item tab. */
export function emptyBenchTabKey(id: string): string {
  return `${EMPTY_BENCH_TAB_KEY_PREFIX}${encodeURIComponent(id)}`
}

export function readEmptyBenchTabID(tabKey: string): string | undefined {
  if (!tabKey.startsWith(EMPTY_BENCH_TAB_KEY_PREFIX)) return undefined
  try {
    return decodeURIComponent(tabKey.slice(EMPTY_BENCH_TAB_KEY_PREFIX.length)) || undefined
  } catch {
    return undefined
  }
}

function workspaceFileTabKey(
  target: Extract<BenchTabTarget, { type: "workspace-file" }>,
  identity: string,
): string {
  return `file:${target.root}:${target.viewer}:${encodeURIComponent(identity)}`
}

function pathKeyForNotesTarget(target: BenchTabTarget): string | undefined {
  return target.type === "workspace-file" && target.root === BENCH_WORKSPACE_ROOT_NOTES && target.id
    ? workspaceFileTabKey(target, target.path)
    : undefined
}

export function benchTabKey(target: BenchTabTarget): string {
  if (target.type === "session") {
    return `session:${encodeURIComponent(target.sessionID)}`
  }
  if (target.type === "browser") {
    return `browser:${encodeURIComponent(target.tabID)}`
  }
  if (target.type === "workspace-file") {
    return workspaceFileTabKey(
      target,
      target.root === BENCH_WORKSPACE_ROOT_NOTES && target.id ? target.id : target.path,
    )
  }

  return `object:${target.ref.kind}:${encodeURIComponent(target.ref.objectID)}:${encodeURIComponent(target.viewID)}`
}

export function benchTabFallbackTitle(target: BenchTabTarget): string {
  if (target.type === "session") return "Subagent"
  if (target.type === "browser") return inAppBrowserFallbackTitle(target.url)
  if (target.type === "workspace-file") {
    const filename = target.path.replaceAll("\\", "/").split("/").at(-1) ?? target.path
    return target.root === BENCH_WORKSPACE_ROOT_NOTES ? filename.replace(/\.md$/iu, "") : filename
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
  browserTitles: ReadonlyMap<string, string> = EMPTY_BENCH_TAB_TITLES,
  noteTitles: ReadonlyMap<string, string> = EMPTY_BENCH_TAB_TITLES,
): string {
  if (tab.target.type === "session") {
    return sessionTitles.get(tab.target.sessionID) ?? benchTabFallbackTitle(tab.target)
  }
  if (tab.target.type === "object") {
    return objectTitles.get(tab.target.ref.objectID) ?? benchTabFallbackTitle(tab.target)
  }
  if (tab.target.type === "browser") {
    return browserTitles.get(tab.target.tabID) ?? benchTabFallbackTitle(tab.target)
  }
  if (tab.target.type === "workspace-file" && tab.target.root === BENCH_WORKSPACE_ROOT_NOTES) {
    return (
      (tab.target.id ? noteTitles.get(tab.target.id) : undefined) ??
      noteTitles.get(tab.target.path) ??
      benchTabFallbackTitle(tab.target)
    )
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
    const pathKey = pathKeyForNotesTarget(target)
    const pathIndex = pathKey ? tabs.findIndex((tab) => tab.key === pathKey) : -1
    return {
      tabs:
        pathIndex < 0
          ? [...tabs, { key, target }]
          : tabs.map((tab, tabIndex) => (tabIndex === pathIndex ? { key, target } : tab)),
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

export function replaceBenchTab(
  tabs: readonly BenchTab[],
  previous: BenchTabTarget,
  target: BenchTabTarget,
): BenchTabSelection {
  const previousKey = benchTabKey(previous)
  if (!tabs.some((tab) => tab.key === previousKey)) return upsertBenchTab(tabs, target)

  const key = benchTabKey(target)
  return {
    tabs: tabs.flatMap((tab): BenchTab[] => {
      if (tab.key === previousKey) return [{ key, target }]
      return tab.key === key ? [] : [tab]
    }),
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
