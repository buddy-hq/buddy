#!/usr/bin/env bun

import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs"
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
  assertNodeArtifactSpreadsheetRouteSmoke,
  delay,
  probe,
  readStream,
  tail,
} from "../../buddy/script/node-artifact-runtime"
import type { NodeArtifactProcess } from "../../buddy/script/node-artifact-runtime"
import {
  LITEPARSE_PACKAGE_NAME,
  TYPESCRIPT_RUNTIME_PACKAGE_NAME,
  currentBackendNodeArtifactTarget,
  liteParseNativePackageName,
  nodePtyNativePackageName,
  parcelWatcherNativePackageName,
  scanBuildOutput,
} from "../../../script/backend-node-artifact"
import {
  resolveExplicitRuntimeRootEnvironment,
  resolveExplicitRuntimeRootPaths,
  syncDesktopRuntimeResources,
} from "./utils"
import type { DesktopRuntimeResources } from "./utils"
import { resolveElectronBin } from "./electron-bin"
import { BUDDY_ENV, BUDDY_HOME_DIRECTORY_NAME, OPENCODE_ENV } from "@buddy/script/storage-env"
import {
  CHEMFIG_CHILD_FILENAME,
  CHEMFIG_TEX_ASSET_FILENAMES,
  CHEMFIG_TEX_DIRECTORY_NAME,
  ELECTRON_CHEMFIG_RUNTIME_PATH_SEGMENTS,
} from "@buddy/script/chemfig-runtime"
import {
  ELECTRON_ASAR_FILENAME,
  PACKAGED_RESOURCES_DIRECTORY_ENV,
  resolvePackagedResourcesDirectory,
} from "./packaged-resources"
import { createBuddyClient } from "@buddy/sdk"

