#!/usr/bin/env bun

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  DEFAULT_STARTUP_TIMEOUT_MS,
  HEALTHZ_PATH,
  HEALTH_PATH,
  HOSTNAME,
  PASSWORD,
  USERNAME,
  allocatePort,
  readStream,
  tail,
} from "../../buddy/script/node-artifact-runtime"
import { syncDesktopRuntimeResources } from "./utils"

const BACKEND_UTILITY_SCRIPT = "backend-utility.js" as const
const ELECTRON_BIN_PATH_SEGMENTS = ["node_modules", ".bin", "electron"] as const
const NODE_PATH_ENV_KEY = "NODE_PATH" as const
const SMOKE_MAIN_FILENAME = "backend-utility-smoke.mjs" as const
const SMOKE_ROOT_PREFIX = "buddy-backend-utility-smoke-" as const
const UTILITY_PATH_ENV = "BUDDY_BACKEND_UTILITY_SMOKE_PATH" as const
const SMOKE_EXIT_TIMEOUT_MS = 45_000

const packageDir = path.resolve(import.meta.dir, "..")
const utilityPath = path.resolve(packageDir, "out", "main", BACKEND_UTILITY_SCRIPT)
const electronBin = resolveElectronBin()

function resolveElectronBin(): string {
  const basePath = path.resolve(packageDir, ...ELECTRON_BIN_PATH_SEGMENTS)
  if (process.platform !== "win32") return basePath
  const commandPath = `${basePath}.cmd`
  return existsSync(commandPath) ? commandPath : basePath
}

function baseEnvironment(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] =>
        entry[0] !== NODE_PATH_ENV_KEY && typeof entry[1] === "string",
    ),
  )
}

function createBackendEnvironment(input: {
  backendNodeEntry: string
  backendResources: string
  migrations: string
  port: number
  runtimeRoot: string
}): Record<string, string> {
  const xdgRoot = path.join(input.runtimeRoot, "xdg")
  const notebookRoot = path.join(input.runtimeRoot, "notebook")
  mkdirSync(notebookRoot, { recursive: true })
  mkdirSync(xdgRoot, { recursive: true })

  return {
    ...baseEnvironment(),
    BUDDY_ALLOWED_DIRECTORY_ROOTS: [notebookRoot, xdgRoot].join(","),
    BUDDY_APP_VERSION: "backend-utility-smoke",
    BUDDY_BACKEND_NODE_ENTRY: input.backendNodeEntry,
    BUDDY_BACKEND_RESOURCES_DIR: input.backendResources,
    BUDDY_DIRECTORY_BASE: notebookRoot,
    BUDDY_MIGRATION_DIR: path.join(input.migrations, "buddy"),
    BUDDY_RUNTIME_ROOT: xdgRoot,
    BUDDY_SERVER_PASSWORD: PASSWORD,
    BUDDY_SERVER_USERNAME: USERNAME,
    OPENCODE_CLIENT: "desktop",
    OPENCODE_DISABLE_CHANNEL_DB: "1",
    OPENCODE_DISABLE_DEFAULT_PLUGINS: "1",
    OPENCODE_DISABLE_EXTERNAL_SKILLS: "1",
    OPENCODE_DISABLE_MODELS_FETCH: "1",
    OPENCODE_EXPERIMENTAL_FILEWATCHER: "true",
    OPENCODE_EXPERIMENTAL_ICON_DISCOVERY: "true",
    OPENCODE_SERVER_PASSWORD: PASSWORD,
    OPENCODE_SERVER_USERNAME: USERNAME,
    PORT: String(input.port),
    XDG_CACHE_HOME: path.join(xdgRoot, "cache"),
    XDG_CONFIG_HOME: path.join(xdgRoot, "config"),
    XDG_DATA_HOME: path.join(xdgRoot, "data"),
    XDG_STATE_HOME: path.join(xdgRoot, "state"),
  }
}

function createElectronMainScript(smokeRoot: string): string {
  const scriptPath = path.join(smokeRoot, SMOKE_MAIN_FILENAME)
  writeFileSync(scriptPath, electronMainSource(), "utf8")
  return scriptPath
}

