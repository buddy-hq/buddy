#!/usr/bin/env bun

import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  DEFAULT_POLL_INTERVAL_MS,
  DEFAULT_STARTUP_TIMEOUT_MS,
  HEALTHZ_PATH,
  HOSTNAME,
  PASSWORD,
  USERNAME,
  allocatePort,
  assertNodeArtifactResourceRouteSmoke,
  delay,
  probe,
  readStream,
  tail,
} from "../../buddy/script/node-artifact-runtime"
import type { NodeArtifactProcess } from "../../buddy/script/node-artifact-runtime"
import {
  LITEPARSE_PACKAGE_NAME,
  currentBackendNodeArtifactTarget,
  liteParseNativePackageName,
  nodePtyNativePackageName,
  parcelWatcherNativePackageName,
  scanBuildOutput,
} from "../../../script/backend-node-artifact"
import { syncDesktopRuntimeResources } from "./utils"
import { resolveElectronBin } from "./electron-bin"

const BACKEND_UTILITY_SCRIPT = "backend-utility.js" as const
const ELECTRON_RUN_AS_NODE_ENV = "ELECTRON_RUN_AS_NODE" as const
const NODE_PATH_ENV_KEY = "NODE_PATH" as const
const SMOKE_READY_FILENAME = "backend-utility-ready.json" as const
const SMOKE_STOP_FILENAME = "backend-utility-stop.json" as const
const SMOKE_ROOT_PREFIX = "buddy-backend-utility-smoke-" as const
const SMOKE_EXIT_TIMEOUT_MS = 45_000
const UTILITY_CWD_ENV = "BUDDY_BACKEND_UTILITY_SMOKE_CWD" as const
const UTILITY_EXIT_TIMEOUT_ENV = "BUDDY_BACKEND_UTILITY_SMOKE_EXIT_TIMEOUT_MS" as const
const UTILITY_HOSTNAME_ENV = "BUDDY_BACKEND_UTILITY_SMOKE_HOSTNAME" as const
const UTILITY_PATH_ENV = "BUDDY_BACKEND_UTILITY_SMOKE_PATH" as const
const UTILITY_READY_ENV = "BUDDY_BACKEND_UTILITY_SMOKE_READY_PATH" as const
const UTILITY_STARTUP_TIMEOUT_ENV = "BUDDY_BACKEND_UTILITY_SMOKE_STARTUP_TIMEOUT_MS" as const
const UTILITY_STOP_ENV = "BUDDY_BACKEND_UTILITY_SMOKE_STOP_PATH" as const
const NATIVE_PACKAGE_PROBE_MAIN_DIR_ENV = "BUDDY_NATIVE_PACKAGE_PROBE_MAIN_DIR" as const
const NATIVE_PACKAGE_PROBE_PACKAGE_ENV = "BUDDY_NATIVE_PACKAGE_PROBE_PACKAGE" as const
const API_HEALTH_PATH = "/api/health" as const
const API_PROVIDER_PATH = "/api/provider" as const
const API_PROVIDER_AUTH_PATH = "/api/provider/auth" as const
const API_SESSION_PATH = "/api/session" as const
const JSON_CONTENT_TYPE = "application/json" as const

const packageDir = path.resolve(import.meta.dir, "..")
const smokeMainScript = path.resolve(import.meta.dir, "backend-utility-smoke-main.mjs")
const nativePackageProbeScript = path.resolve(import.meta.dir, "native-package-probe.mjs")
const mainOutputDir = path.resolve(packageDir, "out", "main")
const utilityPath = path.resolve(mainOutputDir, BACKEND_UTILITY_SCRIPT)
const electronBin = resolveElectronBin(packageDir)

function baseEnvironment(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] =>
        entry[0] !== NODE_PATH_ENV_KEY &&
        entry[0] !== ELECTRON_RUN_AS_NODE_ENV &&
        typeof entry[1] === "string",
    ),
  )
}

function authorizationHeader(): string {
  return `Basic ${Buffer.from(`${USERNAME}:${PASSWORD}`).toString("base64")}`
}

