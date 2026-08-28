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
import { UpdatesSettingsSection } from "../src/components/settings/settings-updates-section"
import {
  resolveUpdateBanner,
  useUpdateSettings,
  type UpdateSettings,
} from "../src/components/settings/use-update-settings"
import {
  SETTINGS_TABS,
  isCoreSettingsTab,
  resolveSettingsTab,
} from "../src/components/settings/settings-tabs"
import { t } from "../src/i18n"

const BANNER_SELECTOR = '[data-action="settings-update-banner"]'
const BANNER_ACTION_SELECTOR = '[data-action="settings-update-banner-action"]'

function createDesktopUpdatePlatform(input?: {
  onCheck?: () => void
  onSetRing?: (ring: UpdateRing) => void
  onUpdate?: () => void
}) {
  let ring: UpdateRing = "stable"
  let progress: UpdateProgressSnapshot = {
    ring,
    status: "idle",
  }
  const listeners = new Set<(snapshot: UpdateProgressSnapshot) => void>()

  const platform: Platform = {
    platform: "desktop",
    version: "0.14.2",
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
    update: async () => {
      input?.onUpdate?.()
    },
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

let capturedSettings: UpdateSettings | undefined

function UpdateSettingsProbe() {
  capturedSettings = useUpdateSettings()
  return null
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
    capturedSettings = undefined
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  function mount() {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    const testRoot = createRoot(container)
    root = testRoot
    return testRoot
  }

  test("registers About as the last core settings tab", () => {
    const coreTabIds = SETTINGS_TABS.filter(isCoreSettingsTab).map((tab) => tab.id)
    expect(coreTabIds.at(0)).toBe("general")
    expect(coreTabIds.at(-1)).toBe("about")
    expect(SETTINGS_TABS.find((tab) => tab.id === "about")?.navLabelKey).toBe(
      "routes.settings.nav.about",
    )
  })

  test("registers standards and memory as independently revealed tabs", () => {
    const revealed = SETTINGS_TABS.filter((tab) => !isCoreSettingsTab(tab))
    expect(revealed.map((tab) => tab.id)).toEqual(["standards", "memory"])
    expect(revealed.map((tab) => tab.reveal)).toEqual(["standards", "memory"])
  })

  test("resolves every retired tab id to a core tab that is always reachable", () => {
    const coreTabIds = new Set(SETTINGS_TABS.filter(isCoreSettingsTab).map((tab) => tab.id))
    const retired = [
      "chat",
      "notebook",
      "tools",
      "teaching",
      "learnerMemory",
      "advanced",
      "labs",
      "updates",
      "attribution",
    ]

    // Core, not merely existing: a revealed tab is hidden until its capability is on, so a
    // bookmark pointing at one would be bounced to General and the link lost.
    for (const id of retired) {
      const resolved = resolveSettingsTab(id)
      expect(resolved !== undefined && coreTabIds.has(resolved)).toBe(true)
    }
  })

  test("rejects inherited object keys as retired tab ids", () => {
    expect(resolveSettingsTab("toString")).toBeUndefined()
    expect(resolveSettingsTab("constructor")).toBeUndefined()
  })

  test("interpolates the MCP toggle accessible name", () => {
    expect(t("mcp.settings.toggleAria", { name: "filesystem" })).toBe(
      "Enable MCP server filesystem by default",
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

  test("shows the running version and no status strip while the updater is idle", async () => {
    const testRoot = mount()
    const updatePlatform = createDesktopUpdatePlatform()

    await act(async () => {
      testRoot.render(
        <PlatformProvider value={updatePlatform.platform}>
          <UpdatesSettingsSection />
        </PlatformProvider>,
      )
    })

    expect(container?.textContent).toContain("0.14.2")
    expect(container?.querySelector(BANNER_SELECTOR)).toBeNull()
  })

  test("saves the channel and checks immediately when Preview is selected", async () => {
    const testRoot = mount()

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
          <UpdateSettingsProbe />
        </PlatformProvider>,
      )
    })

    await act(async () => {
      await capturedSettings?.changeRing("preview")
    })

    expect(savedRing).toBe("preview")
    expect(checkCount).toBe(1)
    expect(capturedSettings?.ring).toBe("preview")
  })

  test("reports an up-to-date check in the status strip", async () => {
    const testRoot = mount()
    const updatePlatform = createDesktopUpdatePlatform()

    await act(async () => {
      testRoot.render(
        <PlatformProvider value={updatePlatform.platform}>
          <UpdatesSettingsSection />
        </PlatformProvider>,
      )
    })

    const checkButton = container?.querySelector<HTMLButtonElement>(
      '[data-action="settings-check-updates"]',
    )
    expect(checkButton).not.toBeNull()

    await act(async () => {
      checkButton?.click()
    })

    expect(container?.querySelector(BANNER_SELECTOR)?.textContent).toContain("Buddy is up to date")
  })

  test("shows inline download progress snapshots", async () => {
    const testRoot = mount()
    const updatePlatform = createDesktopUpdatePlatform()

    await act(async () => {
      testRoot.render(
        <PlatformProvider value={updatePlatform.platform}>
          <UpdatesSettingsSection />
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
        version: "0.15.0",
      })
    })

    const banner = container?.querySelector(BANNER_SELECTOR)
    expect(banner?.textContent).toContain("Downloading Buddy 0.15.0")
    expect(banner?.textContent).toContain("42%")
  })

  test("installs from the status strip once an update is ready", async () => {
    const testRoot = mount()
    let updateCount = 0
    const updatePlatform = createDesktopUpdatePlatform({
      onUpdate: () => {
        updateCount += 1
      },
    })

    await act(async () => {
      testRoot.render(
        <PlatformProvider value={updatePlatform.platform}>
          <UpdatesSettingsSection />
        </PlatformProvider>,
      )
    })

    await act(async () => {
      updatePlatform.emitProgress({
        percent: 100,
        ring: "stable",
        status: "ready",
        version: "0.15.0",
      })
    })

    const banner = container?.querySelector(BANNER_SELECTOR)
    expect(banner?.textContent).toContain("Buddy 0.15.0 is ready")

    const installButton = container?.querySelector<HTMLButtonElement>(BANNER_ACTION_SELECTOR)
    expect(installButton?.textContent).toBe("Restart to install")

    await act(async () => {
      installButton?.click()
    })

    expect(updateCount).toBe(1)
  })
})