const BACKEND_UTILITY_SCRIPT = "backend-utility.js" as const
const ELECTRON_RUN_AS_NODE_ENV = "ELECTRON_RUN_AS_NODE" as const
const NODE_PATH_ENV_KEY = "NODE_PATH" as const
const SMOKE_READY_FILENAME = "backend-utility-ready.json" as const
const SMOKE_STOP_FILENAME = "backend-utility-stop.json" as const
const SMOKE_ROOT_PREFIX = "buddy-backend-utility-smoke-" as const
const SMOKE_EXIT_TIMEOUT_MS = 45_000
const SMOKE_FAILURE_EXIT_TIMEOUT_MS = 10_000
const SMOKE_FORCED_EXIT_TIMEOUT_MS = 5_000
const SMOKE_CLEANUP_MAX_ATTEMPTS = 20
const SMOKE_CLEANUP_RETRY_DELAY_MS = 250
const PACKAGED_SMOKE_ARGUMENT = "--packaged" as const
const ELECTRON_ASAR_UNPACKED_DIRECTORY_NAME = "app.asar.unpacked" as const
const ELECTRON_MAIN_RELATIVE_PATH_SEGMENTS = ["out", "main"] as const
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
const API_CHEMFIG_RENDER_PATH = "/api/chemistry/chemfig/render" as const
const API_BASE_PATH = "/api" as const
const CHEMFIG_SMOKE_SOURCE = String.raw`\chemfig{C=C}`
const CHEMFIG_RENDERER_NAME = "node-tikzjax" as const
const FORBIDDEN_CHEMFIG_SVG_PATTERN =
  /<(?:script|foreignObject)\b|(?:href|src)\s*=\s*["']https?:\/\/|url\(\s*["']?https?:\/\//iu
const USER_CONFIG_ENVIRONMENT_KEYS = new Set<string>([BUDDY_ENV.CONFIG, BUDDY_ENV.CONFIG_CONTENT])
const RETRYABLE_CLEANUP_ERROR_CODES = new Set(["EACCES", "EBUSY", "ENOTEMPTY", "EPERM"])

const packageDir = path.resolve(import.meta.dir, "..")
const smokeMainScript = path.resolve(import.meta.dir, "backend-utility-smoke-main.mjs")
const nativePackageProbeScript = path.resolve(import.meta.dir, "native-package-probe.mjs")
const mainOutputDir = path.resolve(packageDir, "out", "main")
const electronBin = resolveElectronBin(packageDir)
const packagedSmoke = process.argv.includes(PACKAGED_SMOKE_ARGUMENT)

type SmokeMainOutput = {
  mainDir: string
  utilityPath: string
}

type SmokeRuntimeResources = Pick<
  DesktopRuntimeResources,
  "backendResources" | "migrations" | "tessdata"
>

function baseEnvironment(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] =>
        entry[0] !== NODE_PATH_ENV_KEY &&
        entry[0] !== ELECTRON_RUN_AS_NODE_ENV &&
        !USER_CONFIG_ENVIRONMENT_KEYS.has(entry[0]) &&
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
  const { notebookRoot, xdgRoot } = resolveExplicitRuntimeRootPaths(input.runtimeRoot)
  mkdirSync(notebookRoot, { recursive: true })
  mkdirSync(xdgRoot, { recursive: true })

  return {
    ...baseEnvironment(),
    ...resolveExplicitRuntimeRootEnvironment(xdgRoot),
    [BUDDY_ENV.ALLOWED_DIRECTORY_ROOTS]: notebookRoot,
    [BUDDY_ENV.APP_VERSION]: "backend-utility-smoke",
    [BUDDY_ENV.BACKEND_RESOURCES_DIR]: input.backendResources,
    [BUDDY_ENV.DISABLE_SKILL_ARTIFACT_FETCH]: "1",
    [BUDDY_ENV.GLOBAL_CONFIG_DIR]: path.join(input.runtimeRoot, BUDDY_HOME_DIRECTORY_NAME),
    [BUDDY_ENV.TESSDATA_DIR]: input.tessdata,
    [BUDDY_ENV.DIRECTORY_BASE]: notebookRoot,
    [BUDDY_ENV.MIGRATION_DIR]: path.join(input.migrations, "buddy"),
    [BUDDY_ENV.SERVER_PASSWORD]: PASSWORD,
    [BUDDY_ENV.SERVER_USERNAME]: USERNAME,
    [BUDDY_ENV.TEST_HOME]: input.runtimeRoot,
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

function createIsolatedMainOutput(smokeRoot: string): SmokeMainOutput {
  const isolatedMainDir = path.join(smokeRoot, "main")
  cpSync(mainOutputDir, isolatedMainDir, { recursive: true, dereference: false })
  return {
    mainDir: isolatedMainDir,
    utilityPath: path.join(isolatedMainDir, BACKEND_UTILITY_SCRIPT),
  }
}

function packagedMainOutput(resourcesDirectory: string): SmokeMainOutput {
  const mainPathSegments = [...ELECTRON_MAIN_RELATIVE_PATH_SEGMENTS]
  return {
    mainDir: path.join(
      resourcesDirectory,
      ELECTRON_ASAR_UNPACKED_DIRECTORY_NAME,
      ...mainPathSegments,
    ),
    utilityPath: path.join(
      resourcesDirectory,
      ELECTRON_ASAR_FILENAME,
      ...mainPathSegments,
      BACKEND_UTILITY_SCRIPT,
    ),
  }
}

function packagedRuntimeResources(resourcesDirectory: string): SmokeRuntimeResources {
  const resources = {
    backendResources: path.join(resourcesDirectory, "backend"),
    migrations: path.join(resourcesDirectory, "migrations"),
    tessdata: path.join(resourcesDirectory, "tessdata"),
  }
  for (const directory of Object.values(resources)) {
    if (!existsSync(directory)) {
      throw new Error(`Packaged Electron runtime resource missing at ${directory}`)
    }
  }
  return resources
}

function electronCommand(mainScript: string): string[] {
  return [electronBin, mainScript]
}

function readableStream(stream: NodeArtifactProcess["stdout"]): ReadableStream<Uint8Array> | null {
  return stream instanceof ReadableStream ? stream : null
}

async function smokeApiRoutes(input: { baseUrl: string; directory: string }): Promise<void> {
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
    typeof providerList.default !== "object" ||
    providerList.default === null ||
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

  const loadedSession = (
    await client.session.get({ directory: input.directory, sessionID }, { throwOnError: true })
  ).data
  if (loadedSession.id !== sessionID) {
    throw new Error(`${API_SESSION_PATH}/${sessionID} returned a different session`)
  }
  const messages = (
    await client.session.messages({ directory: input.directory, sessionID }, { throwOnError: true })
  ).data
  if (!Array.isArray(messages)) {
    throw new Error(`${API_SESSION_PATH}/${sessionID}/message must be an array`)
  }

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

function assertDesktopBuildContract(mainDir: string): void {
  const scan = scanBuildOutput(mainDir)
  const allowedPackagedPackages = new Set(runtimePackageNames())
  const forbiddenPackagedPackages = scan.packagedNodeModules.filter(
    (packageName) => !allowedPackagedPackages.has(packageName),
  )

  if (forbiddenPackagedPackages.length > 0) {
    throw new Error(
      `Electron main output packaged forbidden runtime node_modules: ${forbiddenPackagedPackages.join(", ")}`,
    )
  }

  assertChemfigRuntimeBuildContract(mainDir)
}

function assertChemfigRuntimeBuildContract(mainDir: string): void {
  const runtimeDirectory = electronChemfigRuntimeDirectory(mainDir)
  const expectedFiles = [
    CHEMFIG_CHILD_FILENAME,
    ...CHEMFIG_TEX_ASSET_FILENAMES.map((assetFilename) =>
      path.join(CHEMFIG_TEX_DIRECTORY_NAME, assetFilename),
    ),
  ].toSorted()
  const actualFiles = collectRelativeFilePaths(runtimeDirectory).toSorted()
  if (
    actualFiles.length !== expectedFiles.length ||
    actualFiles.some((filePath, index) => filePath !== expectedFiles[index])
  ) {
    throw new Error(
      `Electron chemfig runtime files do not match the build contract. Expected ${expectedFiles.join(", ")}; found ${actualFiles.join(", ") || "none"}`,
    )
  }
}

function electronChemfigRuntimeDirectory(mainDir: string): string {
  return path.join(mainDir, ...ELECTRON_CHEMFIG_RUNTIME_PATH_SEGMENTS)
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
      continue
    }
    if (entry.isFile()) files.push(relativePath)
  }
  return files
}

function runtimePackageNames(): string[] {
  const target = currentBackendNodeArtifactTarget()
  return [
    LITEPARSE_PACKAGE_NAME,
    liteParseNativePackageName(target),
    nodePtyNativePackageName(target),
    parcelWatcherNativePackageName(target),
    TYPESCRIPT_RUNTIME_PACKAGE_NAME,
  ]
}

async function assertRuntimePackageLoadable(input: {
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

async function processExitCode(child: NodeArtifactProcess, timeoutMs: number): Promise<number> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  const timeoutTask = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      reject(new Error("Electron backend utility smoke did not exit"))
    }, timeoutMs)
  })
  const exitCode = await Promise.race([child.exited, timeoutTask]).finally(() => {
    if (timeout !== undefined) clearTimeout(timeout)
  })
  return exitCode
}

