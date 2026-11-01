#!/usr/bin/env bun

import { createHash } from "node:crypto"
import {
  cpSync,
  existsSync,
  readFileSync,
  statSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { createServer } from "node:net"
import os from "node:os"
import path from "node:path"
import { BUDDY_ENV, BUDDY_HOME_DIRECTORY_NAME, OPENCODE_ENV } from "@buddy/script/storage-env"
import {
  CHEMFIG_RUNTIME_DIRECTORY_NAME,
  CHEMFIG_TEX_ASSET_FILENAMES,
  CHEMFIG_TEX_DIRECTORY_NAME,
} from "@buddy/script/chemfig-runtime"
import {
  ELECTRON_ASAR_FILENAME,
  PACKAGED_RESOURCES_DIRECTORY_ENV,
  resolvePackagedResourcesDirectory,
} from "./packaged-resources"
import { resolveElectronBin } from "./electron-bin"
import { createBuddyClient } from "@buddy/sdk"
import { Database } from "bun:sqlite"
import * as XLSX from "xlsx"
import z from "zod"
import {
  restoreV1UpgradeFixture,
  V1_UPGRADE_FIXTURE,
  type RestoredV1UpgradeFixture,
} from "../../buddy/script/v1-upgrade-fixture"
import {
  isObjectValue,
  parseTErrorCode,
  parseTPortedAddress,
  parseTString,
} from "../src/shared/parse-external"
import { createRecoverableBrokenXrefTextPdf } from "../../buddy/test/helpers/pdf"
import {
  syncBackendSourceResources,
  syncBundledKnowledgeGraphAssets,
  syncBundledMigrations,
  syncBundledTessdataAssets,
} from "../../../script/desktop-runtime-resources"

const HOSTNAME = "127.0.0.1"
const USERNAME = "buddy"
const PASSWORD = "compiled-backend-smoke"
const HEALTHZ_PATH = "/api/healthz"
const DEFAULT_STARTUP_TIMEOUT_MS = 30_000
const DEFAULT_POLL_INTERVAL_MS = 250
const SMOKE_ROOT_PREFIX = "buddy-backend-smoke-"
const SMOKE_EXIT_TIMEOUT_MS = 45_000
const SMOKE_FORCED_EXIT_TIMEOUT_MS = 5_000
const SMOKE_CLEANUP_MAX_ATTEMPTS = 20
const SMOKE_CLEANUP_RETRY_DELAY_MS = 250
const PACKAGED_SMOKE_ARGUMENT = "--packaged"
const SLOW_UPGRADE_ARGUMENT = "--slow-upgrade"
const SLOW_UPGRADE_PAUSE_MS = 35_000
const DESKTOP_HEALTH_DEADLINE_MS = 30_000
const DESKTOP_HEALTH_FETCH_TIMEOUT_MS = 3_000
const DESKTOP_HEALTH_POLL_MS = 100
const DESKTOP_HEALTH_PATHS = ["/api/healthz", "/api/health"] as const
const V1_IMPORT_PATH = "/api/runtime/v1-import"
const V1_IMPORT_DEADLINE_MS = 60_000
const API_HEALTH_PATH = "/api/health"
const API_PROVIDER_PATH = "/api/provider"
const API_PROVIDER_AUTH_PATH = "/api/provider/auth"
const API_SESSION_PATH = "/api/session"
const API_CHEMFIG_RENDER_PATH = "/api/chemistry/chemfig/render"
const API_BASE_PATH = "/api"
const CHEMFIG_SMOKE_SOURCE = String.raw`\chemfig{C=C}`
const CHEMFIG_RENDERER_NAME = "node-tikzjax"
const FORBIDDEN_CHEMFIG_SVG_PATTERN =
  /<(?:script|foreignObject)\b|(?:href|src)\s*=\s*["']https?:\/\/|url\(\s*["']?https?:\/\//iu
const RETRYABLE_CLEANUP_ERROR_CODES = new Set(["EACCES", "EBUSY", "ENOTEMPTY", "EPERM"])
const INHERITED_ENVIRONMENT_KEYS = new Set([
  "PATH",
  "PATHEXT",
  "SYSTEMROOT",
  "WINDIR",
  "COMSPEC",
  "SYSTEMDRIVE",
  "LANG",
  "TERM",
  "NUMBER_OF_PROCESSORS",
  "PROCESSOR_ARCHITECTURE",
])
const REQUIRED_RESOURCE_DIRECTORIES = ["backend", "migrations", "tessdata", "knowledge-graph"]
const EXCLUDED_PACKAGED_RESOURCES = new Set([ELECTRON_ASAR_FILENAME, "app.asar.unpacked"])
const NODE_BASELINE_MIGRATIONS = [
  "20260127222353_familiar_lady_ursula",
  "20260211171708_add_project_commands",
  "20260213144116_wakeful_the_professor",
] as const
const NODE_PROJECT_ID = "node-sqlite-migration-smoke"
const NODE_PROJECT_SENTINEL = "Created by Node SQLite before Bun migration"
const NODE_CURRICULUM_SENTINEL = "# Node SQLite migration sentinel"
const NODE_SENTINEL_TIMESTAMP = 1_772_000_000_123
const NODE_PENDING_MIGRATION = "20260923013825_project_time_active"
const NODE_FIXTURE_TIMEOUT_MS = 30_000
const RESOURCE_ROUTE_PATH = "/api/objects/resource"
const RESOURCE_ROUTE_POLL_TIMEOUT_MS = 3_000
const LOG_TAIL_CHARACTERS = 8_000
const PDF_SMOKE_TEXT = "Buddy compiled PDF parsing sentinel"

const packageDir = path.resolve(import.meta.dir, "..")
const backendOutputDir = path.resolve(packageDir, "../buddy/dist/backend")
const backendFilename = process.platform === "win32" ? "buddy-backend.exe" : "buddy-backend"
const packagedSmoke = process.argv.includes(PACKAGED_SMOKE_ARGUMENT)
const slowUpgrade = process.argv.includes(SLOW_UPGRADE_ARGUMENT)

type SmokeProcess = Pick<Bun.Subprocess, "exitCode" | "exited" | "kill">
type SmokeResources = {
  readonly credentialMain?: string
  readonly binary: string
  readonly backendResources: string
  readonly migrations: string
  readonly tessdata: string
  readonly knowledgeGraph: string
}

type PreparedResource = {
  readonly format: string
  readonly sourceValidity: string
  readonly packPath: string
  readonly fullTextPath: string
}

function baseEnvironment(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] =>
        parseTString(entry[1]) !== undefined &&
        (INHERITED_ENVIRONMENT_KEYS.has(entry[0].toUpperCase()) ||
          entry[0].toUpperCase().startsWith("LC_")),
    ),
  )
}

function authorizationHeader(): string {
  return `Basic ${Buffer.from(`${USERNAME}:${PASSWORD}`).toString("base64")}`
}

function runtimePaths(runtimeRoot: string) {
  const xdgRoot = path.join(runtimeRoot, "xdg")
  return {
    home: path.join(runtimeRoot, "home"),
    notebookRoot: path.join(runtimeRoot, "notebook"),
    xdgRoot,
    data: path.join(xdgRoot, "data", "buddy"),
    cache: path.join(xdgRoot, "cache", "buddy"),
    state: path.join(xdgRoot, "state", "buddy"),
    tmp: path.join(runtimeRoot, "tmp"),
    database: path.join(xdgRoot, "data", "buddy", "opencode", "opencode-v2.db"),
  }
}

