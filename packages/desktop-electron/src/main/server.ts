import { Buffer } from "node:buffer"
import { EventEmitter } from "node:events"
import { dirname, join } from "node:path"
import readline from "node:readline"
import { fileURLToPath } from "node:url"
import { app, utilityProcess } from "electron"
import type { Details, Event } from "electron"
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
  signal: number | null
}

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: Error) => void
}

type UtilityMessage =
  | { type: "ready" }
  | { type: "stopped" }
  | { type: "error"; error: { message: string; stack?: string } }

type UtilityCommand = { type: "start"; hostname: string; port: number } | { type: "stop" }

const BACKEND_UTILITY_SERVICE_NAME = "Buddy backend"
const BACKEND_UTILITY_STOP_TIMEOUT_MS = 6_000
const BACKEND_UTILITY_FORCE_KILL_TIMEOUT_MS = 2_000
const BACKEND_UTILITY_TERMINATION_SIGNAL: NodeJS.Signals = "SIGTERM"
const BACKEND_UTILITY_FORCE_KILL_SIGNAL: NodeJS.Signals = "SIGKILL"

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
) {
  const utilityPath = join(dirname(fileURLToPath(import.meta.url)), "backend-utility.js")
  const events = new EventEmitter()
  const child = utilityProcess.fork(utilityPath, [], {
    cwd: process.cwd(),
    env: createUtilityEnv(environment),
    serviceName: BACKEND_UTILITY_SERVICE_NAME,
    stdio: "pipe",
  })

  let exited = false
  let stopping: NodeJS.Timeout | undefined
  const exit = defer<TerminatedPayload>()

  const onProcessGone = (_event: Event, details: Details) => {
    if (details.type !== "Utility" || details.name !== BACKEND_UTILITY_SERVICE_NAME) return
    events.emit(
      "stderr",
      `utility process gone reason=${details.reason} exitCode=${details.exitCode}\n`,
    )
  }

  app.on("child-process-gone", onProcessGone)

  child.once("exit", (code) => {
    exited = true
    if (stopping) {
      clearTimeout(stopping)
      stopping = undefined
    }
    app.off("child-process-gone", onProcessGone)
    const payload = { code: code ?? null, signal: null } satisfies TerminatedPayload
    events.emit("terminated", payload)
    exit.resolve(payload)
  })
  child.on("error", (error) => {
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

  await waitForUtilityReady({
    child,
    exit,
    hostname,
    port,
    utilityPath,
  }).catch((error) => {
    if (!exited) killUtilityProcessTree(child, BACKEND_UTILITY_FORCE_KILL_SIGNAL)
    throw error
  })

  let killRequested = false
  const wrappedChild: CommandChild = {
    pid: child.pid,
    kill: () => {
      if (exited || killRequested) return exit.promise
      killRequested = true

      try {
        postUtilityCommand(child, { type: "stop" })
        stopping = setTimeout(() => {
          stopping = undefined
          terminateUtilityProcessTree()
        }, BACKEND_UTILITY_STOP_TIMEOUT_MS)
      } catch {
        terminateUtilityProcessTree()
      }

      return exit.promise
    },
  }

  const terminateUtilityProcessTree = () => {
    if (exited) return
    killUtilityProcessTree(child, BACKEND_UTILITY_TERMINATION_SIGNAL)
    stopping = setTimeout(() => {
      stopping = undefined
      if (!exited) killUtilityProcessTree(child, BACKEND_UTILITY_FORCE_KILL_SIGNAL)
    }, BACKEND_UTILITY_FORCE_KILL_TIMEOUT_MS)
  }

  const wait = (async () => {
    const targetUrl = `http://${hostname}:${port}`

    const ready = async () => {
      while (true) {
        await delay(100)
        const healthy = await checkHealth(targetUrl, BACKEND_SERVER_USERNAME, password)
        if (healthy) {
          return
        }
      }
    }

    const terminated = async () => {
      const result = await exit.promise
      throw new Error(
        `Backend utility terminated before health check passed (code=${result.code ?? "unknown"} signal=${result.signal ?? "unknown"})`,
      )
    }

    await Promise.race([
      ready(),
      terminated(),
      delay(BACKEND_HEALTH_TIMEOUT_MS).then(() => {
        throw new Error("Backend health check timed out")
      }),
    ])
  })()

  return {
    child: wrappedChild,
    events,
    health: { wait } satisfies HealthCheck,
  }
}

async function waitForUtilityReady(input: {
  child: Electron.UtilityProcess
  exit: Deferred<TerminatedPayload>
  hostname: string
  port: number
  utilityPath: string
}) {
  await new Promise<void>((resolve, reject) => {
    let done = false
    let timeout: NodeJS.Timeout
    let exitHandled = false

    const fail = (error: Error) => {
      if (done) return
      done = true
      cleanup()
      reject(error)
    }

    const onMessage = (message: UtilityMessage) => {
      if (message.type === "ready") {
        if (done) return
        done = true
        cleanup()
        resolve()
        return
      }
      if (message.type === "error") {
        fail(Object.assign(new Error(message.error.message), { stack: message.error.stack }))
      }
    }

    const onExit = (payload: TerminatedPayload) => {
      fail(new Error(`Backend utility exited before ready with code ${payload.code ?? "unknown"}`))
    }

    const cleanup = () => {
      clearTimeout(timeout)
      input.child.off("message", onMessage)
    }

    input.child.on("message", onMessage)
    input.exit.promise
      .then((payload) => {
        if (exitHandled) return
        exitHandled = true
        onExit(payload)
      })
      .catch((error) => {
        fail(error instanceof Error ? error : new Error(String(error)))
      })
    timeout = setTimeout(() => {
      fail(
        new Error(
          `Backend utility did not become ready within ${BACKEND_HEALTH_TIMEOUT_MS}ms: ${input.utilityPath}`,
        ),
      )
    }, BACKEND_HEALTH_TIMEOUT_MS)
    postUtilityCommand(input.child, {
      type: "start",
      hostname: input.hostname,
      port: input.port,
    })
  })
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

function defer<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function postUtilityCommand(child: Electron.UtilityProcess, command: UtilityCommand) {
  // oxlint-disable-next-line unicorn/require-post-message-target-origin -- Electron utility process messages do not accept a targetOrigin.
  child.postMessage(command)
}

function killUtilityProcessTree(child: Electron.UtilityProcess, signal: NodeJS.Signals) {
  const pid = child.pid
  if (!pid) {
    child.kill()
    return
  }

  treeKill(pid, signal, () => undefined)
}

function createUtilityEnv(env: Readonly<Record<string, string>>) {
  const next = { ...env }
  delete next.DEBUG
  if (process.platform === "linux") delete next.LD_PRELOAD
  return next
}
