import "../happydom"
import { afterEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { UpdateState } from "@buddy/update-contract"
import { TooltipProvider } from "@buddy/ui"
import { PlatformProvider, type Platform } from "../src/context/platform"
import {
  describeUpdateHint,
  describeUpdateTooltip,
  showsUpdateChangelog,
} from "../src/components/updates/update-presentation"
import { UpdateStatusButton } from "../src/components/updates/update-status-button"

const BUTTON_SELECTOR = '[data-action="sidebar-update-status"]'

function basePlatform(): Platform {
  return {
    platform: "desktop",
    version: "0.14.2",
    openLink: () => undefined,
    restart: async () => undefined,
    back: () => undefined,
    forward: () => undefined,
    notify: async () => undefined,
  }
}

function platformWithState(state: UpdateState) {
  const calls = { checks: 0, downloads: 0 }
  const platform: Platform = {
    ...basePlatform(),
    getUpdateState: async () => state,
    onUpdateState: () => () => undefined,
    checkUpdate: async () => {
      calls.checks += 1
      return state
    },
    downloadUpdate: async () => {
      calls.downloads += 1
      return state
    },
    installUpdate: async () => state,
    setUpdateRing: async () => state,
  }
  return { calls, platform }
}

describe("sidebar update button", () => {
  let container: HTMLDivElement | null = null
  let root: Root | null = null

  afterEach(() => {
    act(() => {
      root?.unmount()
    })
    root = null
    container?.remove()
    container = null
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  async function render(platform: Platform) {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    const testRoot = createRoot(container)
    root = testRoot
    await act(async () => {
      testRoot.render(
        <PlatformProvider value={platform}>
          <TooltipProvider>
            <UpdateStatusButton />
          </TooltipProvider>
        </PlatformProvider>,
      )
    })
  }

  test("renders nothing where the app cannot update itself", async () => {
    await render(basePlatform())

    expect(container?.querySelector(BUTTON_SELECTOR)).toBeNull()
  })

  test("downloads an offered update on press instead of checking again", async () => {
    const { calls, platform } = platformWithState({
      revision: 1,
      ring: "stable",
      currentVersion: "0.14.2",
      activity: { status: "available", version: "0.15.0" },
      releaseNotes: [],
    })
    await render(platform)

    const button = container?.querySelector<HTMLButtonElement>(BUTTON_SELECTOR)
    expect(button?.getAttribute("data-update-status")).toBe("available")
    expect(button?.getAttribute("aria-label")).toContain("Buddy 0.15.0 is available")

    await act(async () => {
      button?.click()
    })

    expect(calls.downloads).toBe(1)
    expect(calls.checks).toBe(0)
  })

  test("offers a downloaded update as an Install button", async () => {
    const { platform } = platformWithState({
      revision: 1,
      ring: "stable",
      currentVersion: "0.14.2",
      activity: { status: "downloaded", version: "0.15.0" },
      releaseNotes: [],
    })
    await render(platform)

    const button = container?.querySelector<HTMLButtonElement>(BUTTON_SELECTOR)
    expect(button?.getAttribute("data-update-status")).toBe("downloaded")
    expect(button?.textContent).toBe("Install")
  })

  test("describes the action it will perform after an unrelated check failure", () => {
    expect(describeUpdateHint("install", { stage: "check" })).toBe("Click to restart and install")
    expect(describeUpdateHint("download", { stage: "check" })).toBe("Click to download")
  })

  test("keeps the hover card for release notes and summarises the rest in one line", () => {
    const offered: UpdateState = {
      revision: 1,
      ring: "stable",
      currentVersion: "0.14.2",
      activity: { status: "available", version: "0.15.0" },
      releaseNotes: [
        { version: "0.15.0", url: "https://example.com", items: ["Faster"], totalItems: 1 },
      ],
    }
    const idle: UpdateState = { ...offered, activity: { status: "idle" }, releaseNotes: [] }

    expect(showsUpdateChangelog(offered, "download")).toBe(true)
    expect(
      showsUpdateChangelog(
        { ...offered, activity: { status: "downloaded", version: "0.15.0" } },
        "install",
      ),
    ).toBe(false)
    expect(showsUpdateChangelog({ ...offered, releaseNotes: [] }, "download")).toBe(false)
    expect(showsUpdateChangelog({ ...offered, failure: { stage: "download" } }, "download")).toBe(
      false,
    )
    expect(showsUpdateChangelog(idle, "check")).toBe(false)
    expect(describeUpdateTooltip({ ...idle, failure: { stage: "check" } }, "check")).toBe(
      "Couldn't check for updates · Click to try again",
    )
  })
})