function createBackendEnvironment(input: {
  readonly port: number
  readonly runtimeRoot: string
  readonly resources: SmokeResources
}) {
  const roots = runtimePaths(input.runtimeRoot)
  const appData = path.join(roots.home, "AppData", "Roaming")
  const localAppData = path.join(roots.home, "AppData", "Local")
  const runtimeDirectory = path.join(input.runtimeRoot, "run")
  for (const directory of [
    roots.home,
    roots.notebookRoot,
    roots.xdgRoot,
    roots.data,
    roots.cache,
    roots.state,
    roots.tmp,
    appData,
    localAppData,
    runtimeDirectory,
  ]) {
    mkdirSync(directory, { recursive: true })
  }

  return {
    ...baseEnvironment(),
    HOME: roots.home,
    USERPROFILE: roots.home,
    HOMEDRIVE: path.parse(roots.home).root.replace(/[\\/]$/u, ""),
    HOMEPATH: roots.home.slice(path.parse(roots.home).root.replace(/[\\/]$/u, "").length),
    APPDATA: appData,
    LOCALAPPDATA: localAppData,
    TMPDIR: roots.tmp,
    TEMP: roots.tmp,
    TMP: roots.tmp,
    XDG_CACHE_HOME: path.dirname(roots.cache),
    XDG_CONFIG_HOME: path.join(roots.xdgRoot, "config"),
    XDG_DATA_HOME: path.dirname(roots.data),
    XDG_STATE_HOME: path.dirname(roots.state),
    XDG_RUNTIME_DIR: runtimeDirectory,
    BUN_INSTALL_CACHE_DIR: path.join(roots.cache, "bun", "install"),
    BUN_RUNTIME_TRANSPILER_CACHE_PATH: path.join(roots.cache, "bun", "transpiler"),
    BUN_TMPDIR: roots.tmp,
    BUDDY_EXIT_WITH_PARENT: "1",
    BUDDY_PDF_EXTRACTION_MODE: "liteparse-no-ocr",
    [BUDDY_ENV.RUNTIME_ROOT]: roots.xdgRoot,
    [BUDDY_ENV.ALLOWED_DIRECTORY_ROOTS]: roots.notebookRoot,
    [BUDDY_ENV.APP_VERSION]: "backend-smoke",
    [BUDDY_ENV.BACKEND_RESOURCES_DIR]: input.resources.backendResources,
    [BUDDY_ENV.DISABLE_SKILL_ARTIFACT_FETCH]: "1",
    [BUDDY_ENV.GLOBAL_CONFIG_DIR]: path.join(roots.home, BUDDY_HOME_DIRECTORY_NAME),
    [BUDDY_ENV.MANAGED_HOME_DIR]: roots.home,
    [BUDDY_ENV.DEFAULT_NOTEBOOK_HOME]: roots.notebookRoot,
    [BUDDY_ENV.DATA_DIR]: roots.data,
    [BUDDY_ENV.CACHE_DIR]: roots.cache,
    [BUDDY_ENV.STATE_DIR]: roots.state,
    [BUDDY_ENV.STANDARDS_LOCAL_ASSET_DIR]: input.resources.knowledgeGraph,
    [BUDDY_ENV.TESSDATA_DIR]: input.resources.tessdata,
    [BUDDY_ENV.DIRECTORY_BASE]: roots.notebookRoot,
    [BUDDY_ENV.MIGRATION_DIR]: path.join(input.resources.migrations, "buddy"),
    [BUDDY_ENV.SERVER_PASSWORD]: PASSWORD,
    [BUDDY_ENV.SERVER_USERNAME]: USERNAME,
    [BUDDY_ENV.TEST_HOME]: roots.home,
    [BUDDY_ENV.TEST_XDG_ROOT]: roots.xdgRoot,
    [OPENCODE_ENV.DB]: "opencode-v2.db",
    [OPENCODE_ENV.DISABLE_CHANNEL_DB]: "1",
    [OPENCODE_ENV.CLIENT]: "desktop",
    [OPENCODE_ENV.DISABLE_DEFAULT_PLUGINS]: "1",
    [OPENCODE_ENV.DISABLE_EXTERNAL_SKILLS]: "1",
    [OPENCODE_ENV.DISABLE_MODELS_FETCH]: "1",
    [OPENCODE_ENV.EXPERIMENTAL_FILEWATCHER]: "true",
    [OPENCODE_ENV.EXPERIMENTAL_ICON_DISCOVERY]: "true",
    [OPENCODE_ENV.SERVER_PASSWORD]: PASSWORD,
    [OPENCODE_ENV.SERVER_USERNAME]: USERNAME,
    PORT: String(input.port),
  }
}

function createIsolatedResources(smokeRoot: string): SmokeResources {
  const sourceDirectory = packagedSmoke
    ? resolvePackagedResourcesDirectory({
        distDirectory: path.join(packageDir, "dist"),
        explicitDirectory: process.env[PACKAGED_RESOURCES_DIRECTORY_ENV],
      })
    : path.join(smokeRoot, "source-resources")
  if (!packagedSmoke) {
    syncBackendSourceResources(path.join(sourceDirectory, "backend"))
    syncBundledMigrations(path.join(sourceDirectory, "migrations"))
    syncBundledKnowledgeGraphAssets({
      destinationDir: path.join(sourceDirectory, "knowledge-graph"),
    })
    syncBundledTessdataAssets(path.join(sourceDirectory, "tessdata"))
  }
  const sourceBinary = path.join(
    packagedSmoke ? sourceDirectory : backendOutputDir,
    backendFilename,
  )
  if (!existsSync(sourceBinary) || statSync(sourceBinary).size === 0) {
    throw new Error(`Compiled backend missing at ${sourceBinary}. Build the backend first.`)
  }
  const directory = path.join(smokeRoot, "resources")
  mkdirSync(directory, { recursive: true })
  if (!packagedSmoke) {
    cpSync(backendOutputDir, directory, { recursive: true, dereference: true })
  }
  for (const entry of readdirSync(sourceDirectory, { withFileTypes: true })) {
    if (EXCLUDED_PACKAGED_RESOURCES.has(entry.name)) continue
    if (entry.name === backendFilename) continue
    cpSync(path.join(sourceDirectory, entry.name), path.join(directory, entry.name), {
      recursive: true,
      dereference: true,
    })
  }
  for (const name of REQUIRED_RESOURCE_DIRECTORIES) {
    const resourceDirectory = path.join(directory, name)
    if (!existsSync(resourceDirectory) || !statSync(resourceDirectory).isDirectory()) {
      throw new Error(`Backend runtime resource directory missing at ${resourceDirectory}`)
    }
  }
  const binary = path.join(directory, backendFilename)
  cpSync(sourceBinary, binary)
  if (digestFile(binary) !== digestFile(sourceBinary)) {
    throw new Error("The isolated backend binary differs from the selected build")
  }
  const credentialMain = packagedSmoke
    ? path.join(directory, "app.asar.unpacked", "out", "main")
    : undefined
  if (credentialMain) {
    cpSync(path.join(sourceDirectory, "app.asar.unpacked", "out", "main"), credentialMain, {
      recursive: true,
      dereference: true,
    })
  }
  assertRuntimeBuildContract(directory)
  return {
    binary,
    credentialMain,
    backendResources: path.join(directory, "backend"),
    migrations: path.join(directory, "migrations"),
    tessdata: path.join(directory, "tessdata"),
    knowledgeGraph: path.join(directory, "knowledge-graph"),
  }
}

