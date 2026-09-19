import type { BrowserImportHost } from "./browser-import-host"
import type { BrowserImportSourceDefinition } from "./sources"

type SourceLockHost = Pick<
  BrowserImportHost,
  "platform" | "path" | "files" | "hostname" | "isProcessAlive"
>

function parseProcessID(text: string): number | undefined {
  if (!/^\d+$/u.test(text)) return undefined
  const pid = Number(text)
  return Number.isSafeInteger(pid) && pid > 0 ? pid : undefined
}

// SingletonLock points at <host>-<pid>; a lock written by another host counts as held.
function chromiumLockTargetIsHeld(target: string, host: SourceLockHost): boolean {
  const separator = target.lastIndexOf("-")
  if (separator <= 0) return true
  const pid = parseProcessID(target.slice(separator + 1))
  if (pid === undefined || target.slice(0, separator) !== host.hostname) return true
  return host.isProcessAlive(pid)
}

async function chromiumSingletonLockIsHeld(root: string, host: SourceLockHost): Promise<boolean> {
  const lock = await host.files.readSymlink(host.path.join(root, "SingletonLock"))
  switch (lock._tag) {
    case "missing":
      return false
    case "unreadable":
      return true
    case "target":
      return chromiumLockTargetIsHeld(lock.target, host)
  }
}

async function chromiumWindowsLockIsHeld(root: string, host: SourceLockHost): Promise<boolean> {
  const result = await host.files.probeOpen(host.path.join(root, "lockfile"), "readWrite")
  return result === "busy" || result === "accessDenied"
}

export async function isSourceRunning(
  definition: BrowserImportSourceDefinition,
  root: string,
  host: SourceLockHost,
): Promise<boolean> {
  switch (definition.engine) {
    case "safari":
      return false
    case "chromium":
      return host.platform === "win32"
        ? chromiumWindowsLockIsHeld(root, host)
        : chromiumSingletonLockIsHeld(root, host)
  }
}
