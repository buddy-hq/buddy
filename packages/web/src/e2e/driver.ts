import type { Platform, UpdateCheckResult } from "@/context/platform"

type E2EPlatformMode = "web" | "desktop"
type E2EStreamStatus = "idle" | "connecting" | "connected" | "error"

type E2EPlatformOverrides = {
  mode?: E2EPlatformMode
  os?: "macos" | "windows" | "linux"
  directoryPickerResults?: Array<string | null>
  filePickerResults?: Array<string | null>
  checkUpdateResult?: UpdateCheckResult
  failUpdate?: boolean
}

type E2EPlatformCalls = {
  startWindowDragging: number
  toggleWindowMaximize: number
  openDirectoryPickerDialog: number
  openFilePickerDialog: number
  checkUpdate: number
  update: number
  restart: number
}

type E2EPromptProbe = {
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
  lastSubmission?: E2EPromptSubmission
}

type E2EPromptSubmission = {
  kind: "prompt" | "command"
  intent?: string
  persona?: string
  model?: string
  command?: string
  contentLength: number
  hasTeachingContext: boolean
}

type E2EChatSyncControls = {
  disconnect: () => void
  reconnect: () => void
}

type E2ESyncProbe = {
  status: E2EStreamStatus
  controlsCount: number
  disconnect: () => void
  reconnect: () => void
}

type BuddyE2EDriver = {
  enabled: boolean
  platform: {
    overrides: E2EPlatformOverrides
    calls: E2EPlatformCalls
  }
  prompt: {
    current: E2EPromptProbe
  }
  sync: E2ESyncProbe
}

declare global {
  interface Window {
    __BUDDY_E2E__?: Partial<BuddyE2EDriver>
  }
}

const defaultPlatformCalls = (): E2EPlatformCalls => ({
  startWindowDragging: 0,
  toggleWindowMaximize: 0,
  openDirectoryPickerDialog: 0,
  openFilePickerDialog: 0,
  checkUpdate: 0,
  update: 0,
  restart: 0,
})

const defaultPromptProbe = (): E2EPromptProbe => ({
  popover: "none",
  slash: { ids: [] },
  mention: { ids: [] },
  selects: 0,
  submissions: 0,
})

function readGlobalDriver() {
  if (typeof window === "undefined") return undefined
  return window.__BUDDY_E2E__
}

function e2eEnabled() {
  const globalDriver = readGlobalDriver()
  if (globalDriver?.enabled === true) return true
  return import.meta.env.VITE_BUDDY_E2E === "1"
}

function ensureDriver(): BuddyE2EDriver | undefined {
  if (!e2eEnabled() || typeof window === "undefined") return undefined

  const current = window.__BUDDY_E2E__
  const next: BuddyE2EDriver = {
    enabled: true,
    platform: {
      overrides: current?.platform?.overrides ?? {},
      calls: current?.platform?.calls ?? defaultPlatformCalls(),
    },
    prompt: {
      current: current?.prompt?.current ?? defaultPromptProbe(),
    },
    sync: {
      status: current?.sync?.status ?? "idle",
      controlsCount: current?.sync?.controlsCount ?? 0,
      disconnect: current?.sync?.disconnect ?? (() => undefined),
      reconnect: current?.sync?.reconnect ?? (() => undefined),
    },
  }

  window.__BUDDY_E2E__ = next
  return next
}

function takeResult(queue: Array<string | null> | undefined): string | null {
  if (!queue || queue.length === 0) return null
  const [first, ...rest] = queue
  queue.splice(0, queue.length, ...rest)
  return first ?? null
}

const chatSyncControls = new Set<E2EChatSyncControls>()

function syncDisconnect() {
  for (const controls of chatSyncControls) {
    controls.disconnect()
  }
}

function syncReconnect() {
  for (const controls of chatSyncControls) {
    controls.reconnect()
  }
}

function refreshSyncProbe(driver: BuddyE2EDriver) {
  driver.sync.controlsCount = chatSyncControls.size
  driver.sync.disconnect = syncDisconnect
  driver.sync.reconnect = syncReconnect
}

export function configureE2EPlatform(base: Platform): Platform {
  const driver = ensureDriver()
  if (!driver) return base

  const { overrides, calls } = driver.platform
  const readMode = () => overrides.mode ?? "web"
  const readDesktop = () => readMode() === "desktop"

  const bindBase = <Args extends unknown[], Result>(fn: ((...args: Args) => Result) | undefined) =>
    fn ? (...args: Args) => fn.apply(base, args) : undefined

  return {
    ...base,
    get platform() {
      return readDesktop() ? "desktop" : "web"
    },
    get os() {
      return readDesktop() ? (overrides.os ?? "macos") : base.os
    },
    get startWindowDragging() {
      if (!readDesktop()) {
        return bindBase(base.startWindowDragging)
      }
      return async () => {
        calls.startWindowDragging += 1
      }
    },
    get toggleWindowMaximize() {
      if (!readDesktop()) {
        return bindBase(base.toggleWindowMaximize)
      }
      return async () => {
        calls.toggleWindowMaximize += 1
      }
    },
    get openDirectoryPickerDialog() {
      if (!readDesktop()) {
        return bindBase(base.openDirectoryPickerDialog)
      }
      return async () => {
        calls.openDirectoryPickerDialog += 1
        return takeResult(overrides.directoryPickerResults)
      }
    },
    get openFilePickerDialog() {
      if (!readDesktop()) {
        return bindBase(base.openFilePickerDialog)
      }
      return async () => {
        calls.openFilePickerDialog += 1
        return takeResult(overrides.filePickerResults)
      }
    },
    get checkUpdate() {
      if (!readDesktop()) {
        return bindBase(base.checkUpdate)
      }
      return async () => {
        calls.checkUpdate += 1
        return overrides.checkUpdateResult ?? { status: "up-to-date" }
      }
    },
    get update() {
      if (!readDesktop()) {
        return bindBase(base.update)
      }
      return async () => {
        calls.update += 1
        if (overrides.failUpdate) {
          throw new Error("E2E mocked update failure")
        }
      }
    },
    async restart() {
      if (!readDesktop()) {
        await base.restart()
        return
      }
      calls.restart += 1
    },
  }
}

export function publishPromptProbe(next: Omit<E2EPromptProbe, "submissions" | "lastSubmission">) {
  const driver = ensureDriver()
  if (!driver) return
  const current = driver.prompt.current
  driver.prompt.current = {
    ...next,
    submissions: current.submissions,
    lastSubmission: current.lastSubmission,
  }
}

export function publishPromptSubmissionProbe(
  next: Omit<E2EPromptSubmission, "contentLength"> & { contentLength: number },
) {
  const driver = ensureDriver()
  if (!driver) return

  const current = driver.prompt.current
  driver.prompt.current = {
    ...current,
    submissions: current.submissions + 1,
    lastSubmission: {
      kind: next.kind,
      intent: next.intent,
      persona: next.persona,
      model: next.model,
      command: next.command,
      contentLength: next.contentLength,
      hasTeachingContext: next.hasTeachingContext,
    },
  }
}

export function publishChatSyncProbeStatus(status: E2EStreamStatus) {
  const driver = ensureDriver()
  if (!driver) return
  driver.sync.status = status
}

export function registerChatSyncProbe(controls: E2EChatSyncControls) {
  const driver = ensureDriver()
  if (!driver) return () => undefined

  chatSyncControls.add(controls)
  refreshSyncProbe(driver)

  return () => {
    chatSyncControls.delete(controls)
    const currentDriver = ensureDriver()
    if (currentDriver) {
      refreshSyncProbe(currentDriver)
    }
  }
}