async function assertCredentialNativePackages(
  smokeRoot: string,
  resources: SmokeResources,
): Promise<void> {
  if (!resources.credentialMain) return
  const environment = createBackendEnvironment({
    port: 0,
    runtimeRoot: path.join(smokeRoot, "credential-runtime"),
    resources,
  })
  const packages =
    process.platform === "win32" ? ["@napi-rs/keyring", "@primno/dpapi"] : ["@napi-rs/keyring"]
  for (const packageName of packages) {
    const child = Bun.spawn(
      [resolveElectronBin(packageDir), path.join(import.meta.dir, "native-package-probe.mjs")],
      {
        cwd: resources.credentialMain,
        env: {
          ...environment,
          ELECTRON_RUN_AS_NODE: "1",
          BUDDY_NATIVE_PACKAGE_PROBE_MAIN_DIR: resources.credentialMain,
          BUDDY_NATIVE_PACKAGE_PROBE_PACKAGE: packageName,
        },
        stdout: "pipe",
        stderr: "pipe",
        windowsHide: true,
      },
    )
    const timeout = setTimeout(() => child.kill(), DEFAULT_STARTUP_TIMEOUT_MS)
    const stdoutText = readStream(child.stdout)
    const stderrText = readStream(child.stderr)
    try {
      const exitCode = await child.exited
      const [stdout, stderr] = await Promise.all([stdoutText, stderrText])
      if (exitCode !== 0) {
        throw new Error(
          `${packageName} failed its isolated Electron native load: ${tail(stdout)}\n${tail(stderr)}`,
        )
      }
      console.log(stdout.trim())
    } finally {
      clearTimeout(timeout)
    }
  }
}

function spawnBackend(input: {
  readonly environment: Record<string, string>
  readonly resources: SmokeResources
  readonly port: number
  readonly cwd: string
}) {
  return Bun.spawn(
    [input.resources.binary, "serve", "--hostname", HOSTNAME, "--port", String(input.port)],
    {
      cwd: input.cwd,
      env: input.environment,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
      windowsHide: true,
    },
  )
}

async function smokeApiRoutes(input: { baseUrl: string; directory: string }): Promise<void> {
  const route = (pathname: string) => {
    const url = new URL(`/api/${pathname}`, input.baseUrl)
    url.searchParams.set("directory", input.directory)
    return url
  }
  const requestJson = async (pathname: string, init: RequestInit = {}) => {
    const response = await fetch(route(pathname), {
      ...init,
      headers: { authorization: authorizationHeader(), "content-type": "application/json" },
      signal: AbortSignal.timeout(DEFAULT_STARTUP_TIMEOUT_MS),
    })
    if (!response.ok)
      throw new Error(`${pathname} failed (${response.status}): ${await response.text()}`)
    return await response.json()
  }
  const opened = z.object({ directory: z.string() }).parse(
    await requestJson("open-projects", {
      method: "POST",
      body: JSON.stringify({ directory: input.directory }),
    }),
  )
  if (realpathSync.native(opened.directory) !== realpathSync.native(input.directory))
    throw new Error("Opened a different notebook")
  const notebooks = z
    .object({ directories: z.array(z.string()) })
    .parse(await requestJson("open-projects"))
  if (!notebooks.directories.includes(opened.directory))
    throw new Error("Opened notebook is missing from the registry")
  z.array(z.object({ name: z.string().min(1) }))
    .min(1)
    .parse(await requestJson("command"))
  z.object({ installed: z.array(z.object({ name: z.string().min(1) })).min(1) }).parse(
    await requestJson("skills"),
  )
  const client = createBuddyClient({
    baseUrl: new URL(API_BASE_PATH, input.baseUrl).toString(),
    headers: { authorization: authorizationHeader() },
  })
  const health = (await client.health.check({ throwOnError: true })).data
  if (health.healthy !== true) {
    throw new Error(`${API_HEALTH_PATH} did not report healthy`)
  }

  const providerList = (
    await client.provider.list({ directory: input.directory }, { throwOnError: true })
  ).data
  if (
    !Array.isArray(providerList.all) ||
    !isObjectValue(providerList.default) ||
    !Array.isArray(providerList.connected)
  ) {
    throw new Error(`${API_PROVIDER_PATH} returned an invalid provider list`)
  }

  const providerAuth = (
    await client.provider.auth({ directory: input.directory }, { throwOnError: true })
  ).data
  for (const [providerID, methods] of Object.entries(providerAuth)) {
    if (!Array.isArray(methods)) {
      throw new Error(`${API_PROVIDER_AUTH_PATH}.${providerID} must be an array`)
    }
  }

  const createdSession = (
    await client.session.create({ directory: input.directory, body: {} }, { throwOnError: true })
  ).data
  const sessionID = createdSession.id
  const sessions = z.array(z.object({ id: z.string() })).parse(await requestJson("session"))
  if (!sessions.some((session) => session.id === sessionID))
    throw new Error("Created session is missing from the session list")
  const renamed = z.object({ title: z.literal("Backend smoke renamed") }).parse(
    await requestJson(`session/${sessionID}`, {
      method: "PATCH",
      body: JSON.stringify({ title: "Backend smoke renamed" }),
    }),
  )

  const loadedSession = (
    await client.session.get({ directory: input.directory, sessionID }, { throwOnError: true })
  ).data
  if (loadedSession.id !== sessionID || loadedSession.title !== renamed.title) {
    throw new Error(`${API_SESSION_PATH}/${sessionID} returned a different session`)
  }
  const messages = (
    await client.session.messages({ directory: input.directory, sessionID }, { throwOnError: true })
  ).data
  if (!Array.isArray(messages)) {
    throw new Error(`${API_SESSION_PATH}/${sessionID}/message must be an array`)
  }
  const stream = await fetch(route("event"), {
    headers: { authorization: authorizationHeader() },
    signal: AbortSignal.timeout(DEFAULT_STARTUP_TIMEOUT_MS),
  })
  if (!stream.ok || !stream.headers.get("content-type")?.includes("text/event-stream"))
    throw new Error("Event route did not return SSE")
  const reader = stream.body?.getReader()
  if (!reader) throw new Error("Event stream has no body")
  try {
    const decoder = new TextDecoder()
    let frame = ""
    while (!frame.includes("\n\n")) {
      const chunk = await reader.read()
      if (chunk.done) throw new Error("Event stream ended before its first event")
      frame += decoder.decode(chunk.value, { stream: true }).replaceAll("\r\n", "\n")
    }
    const data = frame
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n")
    z.object({ payload: z.object({ type: z.string().min(1) }) }).parse(JSON.parse(data))
  } finally {
    await reader.cancel()
  }
  z.literal(true).parse(await requestJson(`session/${sessionID}`, { method: "DELETE" }))
  const remaining = z.array(z.object({ id: z.string() })).parse(await requestJson("session"))
  if (remaining.some((session) => session.id === sessionID))
    throw new Error("Deleted session is still listed")

  const chemistryRender = (
    await client.chemistry.renderChemfig(
      { directory: input.directory, source: CHEMFIG_SMOKE_SOURCE },
      { throwOnError: true },
    )
  ).data
  if (chemistryRender.status !== "rendered") {
    throw new Error(`${API_CHEMFIG_RENDER_PATH}.status must be rendered`)
  }
  if (chemistryRender.rendererName !== CHEMFIG_RENDERER_NAME) {
    throw new Error(`${API_CHEMFIG_RENDER_PATH}.rendererName must be ${CHEMFIG_RENDERER_NAME}`)
  }
  const chemistrySvg = chemistryRender.svg
  if (!chemistrySvg.startsWith("<svg")) {
    throw new Error(`${API_CHEMFIG_RENDER_PATH}.svg must start with <svg`)
  }
  if (FORBIDDEN_CHEMFIG_SVG_PATTERN.test(chemistrySvg)) {
    throw new Error(`${API_CHEMFIG_RENDER_PATH}.svg contains unsafe or remote content`)
  }
}