function electronCommand(mainScript: string): string[] {
  if (process.platform !== "win32") return [electronBin, mainScript]
  return ["cmd.exe", "/d", "/s", "/c", `"${electronBin}" "${mainScript}"`]
}

function electronMainSource(): string {
  return `
import { Buffer } from "node:buffer"
import { writeFile } from "node:fs/promises"
import path from "node:path"
import readline from "node:readline"
import { app, utilityProcess } from "electron"

const HOSTNAME = ${JSON.stringify(HOSTNAME)}
const USERNAME = ${JSON.stringify(USERNAME)}
const PASSWORD = ${JSON.stringify(PASSWORD)}
const HEALTHZ_PATH = ${JSON.stringify(HEALTHZ_PATH)}
const HEALTH_PATH = ${JSON.stringify(HEALTH_PATH)}
const DIRECTORY_HEADER = "x-buddy-directory"
const JSON_CONTENT_TYPE = "application/json"
const RESOURCE_READY_STATUS = "ready"
const RESOURCE_ROUTE_PATH = "/api/objects/resource"
const RESOURCE_ROUTE_SMOKE_ALIAS = "backend-utility-route-smoke"
const RESOURCE_ROUTE_SMOKE_FILENAME = "backend-utility-route-smoke.md"
const RESOURCE_ROUTE_SMOKE_TEXT = "# Backend Utility Route Smoke\\n\\nPackaged Electron utility route prep smoke.\\n"
const STARTUP_TIMEOUT_MS = ${String(DEFAULT_STARTUP_TIMEOUT_MS)}
const EXIT_TIMEOUT_MS = ${String(SMOKE_EXIT_TIMEOUT_MS)}
const UTILITY_SERVICE_NAME = "Buddy backend utility smoke"

function requiredEnv(name) {
  const value = process.env[name]
  if (!value) throw new Error(name + " is required")
  return value
}

function backendEnvironment() {
  const next = { ...process.env }
  delete next.DEBUG
  delete next.NODE_PATH
  if (process.platform === "linux") delete next.LD_PRELOAD
  return next
}

function authorizationHeader() {
  return "Basic " + Buffer.from(USERNAME + ":" + PASSWORD).toString("base64")
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForEndpoint(baseUrl, pathname) {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS
  let last = ""

  while (Date.now() < deadline) {
    try {
      const response = await fetch(new URL(pathname, baseUrl), {
        headers: { authorization: authorizationHeader() },
        signal: AbortSignal.timeout(1000),
      })
      last = await response.text()
      if (response.ok) return
    } catch (error) {
      last = error instanceof Error ? error.message : String(error)
    }
    await delay(250)
  }

  throw new Error(pathname + " did not become healthy: " + last)
}

async function smokeResourceRoute(baseUrl) {
  const directory = requiredEnv("BUDDY_DIRECTORY_BASE")
  await writeFile(path.join(directory, RESOURCE_ROUTE_SMOKE_FILENAME), RESOURCE_ROUTE_SMOKE_TEXT, "utf8")

  const createResponse = await fetch(new URL(RESOURCE_ROUTE_PATH, baseUrl), {
    method: "POST",
    headers: {
      authorization: authorizationHeader(),
      [DIRECTORY_HEADER]: directory,
      "content-type": JSON_CONTENT_TYPE,
    },
    body: JSON.stringify({
      alias: RESOURCE_ROUTE_SMOKE_ALIAS,
      sourcePath: RESOURCE_ROUTE_SMOKE_FILENAME,
    }),
  })
  if (!createResponse.ok) {
    throw new Error("Resource route create failed: " + String(createResponse.status) + " " + await createResponse.text())
  }

  const deadline = Date.now() + STARTUP_TIMEOUT_MS
  let last = ""
  while (Date.now() < deadline) {
    const listResponse = await fetch(new URL(RESOURCE_ROUTE_PATH, baseUrl), {
      headers: {
        authorization: authorizationHeader(),
        [DIRECTORY_HEADER]: directory,
      },
      signal: AbortSignal.timeout(1000),
    })
    last = await listResponse.text()
    if (listResponse.ok) {
      const body = JSON.parse(last)
      const resources = Array.isArray(body.resources) ? body.resources : []
      const resource = resources.find((entry) => entry?.alias === RESOURCE_ROUTE_SMOKE_ALIAS)
      if (
        resource?.status === RESOURCE_READY_STATUS &&
        typeof resource.packPath === "string" &&
        typeof resource.fullTextPath === "string"
      ) {
        return
      }
    }
    await delay(250)
  }

  throw new Error("Resource route smoke did not become ready: " + last)
}

async function main() {
  await app.whenReady()

  const utilityPath = requiredEnv(${JSON.stringify(UTILITY_PATH_ENV)})
  const port = Number.parseInt(requiredEnv("PORT"), 10)
  if (!Number.isFinite(port)) throw new Error("PORT must be numeric")

  const child = utilityProcess.fork(utilityPath, [], {
    cwd: process.cwd(),
    env: backendEnvironment(),
    serviceName: UTILITY_SERVICE_NAME,
    stdio: "pipe",
  })

  if (child.stdout) {
    readline.createInterface({ input: child.stdout }).on("line", (line) => {
      console.log("[backend-utility stdout] " + line)
    })
  }
  if (child.stderr) {
    readline.createInterface({ input: child.stderr }).on("line", (line) => {
      console.error("[backend-utility stderr] " + line)
    })
  }

  let readyComplete = false
  const exitedBeforeReady = new Promise((_, reject) => {
    child.once("exit", (code) => {
      if (!readyComplete) {
        reject(new Error("Backend utility exited early with code " + String(code)))
      }
    })
  })

  const ready = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Backend utility did not send ready"))
    }, STARTUP_TIMEOUT_MS)

    child.on("message", (message) => {
      if (message?.type === "ready") {
        clearTimeout(timeout)
        resolve()
      }
      if (message?.type === "error") {
        clearTimeout(timeout)
        reject(new Error(message.error?.message ?? "Backend utility error"))
      }
    })
  })

  child.postMessage({ type: "start", hostname: HOSTNAME, port })
  await Promise.race([ready, exitedBeforeReady])
  readyComplete = true

  const baseUrl = "http://" + HOSTNAME + ":" + String(port)
  await waitForEndpoint(baseUrl, HEALTHZ_PATH)
  await waitForEndpoint(baseUrl, HEALTH_PATH)
  await smokeResourceRoute(baseUrl)

  const stopped = new Promise((resolve) => {
    child.on("message", (message) => {
      if (message?.type === "stopped") resolve()
    })
    child.once("exit", () => resolve())
  })
  child.postMessage({ type: "stop" })
  await Promise.race([
    stopped,
    delay(EXIT_TIMEOUT_MS).then(() => {
      throw new Error("Backend utility did not stop cleanly")
    }),
  ])
}

main()
  .then(() => app.exit(0))
  .catch((error) => {
    console.error(error)
    app.exit(1)
  })
`
}

