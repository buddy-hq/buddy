import { spawn, spawnSync } from "node:child_process"
import { unlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import type ParcelWatcher from "@parcel/watcher"
import treeKill from "tree-kill"
import {
  BACKEND_DEVELOPMENT_RELOAD_ACKNOWLEDGEMENT_ENV,
  BACKEND_DEVELOPMENT_RELOAD_SIGNAL_ENV,
  watchDevelopmentGenerationFile,
} from "../src/shared/backend-development-reload"
import { backendDevelopmentWatchRoots } from "./electron-vite-build-policy"
import { resolveElectronBin } from "./electron-bin"
import { ensureGeneratedSdk, generatedSdkFreshnessInput } from "./dev-sdk"
import { prepareMacDevElectronExecutable } from "./mac-dev-electron-app"
import { BUDDY_DEV_INSTANCE_NAME_ENV, formatBuddyDevAppName } from "../src/shared/dev-app-name"
import { applyDesktopDevTerminalTitle, resolveDesktopDevBranchName } from "./dev-terminal-title"

const DEV_COMMAND = "electron-vite"
const DEV_ARGUMENTS = ["dev"] as const
const LOGIN_SHELL_PATH_COMMAND = "printf '%s' \"$PATH\""
const FORCE_KILL_TIMEOUT_MS = 7_000
const PARENT_EXIT_TIMEOUT_MS = 9_000
const BACKEND_RELOAD_DEBOUNCE_MS = 100
const SHUTDOWN_SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP"] as const
const TERMINATION_SIGNAL: NodeJS.Signals = "SIGTERM"
const FORCE_KILL_SIGNAL: NodeJS.Signals = "SIGKILL"
const SHOULD_DETACH_CHILD = process.platform !== "win32"
const BACKEND_WATCH_DISABLED_ARGUMENT = "--no-backend-watch"
const BACKEND_RELOAD_SIGNAL_PREFIX = "buddy-electron-backend-reload-"
const BACKEND_RELOAD_SIGNAL_SUFFIX = ".signal"
const BACKEND_RELOAD_ACKNOWLEDGEMENT_SUFFIX = ".ack"
const ELECTRON_EXECUTABLE_PATH_ENV = "ELECTRON_EXEC_PATH"
const backendDevelopmentReloadEnabled = !process.argv.includes(BACKEND_WATCH_DISABLED_ARGUMENT)

let shuttingDown = false
let requestedExitCode: number | undefined
let sdkGenerationChild: ReturnType<typeof spawn> | undefined
let backendReloadGeneration = 0
let backendReloadPending = false
let backendReloadPreparing = false
let backendReloadQueued = false
let backendReloadTimer: ReturnType<typeof setTimeout> | undefined
let stopBackendReloadAcknowledgementWatcher: (() => void) | undefined
const backendWatchSubscriptions: ParcelWatcher.AsyncSubscription[] = []
const closedChildren = new WeakSet<ReturnType<typeof spawn>>()

const packageRoot = path.resolve(import.meta.dir, "..")
const repoRoot = path.resolve(packageRoot, "..", "..")
const devInstanceName = resolveDesktopDevBranchName(repoRoot)
applyDesktopDevTerminalTitle({ repoRoot, branchName: devInstanceName })
const sdkDir = path.resolve(packageRoot, "../sdk")
const backendWatchRoots = backendDevelopmentWatchRoots(repoRoot)
const sdkFreshness = generatedSdkFreshnessInput({
  backendSourcePaths: backendWatchRoots,
  repositoryRoot: repoRoot,
  sdkDir,
})
const backendReloadSignalPath = backendDevelopmentReloadEnabled
  ? path.join(
      tmpdir(),
      `${BACKEND_RELOAD_SIGNAL_PREFIX}${process.pid}${BACKEND_RELOAD_SIGNAL_SUFFIX}`,
    )
  : undefined
const backendReloadAcknowledgementPath = backendReloadSignalPath
  ? `${backendReloadSignalPath}${BACKEND_RELOAD_ACKNOWLEDGEMENT_SUFFIX}`
  : undefined

function resolveShellPath() {
  if (process.platform === "win32") return process.env.PATH

  const shell = process.env.SHELL?.trim()
  if (!shell) return process.env.PATH

  const result = spawnSync(shell, ["-il", "-c", LOGIN_SHELL_PATH_COMMAND], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  })

  const shellPath = result.status === 0 ? result.stdout.trim() : ""
  return shellPath.length > 0 ? shellPath : process.env.PATH
}