async function desktopHealthPasses(baseUrl: string): Promise<boolean> {
  for (const pathname of DESKTOP_HEALTH_PATHS) {
    try {
      const response = await fetch(new URL(pathname, baseUrl), {
        headers: { authorization: authorizationHeader() },
        signal: AbortSignal.timeout(DESKTOP_HEALTH_FETCH_TIMEOUT_MS),
      })
      if (!response.ok) return false
    } catch {
      return false
    }
  }
  return true
}

async function waitForDesktopHealth(input: {
  baseUrl: string
  child: SmokeProcess
  spawnedAt: number
}): Promise<number> {
  while (true) {
    await delay(DESKTOP_HEALTH_POLL_MS)
    if (input.child.exitCode !== null) {
      throw new Error(`Compiled backend exited before healthy (code=${input.child.exitCode})`)
    }
    if (await desktopHealthPasses(input.baseUrl)) {
      const elapsed = performance.now() - input.spawnedAt
      if (elapsed <= DESKTOP_HEALTH_DEADLINE_MS) return elapsed
    }
    if (performance.now() - input.spawnedAt > DESKTOP_HEALTH_DEADLINE_MS) {
      throw new Error(
        `The desktop health check did not pass within ${DESKTOP_HEALTH_DEADLINE_MS}ms`,
      )
    }
  }
}

const v1ImportReportSchema = z.object({
  upgrade: z.object({ state: z.string(), error: z.string().optional() }),
  import: z.object({ status: z.string(), error: z.string().optional() }).nullable(),
  skipped: z.array(z.object({ id: z.string() })),
})

async function readV1ImportReport(baseUrl: string) {
  const response = await fetch(new URL(V1_IMPORT_PATH, baseUrl), {
    headers: { authorization: authorizationHeader() },
    signal: AbortSignal.timeout(DEFAULT_STARTUP_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`${V1_IMPORT_PATH} returned ${response.status}`)
  return v1ImportReportSchema.parse(await response.json())
}

function digestFile(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex")
}

async function directoryJson(
  baseUrl: string,
  route: string,
  directory: string,
  init: RequestInit = {},
) {
  const url = new URL(`${API_BASE_PATH}/${route}`, baseUrl)
  url.searchParams.set("directory", directory)
  const response = await fetch(url, {
    ...init,
    headers: { authorization: authorizationHeader(), "content-type": "application/json" },
  })
  if (!response.ok)
    throw new Error(`${route} returned ${response.status}: ${await response.text()}`)
  const data: unknown = await response.json()
  return data
}

function storedSessionDirectories(database: string): string {
  try {
    const db = new Database(database, { readonly: true })
    try {
      return JSON.stringify(db.query("SELECT id, directory FROM session_v2 ORDER BY id").all())
    } finally {
      db.close(false)
    }
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

async function assertV1Upgrade(input: {
  baseUrl: string
  upgrade: RestoredV1UpgradeFixture
  v1Digest: string
  v2Database: string
}): Promise<void> {
  const deadline =
    performance.now() + V1_IMPORT_DEADLINE_MS + (slowUpgrade ? SLOW_UPGRADE_PAUSE_MS : 0)
  let report = await readV1ImportReport(input.baseUrl)
  while (report.import?.status !== "completed") {
    if (report.import?.status === "error")
      throw new Error(`The v1 chat import failed: ${report.import.error}`)
    if (report.upgrade.state === "failed")
      throw new Error(`The upgrade failed: ${report.upgrade.error}`)
    if (performance.now() > deadline)
      throw new Error(`The v1 chat import did not complete: ${JSON.stringify(report)}`)
    await delay(DEFAULT_POLL_INTERVAL_MS)
    report = await readV1ImportReport(input.baseUrl)
  }
  if (report.upgrade.state !== "ready" || report.skipped.length > 0) {
    throw new Error(`Unexpected upgrade report: ${JSON.stringify(report)}`)
  }
  if (process.platform !== "win32" && (statSync(input.v2Database).mode & 0o777) !== 0o600) {
    throw new Error("opencode-v2.db is not restricted to its owner")
  }
  if (digestFile(input.upgrade.v1Database) !== input.v1Digest)
    throw new Error("opencode.db changed during the upgrade")
  await directoryJson(input.baseUrl, "open-projects", input.upgrade.notebook, {
    method: "POST",
    body: JSON.stringify({ directory: input.upgrade.notebook }),
  })
  const sessions = z
    .array(z.object({ id: z.string() }))
    .parse(await directoryJson(input.baseUrl, "session?roots=true", input.upgrade.notebook))
  const expected = [
    V1_UPGRADE_FIXTURE.parentSessionID,
    V1_UPGRADE_FIXTURE.separateSessionID,
  ].toSorted()
  if (
    JSON.stringify(sessions.map((session) => session.id).toSorted()) !== JSON.stringify(expected)
  ) {
    const listed = sessions.map((session) => session.id).toSorted()
    const stored = storedSessionDirectories(input.v2Database)
    throw new Error(
      [
        `The upgraded notebook lists ${JSON.stringify(listed)}`,
        `asked: ${JSON.stringify(input.upgrade.notebook)}`,
        `expected: ${JSON.stringify(expected)}`,
        `stored: ${stored}`,
      ].join("\n"),
    )
  }
  const children = z
    .array(z.object({ id: z.string(), parentID: z.string().optional() }))
    .parse(
      await directoryJson(
        input.baseUrl,
        `session/${V1_UPGRADE_FIXTURE.parentSessionID}/children`,
        input.upgrade.notebook,
      ),
    )
  if (
    children[0]?.id !== V1_UPGRADE_FIXTURE.childSessionID ||
    children[0]?.parentID !== V1_UPGRADE_FIXTURE.parentSessionID
  ) {
    throw new Error(`The imported subagent chat lost its parent: ${JSON.stringify(children)}`)
  }
  const messages = z
    .array(z.object({ info: z.object({ id: z.string() }) }))
    .parse(
      await directoryJson(
        input.baseUrl,
        `session/${V1_UPGRADE_FIXTURE.parentSessionID}/message`,
        input.upgrade.notebook,
      ),
    )
  const ids = new Set(messages.map((message) => message.info.id))
  for (const id of [
    V1_UPGRADE_FIXTURE.parentFirstMessageID,
    V1_UPGRADE_FIXTURE.citedMessageID,
    V1_UPGRADE_FIXTURE.mermaidMessageID,
  ]) {
    if (!ids.has(id)) throw new Error(`Imported message ${id} is missing`)
  }
}

function assertRuntimeBuildContract(directory: string): void {
  const runtimeDirectory = path.join(directory, CHEMFIG_RUNTIME_DIRECTORY_NAME)
  const expectedFiles = CHEMFIG_TEX_ASSET_FILENAMES.map((filename) =>
    path.join(CHEMFIG_TEX_DIRECTORY_NAME, filename),
  ).toSorted()
  const actualFiles = collectRelativeFilePaths(runtimeDirectory).toSorted()
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
    throw new Error(
      `Chemistry runtime files do not match the build contract. Expected ${expectedFiles.join(", ")}; found ${actualFiles.join(", ") || "none"}`,
    )
  }
  for (const file of actualFiles) {
    if (statSync(path.join(runtimeDirectory, file)).size === 0) {
      throw new Error(`Chemistry runtime asset is empty: ${file}`)
    }
  }
}

function collectRelativeFilePaths(directory: string, relativeDirectory = ""): string[] {
  if (!existsSync(directory)) return []
  const files: string[] = []
  for (const entry of readdirSync(path.join(directory, relativeDirectory), {
    withFileTypes: true,
  })) {
    const relativePath = path.join(relativeDirectory, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectRelativeFilePaths(directory, relativePath))
    } else if (entry.isFile()) {
      files.push(relativePath)
    }
  }
  return files
}

async function allocatePort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const server = createServer()
    server.on("error", reject)
    server.listen(0, HOSTNAME, () => {
      const address = parseTPortedAddress(server.address())
      if (address === undefined) {
        server.close()
        reject(new Error("Failed to allocate a backend smoke port"))
        return
      }
      server.close((error) => {
        if (error) reject(error)
        else resolve(address.port)
      })
    })
  })
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function readStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  return await new Response(stream).text()
}

