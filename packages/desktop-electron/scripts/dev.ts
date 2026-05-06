import { execFileSync, spawn, spawnSync } from "node:child_process"
import path from "node:path"
import treeKill from "tree-kill"

const DEV_COMMAND = "electron-vite"
const DEV_ARGUMENTS = ["dev"] as const
const LOGIN_SHELL_PATH_COMMAND = "printf '%s' \"$PATH\""
const FORCE_KILL_TIMEOUT_MS = 2_000
const PARENT_EXIT_TIMEOUT_MS = 4_000
const SHUTDOWN_SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP"] as const
const TERMINATION_SIGNAL: NodeJS.Signals = "SIGTERM"
const FORCE_KILL_SIGNAL: NodeJS.Signals = "SIGKILL"
const PROCESS_LIST_COLUMNS = "pid=,command=" as const
const SHOULD_DETACH_CHILD = process.platform !== "win32"

let shuttingDown = false
let requestedExitCode: number | undefined

const packageRoot = path.resolve(import.meta.dir, "..")
const repoRoot = path.resolve(packageRoot, "..", "..")
const electronViteBinPath = path.resolve(packageRoot, "node_modules/.bin/electron-vite")
const electronBinaryPathFragment = path.join(repoRoot, "node_modules/.bun/electron@")

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
      const matchesBuddyElectron =
        command.includes(electronBinaryPathFragment) &&
        command.includes("/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron")

      if (!matchesElectronVite && !matchesBuddyElectron) continue

      const isFromCurrentWorktree = command.includes(repoRoot)
      if (!isFromCurrentWorktree) continue

      treeKill(pid, FORCE_KILL_SIGNAL, () => undefined)
    }
  } catch {
    // noop
  }
}

killStaleDesktopDevProcesses()

const child = spawn(DEV_COMMAND, DEV_ARGUMENTS, {
  stdio: "inherit",
  detached: SHOULD_DETACH_CHILD,
  shell: process.platform === "win32",
  env: {
    ...process.env,
    PATH: resolveShellPath(),
  },
})

function killProcessTree(signal: NodeJS.Signals) {
  if (!child.pid) return

  if (SHOULD_DETACH_CHILD) {
    try {
      process.kill(-child.pid, signal)
    } catch {
      // noop
    }
  }

  treeKill(child.pid, signal, () => undefined)
}

function shutdown() {
  if (shuttingDown) return
  shuttingDown = true

  killProcessTree(TERMINATION_SIGNAL)

  setTimeout(() => {
    killProcessTree(FORCE_KILL_SIGNAL)
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
  process.exit(requestedExitCode ?? code ?? 0)
})

child.on("error", () => {
  process.exit(1)
})