async function waitForProcessExit(
  child: NodeArtifactProcess,
  stdoutText: Promise<string>,
  stderrText: Promise<string>,
): Promise<void> {
  const exitCode = await processExitCode(child, SMOKE_EXIT_TIMEOUT_MS)

  if (exitCode !== 0) {
    const [stdout, stderr] = await Promise.all([stdoutText, stderrText])
    throw new Error(
      `Electron backend utility smoke failed.\nstdout:\n${tail(stdout)}\nstderr:\n${tail(stderr)}`,
    )
  }
}

async function stopProcessAfterFailure(input: {
  child: NodeArtifactProcess
  stopPath: string
}): Promise<void> {
  writeFileSync(input.stopPath, JSON.stringify({ stop: true }), "utf8")
  try {
    await processExitCode(input.child, SMOKE_FAILURE_EXIT_TIMEOUT_MS)
    return
  } catch (gracefulExitError) {
    console.error("Electron backend utility did not stop gracefully after smoke failure", {
      cause:
        gracefulExitError instanceof Error ? gracefulExitError.message : String(gracefulExitError),
    })
  }

  input.child.kill()
  await processExitCode(input.child, SMOKE_FORCED_EXIT_TIMEOUT_MS)
}

function isRetryableCleanupError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    typeof error.code === "string" &&
    RETRYABLE_CLEANUP_ERROR_CODES.has(error.code)
  )
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