function tail(text: string): string {
  return text.slice(-LOG_TAIL_CHARACTERS)
}

async function processExitCode(child: SmokeProcess, timeoutMs: number): Promise<number> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      child.exited,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error("Backend smoke child did not exit")), timeoutMs)
      }),
    ])
  } finally {
    if (timeout !== undefined) clearTimeout(timeout)
  }
}

async function stopBackend(child: ReturnType<typeof spawnBackend>): Promise<void> {
  if (child.exitCode !== null) {
    throw new Error(`Compiled backend exited before shutdown (code=${child.exitCode})`)
  }
  child.stdin.end()
  if (process.platform !== "win32") child.kill("SIGTERM")
  let gracefulCode: number
  try {
    gracefulCode = await processExitCode(child, SMOKE_EXIT_TIMEOUT_MS)
  } catch (error) {
    child.kill("SIGKILL")
    await processExitCode(child, SMOKE_FORCED_EXIT_TIMEOUT_MS)
    throw error
  }
  if (gracefulCode !== 0)
    throw new Error(`Compiled backend did not stop cleanly (code=${gracefulCode})`)
}

async function withBackend(
  input: {
    readonly environment: Record<string, string>
    readonly resources: SmokeResources
    readonly port: number
    readonly cwd: string
  },
  run: (backend: {
    readonly baseUrl: string
    readonly child: SmokeProcess
    readonly spawnedAt: number
  }) => Promise<void>,
): Promise<void> {
  const spawnedAt = performance.now()
  const child = spawnBackend(input)
  const stdoutText = readStream(child.stdout)
  const stderrText = readStream(child.stderr)
  try {
    await run({ baseUrl: `http://${HOSTNAME}:${input.port}`, child, spawnedAt })
    await stopBackend(child)
  } catch (error) {
    if (child.exitCode === null) {
      try {
        await stopBackend(child)
      } catch (cleanupError) {
        console.error("Backend cleanup failed after smoke failure", cleanupError)
      }
    }
    if (child.exitCode === null) throw error
    const [stdout, stderr] = await Promise.all([stdoutText, stderrText])
    console.error(`stdout:\n${tail(stdout)}`)
    console.error(`stderr:\n${tail(stderr)}`)
    throw error
  }
}

const runtimeHealthSchema = z.object({
  healthy: z.literal(true),
  runtime: z.object({ runtime: z.literal("bun"), version: z.string().regex(/^\d+\.\d+\.\d+/u) }),
})