function createBackendEnvironment(input: {
  backendResources: string
  migrations: string
  port: number
  runtimeRoot: string
  tessdata: string
}): Record<string, string> {
  const xdgRoot = path.join(input.runtimeRoot, "xdg")
  const notebookRoot = path.join(input.runtimeRoot, "notebook")
  mkdirSync(notebookRoot, { recursive: true })
  mkdirSync(xdgRoot, { recursive: true })

  return {
    ...baseEnvironment(),
    BUDDY_ALLOWED_DIRECTORY_ROOTS: [notebookRoot, xdgRoot].join(","),
    BUDDY_APP_VERSION: "backend-utility-smoke",
    BUDDY_BACKEND_RESOURCES_DIR: input.backendResources,
    BUDDY_TESSDATA_DIR: input.tessdata,
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

function createIsolatedMainOutput(smokeRoot: string): {
  isolatedMainDir: string
  utilityPath: string
} {
  const isolatedMainDir = path.join(smokeRoot, "main")
  cpSync(mainOutputDir, isolatedMainDir, { recursive: true, dereference: false })
  return {
    isolatedMainDir,
    utilityPath: path.join(isolatedMainDir, BACKEND_UTILITY_SCRIPT),
  }
}

function electronCommand(mainScript: string): string[] {
  return [electronBin, mainScript]
}

function readableStream(stream: NodeArtifactProcess["stdout"]): ReadableStream<Uint8Array> | null {
  return stream instanceof ReadableStream ? stream : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (isRecord(value)) return value
  throw new Error(`${label} response must be a JSON object`)
}

function requireString(value: unknown, label: string): string {
  if (typeof value === "string" && value.length > 0) return value
  throw new Error(`${label} must be a non-empty string`)
}

function requireArray(value: unknown, label: string): unknown[] {
  if (Array.isArray(value)) return value
  throw new Error(`${label} must be an array`)
}

async function requestJson(input: {
  baseUrl: string
  body?: unknown
  method?: "GET" | "POST"
  pathname: string
  search?: Record<string, string>
}): Promise<unknown> {
  const url = new URL(input.pathname, input.baseUrl)
  for (const [key, value] of Object.entries(input.search ?? {})) {
    url.searchParams.set(key, value)
  }

  const response = await fetch(url, {
    method: input.method ?? "GET",
    headers: {
      authorization: authorizationHeader(),
      ...(input.body === undefined ? {} : { "content-type": JSON_CONTENT_TYPE }),
    },
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`${input.pathname} failed (${response.status}): ${text}`)
  }
  if (text.length === 0) return undefined
  const parsed: unknown = JSON.parse(text)
  return parsed
}

async function smokeApiRoutes(input: { baseUrl: string; directory: string }): Promise<void> {
  const health = requireRecord(
    await requestJson({ baseUrl: input.baseUrl, pathname: API_HEALTH_PATH }),
    API_HEALTH_PATH,
  )
  if (health.healthy !== true) {
    throw new Error(`${API_HEALTH_PATH} did not report healthy`)
  }

  const providerList = requireRecord(
    await requestJson({
      baseUrl: input.baseUrl,
      pathname: API_PROVIDER_PATH,
      search: { directory: input.directory },
    }),
    API_PROVIDER_PATH,
  )
  requireArray(providerList.all, `${API_PROVIDER_PATH}.all`)
  requireRecord(providerList.default, `${API_PROVIDER_PATH}.default`)
  requireArray(providerList.connected, `${API_PROVIDER_PATH}.connected`)

  const providerAuth = requireRecord(
    await requestJson({
      baseUrl: input.baseUrl,
      pathname: API_PROVIDER_AUTH_PATH,
      search: { directory: input.directory },
    }),
    API_PROVIDER_AUTH_PATH,
  )
  for (const [providerID, methods] of Object.entries(providerAuth)) {
    requireArray(methods, `${API_PROVIDER_AUTH_PATH}.${providerID}`)
  }

  const createdSession = requireRecord(
    await requestJson({
      baseUrl: input.baseUrl,
      body: {},
      method: "POST",
      pathname: API_SESSION_PATH,
      search: { directory: input.directory },
    }),
    API_SESSION_PATH,
  )
  const sessionID = requireString(createdSession.id, `${API_SESSION_PATH}.id`)

  requireRecord(
    await requestJson({
      baseUrl: input.baseUrl,
      pathname: `${API_SESSION_PATH}/${sessionID}`,
      search: { directory: input.directory },
    }),
    `${API_SESSION_PATH}/${sessionID}`,
  )
  requireArray(
    await requestJson({
      baseUrl: input.baseUrl,
      pathname: `${API_SESSION_PATH}/${sessionID}/message`,
      search: { directory: input.directory },
    }),
    `${API_SESSION_PATH}/${sessionID}/message`,
  )
}

function assertDesktopBuildContract(mainDir: string): void {
  const scan = scanBuildOutput(mainDir)
  const allowedPackagedPackages = new Set(nativeRuntimePackageNames())
  const forbiddenPackagedPackages = scan.packagedNodeModules.filter(
    (packageName) => !allowedPackagedPackages.has(packageName),
  )

  if (forbiddenPackagedPackages.length > 0) {
    throw new Error(
      `Electron main output packaged forbidden runtime node_modules: ${forbiddenPackagedPackages.join(", ")}`,
    )
  }
}

function nativeRuntimePackageNames(): string[] {
  const target = currentBackendNodeArtifactTarget()
  return [
    LITEPARSE_PACKAGE_NAME,
    liteParseNativePackageName(target),
    nodePtyNativePackageName(target),
    parcelWatcherNativePackageName(target),
  ]
}

async function assertNativePackageLoadable(input: {
  mainDir: string
  packageName: string
}): Promise<void> {
  const child = Bun.spawn([electronBin, nativePackageProbeScript], {
    cwd: input.mainDir,
    env: {
      ...baseEnvironment(),
      [ELECTRON_RUN_AS_NODE_ENV]: "1",
      [NATIVE_PACKAGE_PROBE_MAIN_DIR_ENV]: input.mainDir,
      [NATIVE_PACKAGE_PROBE_PACKAGE_ENV]: input.packageName,
    },
    stderr: "pipe",
    stdout: "pipe",
    windowsHide: true,
  })
  const stdoutText = readStream(readableStream(child.stdout))
  const stderrText = readStream(readableStream(child.stderr))
  const exitCode = await child.exited
  if (exitCode !== 0) {
    const [stdout, stderr] = await Promise.all([stdoutText, stderrText])
    throw new Error(
      `${input.packageName} failed to load from isolated Electron output.\nstdout:\n${tail(stdout)}\nstderr:\n${tail(stderr)}`,
    )
  }
}

async function waitForReadyFile(input: {
  child: NodeArtifactProcess
  readyPath: string
  startupTimeoutMs: number
}): Promise<void> {
  const deadline = Date.now() + input.startupTimeoutMs

  while (Date.now() < deadline) {
    if (existsSync(input.readyPath)) return

    const exited = await Promise.race([
      input.child.exited.then((code) => code),
      delay(0).then(() => undefined),
    ])
    if (exited !== undefined) {
      throw new Error(`Electron backend utility smoke exited before ready (code=${exited})`)
    }

    await delay(DEFAULT_POLL_INTERVAL_MS)
  }

  throw new Error("Electron backend utility smoke did not report ready")
}

async function waitForProcessExit(
  child: NodeArtifactProcess,
  stdoutText: Promise<string>,
  stderrText: Promise<string>,
): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  const timeoutTask = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      reject(new Error("Electron backend utility smoke did not exit"))
    }, SMOKE_EXIT_TIMEOUT_MS)
  })
  const exitCode = await Promise.race([child.exited, timeoutTask]).finally(() => {
    if (timeout !== undefined) clearTimeout(timeout)
  })

  if (exitCode !== 0) {
    const [stdout, stderr] = await Promise.all([stdoutText, stderrText])
    throw new Error(
      `Electron backend utility smoke failed.\nstdout:\n${tail(stdout)}\nstderr:\n${tail(stderr)}`,
    )
  }
}