const workspaceUtilityPath = path.resolve(mainOutputDir, BACKEND_UTILITY_SCRIPT)
if (!packagedSmoke && !existsSync(workspaceUtilityPath)) {
  throw new Error(
    `Backend utility build output missing at ${workspaceUtilityPath}. Run desktop build first.`,
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

const packagedResourcesDirectory = packagedSmoke
  ? resolvePackagedResourcesDirectory({
      distDirectory: path.join(packageDir, "dist"),
      explicitDirectory: process.env[PACKAGED_RESOURCES_DIRECTORY_ENV],
    })
  : undefined
const resources: SmokeRuntimeResources = packagedResourcesDirectory
  ? packagedRuntimeResources(packagedResourcesDirectory)
  : syncDesktopRuntimeResources()
const smokeRoot = mkdtempSync(path.join(os.tmpdir(), SMOKE_ROOT_PREFIX))
const runtimeRoot = path.join(smokeRoot, "runtime")
const readyPath = path.join(smokeRoot, SMOKE_READY_FILENAME)
const stopPath = path.join(smokeRoot, SMOKE_STOP_FILENAME)
const port = await allocatePort()
const mainScript = smokeMainScript
const smokeMain = packagedResourcesDirectory
  ? packagedMainOutput(packagedResourcesDirectory)
  : createIsolatedMainOutput(smokeRoot)
const notebookRoot = path.join(runtimeRoot, "notebook")

if (packagedSmoke) {
  assertChemfigRuntimeBuildContract(smokeMain.mainDir)
} else {
  assertDesktopBuildContract(smokeMain.mainDir)
}
if (!packagedSmoke) {
  for (const packageName of runtimePackageNames()) {
    await assertRuntimePackageLoadable({ mainDir: smokeMain.mainDir, packageName })
  }
}

let child: NodeArtifactProcess | undefined
let stdoutText: Promise<string> | undefined
let stderrText: Promise<string> | undefined
let smokeFailed = false
let smokeFailure: unknown

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
      [UTILITY_CWD_ENV]: smokeMain.mainDir,
      [UTILITY_EXIT_TIMEOUT_ENV]: String(SMOKE_EXIT_TIMEOUT_MS),
      [UTILITY_HOSTNAME_ENV]: HOSTNAME,
      [UTILITY_PATH_ENV]: smokeMain.utilityPath,
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
  await assertNodeArtifactSpreadsheetRouteSmoke({
    baseUrl,
    directory: notebookRoot,
    timeoutMs: DEFAULT_STARTUP_TIMEOUT_MS,
  })

  writeFileSync(stopPath, JSON.stringify({ stop: true }), "utf8")
  await waitForProcessExit(child, stdoutText, stderrText)

  console.log(
    packagedSmoke
      ? "Packaged Electron backend utility chemistry smoke passed"
      : "Electron backend utility smoke passed",
  )
} catch (error) {
  smokeFailed = true
  smokeFailure = error
  if (child) {
    try {
      await stopProcessAfterFailure({ child, stopPath })
    } catch (stopError) {
      console.error("Electron backend utility cleanup failed after smoke failure", {
        cause: stopError instanceof Error ? stopError.message : String(stopError),
      })
    }
  }
  if (stdoutText && stderrText) {
    const [stdout, stderr] = await Promise.all([stdoutText, stderrText])
    console.error(`stdout:\n${tail(stdout)}`)
    console.error(`stderr:\n${tail(stderr)}`)
  }
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
