import { describe, expect, test } from "bun:test"
import { readCitation } from "@buddy/citation-contract"
import {
  DEFAULT_IN_APP_BROWSER_PROFILE_ID,
  INCOGNITO_IN_APP_BROWSER_PROFILE_ID,
  parseInAppBrowserProfileID,
} from "@buddy/browser-contract/profiles"
import type { InAppBrowserCitationLocateResult } from "@buddy/browser-contract"
import type { BenchTab } from "../src/lib/bench-tabs"
import {
  browserCitationCommentSource,
  createWebCitation,
  hostPointFromGuest,
  hostRectFromGuest,
  isSameWebCitationPage,
  resolveWebCitationProfileID,
  selectWebCitationTab,
  type WebCitationMarkListener,
} from "../src/lib/in-app-browser-citations"

const ARTICLE = "https://example.com/article"
const SELECTOR = { version: 1, start: 4, end: 15, prefix: "The ", suffix: " grows." } as const

function requireProfileID(value: string) {
  const profileID = parseInAppBrowserProfileID(value)
  if (!profileID) throw new Error(`expected a valid profile ID: ${value}`)
  return profileID
}

const WORK_PROFILE_ID = requireProfileID("work-profile")

function browserTab(tabID: string, url: string, profileID?: string): BenchTab {
  return {
    key: `browser:${tabID}`,
    target: Object.assign(
      { type: "browser" as const, tabID, url },
      profileID ? { profileID: requireProfileID(profileID) } : undefined,
    ),
  }
}

