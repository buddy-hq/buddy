import { check, type Update } from "@tauri-apps/plugin-updater"
import { type as osType } from "@tauri-apps/plugin-os"
import type { UpdateCheckResult } from "@buddy/web/context/platform"
import { commands } from "./bindings"

type BuddyWindow = Window & {
  __BUDDY__?: {
    updaterEnabled?: boolean
  }
}

let pendingUpdate: Update | null = null

export const UPDATER_ENABLED = (window as BuddyWindow).__BUDDY__?.updaterEnabled ?? false

export async function checkForUpdate(): Promise<UpdateCheckResult> {
  if (!UPDATER_ENABLED) {
    return { status: "disabled" }
  }

  if (pendingUpdate) {
    return {
      status: "ready",
      version: pendingUpdate.version,
    }
  }

  const next = await check().catch(() => undefined)
  if (next === undefined) {
    return { status: "error", stage: "check" }
  }
  if (!next) {
    return { status: "up-to-date" }
  }

  try {
    await next.download()
  } catch {
    return { status: "error", stage: "download" }
  }

  pendingUpdate = next
  return {
    status: "ready",
    version: next.version,
  }
}

export async function installPendingUpdate() {
  if (!UPDATER_ENABLED || !pendingUpdate) {
    return
  }

  if (osType() === "windows") {
    await commands.killSidecar()
  }

  await pendingUpdate.install()
  pendingUpdate = null
}
