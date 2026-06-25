import { realpathSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { app } from "./app"
import { listenNodeServer } from "./node-server"

const OPTION_PRINT_LOGS = "--print-logs"
const OPTION_LOG_LEVEL = "--log-level"
const OPTION_PORT = "--port"
const OPTION_HOSTNAME = "--hostname"
const COMMAND_SERVE = "serve"
const DEFAULT_SERVER_PORT = 3000
const DEFAULT_SERVER_HOSTNAME = "127.0.0.1"
const SERVER_PORT_ENV = "PORT"

export type ServerBootstrapConfig = {
  hostname: string
  port: number
}

export type NodeServerListener = ReturnType<typeof listenNodeServer>

let activeListener: NodeServerListener | undefined
let signalHandlersInstalled = false

function readPortFromEnv() {
  const value = process.env[SERVER_PORT_ENV]
  if (!value) return DEFAULT_SERVER_PORT
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) return DEFAULT_SERVER_PORT
  return parsed
}

function parseServeCommand(args: string[]): ServerBootstrapConfig {
  let hostname = DEFAULT_SERVER_HOSTNAME
  let port = readPortFromEnv()

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (!arg) continue

    if (arg === OPTION_HOSTNAME) {
      const next = args[index + 1]
      if (!next) continue
      hostname = next
      index += 1
      continue
    }

    if (arg === OPTION_PORT) {
      const next = args[index + 1]
      if (!next) continue
      const parsed = Number.parseInt(next, 10)
      if (Number.isFinite(parsed)) {
        port = parsed
      }
      index += 1
      continue
    }
  }

  return { hostname, port }
}

export function parseServerBootstrapConfig(argv: string[]): ServerBootstrapConfig {
  const args = [...argv]

  while (args.length > 0 && args[0]?.startsWith("-")) {
    const option = args.shift()
    if (!option) break

    if (option === OPTION_PRINT_LOGS) continue
    if (option === OPTION_LOG_LEVEL) {
      args.shift()
      continue
    }

    args.unshift(option)
    break
  }

  return parseServeCommand(args[0] === COMMAND_SERVE ? args.slice(1) : args)
}

export function listen(config: ServerBootstrapConfig): NodeServerListener {
  return listenNodeServer(config)
}

export function startServerFromArgv(argv: string[]): NodeServerListener {
  return listen(parseServerBootstrapConfig(argv))
}

export function startEntrypointServer(argv: string[]): NodeServerListener {
  activeListener = startServerFromArgv(argv)
  installSignalHandlers()
  return activeListener
}

export function isEntrypoint(moduleUrl: string, entrypoint = process.argv[1]) {
  return (
    !!entrypoint &&
    resolveEntrypointPath(entrypoint) === resolveEntrypointPath(fileURLToPath(moduleUrl))
  )
}

export function isMainModule(entrypoint = process.argv[1]) {
  return isEntrypoint(import.meta.url, entrypoint)
}

async function stopActiveListener(exitCode: number) {
  try {
    await activeListener?.stop(true)
    process.exit(exitCode)
  } catch (error) {
    console.error("Failed to stop Buddy Node backend", error)
    process.exit(1)
  }
}

function installSignalHandlers() {
  if (signalHandlersInstalled) return
  signalHandlersInstalled = true
  process.once("SIGINT", () => {
    void stopActiveListener(0)
  })
  process.once("SIGTERM", () => {
    void stopActiveListener(0)
  })
}

if (isEntrypoint(import.meta.url)) {
  startEntrypointServer(process.argv.slice(2))
}

export { app }
export { runNodeArtifactResourcePackSmoke } from "./node-artifact-smoke"

function resolveEntrypointPath(value: string) {
  const resolved = path.resolve(value)
  try {
    return realpathSync(resolved)
  } catch {
    return resolved
  }
}