if (!existsSync(utilityPath)) {
  throw new Error(`Backend utility build output missing at ${utilityPath}. Run desktop build first.`)
}
if (!existsSync(electronBin)) {
  throw new Error(`Electron binary missing at ${electronBin}. Run bun install first.`)
}

const resources = syncDesktopRuntimeResources()
const smokeRoot = mkdtempSync(path.join(os.tmpdir(), SMOKE_ROOT_PREFIX))
const runtimeRoot = path.join(smokeRoot, "runtime")
const port = await allocatePort()
const mainScript = createElectronMainScript(smokeRoot)

try {
  const child = Bun.spawn(electronCommand(mainScript), {
    cwd: packageDir,
    env: {
      ...createBackendEnvironment({
        backendNodeEntry: resources.backendNodeEntry,
        backendResources: resources.backendResources,
        migrations: resources.migrations,
        port,
        runtimeRoot,
      }),
      [UTILITY_PATH_ENV]: utilityPath,
    },
    stderr: "pipe",
    stdout: "pipe",
    windowsHide: true,
  })
  const [code, stdoutText, stderrText] = await Promise.all([
    child.exited,
    readStream(child.stdout),
    readStream(child.stderr),
  ])

  if (code !== 0) {
    throw new Error(
      `Electron backend utility smoke failed.\nstdout:\n${tail(stdoutText)}\nstderr:\n${tail(stderrText)}`,
    )
  }

  console.log("Electron backend utility smoke passed")
} finally {
  rmSync(smokeRoot, { recursive: true, force: true })
}