describe("in-app browser citations", () => {
  test("builds a valid web citation from a Browser capture", () => {
    const citation = createWebCitation({
      id: "web_sel_1",
      capture: {
        url: `${ARTICLE}#growth`,
        title: "Plant growth",
        excerpt: "plant stems",
        selector: SELECTOR,
        headingPath: ["Plants", "Growth"],
        rect: { x: 10, y: 20, width: 80, height: 16 },
      },
      profileID: WORK_PROFILE_ID,
    })

    expect(readCitation(citation)).toEqual({
      schemaVersion: 1,
      id: "web_sel_1",
      excerpt: "plant stems",
      source: {
        kind: "web",
        url: `${ARTICLE}#growth`,
        profileID: "work-profile",
        selector: SELECTOR,
      },
      presentation: { title: "Plant growth", headingPath: ["Plants", "Growth"] },
    })
  })

  test("leaves out an empty heading path", () => {
    const citation = createWebCitation({
      id: "web_sel_2",
      capture: {
        url: ARTICLE,
        title: "Article",
        excerpt: "plant stems",
        selector: SELECTOR,
        headingPath: [],
        rect: { x: 0, y: 0, width: 1, height: 1 },
      },
      profileID: DEFAULT_IN_APP_BROWSER_PROFILE_ID,
    })

    expect(citation.presentation).toEqual({ title: "Article" })
  })

  test("treats the same page with a different fragment as one page", () => {
    expect(isSameWebCitationPage(`${ARTICLE}#one`, `${ARTICLE}#two`)).toBe(true)
    expect(isSameWebCitationPage(`${ARTICLE}?page=2`, ARTICLE)).toBe(false)
  })

  test("treats hash routes as different pages", () => {
    const app = "https://docs.example.com/"
    expect(isSameWebCitationPage(`${app}#/docs/a`, `${app}#/docs/b`)).toBe(false)
    expect(isSameWebCitationPage(`${app}#!/docs/a`, `${app}#!/docs/b`)).toBe(false)
    expect(isSameWebCitationPage(`${app}#/docs/a`, `${app}#/docs/a:~:text=plant`)).toBe(true)
    expect(isSameWebCitationPage(`${app}#/docs/a`, app)).toBe(false)
  })

  test("reopens in the cited profile unless it was removed", () => {
    const known = [DEFAULT_IN_APP_BROWSER_PROFILE_ID, INCOGNITO_IN_APP_BROWSER_PROFILE_ID]
    expect(
      resolveWebCitationProfileID({
        profileID: "incognito",
        knownProfileIDs: known,
        defaultProfileID: DEFAULT_IN_APP_BROWSER_PROFILE_ID,
      }),
    ).toBe(INCOGNITO_IN_APP_BROWSER_PROFILE_ID)
    expect(
      resolveWebCitationProfileID({
        profileID: "work-profile",
        knownProfileIDs: known,
        defaultProfileID: DEFAULT_IN_APP_BROWSER_PROFILE_ID,
      }),
    ).toBe(DEFAULT_IN_APP_BROWSER_PROFILE_ID)
    expect(
      resolveWebCitationProfileID({
        profileID: undefined,
        knownProfileIDs: known,
        defaultProfileID: DEFAULT_IN_APP_BROWSER_PROFILE_ID,
      }),
    ).toBe(DEFAULT_IN_APP_BROWSER_PROFILE_ID)
  })

  test("prefers the selected tab showing the cited page in the cited profile", () => {
    const tabs = [
      browserTab("first", `${ARTICLE}#intro`),
      browserTab("work", ARTICLE, "work-profile"),
      browserTab("selected", ARTICLE),
      {
        key: "file:notes.md",
        target: { type: "workspace-file", root: "notebook", path: "notes.md", viewer: "markdown" },
      },
    ] satisfies BenchTab[]
    const select = (input: { activeTabID?: string; profileID?: typeof WORK_PROFILE_ID }) =>
      selectWebCitationTab({
        tabs,
        activeTarget: tabs.find((tab) => tab.key === `browser:${input.activeTabID}`)?.target,
        pageUrls: new Map(),
        url: ARTICLE,
        profileID: input.profileID ?? DEFAULT_IN_APP_BROWSER_PROFILE_ID,
        defaultProfileID: DEFAULT_IN_APP_BROWSER_PROFILE_ID,
      })?.tabID

    expect(select({ activeTabID: "selected" })).toBe("selected")
    expect(select({})).toBe("first")
    expect(select({ profileID: WORK_PROFILE_ID })).toBe("work")
  })

  test("matches a tab by the page it shows now, not the page it opened", () => {
    const tabs = [browserTab("moved", ARTICLE), browserTab("arrived", "https://example.com/")]
    const selected = selectWebCitationTab({
      tabs,
      activeTarget: undefined,
      pageUrls: new Map([
        ["moved", "https://example.com/elsewhere"],
        ["arrived", ARTICLE],
      ]),
      url: ARTICLE,
      profileID: DEFAULT_IN_APP_BROWSER_PROFILE_ID,
      defaultProfileID: DEFAULT_IN_APP_BROWSER_PROFILE_ID,
    })

    expect(selected?.tabID).toBe("arrived")
  })

  test("maps page coordinates through the webview position and zoom", () => {
    const webviewRect = new DOMRect(100, 50, 800, 600)
    expect(hostPointFromGuest({ x: 20, y: 10 }, webviewRect, 1.5)).toEqual({ x: 130, y: 65 })
    const rect = hostRectFromGuest({ x: 20, y: 10, width: 40, height: 12 }, webviewRect, 1.5)
    expect([rect.x, rect.y, rect.width, rect.height]).toEqual([130, 65, 60, 18])
  })

  test("closes the comment editor once when its page text cannot be marked", async () => {
    const markListeners = new Map<string, WebCitationMarkListener>()
    const unmarked: string[] = []
    const source = browserCitationCommentSource({
      browser: {
        markCitation: async (): Promise<InAppBrowserCitationLocateResult> => ({
          _tag: "not-found",
        }),
        unmarkCitation: async (input) => {
          unmarked.push(input.markID)
          return { _tag: "done" }
        },
      },
      webContentsID: 7,
      excerpt: "plant stems",
      source: { kind: "web", url: ARTICLE, selector: SELECTOR },
      rect: { x: 0, y: 0, width: 1, height: 1 },
      pageAreaRef: { current: null },
      readZoomFactor: () => 1,
      markListeners,
    })
    let unavailable = 0

    const dispose = source.mark(() => {
      unavailable += 1
    })
    await Promise.resolve()
    dispose()

    expect(unavailable).toBe(1)
    expect(markListeners.size).toBe(0)
    expect(unmarked).toHaveLength(1)
  })

  test("ignores a failed mark after the comment editor closed", async () => {
    const markListeners = new Map<string, WebCitationMarkListener>()
    const source = browserCitationCommentSource({
      browser: {
        markCitation: async (): Promise<InAppBrowserCitationLocateResult> => ({
          _tag: "not-found",
        }),
        unmarkCitation: async () => ({ _tag: "done" }),
      },
      webContentsID: 7,
      excerpt: "plant stems",
      source: { kind: "web", url: ARTICLE, selector: SELECTOR },
      rect: { x: 0, y: 0, width: 1, height: 1 },
      pageAreaRef: { current: null },
      readZoomFactor: () => 1,
      markListeners,
    })
    let unavailable = 0

    source.mark(() => {
      unavailable += 1
    })()
    await Promise.resolve()

    expect(unavailable).toBe(0)
  })
})