const sourceElectronExecutablePath = resolveElectronBin(packageRoot)
const macDevElectronExecutablePath = prepareMacDevElectronExecutable({
  appName: formatBuddyDevAppName(devInstanceName),
  electronExecutablePath: sourceElectronExecutablePath,
  repositoryRoot: repoRoot,
})
if (backendReloadSignalPath) writeFileSync(backendReloadSignalPath, "0\n")
if (backendReloadAcknowledgementPath) {
  writeFileSync(backendReloadAcknowledgementPath, "0\n")
}

const child = spawn(DEV_COMMAND, DEV_ARGUMENTS, {
  stdio: "inherit",
  detached: SHOULD_DETACH_CHILD,
  shell: process.platform === "win32",
  env: Object.assign(
    {
      ...process.env,
      PATH: resolveShellPath(),
      [BUDDY_DEV_INSTANCE_NAME_ENV]: devInstanceName,
    },
    macDevElectronExecutablePath
      ? { [ELECTRON_EXECUTABLE_PATH_ENV]: macDevElectronExecutablePath }
      : undefined,
    backendReloadSignalPath
      ? { [BACKEND_DEVELOPMENT_RELOAD_SIGNAL_ENV]: backendReloadSignalPath }
      : undefined,
    backendReloadAcknowledgementPath
      ? {
          [BACKEND_DEVELOPMENT_RELOAD_ACKNOWLEDGEMENT_ENV]: backendReloadAcknowledgementPath,
        }
      : undefined,
  ),
})
child.once("close", () => closedChildren.add(child))

if (backendDevelopmentReloadEnabled) {
  startBackendReloadAcknowledgementWatcher()
  void startBackendDevelopmentWatcher()
}

function killProcessTree(target: ReturnType<typeof spawn> | undefined, signal: NodeJS.Signals) {
  if (!target?.pid || closedChildren.has(target)) return
  if (SHOULD_DETACH_CHILD) {
    try {
      process.kill(-target.pid, signal)
      return
    } catch {
      // noop
    }
  }

  treeKill(target.pid, signal, () => undefined)
}

function backendWatcherBackend(): ParcelWatcher.BackendType | undefined {
  if (process.platform === "win32") return "windows"
  if (process.platform === "darwin") return "fs-events"
  if (process.platform === "linux") return "inotify"
  return undefined
}

async function startBackendDevelopmentWatcher() {
  const backend = backendWatcherBackend()
  if (!backend) {
    console.warn(`Backend development reload is unavailable on ${process.platform}.`)
    return
  }

  try {
    const parcelWatcher = (await import("@parcel/watcher")).default
    for (const root of backendWatchRoots) {
      const subscription = await parcelWatcher.subscribe(
        root,
        (error, events) => {
          if (error) {
            console.error("Backend development watcher failed.", error)
            return
          }
          if (events.length > 0) scheduleBackendReload()
        },
        { backend },
      )
      if (shuttingDown) {
        await subscription.unsubscribe()
        continue
      }
      backendWatchSubscriptions.push(subscription)
    }
    console.log(`Watching ${backendWatchRoots.length} backend source roots for changes`)
  } catch (error) {
    console.error("Failed to start backend development reload.", error)
  }
}

function scheduleBackendReload() {
  if (shuttingDown) return
  if (backendReloadPreparing || backendReloadPending) {
    backendReloadQueued = true
    return
  }
  if (backendReloadTimer) clearTimeout(backendReloadTimer)
  backendReloadTimer = setTimeout(() => {
    backendReloadTimer = undefined
    void reloadDevelopmentBackend()
  }, BACKEND_RELOAD_DEBOUNCE_MS)
}

function startBackendReloadAcknowledgementWatcher() {
  if (!backendReloadAcknowledgementPath || stopBackendReloadAcknowledgementWatcher) return

  stopBackendReloadAcknowledgementWatcher = watchDevelopmentGenerationFile({
    generationPath: backendReloadAcknowledgementPath,
    onError: (error) => {
      console.error("Backend development reload acknowledgement failed.", error)
    },
    onGeneration: async (generation) => {
      if (generation.trim() !== String(backendReloadGeneration)) return
      backendReloadPending = false
      if (backendReloadQueued) scheduleBackendReload()
    },
  })
}

