import type { UpdateCheckResult } from "@buddy/web/context/platform"

type BuddyWindow = Window & {
  __BUDDY__?: {
    updaterEnabled?: boolean
    version?: string
  }
}

export const UPDATER_ENABLED = (window as BuddyWindow).__BUDDY__?.updaterEnabled ?? false

let pendingVersion: string | undefined

export async function checkForUpdate(): Promise<UpdateCheckResult> {
  if (!UPDATER_ENABLED) {
    return { status: "disabled" }
  }

  if (pendingVersion) {
    return {
      status: "ready",
      version: pendingVersion,
    }
  }

  try {
    const result = await window.api.checkUpdate()
    if (!result.updateAvailable) {
      return { status: "up-to-date" }
    }

    pendingVersion = result.version
    return {
      status: "ready",
      version: result.version,
    }
  } catch {
    return {
      status: "error",
      stage: "check",
    }
  }
}

export async function installPendingUpdate() {
  if (!UPDATER_ENABLED) return
  await window.api.installUpdate()
  pendingVersion = undefined
}
