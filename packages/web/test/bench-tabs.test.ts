import { describe, expect, test } from "bun:test"
import {
  benchTabKey,
  closeBenchTab,
  closeBenchTabsToRight,
  closeOtherBenchTabs,
  resolveBenchTabTitle,
  upsertBenchTab,
} from "../src/lib/bench-tabs"
import type { BenchSessionTarget, BenchTarget } from "../src/lib/bench-navigation"

const FIRST_FILE = {
  type: "workspace-file",
  path: "docs/first.md",
  viewer: "markdown",
} satisfies BenchTarget
const SECOND_FILE = {
  type: "workspace-file",
  path: "docs/second.md",
  viewer: "markdown",
} satisfies BenchTarget
const THIRD_FILE = {
  type: "workspace-file",
  path: "docs/third.md",
  viewer: "markdown",
} satisfies BenchTarget
const OBJECT_REVISION_ONE = {
  type: "object",
  ref: {
    kind: "resource",
    objectID: "resource-1",
    revisionID: "revision-1",
    itemID: null,
  },
  viewID: "reader",
} satisfies BenchTarget
const OBJECT_REVISION_TWO = {
  ...OBJECT_REVISION_ONE,
  ref: { ...OBJECT_REVISION_ONE.ref, revisionID: "revision-2" },
} satisfies BenchTarget
const SUBAGENT_SESSION = {
  type: "session",
  sessionID: "session/child-1",
} satisfies BenchSessionTarget

function threeTabs() {
  return [FIRST_FILE, SECOND_FILE, THIRD_FILE].reduce(
    (tabs, target) => upsertBenchTab(tabs, target).tabs,
    upsertBenchTab([], FIRST_FILE).tabs.slice(0, 0),
  )
}

describe("Bench tabs", () => {
  test("uses JSON-safe logical keys that ignore rendered revisions", () => {
    expect(benchTabKey(FIRST_FILE)).toBe("file:markdown:docs%2Ffirst.md")
    expect(benchTabKey(OBJECT_REVISION_ONE)).toBe("object:resource:resource-1:reader")
    expect(benchTabKey(OBJECT_REVISION_ONE)).not.toContain("\u0000")
  })

  test("uses logical identity and replaces a tab target without moving it", () => {
    const first = upsertBenchTab([], OBJECT_REVISION_ONE)
    const second = upsertBenchTab(first.tabs, SECOND_FILE)
    const updated = upsertBenchTab(second.tabs, OBJECT_REVISION_TWO)

    expect(benchTabKey(OBJECT_REVISION_ONE)).toBe(benchTabKey(OBJECT_REVISION_TWO))
    expect(updated.tabs.map((tab) => tab.key)).toEqual([
      benchTabKey(OBJECT_REVISION_ONE),
      benchTabKey(SECOND_FILE),
    ])
    expect(updated.tabs[0]?.target).toEqual(OBJECT_REVISION_TWO)
  })

  test("uses stored object titles and falls back only when one is unavailable", () => {
    const tab = upsertBenchTab([], OBJECT_REVISION_ONE).tabs[0]
    if (!tab) throw new Error("Expected an object tab.")

    expect(resolveBenchTabTitle(tab, new Map([["resource-1", "Abhi Aiyer interview pack"]]))).toBe(
      "Abhi Aiyer interview pack",
    )
    expect(resolveBenchTabTitle(tab, new Map())).toBe("Resource")
  })

  test("focuses an existing subagent tab instead of duplicating it", () => {
    const opened = upsertBenchTab([], SUBAGENT_SESSION)
    const reopened = upsertBenchTab(opened.tabs, { ...SUBAGENT_SESSION })
    const tab = reopened.tabs[0]
    if (!tab) throw new Error("Expected a subagent tab.")

    expect(benchTabKey(SUBAGENT_SESSION)).toBe("session:session%2Fchild-1")
    expect(reopened.tabs).toHaveLength(1)
    expect(reopened.activeTabKey).toBe(benchTabKey(SUBAGENT_SESSION))
    expect(resolveBenchTabTitle(tab, new Map(), new Map([[SUBAGENT_SESSION.sessionID, "Research"]]))).toBe(
      "Research",
    )
  })

  test("closing the selected tab chooses the tab to its right, then its left", () => {
    const tabs = threeTabs()
    const closedMiddle = closeBenchTab({
      tabs,
      activeTabKey: benchTabKey(SECOND_FILE),
      tabKey: benchTabKey(SECOND_FILE),
    })
    expect(closedMiddle.activeTabKey).toBe(benchTabKey(THIRD_FILE))

    const closedLast = closeBenchTab({
      tabs: closedMiddle.tabs,
      activeTabKey: benchTabKey(THIRD_FILE),
      tabKey: benchTabKey(THIRD_FILE),
    })
    expect(closedLast.activeTabKey).toBe(benchTabKey(FIRST_FILE))
  })

  test("closing a background tab preserves the selected tab", () => {
    const result = closeBenchTab({
      tabs: threeTabs(),
      activeTabKey: benchTabKey(FIRST_FILE),
      tabKey: benchTabKey(SECOND_FILE),
    })
    expect(result.activeTabKey).toBe(benchTabKey(FIRST_FILE))
  })

  test("close others selects the invoked tab and close right keeps the prefix", () => {
    const tabs = threeTabs()
    const others = closeOtherBenchTabs({ tabs, tabKey: benchTabKey(SECOND_FILE) })
    expect(others.tabs.map((tab) => tab.key)).toEqual([benchTabKey(SECOND_FILE)])
    expect(others.activeTabKey).toBe(benchTabKey(SECOND_FILE))

    const right = closeBenchTabsToRight({
      tabs,
      activeTabKey: benchTabKey(THIRD_FILE),
      tabKey: benchTabKey(SECOND_FILE),
    })
    expect(right.tabs.map((tab) => tab.key)).toEqual([
      benchTabKey(FIRST_FILE),
      benchTabKey(SECOND_FILE),
    ])
    expect(right.activeTabKey).toBe(benchTabKey(SECOND_FILE))
  })
})
