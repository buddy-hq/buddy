import type {
  UpdateCheckResult,
  UpdateProgressSnapshot,
  UpdateRing,
} from "@buddy/web/context/platform"
import { readBuddyRendererGlobals } from "../shared/parse-external"

function isUpdaterEnabled() {
  return readBuddyRendererGlobals(window)?.updaterEnabled === true
}

export async function checkForUpdate(): Promise<UpdateCheckResult> {
  if (!isUpdaterEnabled()) {
    return { status: "disabled" }
  }

  try {
    const result = await window.api.checkUpdate()
    if (result.failed) {
      const progress = await window.api.getUpdateProgress().catch(() => null)
      return {
        status: "error",
        stage: progress?.errorStage === "download" ? "download" : "check",
      }
    }

    if (result.blocked) {
      return { status: "blocked" }
    }

    if (!result.updateAvailable) {
      return { status: "up-to-date" }
    }

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
  if (!isUpdaterEnabled()) return
  await window.api.installUpdate()
}

export async function getUpdateProgress(): Promise<UpdateProgressSnapshot> {
  return await window.api.getUpdateProgress()
}

export async function getUpdateRing(): Promise<UpdateRing> {
  return await window.api.getUpdateRing()
}

export function onUpdateProgress(cb: (snapshot: UpdateProgressSnapshot) => void): () => void {
  return window.api.onUpdateProgress(cb)
}

export async function setUpdateRing(ring: UpdateRing): Promise<void> {
  await window.api.setUpdateRing(ring)
}
