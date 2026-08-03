import "../happydom"
import { afterEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import {
  PlatformProvider,
  type Platform,
  type UpdateProgressSnapshot,
  type UpdateRing,
} from "../src/context/platform"
import { UpdatesSettings } from "../src/components/settings/settings-updates"
import { SETTINGS_TABS } from "../src/components/settings/settings-tabs"

function createDesktopUpdatePlatform(input?: {
  onCheck?: () => void
  onSetRing?: (ring: UpdateRing) => void
}) {
  let ring: UpdateRing = "stable"
  let progress: UpdateProgressSnapshot = {
    ring,
    status: "idle",
  }
  const listeners = new Set<(snapshot: UpdateProgressSnapshot) => void>()

  const platform: Platform = {
    platform: "desktop",
    openLink: () => undefined,
    restart: async () => undefined,
    back: () => undefined,
    forward: () => undefined,
    notify: async () => undefined,
    checkUpdate: async () => {
      input?.onCheck?.()
      return { status: "up-to-date" }
    },
    getUpdateProgress: async () => progress,
    getUpdateRing: async () => ring,
    onUpdateProgress: (cb) => {
      listeners.add(cb)
      return () => {
        listeners.delete(cb)
      }
    },
    setUpdateRing: async (nextRing) => {
      ring = nextRing
      progress = {
        ring,
        status: "idle",
      }
      input?.onSetRing?.(nextRing)
    },
    update: async () => undefined,
  }

  return {
    emitProgress(snapshot: UpdateProgressSnapshot) {
      progress = snapshot
      for (const listener of listeners) {
        listener(snapshot)
      }
    },
    platform,
  }
}

describe("settings updates", () => {
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

  test("registers Updates as a main settings tab", () => {
    const tabIds = SETTINGS_TABS.map((tab) => tab.id)
    expect(tabIds.slice(0, 2)).toEqual(["general", "updates"])
    expect(SETTINGS_TABS.find((tab) => tab.id === "updates")?.navLabelKey).toBe(
      "routes.settings.nav.updates",
    )
  })

  test("registers Skills between AI Providers and MCPs", () => {
    const tabIds = SETTINGS_TABS.map((tab) => tab.id)
    const providersIndex = tabIds.indexOf("providers")

    expect(tabIds.slice(providersIndex, providersIndex + 3)).toEqual([
      "providers",
      "skills",
      "mcps",
    ])
    expect(SETTINGS_TABS.find((tab) => tab.id === "skills")?.navLabelKey).toBe(
      "routes.settings.nav.skills",
    )
  })

  test("renders update ring controls and checks immediately when Preview is selected", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    const testRoot = createRoot(container)
    root = testRoot

    let checkCount = 0
    let savedRing: UpdateRing | undefined
    const updatePlatform = createDesktopUpdatePlatform({
      onCheck: () => {
        checkCount += 1
      },
      onSetRing: (ring) => {
        savedRing = ring
      },
    })

    await act(async () => {
      testRoot.render(
        <PlatformProvider value={updatePlatform.platform}>
          <UpdatesSettings />
        </PlatformProvider>,
      )
    })

    expect(container.textContent).toContain("Stable")
    expect(container.textContent).toContain("Preview")
    expect(container.querySelector('[data-action="settings-check-updates"]')).not.toBeNull()

    const previewButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Preview",
    )
    expect(previewButton).toBeDefined()

    await act(async () => {
      previewButton?.click()
      await Promise.resolve()
    })

    expect(savedRing).toBe("preview")
    expect(checkCount).toBe(1)
  })

  test("shows inline download progress snapshots", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    const testRoot = createRoot(container)
    root = testRoot
    const updatePlatform = createDesktopUpdatePlatform()

    await act(async () => {
      testRoot.render(
        <PlatformProvider value={updatePlatform.platform}>
          <UpdatesSettings />
        </PlatformProvider>,
      )
    })

    await act(async () => {
      updatePlatform.emitProgress({
        percent: 42,
        ring: "preview",
        status: "downloading",
        totalBytes: 100,
        transferredBytes: 42,
      })
    })

    expect(container.textContent).toContain("Downloading update")
    expect(container.textContent).toContain("42%")
  })
})
