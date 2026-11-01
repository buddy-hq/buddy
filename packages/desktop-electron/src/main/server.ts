import { Buffer } from "node:buffer"
import { spawn } from "node:child_process"
import type { ChildProcess } from "node:child_process"
import type { EventEmitter } from "node:events"
import { join } from "node:path"
import readline from "node:readline"
import { app } from "electron"
import treeKill from "tree-kill"
import {
  API_HEALTH_PATH,
  API_VENDOR_HEALTH_PATH,
  BACKEND_HEALTH_TIMEOUT_MS,
  BACKEND_SERVER_USERNAME,
  DEFAULT_SERVER_URL_KEY,
  WSL_ENABLED_KEY,
} from "./constants"
import { store } from "./store"
import { parseTBoolean, parseTString } from "../shared/parse-external"

export type WslConfig = {
  enabled: boolean
}

export type HealthCheck = {
  wait: Promise<void>
}

export type CommandChild = {
  pid: number | undefined
  kill: () => Promise<TerminatedPayload>
}

export type TerminatedPayload = {
  code: number | null
  signal: NodeJS.Signals | null
}

const BACKEND_STOP_TIMEOUT_MS = 6_000
const BACKEND_FORCE_KILL_TIMEOUT_MS = 2_000
const BACKEND_TERMINATION_SIGNAL: NodeJS.Signals = "SIGTERM"
const BACKEND_FORCE_KILL_SIGNAL: NodeJS.Signals = "SIGKILL"

export function getDefaultServerUrl(): string | null {
  return parseTString(store.get(DEFAULT_SERVER_URL_KEY)) ?? null
}

export function setDefaultServerUrl(url: string | null) {
  if (url) {
    store.set(DEFAULT_SERVER_URL_KEY, url)
    return
  }

  store.delete(DEFAULT_SERVER_URL_KEY)
}

export function getWslConfig(): WslConfig {
  return { enabled: parseTBoolean(store.get(WSL_ENABLED_KEY)) ?? false }
}

export function setWslConfig(config: WslConfig) {
  store.set(WSL_ENABLED_KEY, config.enabled)
}

export async function spawnLocalServer(
  hostname: string,
  port: number,
  password: string,
  environment: Readonly<Record<string, string>>,
  events: EventEmitter,
) {
  const backendRoot = join(app.getAppPath(), "..", "buddy")
  const command = app.isPackaged
    ? join(
        process.resourcesPath,
        process.platform === "win32" ? "buddy-backend.exe" : "buddy-backend",
      )
    : "bun"
  const serverArgs = ["serve", "--hostname", hostname, "--port", String(port)]
  const args = app.isPackaged
    ? serverArgs
    : [
        "run",
        "--preload",
        join(backendRoot, "src/dev/opencode-branding-preload.ts"),
        join(backendRoot, "src/index.ts"),
        ...serverArgs,
      ]
  const child = spawn(command, args, {
    cwd: app.isPackaged ? process.cwd() : backendRoot,
    env: createBackendEnv(environment),
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  })

  let closed = false
  let killRequested = false
  let startupError: Error | undefined
  let stopping: NodeJS.Timeout | undefined
  const exit = new Promise<TerminatedPayload>((resolve) => {
    child.once("close", (code, signal) => {
      closed = true
      if (stopping) {
        clearTimeout(stopping)
        stopping = undefined
      }
      const payload = { code, signal } satisfies TerminatedPayload
      events.emit("terminated", payload)
      resolve(payload)
    })
  })
  child.on("error", (error) => {
    startupError = error
    events.emit("error", String(error))
  })

  if (child.stdout) {
    readline.createInterface({ input: child.stdout }).on("line", (line) => {
      events.emit("stdout", `${line}\n`)
    })
  }

  if (child.stderr) {
    readline.createInterface({ input: child.stderr }).on("line", (line) => {
      events.emit("stderr", `${line}\n`)
    })
  }

  const killBackendProcessTree = (signal: NodeJS.Signals) => {
    if (closed) return
    const reportFailure = (error?: Error) => {
      if (error && !closed) events.emit("error", `Failed to stop backend: ${error.message}`)
    }
    if (child.pid) {
      treeKill(child.pid, signal, reportFailure)
    } else {
      child.kill(signal)
    }
  }

  const terminateBackendProcessTree = () => {
    if (closed) return
    killBackendProcessTree(BACKEND_TERMINATION_SIGNAL)
    stopping = setTimeout(() => {
      stopping = undefined
      killBackendProcessTree(BACKEND_FORCE_KILL_SIGNAL)
    }, BACKEND_FORCE_KILL_TIMEOUT_MS)
  }

  const wrappedChild: CommandChild = {
    pid: child.pid,
    kill: () => {
      if (closed || killRequested) return exit
      killRequested = true

      if (process.platform === "win32") {
        terminateBackendProcessTree()
      } else if (signalBackend(child, events)) {
        stopping = setTimeout(() => {
          stopping = undefined
          terminateBackendProcessTree()
        }, BACKEND_STOP_TIMEOUT_MS)
      } else {
        terminateBackendProcessTree()
      }

      return exit
    },
  }

  const wait = (async () => {
    const targetUrl = `http://${hostname}:${port}`
    let checking = true
    let healthTimeout: NodeJS.Timeout | undefined

    const ready = async () => {
      while (true) {
        await delay(100)
        if (!checking) return
        const healthy = await checkHealth(targetUrl, BACKEND_SERVER_USERNAME, password)
        if (healthy) {
          return
        }
      }
    }

    const terminated = async () => {
      const result = await exit
      throw new Error(
        `Backend terminated before health check passed (command=${command} code=${result.code ?? "unknown"} signal=${result.signal ?? "unknown"})${startupError ? `: ${startupError.message}` : ""}`,
      )
    }

    try {
      await Promise.race([
        ready(),
        terminated(),
        new Promise<never>((_resolve, reject) => {
          healthTimeout = setTimeout(() => {
            reject(new Error("Backend health check timed out"))
          }, BACKEND_HEALTH_TIMEOUT_MS)
        }),
      ])
    } finally {
      checking = false
      if (healthTimeout) clearTimeout(healthTimeout)
    }
  })()

  return {
    child: wrappedChild,
    events,
    health: { wait } satisfies HealthCheck,
  }
}

export async function checkHealth(url: string, username: string, password: string) {
  const headerValue = Buffer.from(`${username}:${password}`).toString("base64")

  for (const pathname of [API_HEALTH_PATH, API_VENDOR_HEALTH_PATH]) {
    let targetUrl: URL
    try {
      targetUrl = new URL(pathname, url)
    } catch {
      return false
    }

    try {
      const response = await fetch(targetUrl, {
        method: "GET",
        headers: {
          authorization: `Basic ${headerValue}`,
        },
        signal: AbortSignal.timeout(3_000),
      })
      if (!response.ok) {
        return false
      }
    } catch {
      return false
    }
  }

  return true
}

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function signalBackend(child: ChildProcess, events: EventEmitter): boolean {
  try {
    return child.kill(BACKEND_TERMINATION_SIGNAL)
  } catch (error) {
    events.emit("error", `Failed to signal backend: ${String(error)}`)
    return false
  }
}

function createBackendEnv(env: Readonly<Record<string, string>>) {
  const next = { ...env }
  delete next.DEBUG
  if (process.platform === "linux") delete next.LD_PRELOAD
  return { ...next, BUDDY_EXIT_WITH_PARENT: "1" }
}
