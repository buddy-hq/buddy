import { beforeEach, describe, expect, test } from "bun:test"
import {
  DEVTOOLS_NAVIGATION_STORAGE_KEY,
  useDevToolsNavigation,
} from "../src/components/debug/devtools-navigation-store"
import { parsePersistedStoreState } from "./parse-test-values"

beforeEach(() => {
  localStorage.clear()
  useDevToolsNavigation.setState({
    buddyOpen: false,
    activeTab: "palette",
    promptComparisonID: undefined,
    promptViewMode: "context",
    easelPrototypeID: "sent-message-motion",
    easelSection: "sources",
    easelLotsOfContent: false,
  })
})

describe("DevTools navigation persistence", () => {
  test("saves navigation choices separately from production preferences", async () => {
    const state = useDevToolsNavigation.getState()
    state.setBuddyOpen(true)
    state.setActiveTab("prompt-engineering")
    state.setPromptComparisonID("whiteboard-selection/skill-guidance")
    state.setPromptViewMode("full")
    state.setEaselPrototypeID("right-workspace")
    state.setEaselSection("boards")
    state.setEaselLotsOfContent(true)

    const saved = parsePersistedStoreState(localStorage.getItem(DEVTOOLS_NAVIGATION_STORAGE_KEY))
    expect(saved).toEqual({
      buddyOpen: true,
      activeTab: "prompt-engineering",
      promptComparisonID: "whiteboard-selection/skill-guidance",
      promptViewMode: "full",
      easelPrototypeID: "right-workspace",
      easelSection: "boards",
      easelLotsOfContent: true,
    })
    expect(localStorage.length).toBe(1)
    expect(localStorage.key(0)).toBe(DEVTOOLS_NAVIGATION_STORAGE_KEY)

    useDevToolsNavigation.setState({
      buddyOpen: false,
      activeTab: "palette",
      promptComparisonID: undefined,
      promptViewMode: "context",
      easelPrototypeID: "sent-message-motion",
      easelSection: "sources",
      easelLotsOfContent: false,
    })
    localStorage.setItem(
      DEVTOOLS_NAVIGATION_STORAGE_KEY,
      JSON.stringify({ state: saved, version: 0 }),
    )
    await useDevToolsNavigation.persist.rehydrate()

    expect(useDevToolsNavigation.getState()).toMatchObject({
      buddyOpen: true,
      activeTab: "prompt-engineering",
      promptComparisonID: "whiteboard-selection/skill-guidance",
      promptViewMode: "full",
      easelPrototypeID: "right-workspace",
      easelSection: "boards",
      easelLotsOfContent: true,
    })
  })

  test("ignores invalid saved navigation values", async () => {
    localStorage.setItem(
      DEVTOOLS_NAVIGATION_STORAGE_KEY,
      JSON.stringify({
        state: {
          buddyOpen: "true",
          activeTab: "unknown",
          promptComparisonID: 42,
          promptViewMode: "unknown",
          easelPrototypeID: 42,
          easelSection: "unknown",
          easelLotsOfContent: "true",
        },
        version: 0,
      }),
    )

    await useDevToolsNavigation.persist.rehydrate()

    expect(useDevToolsNavigation.getState()).toMatchObject({
      buddyOpen: false,
      activeTab: "palette",
      promptComparisonID: undefined,
      promptViewMode: "context",
      easelPrototypeID: "sent-message-motion",
      easelSection: "sources",
      easelLotsOfContent: false,
    })
  })

  test("closing DevTools stays closed after reload", async () => {
    const { setBuddyOpen, toggleBuddyOpen } = useDevToolsNavigation.getState()
    setBuddyOpen(true)
    toggleBuddyOpen()

    expect(parsePersistedStoreState(localStorage.getItem(DEVTOOLS_NAVIGATION_STORAGE_KEY))).toMatchObject({
      buddyOpen: false,
    })

    setBuddyOpen(true)
    localStorage.setItem(
      DEVTOOLS_NAVIGATION_STORAGE_KEY,
      JSON.stringify({ state: { buddyOpen: false }, version: 0 }),
    )
    await useDevToolsNavigation.persist.rehydrate()

    expect(useDevToolsNavigation.getState().buddyOpen).toBe(false)
  })

  test("migrates the previously selected whiteboard comparison", async () => {
    localStorage.setItem(
      DEVTOOLS_NAVIGATION_STORAGE_KEY,
      JSON.stringify({ state: { promptReviewID: "skill-guidance" }, version: 0 }),
    )

    await useDevToolsNavigation.persist.rehydrate()

    expect(useDevToolsNavigation.getState().promptComparisonID).toBe(
      "whiteboard-selection/skill-guidance",
    )
  })
})
