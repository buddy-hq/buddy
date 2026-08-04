import "../happydom"
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { Toaster } from "@buddy/ui"
import type { Platform, UpdateProgressSnapshot } from "@/context/platform"
import {
  showDesktopUpdateProgressToast,
  showDesktopUpdateToast,
} from "@/lib/desktop-updates"

const UPDATE_VERSION = "1.2.3"
const TOAST_SETTLE_DELAY_MS = 100

function createDesktopPlatform(input?: { update?: () => Promise<void> }) {
  let updateCount = 0

  const platform: Platform = {
    platform: "desktop",
    openLink: () => undefined,
    restart: async () => undefined,
    back: () => undefined,
    forward: () => undefined,
    notify: async () => undefined,
    getUpdateProgress: async () => ({
      percent: 100,
      ring: "stable",
      status: "ready",
      version: UPDATE_VERSION,
    }),
    update: async () => {
      updateCount += 1
      await input?.update?.()
    },
  }

  return {
    getUpdateCount: () => updateCount,
    platform,
  }
}

function downloadingProgress(percent: number): UpdateProgressSnapshot {
  return {
    percent,
    ring: "stable",
    status: "downloading",
    version: UPDATE_VERSION,
  }
}

function readyProgress(): UpdateProgressSnapshot {
  return {
    percent: 100,
    ring: "stable",
    status: "ready",
    version: UPDATE_VERSION,
  }
}

function visibleToasts(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-sonner-toast]")).filter(
    (element) => element.dataset.removed !== "true",
  )
}

function onlyVisibleToast(): HTMLElement {
  const toasts = visibleToasts()
  expect(toasts).toHaveLength(1)
  const toast = toasts[0]
  if (!toast) {
    throw new Error("Expected an update toast")
  }
  return toast
}

async function settleToast() {
  await new Promise((resolve) => setTimeout(resolve, TOAST_SETTLE_DELAY_MS))
}

describe("desktop update toasts", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => {
      root.render(<Toaster />)
    })
  })

  afterEach(async () => {
    await act(async () => {
      showDesktopUpdateProgressToast({
        progress: {
          ring: "stable",
          status: "idle",
        },
      })
      await settleToast()
      root.unmount()
    })
    container.remove()
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  test("transitions one toast from download progress to an actionable ready state", async () => {
    const { platform } = createDesktopPlatform()

    await act(async () => {
      showDesktopUpdateProgressToast({ progress: downloadingProgress(10) })
      showDesktopUpdateProgressToast({ progress: downloadingProgress(99) })
      showDesktopUpdateProgressToast({ progress: readyProgress() })
      showDesktopUpdateToast({ platform, version: UPDATE_VERSION })
      await settleToast()
    })

    const toast = onlyVisibleToast()
    expect(toast.textContent).toContain("Update ready to install")
    expect(toast.textContent).toContain(`Buddy ${UPDATE_VERSION} has been downloaded.`)
    expect(toast.querySelector('[data-action="true"]')?.textContent).toBe("Install & restart")
    expect(toast.querySelector('[data-cancel="true"]')?.textContent).toBe("Later")
  })

  test("keeps the actionable ready toast during a manual recheck", async () => {
    const { platform } = createDesktopPlatform()
    showDesktopUpdateToast({ platform, version: UPDATE_VERSION })

    await act(async () => {
      showDesktopUpdateProgressToast({
        progress: {
          ring: "stable",
          status: "checking",
        },
        showChecking: true,
      })
      showDesktopUpdateProgressToast({
        progress: {
          ring: "stable",
          status: "error",
        },
      })
      showDesktopUpdateProgressToast({ progress: readyProgress() })
      await settleToast()
    })

    const toast = onlyVisibleToast()
    expect(toast.textContent).toContain("Update ready to install")
    expect(toast.textContent).not.toContain("Checking for updates")
    expect(toast.querySelector('[data-action="true"]')?.textContent).toBe("Install & restart")
  })

  test("shows a passive ready state for checks owned by the native update dialog", async () => {
    await act(async () => {
      showDesktopUpdateProgressToast({ progress: downloadingProgress(99) })
      showDesktopUpdateProgressToast({ progress: readyProgress() })
      await settleToast()
    })

    const toast = onlyVisibleToast()
    expect(toast.textContent).toContain("Update ready to install")
    expect(toast.querySelector("[data-action]")).toBeNull()
    expect(toast.querySelector("[data-cancel]")).toBeNull()
  })

  test("starts a clean toast lifecycle when checking again immediately after Later", async () => {
    const { platform } = createDesktopPlatform()
    showDesktopUpdateToast({ platform, version: UPDATE_VERSION })
    await act(settleToast)

    const firstToast = onlyVisibleToast()
    const laterButton = firstToast.querySelector<HTMLButtonElement>('[data-cancel="true"]')
    expect(laterButton).not.toBeNull()

    await act(async () => {
      laterButton?.click()
      showDesktopUpdateProgressToast({ progress: downloadingProgress(1) })
      showDesktopUpdateProgressToast({ progress: readyProgress() })
      showDesktopUpdateToast({ platform, version: UPDATE_VERSION })
      await settleToast()
    })

    const replacementToast = onlyVisibleToast()
    expect(replacementToast).not.toBe(firstToast)
    expect(replacementToast.textContent).toContain("Update ready to install")
    expect(replacementToast.querySelector('[data-action="true"]')).not.toBeNull()
  })

  test("keeps the same toast visible while installation starts", async () => {
    const updatePlatform = createDesktopPlatform()
    showDesktopUpdateToast({
      platform: updatePlatform.platform,
      version: UPDATE_VERSION,
    })
    await act(settleToast)

    const readyToast = onlyVisibleToast()
    const installButton = readyToast.querySelector<HTMLButtonElement>('[data-action="true"]')
    expect(installButton).not.toBeNull()

    await act(async () => {
      installButton?.click()
      await settleToast()
    })

    const installingToast = onlyVisibleToast()
    expect(installingToast).toBe(readyToast)
    expect(installingToast.textContent).toContain("Installing update")
    expect(installingToast.querySelector("[data-action]")).toBeNull()
    expect(updatePlatform.getUpdateCount()).toBe(1)
  })

  test("replaces a failed install lifecycle with a finite error toast", async () => {
    const updatePlatform = createDesktopPlatform({
      update: async () => {
        throw new Error("install failed")
      },
    })
    let installFailureCount = 0
    showDesktopUpdateToast({
      platform: updatePlatform.platform,
      version: UPDATE_VERSION,
      onInstallFailed: () => {
        installFailureCount += 1
      },
    })
    await act(settleToast)

    const installButton = onlyVisibleToast().querySelector<HTMLButtonElement>(
      '[data-action="true"]',
    )
    await act(async () => {
      installButton?.click()
      await settleToast()
    })

    const errorToast = onlyVisibleToast()
    expect(errorToast.textContent).toContain("Update install failed")
    expect(installFailureCount).toBe(1)
  })
})
