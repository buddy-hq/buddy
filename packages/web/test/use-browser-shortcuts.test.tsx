import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { useBrowserShortcuts } from "../src/components/bench/surfaces/browser/use-browser-shortcuts"
import type { InAppBrowserPlatform } from "../src/context/platform"

const browser: InAppBrowserPlatform = {
  webPreferences: "",
  onMessage: () => () => undefined,
  onFavicon: () => () => undefined,
  onAudio: () => () => undefined,
  onShortcut: () => () => undefined,
  setAppearance: async () => ({ _tag: "done" }),
  clearProfileData: async () => ({ _tag: "done" }),
  checkSafariFullDiskAccess: async () => false,
  listImportSources: async () => [],
  importCookies: async () => ({
    _tag: "imported",
    imported: 0,
    skipped: 0,
    skippedDomains: [],
  }),
  openFullDiskAccessSettings: async () => undefined,
}

function dispatchFocusCommand(): void {
  window.dispatchEvent(new CustomEvent("buddy:menu-command", { detail: { id: "composer.focus" } }))
}

describe("Browser shortcut ownership", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  test("claims the forwarded focus command only while its surface is active", async () => {
    let addressFocusCount = 0

    function Probe(props: { active: boolean }) {
      useBrowserShortcuts({
        browser,
        active: props.active,
        platform: "macos",
        webContentsID: null,
        handlers: {
          reload: () => undefined,
          focusAddress: () => {
            addressFocusCount += 1
          },
          zoomIn: () => undefined,
          zoomOut: () => undefined,
          zoomReset: () => undefined,
        },
      })
      return null
    }

    await act(async () => root.render(<Probe active={false} />))
    act(dispatchFocusCommand)
    expect(addressFocusCount).toBe(0)

    await act(async () => root.render(<Probe active />))
    act(dispatchFocusCommand)
    expect(addressFocusCount).toBe(1)
  })
})
