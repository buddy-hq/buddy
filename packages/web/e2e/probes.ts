import { expect, type Page } from "@playwright/test"

export type E2EPlatformMode = "web" | "desktop"
export type E2EStreamStatus = "idle" | "connecting" | "connected" | "error"
const E2E_PLATFORM_OVERRIDES_STORAGE_KEY = "buddy.e2e.platform.overrides"

export type E2EPlatformOverrides = {
  mode?: E2EPlatformMode
  os?: "macos" | "windows" | "linux"
  directoryPickerResults?: Array<string | null>
  filePickerResults?: Array<string | null>
  checkUpdateResult?:
    | { status: "disabled" }
    | { status: "up-to-date" }
    | { status: "ready"; version?: string }
    | { status: "error"; stage: "check" | "download" }
  failUpdate?: boolean
}

export type E2EPlatformCalls = {
  startWindowDragging: number
  toggleWindowMaximize: number
  openDirectoryPickerDialog: number
  openFilePickerDialog: number
  checkUpdate: number
  update: number
  restart: number
}

export type E2EPromptProbe = {
  popover: "none" | "slash" | "mention"
  slash: {
    ids: string[]
    active?: string
  }
  mention: {
    ids: string[]
    active?: string
  }
  selected?: string
  selects: number
  submissions: number
  lastSubmission?: {
    kind: "prompt" | "command"
    intent?: string
    persona?: string
    model?: string
    command?: string
    contentLength: number
    hasTeachingContext: boolean
  }
}

export type BuddyE2EDriver = {
  enabled: boolean
  platform: {
    overrides: E2EPlatformOverrides
    calls: E2EPlatformCalls
  }
  prompt: {
    current: E2EPromptProbe
  }
  sync: {
    status: E2EStreamStatus
    controlsCount: number
    disconnect: () => void
    reconnect: () => void
  }
}

declare global {
  interface Window {
    __BUDDY_E2E__?: Partial<BuddyE2EDriver>
  }
}

export async function readDriver(page: Page) {
  return page.evaluate(() => window.__BUDDY_E2E__) as Promise<Partial<BuddyE2EDriver> | undefined>
}

export async function waitForDriver(page: Page) {
  await expect
    .poll(() => readDriver(page).then((driver) => driver?.enabled === true), {
      timeout: 10_000,
    })
    .toBe(true)
}

export async function setDesktopPlatformOverrides(page: Page, overrides: E2EPlatformOverrides) {
  await page.evaluate(
    ({ next, storageKey }) => {
      const driver = window.__BUDDY_E2E__
      if (!driver) return

      const current = driver.platform?.overrides ?? {}
      const merged: E2EPlatformOverrides = {
        ...current,
        ...next,
        mode: "desktop",
      }
      driver.platform = driver.platform ?? { overrides: {}, calls: {} as E2EPlatformCalls }
      driver.platform.overrides = merged
      sessionStorage.setItem(storageKey, JSON.stringify(merged))
    },
    {
      next: overrides,
      storageKey: E2E_PLATFORM_OVERRIDES_STORAGE_KEY,
    },
  )
}

export async function setWebPlatformMode(page: Page) {
  await page.evaluate((storageKey) => {
    const driver = window.__BUDDY_E2E__
    if (!driver) return
    driver.platform = driver.platform ?? { overrides: {}, calls: {} as E2EPlatformCalls }
    const next: E2EPlatformOverrides = {
      ...driver.platform.overrides,
      mode: "web",
    }
    driver.platform.overrides = next
    sessionStorage.setItem(storageKey, JSON.stringify(next))
  }, E2E_PLATFORM_OVERRIDES_STORAGE_KEY)
}

export async function readPlatformCalls(page: Page) {
  const driver = await readDriver(page)
  return driver?.platform?.calls
}

export async function resetPlatformCalls(page: Page) {
  await page.evaluate(() => {
    const driver = window.__BUDDY_E2E__
    if (!driver?.platform?.calls) return
    driver.platform.calls = {
      startWindowDragging: 0,
      toggleWindowMaximize: 0,
      openDirectoryPickerDialog: 0,
      openFilePickerDialog: 0,
      checkUpdate: 0,
      update: 0,
      restart: 0,
    }
  })
}

export async function readPromptProbe(page: Page) {
  const driver = await readDriver(page)
  return driver?.prompt?.current
}

export async function waitForPromptSubmissions(page: Page, submissions: number) {
  await expect
    .poll(async () => {
      const prompt = await readPromptProbe(page)
      return prompt?.submissions ?? 0
    })
    .toBe(submissions)
}

export async function waitForPromptPopover(page: Page, popover: E2EPromptProbe["popover"]) {
  await expect
    .poll(async () => {
      const prompt = await readPromptProbe(page)
      return prompt?.popover ?? "none"
    })
    .toBe(popover)
}

export async function readSyncStatus(page: Page) {
  const driver = await readDriver(page)
  return driver?.sync?.status
}

export async function waitForSyncStatus(page: Page, status: E2EStreamStatus) {
  await expect.poll(() => readSyncStatus(page)).toBe(status)
}

export async function disconnectSync(page: Page) {
  await page.evaluate(() => {
    window.__BUDDY_E2E__?.sync?.disconnect?.()
  })
}

export async function reconnectSync(page: Page) {
  await page.evaluate(() => {
    window.__BUDDY_E2E__?.sync?.reconnect?.()
  })
}