if (!existsSync(utilityPath)) {
  throw new Error(
    `Backend utility build output missing at ${utilityPath}. Run desktop build first.`,
  )
}
if (!existsSync(electronBin)) {
  throw new Error(`Electron binary missing at ${electronBin}. Run bun install first.`)
}
if (!existsSync(smokeMainScript)) {
  throw new Error(`Electron backend utility smoke main script missing at ${smokeMainScript}`)
}
if (!existsSync(nativePackageProbeScript)) {
  throw new Error(`Native package probe script missing at ${nativePackageProbeScript}`)
}

const resources = syncDesktopRuntimeResources()
const smokeRoot = mkdtempSync(path.join(os.tmpdir(), SMOKE_ROOT_PREFIX))
const runtimeRoot = path.join(smokeRoot, "runtime")
const readyPath = path.join(smokeRoot, SMOKE_READY_FILENAME)
const stopPath = path.join(smokeRoot, SMOKE_STOP_FILENAME)
const port = await allocatePort()
const mainScript = smokeMainScript
const isolatedMain = createIsolatedMainOutput(smokeRoot)
const notebookRoot = path.join(runtimeRoot, "notebook")

assertDesktopBuildContract(isolatedMain.isolatedMainDir)
for (const packageName of nativeRuntimePackageNames()) {
  await assertNativePackageLoadable({ mainDir: isolatedMain.isolatedMainDir, packageName })
}