async function assertBunRuntime(baseUrl: string): Promise<void> {
  const response = await fetch(new URL(HEALTHZ_PATH, baseUrl), {
    headers: { authorization: authorizationHeader() },
    signal: AbortSignal.timeout(DEFAULT_STARTUP_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`${HEALTHZ_PATH} returned ${response.status}`)
  const health = runtimeHealthSchema.parse(await response.json())
  console.log(`Compiled backend reports Bun ${health.runtime.version}`)
}

const resourceListSchema = z.object({
  resources: z.array(
    z.object({
      alias: z.string(),
      status: z.string(),
      format: z.string(),
      sourceValidity: z.string(),
      packPath: z.string().optional(),
      fullTextPath: z.string().optional(),
    }),
  ),
})

async function createAndWaitForReadyResource(input: {
  readonly alias: string
  readonly baseUrl: string
  readonly directory: string
  readonly sourcePath: string
  readonly timeoutMs: number
}): Promise<PreparedResource> {
  const headers = {
    authorization: authorizationHeader(),
    "x-buddy-directory": input.directory,
    "content-type": "application/json",
  }
  const response = await fetch(new URL(RESOURCE_ROUTE_PATH, input.baseUrl), {
    method: "POST",
    headers,
    body: JSON.stringify({ alias: input.alias, sourcePath: input.sourcePath }),
    signal: AbortSignal.timeout(input.timeoutMs),
  })
  if (!response.ok) {
    throw new Error(
      `Resource route smoke create failed (${response.status}): ${await response.text()}`,
    )
  }
  const deadline = Date.now() + input.timeoutMs
  let last = ""
  while (Date.now() < deadline) {
    try {
      const listed = await fetch(new URL(RESOURCE_ROUTE_PATH, input.baseUrl), {
        headers,
        signal: AbortSignal.timeout(RESOURCE_ROUTE_POLL_TIMEOUT_MS),
      })
      last = await listed.text()
      if (listed.ok) {
        const parsed = resourceListSchema.safeParse(JSON.parse(last))
        const resource = parsed.success
          ? parsed.data.resources.find((entry) => entry.alias === input.alias)
          : undefined
        if (
          resource?.status === "ready" &&
          resource.packPath !== undefined &&
          resource.fullTextPath !== undefined
        ) {
          return {
            format: resource.format,
            sourceValidity: resource.sourceValidity,
            packPath: resource.packPath,
            fullTextPath: resource.fullTextPath,
          }
        }
      }
    } catch (error) {
      last = error instanceof Error ? error.message : String(error)
    }
    await delay(DEFAULT_POLL_INTERVAL_MS)
  }
  throw new Error(`Resource route smoke did not become ready: ${last}`)
}

async function assertResourceRoutes(input: {
  readonly baseUrl: string
  readonly directory: string
}): Promise<void> {
  const markdown = path.join(input.directory, "artifact-route-smoke.md")
  const text = "Buddy prepares local reading material without a model. ".repeat(4_000)
  writeFileSync(markdown, text, "utf8")
  const prepared = await createAndWaitForReadyResource({
    ...input,
    alias: "artifact-route-smoke",
    sourcePath: markdown,
    timeoutMs: DEFAULT_STARTUP_TIMEOUT_MS,
  })
  const fullTextUrl = new URL("/api/file/content", input.baseUrl)
  fullTextUrl.searchParams.set("path", prepared.fullTextPath)
  const fullTextResponse = await fetch(fullTextUrl, {
    headers: {
      authorization: authorizationHeader(),
      "x-buddy-directory": input.directory,
    },
    signal: AbortSignal.timeout(DEFAULT_STARTUP_TIMEOUT_MS),
  })
  if (!fullTextResponse.ok) {
    throw new Error(
      `Large Markdown file API failed (${fullTextResponse.status}): ${await fullTextResponse.text()}`,
    )
  }
  const fullText = z.object({ content: z.string() }).parse(await fullTextResponse.json())
  if (!fullText.content.includes(text.trim())) {
    throw new Error("Large Markdown extracted text did not survive the file API")
  }
  const chunks = readdirSync(
    temporaryResourcePath(input.directory, path.join(prepared.packPath, "chunks")),
  ).filter((filename) => /^50-chunk-.*\.md$/u.test(filename))
  if (chunks.length <= 1) {
    throw new Error(`Large Markdown did not exercise Chonkie WASM: ${chunks.length} chunks`)
  }
  console.log(
    `Chonkie WASM prepared ${Buffer.byteLength(text)} Markdown bytes into ${chunks.length} chunks; file API text verified`,
  )
  const spreadsheet = path.join(input.directory, "artifact-spreadsheet-route-smoke.xlsx")
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ["Student", "Score"],
      ["Ada", 95],
    ]),
    "Scores",
  )
  const bytes: unknown = XLSX.write(workbook, {
    bookType: "xlsx",
    compression: true,
    type: "buffer",
  })
  if (!(bytes instanceof Uint8Array))
    throw new Error("SheetJS smoke fixture writer did not return workbook bytes")
  writeFileSync(spreadsheet, bytes)
  await createAndWaitForReadyResource({
    ...input,
    alias: "artifact-spreadsheet-route-smoke",
    sourcePath: spreadsheet,
    timeoutMs: DEFAULT_STARTUP_TIMEOUT_MS,
  })
  await assertPdfRoutes(input)
}

function temporaryResourcePath(directory: string, resourcePath: string): string {
  const root = realpathSync(directory)
  const resolved = realpathSync(path.resolve(directory, resourcePath))
  const relative = path.relative(root, resolved)
  if (path.isAbsolute(relative) || relative === ".." || relative.startsWith(`..${path.sep}`)) {
    throw new Error(`Resource smoke output is outside its temporary notebook: ${resourcePath}`)
  }
  return resolved
}

