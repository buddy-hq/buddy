import { Buffer } from "node:buffer"
import * as http from "node:http"
import * as tls from "node:tls"
import { existsSync } from "node:fs"
import { pathToFileURL } from "node:url"

const BACKEND_NODE_ENTRY_ENV = "BUDDY_BACKEND_NODE_ENTRY"
const BACKEND_SERVER_PASSWORD_ENV = "BUDDY_SERVER_PASSWORD"
const BACKEND_SERVER_USERNAME_ENV = "BUDDY_SERVER_USERNAME"
const DEFAULT_BACKEND_SERVER_USERNAME = "buddy"
const GLOBAL_DISPOSE_PATH = "/api/global/dispose" as const
const RUNTIME_DISPOSE_TIMEOUT_MS = 3_000

type NodeHttpWithEnvProxy = typeof http & {
  setGlobalProxyFromEnv: () => void
}

type NodeTlsWithSystemCertificates = typeof tls & {
  getCACertificates: (type: "default" | "system") => string[]
  setDefaultCACertificates: (certificates: string[]) => void
}

type StartCommand = {
  type: "start"
  hostname: string
  port: number
}

type StopCommand = {
  type: "stop"
}

type UtilityCommand = StartCommand | StopCommand

type UtilityMessage =
  | { type: "ready" }
  | { type: "stopped" }
  | { type: "error"; error: { message: string; stack?: string } }

type ParentPort = {
  postMessage(message: UtilityMessage): void
  on(event: "message", listener: (event: { data: unknown }) => void): void
}

type Listener = {
  stop: (close?: boolean) => Promise<void>
}

type BackendModule = {
  listen: (config: { hostname: string; port: number }) => Listener | Promise<Listener>
}

type ActiveServer = {
  hostname: string
  password: string | undefined
  port: number
  username: string
}

const parentPort = getParentPort()
let listener: Listener | undefined
let activeServer: ActiveServer | undefined
let backendModuleTask: Promise<BackendModule> | undefined

parentPort.on("message", (event) => {
  const command = parseCommand(event.data)
  if (!command) return
  if (command.type === "stop") {
    void stop()
    return
  }
  void start(command)
})

async function start(command: StartCommand) {
  try {
    if (listener) {
      postParentMessage({ type: "ready" })
      return
    }

    ensureLoopbackNoProxy()
    useSystemCertificates()
    useEnvProxy()

    const backendModule = await loadBackendModule()
    listener = await backendModule.listen({
      hostname: command.hostname,
      port: command.port,
    })
    activeServer = {
      hostname: command.hostname,
      password: process.env[BACKEND_SERVER_PASSWORD_ENV],
      port: command.port,
      username: process.env[BACKEND_SERVER_USERNAME_ENV] ?? DEFAULT_BACKEND_SERVER_USERNAME,
    }
    postParentMessage({ type: "ready" })
  } catch (error) {
    postParentMessage({ type: "error", error: serializeError(error) })
    setImmediate(() => process.exit(1))
  }
}

async function stop() {
  try {
    await disposeActiveServer()
    await listener?.stop(true)
  } finally {
    activeServer = undefined
    listener = undefined
    postParentMessage({ type: "stopped" })
    setImmediate(() => process.exit(0))
  }
}

async function disposeActiveServer(): Promise<void> {
  if (!activeServer?.password) return

  const authorization = Buffer.from(`${activeServer.username}:${activeServer.password}`).toString(
    "base64",
  )
  try {
    await fetch(new URL(GLOBAL_DISPOSE_PATH, serverBaseUrl(activeServer)), {
      method: "POST",
      headers: {
        authorization: `Basic ${authorization}`,
      },
      signal: AbortSignal.timeout(RUNTIME_DISPOSE_TIMEOUT_MS),
    })
  } catch (error) {
    console.warn("failed to dispose Buddy backend runtime before shutdown", error)
  }
}

function serverBaseUrl(server: ActiveServer): string {
  const hostname = server.hostname.includes(":") ? `[${server.hostname}]` : server.hostname
  return `http://${hostname}:${server.port}`
}

async function loadBackendModule(): Promise<BackendModule> {
  backendModuleTask ??= (async () => {
    const entry = resolveBackendNodeEntry()
    await assertNodeSqliteAvailable()
    const loaded: unknown = await import(pathToFileURL(entry).href)
    if (!isBackendModule(loaded)) {
      throw new Error(`Buddy Node backend artifact does not export listen(): ${entry}`)
    }
    return loaded
  })()

  return backendModuleTask
}

function resolveBackendNodeEntry() {
  const entry = process.env[BACKEND_NODE_ENTRY_ENV]?.trim()
  if (!entry) {
    throw new Error(`${BACKEND_NODE_ENTRY_ENV} is not configured for the backend utility process`)
  }
  if (!existsSync(entry)) {
    throw new Error(`Buddy Node backend artifact not found at ${entry}`)
  }
  return entry
}

async function assertNodeSqliteAvailable() {
  try {
    const sqliteModule: unknown = await import("node:sqlite")
    if (isRecord(sqliteModule) && typeof sqliteModule.DatabaseSync === "function") return
    throw new Error("node:sqlite loaded without DatabaseSync")
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Buddy Node backend requires Electron's utility Node runtime to provide node:sqlite: ${detail}`,
      { cause: error },
    )
  }
}

function ensureLoopbackNoProxy() {
  const loopbackHosts = ["127.0.0.1", "localhost", "::1"]
  const upsert = (key: string) => {
    const values = (process.env[key] ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0)

    for (const host of loopbackHosts) {
      if (values.some((value) => value.toLowerCase() === host)) continue
      values.push(host)
    }

    process.env[key] = values.join(",")
  }

  upsert("NO_PROXY")
  upsert("no_proxy")
}

function useSystemCertificates() {
  try {
    const nodeTls = tls as NodeTlsWithSystemCertificates
    nodeTls.setDefaultCACertificates([
      ...new Set([
        ...nodeTls.getCACertificates("default"),
        ...nodeTls.getCACertificates("system"),
      ]),
    ])
  } catch (error) {
    console.warn("failed to load system certificates", error)
  }
}

function useEnvProxy() {
  try {
    ;(http as NodeHttpWithEnvProxy).setGlobalProxyFromEnv()
  } catch (error) {
    console.warn("failed to load proxy environment", error)
  }
}

function postParentMessage(message: UtilityMessage) {
  // oxlint-disable-next-line unicorn(require-post-message-target-origin): Electron utility process messages do not accept a targetOrigin.
  parentPort.postMessage(message)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isBackendModule(value: unknown): value is BackendModule {
  return isRecord(value) && typeof value.listen === "function"
}

function parseCommand(value: unknown): UtilityCommand | undefined {
  if (!isRecord(value)) return undefined
  if (value.type === "stop") return { type: "stop" }
  if (value.type !== "start") return undefined
  if (typeof value.hostname !== "string") return undefined
  if (typeof value.port !== "number") return undefined
  return {
    type: "start",
    hostname: value.hostname,
    port: value.port,
  }
}

function serializeError(error: unknown) {
  if (error instanceof Error) return { message: error.message, stack: error.stack }
  return { message: String(error) }
}

function getParentPort() {
  const port = process.parentPort as ParentPort | undefined
  if (!port) throw new Error("Backend utility parent port unavailable")
  return port
}
