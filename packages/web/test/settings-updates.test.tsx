import "../happydom"
import { afterEach, describe, expect, spyOn, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { UpdateRing, UpdateState } from "@buddy/update-contract"
import { toast } from "@buddy/ui"
import { PlatformProvider, type Platform } from "../src/context/platform"
import { UpdatesSettingsSection } from "../src/components/settings/settings-updates-section"
import { useUpdateControl } from "../src/components/updates/use-update-control"
import {
  CAPABILITY_FALLBACK_SETTINGS_TAB,
  DEFAULT_SETTINGS_TAB,
  SETTINGS_TABS,
  getSettingsTabFallback,
  isCoreSettingsTab,
  resolveSettingsTab,
} from "../src/components/settings/settings-tabs"
import { t } from "../src/i18n"

const BANNER_SELECTOR = '[data-action="settings-update-banner"]'
const BANNER_ACTION_SELECTOR = '[data-action="settings-update-banner-action"]'
const INSTALL_CONFIRM_SELECTOR = '[data-action="update-install-confirm"]'

function idleState(ring: UpdateRing = "stable"): UpdateState {
  return {
    revision: 0,
    ring,
    currentVersion: "0.14.2",
    activity: { status: "idle" },
    releaseNotes: [],
  }
}

function createDesktopUpdatePlatform(input?: { onCheck?: UpdateState; ringSaveError?: Error }) {
  let state = idleState()
  const listeners = new Set<(next: UpdateState) => void>()
  const calls = { checks: 0, installs: 0, rings: new Array<UpdateRing>() }

  const publish = (next: UpdateState) => {
    state = { ...next, revision: state.revision + 1 }
    for (const listener of listeners) listener(state)
    return state
  }

  const platform: Platform = {
    platform: "desktop",
    version: "0.14.2",
    openLink: () => undefined,
    restart: async () => undefined,
    back: () => undefined,
    forward: () => undefined,
    notify: async () => undefined,
    getUpdateState: async () => state,
    onUpdateState: (cb) => {
      listeners.add(cb)
      return () => {
        listeners.delete(cb)
      }
    },
    checkUpdate: async () => {
      calls.checks += 1
      return publish(input?.onCheck ?? { ...state, activity: { status: "up-to-date" } })
    },
    downloadUpdate: async () => state,
    installUpdate: async () => {
      calls.installs += 1
      return state
    },
    setUpdateRing: async (ring) => {
      if (input?.ringSaveError) throw input.ringSaveError
      calls.rings.push(ring)
      return publish(idleState(ring))
    },
  }

  return { calls, platform, publish }
}

function RingChangeProbe() {
  const { setRing } = useUpdateControl()
  return (
    <button type="button" data-action="change-ring-probe" onClick={() => void setRing("preview")}>
      Change ring
    </button>
  )
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

  test("registers Shortcuts immediately before About", () => {
    const coreTabIds = SETTINGS_TABS.filter(isCoreSettingsTab).map((tab) => tab.id)
    expect(coreTabIds.slice(-2)).toEqual(["shortcuts", "about"])
    expect(resolveSettingsTab("shortcuts")).toBe("shortcuts")
    expect(SETTINGS_TABS.find((tab) => tab.id === "shortcuts")?.navLabelKey).toBe(
      "routes.settings.nav.shortcuts",
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

  test("sends a hidden capability tab to the panel that enables it", () => {
    // General has no switch for Standards or Memory, so bouncing a deep link there strands the
    // reader; Packages is where the capability is turned on.
    const revealedTabs = SETTINGS_TABS.filter((tab) => !isCoreSettingsTab(tab))
    expect(revealedTabs.length).toBeGreaterThan(0)

    for (const tab of revealedTabs) {
      expect(getSettingsTabFallback(tab.id)).toBe(CAPABILITY_FALLBACK_SETTINGS_TAB)
    }

    for (const tab of SETTINGS_TABS.filter(isCoreSettingsTab)) {
      expect(getSettingsTabFallback(tab.id)).toBe(DEFAULT_SETTINGS_TAB)
    }
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

  function render(platform: Platform) {
    const testRoot = mount()
    return act(async () => {
      testRoot.render(
        <PlatformProvider value={platform}>
          <UpdatesSettingsSection />
        </PlatformProvider>,
      )
    })
  }

  test("shows the running version and no status strip while the updater is idle", async () => {
    const updatePlatform = createDesktopUpdatePlatform()
    await render(updatePlatform.platform)

    expect(container?.textContent).toContain("0.14.2")
    expect(container?.textContent).toContain("Not checked yet")
    expect(container?.querySelector(BANNER_SELECTOR)).toBeNull()
  })

  test("reports an up-to-date check in the status strip", async () => {
    const updatePlatform = createDesktopUpdatePlatform()
    await render(updatePlatform.platform)

    await act(async () => {
      container?.querySelector<HTMLButtonElement>('[data-action="settings-check-updates"]')?.click()
    })

    expect(updatePlatform.calls.checks).toBe(1)
    expect(container?.querySelector(BANNER_SELECTOR)?.textContent).toContain("Buddy is up to date")
  })

  test("offers a download rather than downloading when a check finds an update", async () => {
    const updatePlatform = createDesktopUpdatePlatform({
      onCheck: {
        ...idleState(),
        activity: { status: "available", version: "0.15.0" },
        checkedAt: new Date().toISOString(),
      },
    })
    await render(updatePlatform.platform)

    await act(async () => {
      container?.querySelector<HTMLButtonElement>('[data-action="settings-check-updates"]')?.click()
    })

    const banner = container?.querySelector(BANNER_SELECTOR)
    expect(banner?.textContent).toContain("Buddy 0.15.0 is available")
    expect(container?.querySelector(BANNER_ACTION_SELECTOR)?.textContent).toBe("Download")
    expect(container?.textContent).toContain("Last checked")
  })

  test("shows inline download progress", async () => {
    const updatePlatform = createDesktopUpdatePlatform()
    await render(updatePlatform.platform)

    await act(async () => {
      updatePlatform.publish({
        ...idleState(),
        activity: {
          status: "downloading",
          version: "0.15.0",
          progress: { percent: 42, transferredBytes: 42, totalBytes: 100 },
        },
      })
    })

    const banner = container?.querySelector(BANNER_SELECTOR)
    expect(banner?.textContent).toContain("Downloading Buddy 0.15.0")
    expect(banner?.textContent).toContain("42%")
  })

  test("asks before restarting to install, and installs only once confirmed", async () => {
    const updatePlatform = createDesktopUpdatePlatform()
    await render(updatePlatform.platform)

    await act(async () => {
      updatePlatform.publish({
        ...idleState(),
        activity: { status: "downloaded", version: "0.15.0" },
      })
    })

    const installButton = container?.querySelector<HTMLButtonElement>(BANNER_ACTION_SELECTOR)
    expect(installButton?.textContent).toBe("Restart to install")

    await act(async () => {
      installButton?.click()
    })

    expect(updatePlatform.calls.installs).toBe(0)
    expect(document.body.textContent).toContain("Restart to install Buddy 0.15.0?")

    await act(async () => {
      document.body.querySelector<HTMLButtonElement>(INSTALL_CONFIRM_SELECTOR)?.click()
    })

    expect(updatePlatform.calls.installs).toBe(1)
  })

  test("keeps the restart offer after a failed install and labels it a retry", async () => {
    const updatePlatform = createDesktopUpdatePlatform()
    await render(updatePlatform.platform)

    await act(async () => {
      updatePlatform.publish({
        ...idleState(),
        activity: { status: "downloaded", version: "0.15.0" },
        failure: { stage: "install" },
      })
    })

    const banner = container?.querySelector(BANNER_SELECTOR)
    expect(banner?.getAttribute("data-tone")).toBe("critical")
    expect(banner?.textContent).toContain("Couldn't install the update")
    expect(container?.querySelector(BANNER_ACTION_SELECTOR)?.textContent).toBe("Try again")
  })

  test("reports a channel persistence failure", async () => {
    const errorToast = spyOn(toast, "error").mockImplementation(() => "test-toast")
    const updatePlatform = createDesktopUpdatePlatform({
      ringSaveError: new Error("store unavailable"),
    })
    const testRoot = mount()
    await act(async () => {
      testRoot.render(
        <PlatformProvider value={updatePlatform.platform}>
          <RingChangeProbe />
        </PlatformProvider>,
      )
    })

    await act(async () => {
      container?.querySelector<HTMLButtonElement>('[data-action="change-ring-probe"]')?.click()
    })

    expect(errorToast).toHaveBeenCalledWith("Failed to save update channel")
    errorToast.mockRestore()
  })
})