async function assertPdfRoutes(input: {
  readonly baseUrl: string
  readonly directory: string
}): Promise<void> {
  const sourcePath = path.join(input.directory, "compiled-backend-pdf-smoke.pdf")
  const source = createRecoverableBrokenXrefTextPdf(PDF_SMOKE_TEXT)
  writeFileSync(sourcePath, source, "utf8")
  const headers = {
    authorization: authorizationHeader(),
    "x-buddy-directory": input.directory,
    "content-type": "application/json",
  }
  const uploadedResponse = await fetch(new URL("/api/notebook/uploads", input.baseUrl), {
    method: "POST",
    headers,
    body: JSON.stringify({ sourcePath }),
    signal: AbortSignal.timeout(DEFAULT_STARTUP_TIMEOUT_MS),
  })
  if (!uploadedResponse.ok) {
    throw new Error(
      `PDF upload failed (${uploadedResponse.status}): ${await uploadedResponse.text()}`,
    )
  }
  const uploaded = z
    .object({
      uploadID: z.string().length(10),
      displayName: z.literal("compiled-backend-pdf-smoke.pdf"),
      format: z.literal("pdf"),
      mime: z.literal("application/pdf"),
      workspacePath: z.string().regex(/^uploads\//u),
      absolutePath: z.string().min(1),
      sizeBytes: z.number().int().positive(),
    })
    .parse(await uploadedResponse.json())
  const uploadedPath = temporaryResourcePath(input.directory, uploaded.absolutePath)
  if (
    digestFile(sourcePath) !== digestFile(uploadedPath) ||
    uploaded.sizeBytes !== Buffer.byteLength(source)
  ) {
    throw new Error("PDF upload changed the source bytes")
  }
  const prepared = await createAndWaitForReadyResource({
    ...input,
    alias: "compiled-backend-pdf-smoke",
    sourcePath: uploadedPath,
    timeoutMs: DEFAULT_STARTUP_TIMEOUT_MS,
  })
  if (prepared.format !== "pdf" || prepared.sourceValidity !== "valid") {
    throw new Error(
      `The PDF validation worker did not recover the broken xref: ${JSON.stringify(prepared)}`,
    )
  }
  const fullText = readFileSync(
    temporaryResourcePath(input.directory, prepared.fullTextPath),
    "utf8",
  )
  if (!fullText.includes(PDF_SMOKE_TEXT)) {
    throw new Error(`Compiled LiteParse/PDFium did not extract the PDF text sentinel: ${fullText}`)
  }
  const metadataPath = temporaryResourcePath(
    input.directory,
    path.join(prepared.packPath, "00-resource.md"),
  )
  const metadata = readFileSync(metadataPath, "utf8")
  if (!/^extractor:\s*["']?@llamaindex\/liteparse["']?\s*$/mu.test(metadata)) {
    throw new Error(`The compiled PDF smoke did not use the LiteParse extractor: ${metadata}`)
  }
  const rawUrl = new URL("/api/file/raw/compiled-backend-pdf-smoke.pdf", input.baseUrl)
  rawUrl.searchParams.set("path", uploaded.workspacePath)
  const raw = await fetch(rawUrl, {
    method: "HEAD",
    headers,
    signal: AbortSignal.timeout(DEFAULT_STARTUP_TIMEOUT_MS),
  })
  if (!raw.ok || raw.headers.get("content-type") !== "application/pdf") {
    throw new Error(`Validated uploaded PDF was not served as application/pdf (${raw.status})`)
  }
  const invalidSource = path.join(input.directory, "invalid-compiled-pdf-smoke.pdf")
  writeFileSync(invalidSource, "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n", "utf8")
  const rejected = await fetch(new URL(RESOURCE_ROUTE_PATH, input.baseUrl), {
    method: "POST",
    headers,
    body: JSON.stringify({ sourcePath: invalidSource, alias: "invalid-compiled-pdf-smoke" }),
    signal: AbortSignal.timeout(DEFAULT_STARTUP_TIMEOUT_MS),
  })
  if (rejected.status !== 400) {
    throw new Error(`The PDF validation worker accepted an invalid PDF (${rejected.status})`)
  }
  z.object({ code: z.literal("resource.invalid"), error: z.string().min(1) }).parse(
    await rejected.json(),
  )
  console.log("PDF upload, worker validation, and embedded LiteParse/PDFium text extraction passed")
}

const nodeFixtureSource = String.raw`
import { DatabaseSync } from "node:sqlite"
import { createHash } from "node:crypto"
import { mkdirSync, readFileSync } from "node:fs"
import path from "node:path"

if (process.versions.bun || !process.versions.node) throw new Error("The fixture must run in a real Node process")
const input = JSON.parse(process.argv[1])
mkdirSync(path.dirname(input.database), { recursive: true })
const db = new DatabaseSync(input.database)
try {
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; BEGIN IMMEDIATE")
  for (const file of input.migrations) db.exec(readFileSync(file, "utf8"))
  db.exec("CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY, hash TEXT NOT NULL, created_at NUMERIC, name TEXT, applied_at TEXT)")
  const journal = db.prepare("INSERT INTO __drizzle_migrations (hash, created_at, name, applied_at) VALUES (?, ?, ?, ?)")
  const hash = createHash("sha256").update(readFileSync(input.migrations[0])).digest("hex")
  for (const name of input.baseline) {
    const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})_/.exec(name)
    if (!match) throw new Error("Invalid baseline migration name: " + name)
    const date = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6]))
    journal.run(hash, date, name, new Date(date).toISOString())
  }
  db.prepare("INSERT INTO project (id, worktree, name, time_created, time_updated, sandboxes) VALUES (?, ?, ?, ?, ?, ?)").run(
    input.projectID, input.notebook, input.projectSentinel, input.timestamp, input.timestamp, "[]",
  )
  db.prepare("INSERT INTO curriculum (project_id, markdown, time_created, time_updated) VALUES (?, ?, ?, ?)").run(
    input.projectID, input.curriculumSentinel, input.timestamp, input.timestamp,
  )
  db.exec("COMMIT")
  if (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('migration', 'session_v2')").all().length > 0) {
    throw new Error("The Node fixture unexpectedly has the migrated schema")
  }
  if (db.prepare("SELECT name FROM pragma_table_info('project') WHERE name = 'time_active'").get()) {
    throw new Error("The Node fixture has no pending project migration")
  }
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)")
  console.log(JSON.stringify({ runtime: "node", version: process.versions.node, baseline: input.baseline }))
} finally {
  db.close()
}
`

async function createNodeDatabase(input: {
  readonly resources: SmokeResources
  readonly runtimeRoot: string
  readonly environment: Record<string, string>
}): Promise<void> {
  const nodeBinary = Bun.which("node")
  if (!nodeBinary)
    throw new Error(
      "Node with node:sqlite is required to create the previous-runtime database fixture",
    )
  const roots = runtimePaths(input.runtimeRoot)
  const migrations = ["20260221153000_init", "20260225141000_add_curriculum"].map((name) =>
    path.join(input.resources.migrations, "buddy", name, "migration.sql"),
  )
  const fixture = {
    database: roots.database,
    migrations,
    baseline: NODE_BASELINE_MIGRATIONS,
    notebook: roots.notebookRoot.replaceAll("\\", "/"),
    projectID: NODE_PROJECT_ID,
    projectSentinel: NODE_PROJECT_SENTINEL,
    curriculumSentinel: NODE_CURRICULUM_SENTINEL,
    timestamp: NODE_SENTINEL_TIMESTAMP,
  }
  const child = Bun.spawn(
    [nodeBinary, "--input-type=module", "-e", nodeFixtureSource, JSON.stringify(fixture)],
    {
      cwd: input.runtimeRoot,
      env: input.environment,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      windowsHide: true,
    },
  )
  const stdoutText = readStream(child.stdout)
  const stderrText = readStream(child.stderr)
  let exitCode: number
  try {
    exitCode = await processExitCode(child, NODE_FIXTURE_TIMEOUT_MS)
  } catch (error) {
    child.kill("SIGKILL")
    await processExitCode(child, SMOKE_FORCED_EXIT_TIMEOUT_MS)
    throw error
  }
  const [stdout, stderr] = await Promise.all([stdoutText, stderrText])
  if (exitCode !== 0)
    throw new Error(`Node SQLite fixture failed (${exitCode})\n${tail(stdout)}\n${tail(stderr)}`)
  const created = z
    .object({
      runtime: z.literal("node"),
      version: z.string().min(1),
      baseline: z.array(z.string()),
    })
    .parse(JSON.parse(stdout.trim()))
  if (JSON.stringify(created.baseline) !== JSON.stringify(NODE_BASELINE_MIGRATIONS)) {
    throw new Error("Node fixture did not record the expected migration baseline")
  }
  console.log(`Previous-runtime database created by Node ${created.version}`)
}

function assertNodeDatabaseMigrated(database: string): void {
  const db = new Database(database, { readonly: true })
  try {
    z.object({ integrity_check: z.literal("ok") }).parse(db.query("PRAGMA integrity_check").get())
    const project = z
      .object({ name: z.string(), time_active: z.number() })
      .parse(db.query("SELECT name, time_active FROM project WHERE id = ?").get(NODE_PROJECT_ID))
    if (project.name !== NODE_PROJECT_SENTINEL || project.time_active !== NODE_SENTINEL_TIMESTAMP) {
      throw new Error(
        `Node database project sentinel or time_active migration was lost: ${JSON.stringify(project)}`,
      )
    }
    const curriculum = z
      .object({ markdown: z.string() })
      .parse(db.query("SELECT markdown FROM curriculum WHERE project_id = ?").get(NODE_PROJECT_ID))
    if (curriculum.markdown !== NODE_CURRICULUM_SENTINEL)
      throw new Error("The real Buddy SQL migration sentinel was lost")
    const migrations = z
      .array(z.object({ id: z.string(), time_completed: z.number().positive() }))
      .parse(db.query("SELECT id, time_completed FROM migration ORDER BY id").all())
    const names = new Set(migrations.map((migration) => migration.id))
    for (const name of [...NODE_BASELINE_MIGRATIONS, NODE_PENDING_MIGRATION]) {
      if (!names.has(name)) throw new Error(`Node database did not migrate through ${name}`)
    }
    if (migrations.length <= NODE_BASELINE_MIGRATIONS.length)
      throw new Error("No real pending migrations were applied")
    z.object({ name: z.literal("session_v2") }).parse(
      db.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'session_v2'").get(),
    )
    const baseline = z
      .array(z.object({ name: z.string() }))
      .parse(db.query("SELECT name FROM __drizzle_migrations ORDER BY name").all())
    if (
      JSON.stringify(baseline.map((entry) => entry.name)) !==
      JSON.stringify(NODE_BASELINE_MIGRATIONS)
    ) {
      throw new Error("The previous Node migration journal changed")
    }
    console.log(
      `Node SQLite database preserved its sentinels through ${migrations.length} Bun migrations`,
    )
  } finally {
    db.close(false)
  }
}

function liteparseCacheSnapshot(cache: string) {
  const parent = path.join(cache, "native", "liteparse")
  const entries = readdirSync(parent)
  const directory = entries[0]
  if (entries.length !== 1 || !directory || !/^[a-f0-9]{64}$/u.test(directory)) {
    throw new Error(
      `Expected one content-addressed LiteParse cache directory: ${entries.join(", ")}`,
    )
  }
  const resolved = path.join(parent, directory)
  if (process.platform !== "win32" && (statSync(resolved).mode & 0o777) !== 0o700) {
    throw new Error("LiteParse cache directory is not private")
  }
  const files = readdirSync(resolved).toSorted()
  if (files.length !== 2 || !files.includes("liteparse.node")) {
    throw new Error(`Unexpected LiteParse cache files: ${files.join(", ")}`)
  }
  return JSON.stringify({
    directory,
    files: files.map((name) => {
      const filename = path.join(resolved, name)
      const stats = statSync(filename)
      return { name, hash: digestFile(filename), mtime: stats.mtimeMs, ctime: stats.ctimeMs }
    }),
  })
}

async function smokeV1Upgrade(smokeRoot: string, resources: SmokeResources): Promise<void> {
  const runtimeRoot = path.join(smokeRoot, "v1-runtime")
  const roots = runtimePaths(runtimeRoot)
  const port = await allocatePort()
  const environment = createBackendEnvironment({ port, runtimeRoot, resources })
  const upgrade = restoreV1UpgradeFixture({
    root: path.join(smokeRoot, "v1 upgrade"),
    openCodeDataDirectory: path.dirname(roots.database),
    notebookParent: path.join(roots.notebookRoot, "v1 upgrade l'été"),
    credentials: false,
  })
  const v1Digest = digestFile(upgrade.v1Database)
  await withBackend(
    {
      environment: {
        ...environment,
        [BUDDY_ENV.TEST_V2_SEED_PAUSE_MS]: slowUpgrade ? String(SLOW_UPGRADE_PAUSE_MS) : "0",
      },
      resources,
      port,
      cwd: runtimeRoot,
    },
    async ({ baseUrl, child, spawnedAt }) => {
      const desktopHealthMs = await waitForDesktopHealth({ baseUrl, child, spawnedAt })
      console.log(`Desktop health contract passed ${Math.round(desktopHealthMs)}ms after spawn`)
      await assertBunRuntime(baseUrl)
      if (slowUpgrade) {
        const during = await readV1ImportReport(baseUrl)
        if (during.upgrade.state !== "copying") {
          throw new Error(
            `Expected the upgrade to be copying during the injected pause: ${JSON.stringify(during)}`,
          )
        }
      }
      await assertV1Upgrade({ baseUrl, upgrade, v1Digest, v2Database: roots.database })
      console.log(
        `v1 chat import completed ${Math.round(performance.now() - spawnedAt)}ms after spawn`,
      )
      await assertBunRuntime(baseUrl)
      await smokeApiRoutes({ baseUrl, directory: roots.notebookRoot })
      await assertResourceRoutes({ baseUrl, directory: roots.notebookRoot })
    },
  )
  const cached = liteparseCacheSnapshot(roots.cache)
  const reuseDirectory = path.join(roots.notebookRoot, "liteparse-reuse")
  mkdirSync(reuseDirectory)
  await withBackend(
    { environment, resources, port, cwd: runtimeRoot },
    async ({ baseUrl, child, spawnedAt }) => {
      await waitForDesktopHealth({ baseUrl, child, spawnedAt })
      await assertPdfRoutes({ baseUrl, directory: reuseDirectory })
    },
  )
  if (cached !== liteparseCacheSnapshot(roots.cache)) {
    throw new Error("Two backend launches did not reuse the same LiteParse cache files")
  }
  console.log(
    "Two backend launches reused one private LiteParse cache directory without rewriting either file",
  )
}

async function smokeNodeMigration(smokeRoot: string, resources: SmokeResources): Promise<void> {
  const runtimeRoot = path.join(smokeRoot, "node-migration-runtime")
  const roots = runtimePaths(runtimeRoot)
  const port = await allocatePort()
  const environment = createBackendEnvironment({ port, runtimeRoot, resources })
  await createNodeDatabase({ resources, runtimeRoot, environment })
  await withBackend(
    { environment, resources, port, cwd: runtimeRoot },
    async ({ baseUrl, child, spawnedAt }) => {
      await waitForDesktopHealth({ baseUrl, child, spawnedAt })
      await assertBunRuntime(baseUrl)
      const deadline = performance.now() + V1_IMPORT_DEADLINE_MS
      let report = await readV1ImportReport(baseUrl)
      while (
        report.import?.status !== "completed" ||
        (report.upgrade.state !== "ready" && report.upgrade.state !== "idle")
      ) {
        if (report.upgrade.state === "failed" || report.import?.status === "error") {
          throw new Error(`Node database migration failed: ${JSON.stringify(report)}`)
        }
        if (performance.now() > deadline)
          throw new Error(`Node database migration timed out: ${JSON.stringify(report)}`)
        await delay(DEFAULT_POLL_INTERVAL_MS)
        report = await readV1ImportReport(baseUrl)
      }
      assertNodeDatabaseMigrated(roots.database)
      await smokeApiRoutes({ baseUrl, directory: roots.notebookRoot })
    },
  )
}

function isRetryableCleanupError<TError>(error: TError): boolean {
  const code = parseTErrorCode(error)
  return error instanceof Error && code !== undefined && RETRYABLE_CLEANUP_ERROR_CODES.has(code)
}

async function removeSmokeRoot(smokeRoot: string): Promise<void> {
  for (let attempt = 1; attempt <= SMOKE_CLEANUP_MAX_ATTEMPTS; attempt += 1) {
    try {
      rmSync(smokeRoot, { recursive: true, force: true })
      return
    } catch (error) {
      if (!isRetryableCleanupError(error) || attempt === SMOKE_CLEANUP_MAX_ATTEMPTS) {
        throw error
      }
      await delay(SMOKE_CLEANUP_RETRY_DELAY_MS)
    }
  }
}

const smokeRoot = mkdtempSync(path.join(os.tmpdir(), SMOKE_ROOT_PREFIX))
let smokeFailed = false
let smokeFailure: unknown
try {
  const resources = createIsolatedResources(smokeRoot)
  await assertCredentialNativePackages(smokeRoot, resources)
  await smokeV1Upgrade(smokeRoot, resources)
  await smokeNodeMigration(smokeRoot, resources)
  console.log(
    packagedSmoke ? "Packaged Bun backend smoke passed" : "Compiled Bun backend smoke passed",
  )
} catch (error) {
  smokeFailed = true
  smokeFailure = error
}

try {
  await removeSmokeRoot(smokeRoot)
} catch (cleanupError) {
  if (!smokeFailed) {
    smokeFailed = true
    smokeFailure = cleanupError
  } else {
    console.error("Smoke root cleanup failed without replacing the primary smoke failure", {
      cause: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
      smokeRoot,
    })
  }
}

if (smokeFailed) throw smokeFailure