describe("update banner resolution", () => {
  test("stays silent while the updater is idle and nothing has been checked", () => {
    expect(
      resolveUpdateBanner({
        progress: { ring: "stable", status: "idle" },
        checking: false,
        installFailed: false,
      }),
    ).toBeUndefined()
  })

  test("prefers live progress over the last check result", () => {
    const banner = resolveUpdateBanner({
      progress: { ring: "stable", status: "ready", version: "0.15.0" },
      lastCheck: { status: "up-to-date" },
      checking: true,
      installFailed: false,
    })

    expect(banner?.tone).toBe("positive")
    expect(banner?.action).toBe("install")
    expect(banner?.title).toBe("Buddy 0.15.0 is ready")
  })

  test("surfaces a failed install ahead of the ready snapshot it came from", () => {
    const banner = resolveUpdateBanner({
      progress: { ring: "stable", status: "ready", version: "0.15.0" },
      checking: false,
      installFailed: true,
    })

    expect(banner?.tone).toBe("critical")
    expect(banner?.action).toBe("install")
  })

  test("offers a retry when a check fails", () => {
    const banner = resolveUpdateBanner({
      progress: { ring: "stable", status: "idle" },
      lastCheck: { status: "error", stage: "download" },
      checking: false,
      installFailed: false,
    })

    expect(banner?.tone).toBe("critical")
    expect(banner?.action).toBe("retry")
    expect(banner?.title).toBe("Found an update, but download failed")
  })
})