function waitForChild(child: ReturnType<typeof spawn>): Promise<number | null> {
  return new Promise((resolve, reject) => {
    child.once("error", reject)
    child.once("close", resolve)
  })
}

async function refreshGeneratedSdkForDevelopment(): Promise<void> {
  await ensureGeneratedSdk(sdkFreshness, async () => {
    console.log("Backend API sources changed; refreshing the generated Buddy SDK...")
    const generation = spawn("bun", ["run", "--cwd", sdkDir, "generate"], {
      cwd: repoRoot,
      detached: SHOULD_DETACH_CHILD,
      stdio: "inherit",
    })
    sdkGenerationChild = generation
    generation.once("close", () => closedChildren.add(generation))

    try {
      const exitCode = await waitForChild(generation)
      if (exitCode !== 0) {
        throw new Error(`SDK generation exited with code ${exitCode ?? "unknown"}`)
      }
    } finally {
      if (sdkGenerationChild === generation) sdkGenerationChild = undefined
    }
  })
}

async function reloadDevelopmentBackend() {
  if (shuttingDown || backendReloadPreparing || backendReloadPending) return
  backendReloadQueued = false
  backendReloadPreparing = true
  const startedAt = performance.now()
  console.log("\nBackend source changed; preparing to restart Buddy backend...")

  try {
    await refreshGeneratedSdkForDevelopment()
    if (shuttingDown || backendReloadQueued) return

    if (backendReloadSignalPath) {
      backendReloadGeneration += 1
      backendReloadPending = true
      try {
        writeFileSync(backendReloadSignalPath, `${backendReloadGeneration}\n`)
      } catch (error) {
        backendReloadPending = false
        throw error
      }
      console.log(
        `Backend ready to restart from source in ${Math.round(performance.now() - startedAt)}ms...`,
      )
    }
  } catch (error) {
    console.error("Backend reload preparation failed; keeping the current app running.", error)
  } finally {
    backendReloadPreparing = false
    if (backendReloadQueued) scheduleBackendReload()
  }
}

function closeBackendDevelopmentWatcher() {
  if (backendReloadTimer) {
    clearTimeout(backendReloadTimer)
    backendReloadTimer = undefined
  }
  for (const subscription of backendWatchSubscriptions.splice(0)) {
    void subscription.unsubscribe()
  }
  stopBackendReloadAcknowledgementWatcher?.()
  stopBackendReloadAcknowledgementWatcher = undefined
}

function removeBackendDevelopmentFiles() {
  for (const filePath of [backendReloadSignalPath, backendReloadAcknowledgementPath]) {
    if (!filePath) continue
    try {
      unlinkSync(filePath)
    } catch {
      // noop
    }
  }
}

function shutdown() {
  if (shuttingDown) return
  shuttingDown = true

  closeBackendDevelopmentWatcher()
  killProcessTree(child, TERMINATION_SIGNAL)
  killProcessTree(sdkGenerationChild, TERMINATION_SIGNAL)

  setTimeout(() => {
    killProcessTree(child, FORCE_KILL_SIGNAL)
    killProcessTree(sdkGenerationChild, FORCE_KILL_SIGNAL)
  }, FORCE_KILL_TIMEOUT_MS).unref()

  setTimeout(() => {
    process.exit(requestedExitCode ?? 0)
  }, PARENT_EXIT_TIMEOUT_MS).unref()
}

for (const signal of SHUTDOWN_SIGNALS) {
  process.on(signal, () => {
    requestedExitCode = 0
    shutdown()
  })
}

child.on("close", (code) => {
  closeBackendDevelopmentWatcher()
  killProcessTree(sdkGenerationChild, TERMINATION_SIGNAL)
  removeBackendDevelopmentFiles()
  process.exit(requestedExitCode ?? code ?? 0)
})

child.on("error", () => {
  closeBackendDevelopmentWatcher()
  killProcessTree(sdkGenerationChild, TERMINATION_SIGNAL)
  removeBackendDevelopmentFiles()
  process.exit(1)
})
