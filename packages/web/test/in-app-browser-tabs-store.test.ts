import { beforeEach, describe, expect, test } from "bun:test"
import {
  inAppBrowserTabTitle,
  useInAppBrowserTabsStore,
} from "../src/state/in-app-browser-tabs-store"

const RUNTIME = {
  url: "https://hibuddy.in/",
  title: "HiBuddy",
  loading: false,
  canGoBack: true,
  canGoForward: false,
  favicon: null,
  error: null,
}

describe("in-app browser tab runtime", () => {
  beforeEach(() => {
    useInAppBrowserTabsStore.setState({ byTabID: {} })
  })

  test("tracks live state by stable browser tab ID", () => {
    useInAppBrowserTabsStore.getState().setTab("browser-1", RUNTIME)

    expect(inAppBrowserTabTitle("browser-1")).toBe("HiBuddy")
    expect(useInAppBrowserTabsStore.getState().byTabID["browser-1"]).toEqual(RUNTIME)
  })

  test("removes runtime state when the surface closes", () => {
    useInAppBrowserTabsStore.getState().setTab("browser-1", RUNTIME)
    useInAppBrowserTabsStore.getState().removeTab("browser-1")

    expect(useInAppBrowserTabsStore.getState().byTabID["browser-1"]).toBeUndefined()
  })
})
