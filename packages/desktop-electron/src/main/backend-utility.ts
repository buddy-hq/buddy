import * as http from "node:http"
import * as tls from "node:tls"
import { z } from "zod"

const UtilityCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("start"), hostname: z.string(), port: z.number() }),
  z.object({ type: z.literal("stop") }),
])
const FunctionSchema = z.function()

type UtilityCommand = z.infer<typeof UtilityCommandSchema>
type StartCommand = Extract<UtilityCommand, { type: "start" }>

type UtilityMessage =
  | { type: "ready" }
  | { type: "stopped" }
  | { type: "error"; error: { message: string; stack?: string } }

type Listener = {
  stop: (close?: boolean) => Promise<void>
}

type BackendModule = {
  listen: (config: { hostname: string; port: number }) => Listener | Promise<Listener>
}

const parentPort = getParentPort()
let listener: Listener | undefined
let backendModuleTask: Promise<BackendModule> | undefined
let stopping: Promise<void> | undefined

parentPort.on("message", (event) => {
  const parsedCommand = UtilityCommandSchema.safeParse(event.data)
  if (!parsedCommand.success) return
  const command = parsedCommand.data
  if (command.type === "stop") {
    void stop()
    return
  }
  void start(command)
})

process.on("SIGTERM", () => {
  void stop()
})

async function start(command: StartCommand) {
  if (stopping) return
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
    postParentMessage({ type: "ready" })
  } catch (error) {
    const serializedError =
      error instanceof Error ? serializeError(error) : { message: String(error) }
    postParentMessage({ type: "error", error: serializedError })
    setImmediate(() => process.exit(1))
  }
}

function stop(): Promise<void> {
  stopping ??= (async () => {
    let exitCode = 0
    try {
      await listener?.stop(true)
    } catch (error) {
      console.error("Failed to stop Buddy backend utility", error)
      exitCode = 1
    } finally {
      listener = undefined
      try {
        postParentMessage({ type: "stopped" })
      } catch (error) {
        console.warn("Failed to notify the parent that Buddy backend stopped", error)
      }
      setImmediate(() => process.exit(exitCode))
    }
  })()
  return stopping
}

async function loadBackendModule(): Promise<BackendModule> {
  backendModuleTask ??= (async () => {
    await assertNodeSqliteAvailable()
    const loaded = await import("virtual:buddy-server")
    if (!FunctionSchema.safeParse(loaded.listen).success) {
      throw new Error("Buddy Node backend artifact does not export listen()")
    }
    return loaded
  })()

  return backendModuleTask
}

async function assertNodeSqliteAvailable() {
  try {
    const sqliteModule = await import("node:sqlite")
    if (FunctionSchema.safeParse(sqliteModule.DatabaseSync).success) return
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
    tls.setDefaultCACertificates([
      ...new Set([...tls.getCACertificates("default"), ...tls.getCACertificates("system")]),
    ])
  } catch (error) {
    console.warn("failed to load system certificates", error)
  }
}

function useEnvProxy() {
  try {
    http.setGlobalProxyFromEnv()
  } catch (error) {
    console.warn("failed to load proxy environment", error)
  }
}

function postParentMessage(message: UtilityMessage) {
  // oxlint-disable-next-line unicorn/require-post-message-target-origin -- Electron utility process messages do not accept a targetOrigin.
  parentPort.postMessage(message)
}

function serializeError(error: Error) {
  return { message: error.message, stack: error.stack }
}

function getParentPort() {
  const port = process.parentPort
  if (!port) throw new Error("Backend utility parent port unavailable")
  return port
}
