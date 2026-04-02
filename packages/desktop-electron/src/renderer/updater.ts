import type { UpdateCheckResult } from "@buddy/web/context/platform"

function isUpdaterEnabled() {
  const buddyGlobals = Reflect.get(window, "__BUDDY__")
  if (!buddyGlobals || typeof buddyGlobals !== "object") {
    return false
  }

  const updaterEnabled = Reflect.get(buddyGlobals, "updaterEnabled")
  return typeof updaterEnabled === "boolean" ? updaterEnabled : false
}

export async function checkForUpdate(): Promise<UpdateCheckResult> {
  if (!isUpdaterEnabled()) {
    return { status: "disabled" }
  }

  try {
    const result = await window.api.checkUpdate()
    if (result.failed) {
      return {
        status: "error",
        stage: "check",
      }
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