let child: NodeArtifactProcess | undefined
let stdoutText: Promise<string> | undefined
let stderrText: Promise<string> | undefined

try {
  child = Bun.spawn(electronCommand(mainScript), {
    cwd: smokeRoot,
    env: {
      ...createBackendEnvironment({
        backendResources: resources.backendResources,
        migrations: resources.migrations,
        port,
        runtimeRoot,
        tessdata: resources.tessdata,
      }),
      [UTILITY_CWD_ENV]: isolatedMain.isolatedMainDir,
      [UTILITY_EXIT_TIMEOUT_ENV]: String(SMOKE_EXIT_TIMEOUT_MS),
      [UTILITY_HOSTNAME_ENV]: HOSTNAME,
      [UTILITY_PATH_ENV]: isolatedMain.utilityPath,
      [UTILITY_READY_ENV]: readyPath,
      [UTILITY_STARTUP_TIMEOUT_ENV]: String(DEFAULT_STARTUP_TIMEOUT_MS),
      [UTILITY_STOP_ENV]: stopPath,
    },
    stderr: "pipe",
    stdout: "pipe",
    windowsHide: true,
  })
  stdoutText = readStream(readableStream(child.stdout))
  stderrText = readStream(readableStream(child.stderr))

  await waitForReadyFile({
    child,
    readyPath,
    startupTimeoutMs: DEFAULT_STARTUP_TIMEOUT_MS,
  })

  const baseUrl = `http://${HOSTNAME}:${port}`
  const healthz = await probe({
    baseUrl,
    pathname: HEALTHZ_PATH,
    timeoutMs: DEFAULT_STARTUP_TIMEOUT_MS,
  })
  if (!healthz.ok) {
    throw new Error(`${HEALTHZ_PATH} failed: ${healthz.body || healthz.error || "unknown"}`)
  }

  await smokeApiRoutes({ baseUrl, directory: notebookRoot })

  await assertNodeArtifactResourceRouteSmoke({
    baseUrl,
    directory: notebookRoot,
    timeoutMs: DEFAULT_STARTUP_TIMEOUT_MS,
  })

  writeFileSync(stopPath, JSON.stringify({ stop: true }), "utf8")
  await waitForProcessExit(child, stdoutText, stderrText)

  console.log("Electron backend utility smoke passed")
} catch (error) {
  if (child) {
    child.kill()
  }
  if (stdoutText && stderrText) {
    const [stdout, stderr] = await Promise.all([stdoutText, stderrText])
    console.error(`stdout:\n${tail(stdout)}`)
    console.error(`stderr:\n${tail(stderr)}`)
  }
  throw error
} finally {
  rmSync(smokeRoot, { recursive: true, force: true })
}
