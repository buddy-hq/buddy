import { execFileSync, spawn, spawnSync } from "node:child_process"
import { unlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { BUDDY_CHANNEL_ENV, readBuddyReleaseChannel } from "@buddy/script/channel"
import type ParcelWatcher from "@parcel/watcher"
import treeKill from "tree-kill"
import {
  BACKEND_DEVELOPMENT_RELOAD_ACKNOWLEDGEMENT_ENV,
  BACKEND_DEVELOPMENT_RELOAD_SIGNAL_ENV,
  watchDevelopmentGenerationFile,
} from "../src/shared/backend-development-reload"
import {
  backendDevelopmentWatchRoots,
  resolveBackendDevelopmentRebuildCompletion,
} from "./electron-vite-build-policy"
import { resolveElectronBin } from "./electron-bin"
import { ensureGeneratedSdk, generatedSdkFreshnessInput } from "./dev-sdk"
import { prepareMacDevElectronExecutable } from "./mac-dev-electron-app"
import { BUDDY_DEV_INSTANCE_NAME_ENV, formatBuddyDevAppName } from "../src/shared/dev-app-name"

const DEV_COMMAND = "electron-vite"
const DEV_ARGUMENTS = ["dev"] as const
const LOGIN_SHELL_PATH_COMMAND = "printf '%s' \"$PATH\""
const FORCE_KILL_TIMEOUT_MS = 2_000
const PARENT_EXIT_TIMEOUT_MS = 4_000
const BACKEND_REBUILD_DEBOUNCE_MS = 100
const SHUTDOWN_SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP"] as const
const TERMINATION_SIGNAL: NodeJS.Signals = "SIGTERM"
const FORCE_KILL_SIGNAL: NodeJS.Signals = "SIGKILL"
const PROCESS_LIST_COLUMNS = "pid=,command=" as const
const SHOULD_DETACH_CHILD = process.platform !== "win32"
const BACKEND_WATCH_DISABLED_ARGUMENT = "--no-backend-watch"
const BACKEND_RELOAD_SIGNAL_PREFIX = "buddy-electron-backend-reload-"
const BACKEND_RELOAD_SIGNAL_SUFFIX = ".signal"
const BACKEND_RELOAD_ACKNOWLEDGEMENT_SUFFIX = ".ack"
const ELECTRON_EXECUTABLE_PATH_ENV = "ELECTRON_EXEC_PATH"
const backendDevelopmentReloadEnabled = !process.argv.includes(BACKEND_WATCH_DISABLED_ARGUMENT)

let shuttingDown = false
let requestedExitCode: number | undefined
let backendBuildChild: ReturnType<typeof spawn> | undefined
let sdkGenerationChild: ReturnType<typeof spawn> | undefined
let backendReloadGeneration = 0
let backendReloadPending = false
let backendRebuildQueued = false
let backendRebuildTimer: ReturnType<typeof setTimeout> | undefined
let stopBackendReloadAcknowledgementWatcher: (() => void) | undefined
const backendWatchSubscriptions: ParcelWatcher.AsyncSubscription[] = []

const packageRoot = path.resolve(import.meta.dir, "..")
const repoRoot = path.resolve(packageRoot, "..", "..")
const backendDir = path.resolve(packageRoot, "../buddy")
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
const electronViteBinPath = path.resolve(packageRoot, "node_modules/.bin/electron-vite")
const desktopChannel = readBuddyReleaseChannel()

function resolveDevInstanceName() {
  try {
    const result = execFileSync("git", ["branch", "--show-current"], {
      encoding: "utf8",
      cwd: repoRoot,
    })
    const branch = result.trim()
    return branch || path.basename(repoRoot)
  } catch {
    return path.basename(repoRoot)
  }
}

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

function killStaleDesktopDevProcesses() {
  try {
    const output = execFileSync("ps", ["-ax", "-o", PROCESS_LIST_COLUMNS], {
      encoding: "utf8",
    })

    for (const rawLine of output.split("\n")) {
      const trimmed = rawLine.trim()
      if (!trimmed) continue

      const match = /^(\d+)\s+(.*)$/.exec(trimmed)
      if (!match) continue

      const pid = Number.parseInt(match[1], 10)
      const command = match[2] ?? ""
      if (Number.isNaN(pid) || pid === process.pid) continue

      const matchesElectronVite =
        command.includes(electronViteBinPath) ||
        command.includes("electron-vite/bin/electron-vite.js")
      const matchesBuddyElectron = electronExecutablePaths.some((executablePath) =>
        command.includes(executablePath),
      )

      if (!matchesElectronVite && !matchesBuddyElectron) continue

      const isFromCurrentWorktree =
        command.includes(repoRoot) ||
        (macDevElectronExecutablePath ? command.includes(macDevElectronExecutablePath) : false)
      if (!isFromCurrentWorktree) continue

      treeKill(pid, FORCE_KILL_SIGNAL, () => undefined)
    }
  } catch {
    // noop
  }
}

const devInstanceName = resolveDevInstanceName()
const sourceElectronExecutablePath = resolveElectronBin(packageRoot)
const macDevElectronExecutablePath = prepareMacDevElectronExecutable({
  appName: formatBuddyDevAppName(devInstanceName),
  electronExecutablePath: sourceElectronExecutablePath,
  repositoryRoot: repoRoot,
})
const electronExecutablePaths = [
  sourceElectronExecutablePath,
  ...(macDevElectronExecutablePath ? [macDevElectronExecutablePath] : []),
]

killStaleDesktopDevProcesses()

if (backendReloadSignalPath) writeFileSync(backendReloadSignalPath, "0\n")
if (backendReloadAcknowledgementPath) {
  writeFileSync(backendReloadAcknowledgementPath, "0\n")
}

const child = spawn(DEV_COMMAND, DEV_ARGUMENTS, {
  stdio: "inherit",
  detached: SHOULD_DETACH_CHILD,
  shell: process.platform === "win32",
  env: {
    ...process.env,
    PATH: resolveShellPath(),
    [BUDDY_DEV_INSTANCE_NAME_ENV]: devInstanceName,
    ...(macDevElectronExecutablePath
      ? { [ELECTRON_EXECUTABLE_PATH_ENV]: macDevElectronExecutablePath }
      : {}),
    ...(backendReloadSignalPath
      ? { [BACKEND_DEVELOPMENT_RELOAD_SIGNAL_ENV]: backendReloadSignalPath }
      : {}),
    ...(backendReloadAcknowledgementPath
      ? {
          [BACKEND_DEVELOPMENT_RELOAD_ACKNOWLEDGEMENT_ENV]: backendReloadAcknowledgementPath,
        }
      : {}),
  },
})

if (backendDevelopmentReloadEnabled) {
  startBackendReloadAcknowledgementWatcher()
  void startBackendDevelopmentWatcher()
}

function killProcessTree(target: ReturnType<typeof spawn> | undefined, signal: NodeJS.Signals) {
  if (!target?.pid) return
  if (SHOULD_DETACH_CHILD) {
    try {
      process.kill(-target.pid, signal)
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
          if (events.length > 0) scheduleBackendRebuild()
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

function scheduleBackendRebuild() {
  if (shuttingDown) return
  if (backendBuildChild || backendReloadPending) {
    backendRebuildQueued = true
    return
  }
  if (backendRebuildTimer) clearTimeout(backendRebuildTimer)
  backendRebuildTimer = setTimeout(() => {
    backendRebuildTimer = undefined
    void rebuildDevelopmentBackend()
  }, BACKEND_REBUILD_DEBOUNCE_MS)
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
      if (backendRebuildQueued) scheduleBackendRebuild()
    },
  })
}

function waitForChild(child: ReturnType<typeof spawn>): Promise<number | null> {
  return new Promise((resolve, reject) => {
    child.once("error", reject)
    child.once("exit", resolve)
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

async function rebuildDevelopmentBackend() {
  if (shuttingDown || backendBuildChild) return
  backendRebuildQueued = false
  const startedAt = performance.now()
  console.log("\nBackend source changed; rebuilding Buddy Node backend...")

  const build = spawn("bun", ["run", "--cwd", backendDir, "build:node"], {
    cwd: repoRoot,
    detached: SHOULD_DETACH_CHILD,
    env: {
      ...process.env,
      [BUDDY_CHANNEL_ENV]: desktopChannel,
    },
    stdio: "inherit",
  })
  backendBuildChild = build

  try {
    const [buildOutcome, sdkOutcome] = await Promise.allSettled([
      waitForChild(build),
      refreshGeneratedSdkForDevelopment(),
    ])
    const backendBuildSucceeded = buildOutcome.status === "fulfilled" && buildOutcome.value === 0
    const sdkRefreshSucceeded = sdkOutcome.status === "fulfilled"

    if (!backendBuildSucceeded) {
      const detail =
        buildOutcome.status === "rejected"
          ? String(buildOutcome.reason)
          : `exit code ${buildOutcome.value ?? "unknown"}`
      console.error(`Backend rebuild failed with ${detail}; keeping the current app running.`)
    }
    if (!sdkRefreshSucceeded) {
      console.error("Buddy SDK refresh failed; keeping the current app running.", sdkOutcome.reason)
    }
    if (shuttingDown) return

    const completion = resolveBackendDevelopmentRebuildCompletion({
      backendBuildSucceeded,
      sdkRefreshSucceeded,
      rebuildQueued: backendRebuildQueued,
    })
    if (completion === "reload" && backendReloadSignalPath) {
      backendReloadGeneration += 1
      backendReloadPending = true
      try {
        writeFileSync(backendReloadSignalPath, `${backendReloadGeneration}\n`)
      } catch (error) {
        backendReloadPending = false
        throw error
      }
      console.log(
        `Backend rebuilt in ${Math.round(performance.now() - startedAt)}ms; reloading the backend utility...`,
      )
    }
  } catch (error) {
    console.error("Backend rebuild failed; keeping the current app running.", error)
  } finally {
    if (backendBuildChild === build) backendBuildChild = undefined
    if (backendRebuildQueued) scheduleBackendRebuild()
  }
}

function closeBackendDevelopmentWatcher() {
  if (backendRebuildTimer) {
    clearTimeout(backendRebuildTimer)
    backendRebuildTimer = undefined
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
  killProcessTree(backendBuildChild, TERMINATION_SIGNAL)
  killProcessTree(sdkGenerationChild, TERMINATION_SIGNAL)

  setTimeout(() => {
    killProcessTree(child, FORCE_KILL_SIGNAL)
    killProcessTree(backendBuildChild, FORCE_KILL_SIGNAL)
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

child.on("exit", (code) => {
  closeBackendDevelopmentWatcher()
  killProcessTree(backendBuildChild, TERMINATION_SIGNAL)
  killProcessTree(sdkGenerationChild, TERMINATION_SIGNAL)
  removeBackendDevelopmentFiles()
  process.exit(requestedExitCode ?? code ?? 0)
})

child.on("error", () => {
  closeBackendDevelopmentWatcher()
  killProcessTree(backendBuildChild, TERMINATION_SIGNAL)
  killProcessTree(sdkGenerationChild, TERMINATION_SIGNAL)
  removeBackendDevelopmentFiles()
  process.exit(1)
})
