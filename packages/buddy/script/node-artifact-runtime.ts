import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { createServer } from "node:net"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import {
  assertBackendNodeArtifactRuntimeFiles,
  currentBackendNodeArtifactTarget,
  parcelWatcherNativePackageName,
} from "../../../script/backend-node-artifact"
import { syncBackendSourceResources } from "../../../script/desktop-runtime-resources"

export const HOSTNAME = "127.0.0.1"
export const USERNAME = "buddy"
export const PASSWORD = "node-artifact-smoke"
export const HEALTHZ_PATH = "/api/healthz"
export const HEALTH_PATH = "/api/health"
export const DEFAULT_STARTUP_TIMEOUT_MS = 30_000
export const DEFAULT_POLL_INTERVAL_MS = 250
export const DEFAULT_SHUTDOWN_TIMEOUT_MS = 2_000
export const LOG_TAIL_CHARACTERS = 8_000
const DIRECTORY_HEADER = "x-buddy-directory" as const
const ISOLATED_ARTIFACT_DIR_NAME = "backend-node"
const JSON_CONTENT_TYPE = "application/json" as const
const NODE_PATH_ENV_KEY = "NODE_PATH"
const RESOURCE_ROUTE_PATH = "/api/objects/resource" as const
const RESOURCE_ROUTE_SMOKE_ALIAS = "artifact-route-smoke" as const
const RESOURCE_ROUTE_SMOKE_FILENAME = "artifact-route-smoke.md" as const
const RESOURCE_ROUTE_SMOKE_TEXT = "# Artifact Route Smoke\n\nPackaged route resource prep smoke.\n"
const RESOURCE_READY_STATUS = "ready" as const

type UnknownRecord = Record<PropertyKey, unknown>

const BACKEND_DIR = path.resolve(import.meta.dir, "..")
const DEFAULT_ENTRYPOINT = path.resolve(BACKEND_DIR, "dist/node/node.js")
const DEFAULT_MIGRATION_DIR = path.resolve(BACKEND_DIR, "migration")

export type NodeArtifactProcess = ReturnType<typeof Bun.spawn>

export type ProbeResult = {
  body: string
  error?: string
  ok: boolean
  status?: number
}

export type SpawnedNodeArtifact = {
  artifactRoot: string
  baseUrl: string
  child: NodeArtifactProcess
  notebookRoot: string
  runtimeRoot: string
  stderr: Promise<string>
  stdout: Promise<string>
}

export function readFlagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag)
  if (index < 0) return undefined
  return args[index + 1]
}

export function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag)
}

export function parsePort(value: string | undefined): number | undefined {
  if (!value) return undefined
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

export function resolveNodeArtifactEntrypoint(configuredPath: string | undefined) {
  const entrypoint = path.resolve(configuredPath ?? DEFAULT_ENTRYPOINT)
  if (!existsSync(entrypoint)) {
    throw new Error(`Buddy Node backend artifact not found at ${entrypoint}`)
  }
  return entrypoint
}

export function resolveMigrationDir(configuredPath: string | undefined) {
  const migrationDir = path.resolve(configuredPath ?? DEFAULT_MIGRATION_DIR)
  if (!existsSync(migrationDir)) {
    throw new Error(`Buddy migration directory not found at ${migrationDir}`)
  }
  return migrationDir
}

export async function allocatePort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const server = createServer()
    server.on("error", reject)
    server.listen(0, HOSTNAME, () => {
      const address = server.address()
      if (!address || typeof address !== "object") {
        server.close()
        reject(new Error("Failed to allocate a Buddy Node backend port"))
        return
      }

      const { port } = address
      server.close(() => resolve(port))
    })
  })
}

export async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

export async function readStream(stream: ReadableStream<Uint8Array> | null): Promise<string> {
  if (!stream) return ""
  return await new Response(stream).text()
}

export async function assertNodeArtifactRuntimeAssets(entrypoint: string): Promise<void> {
  const artifactDir = path.dirname(entrypoint)
  const target = currentBackendNodeArtifactTarget()
  assertBackendNodeArtifactRuntimeFiles({ artifactDir, target })

  const watcherBindingPackage = parcelWatcherNativePackageName(target)
  const probe = Bun.spawn(
    [
      "node",
      "-e",
      `const path = require("node:path");
const packageName = ${JSON.stringify(watcherBindingPackage)};
const resolved = require.resolve(packageName);
const cwd = path.resolve(process.cwd());
const cwdPrefix = cwd.endsWith(path.sep) ? cwd : cwd + path.sep;
const resolvedEntrypoint = path.resolve(resolved);
if (!resolvedEntrypoint.startsWith(cwdPrefix)) {
  throw new Error(packageName + " resolved outside artifact: " + resolved);
}
require(packageName);`,
    ],
    {
      cwd: artifactDir,
      stderr: "pipe",
      stdout: "pipe",
      windowsHide: true,
    },
  )
  const [code, stdoutText, stderrText] = await Promise.all([
    probe.exited,
    readStream(probe.stdout),
    readStream(probe.stderr),
  ])
  if (code !== 0) {
    throw new Error(
      `Buddy Node artifact failed to load ${watcherBindingPackage}: ${tail(stderrText || stdoutText)}`,
    )
  }

  await assertNodeArtifactResourcePackPrep(entrypoint)
}

async function assertNodeArtifactResourcePackPrep(entrypoint: string): Promise<void> {
  const artifactDir = path.dirname(entrypoint)
  const probe = Bun.spawn(
    [
      "node",
      "--input-type=module",
      "-e",
      `const entrypoint = ${JSON.stringify(pathToFileURL(entrypoint).href)};
const module = await import(entrypoint);
if (typeof module.runNodeArtifactResourcePackSmoke !== "function") {
  throw new Error("Buddy Node artifact does not export runNodeArtifactResourcePackSmoke()");
}
await module.runNodeArtifactResourcePackSmoke();`,
    ],
    {
      cwd: artifactDir,
      env: baseEnvironment(),
      stderr: "pipe",
      stdout: "pipe",
      windowsHide: true,
    },
  )
  const [code, stdoutText, stderrText] = await Promise.all([
    probe.exited,
    readStream(probe.stdout),
    readStream(probe.stderr),
  ])
  if (code !== 0) {
    throw new Error(
      `Buddy Node artifact failed resource-pack prep smoke: ${tail(stderrText || stdoutText)}`,
    )
  }
}

export function tail(text: string): string {
  if (text.length <= LOG_TAIL_CHARACTERS) return text
  return text.slice(text.length - LOG_TAIL_CHARACTERS)
}

export async function stopProcess(child: NodeArtifactProcess): Promise<void> {
  child.kill()
  await Promise.race([child.exited, delay(DEFAULT_SHUTDOWN_TIMEOUT_MS)])
}

function basicAuthorizationHeader(): string {
  return `Basic ${Buffer.from(`${USERNAME}:${PASSWORD}`).toString("base64")}`
}

function baseEnvironment(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] =>
        entry[0] !== NODE_PATH_ENV_KEY && typeof entry[1] === "string",
    ),
  )
}

function createIsolatedArtifact(entrypoint: string): {
  artifactRoot: string
  entrypoint: string
} {
  const sourceDir = path.dirname(entrypoint)
  const artifactRoot = mkdtempSync(path.join(os.tmpdir(), "buddy-node-artifact-bundle-"))
  const artifactDir = path.join(artifactRoot, ISOLATED_ARTIFACT_DIR_NAME)
  cpSync(sourceDir, artifactDir, { recursive: true, dereference: true })

  return {
    artifactRoot,
    entrypoint: path.join(artifactDir, path.basename(entrypoint)),
  }
}

function createRuntimeRoot(): string {
  const runtimeRoot = mkdtempSync(path.join(os.tmpdir(), "buddy-node-artifact-"))
  mkdirSync(path.join(runtimeRoot, "notebook"), { recursive: true })
  return runtimeRoot
}

function createNodeArtifactEnvironment(input: {
  backendResourcesDir: string
  migrationDir: string
  port: number
  runtimeRoot: string
}): Record<string, string> {
  const xdgRoot = path.join(input.runtimeRoot, "xdg")
  const notebookRoot = path.join(input.runtimeRoot, "notebook")

  return {
    ...baseEnvironment(),
    BUDDY_ALLOWED_DIRECTORY_ROOTS: [notebookRoot, xdgRoot].join(","),
    BUDDY_APP_VERSION: "node-artifact-smoke",
    BUDDY_BACKEND_RESOURCES_DIR: input.backendResourcesDir,
    BUDDY_DIRECTORY_BASE: notebookRoot,
    BUDDY_MIGRATION_DIR: input.migrationDir,
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

export async function spawnNodeArtifact(input: {
  entrypoint?: string
  migrationDir?: string
  port?: number
}): Promise<SpawnedNodeArtifact> {
  const sourceEntrypoint = resolveNodeArtifactEntrypoint(input.entrypoint)
  const artifact = createIsolatedArtifact(sourceEntrypoint)
  const entrypoint = artifact.entrypoint
  await assertNodeArtifactRuntimeAssets(entrypoint)
  const migrationDir = resolveMigrationDir(input.migrationDir)
  const runtimeRoot = createRuntimeRoot()
  const notebookRoot = path.join(runtimeRoot, "notebook")
  const backendResourcesDir = syncBackendSourceResources(path.join(runtimeRoot, "backend-resources"))
  const port = input.port ?? (await allocatePort())
  const baseUrl = `http://${HOSTNAME}:${port}`
  const child = Bun.spawn(
    ["node", entrypoint, "serve", "--hostname", HOSTNAME, "--port", String(port)],
    {
      cwd: path.dirname(entrypoint),
      env: createNodeArtifactEnvironment({
        backendResourcesDir,
        migrationDir,
        port,
        runtimeRoot,
      }),
      stderr: "pipe",
      stdout: "pipe",
      windowsHide: true,
    },
  )

  return {
    artifactRoot: artifact.artifactRoot,
    baseUrl,
    child,
    notebookRoot,
    runtimeRoot,
    stderr: readStream(child.stderr),
    stdout: readStream(child.stdout),
  }
}

export async function assertNodeArtifactResourceRouteSmoke(input: {
  baseUrl: string
  directory: string
  timeoutMs: number
}): Promise<void> {
  const sourcePath = path.join(input.directory, RESOURCE_ROUTE_SMOKE_FILENAME)
  writeFileSync(sourcePath, RESOURCE_ROUTE_SMOKE_TEXT, "utf8")

  const createResponse = await fetch(new URL(RESOURCE_ROUTE_PATH, input.baseUrl), {
    method: "POST",
    headers: {
      authorization: basicAuthorizationHeader(),
      [DIRECTORY_HEADER]: input.directory,
      "content-type": JSON_CONTENT_TYPE,
    },
    body: JSON.stringify({
      alias: RESOURCE_ROUTE_SMOKE_ALIAS,
      sourcePath: RESOURCE_ROUTE_SMOKE_FILENAME,
    }),
  })
  if (!createResponse.ok) {
    throw new Error(
      `Resource route smoke create failed (${createResponse.status}): ${await createResponse.text()}`,
    )
  }

  const deadline = Date.now() + input.timeoutMs
  let last = ""
  while (Date.now() < deadline) {
    const listResponse = await fetch(new URL(RESOURCE_ROUTE_PATH, input.baseUrl), {
      headers: {
        authorization: basicAuthorizationHeader(),
        [DIRECTORY_HEADER]: input.directory,
      },
      signal: AbortSignal.timeout(DEFAULT_POLL_INTERVAL_MS),
    })
    last = await listResponse.text()
    if (listResponse.ok) {
      const body: unknown = JSON.parse(last)
      const resources = readResourceList(body)
      const resource = resources.find(
        (entry) => entry.alias === RESOURCE_ROUTE_SMOKE_ALIAS,
      )
      if (
        resource?.status === RESOURCE_READY_STATUS &&
        typeof resource.packPath === "string" &&
        typeof resource.fullTextPath === "string"
      ) {
        return
      }
    }

    await delay(DEFAULT_POLL_INTERVAL_MS)
  }

  throw new Error(`Resource route smoke did not become ready: ${last}`)
}

function isObjectRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null
}

function readResourceList(value: unknown): UnknownRecord[] {
  if (!isObjectRecord(value) || !Array.isArray(value.resources)) return []
  return value.resources.filter(isObjectRecord)
}

export async function probe(input: {
  baseUrl: string
  pathname: string
  timeoutMs: number
}): Promise<ProbeResult> {
  try {
    const response = await fetch(new URL(input.pathname, input.baseUrl), {
      headers: { authorization: basicAuthorizationHeader() },
      signal: AbortSignal.timeout(input.timeoutMs),
    })
    const body = await response.text()
    return {
      body,
      ok: response.ok,
      status: response.status,
    }
  } catch (error) {
    return {
      body: "",
      error: error instanceof Error ? error.message : String(error),
      ok: false,
    }
  }
}

export async function waitForHealthyEndpoint(input: {
  baseUrl: string
  child: NodeArtifactProcess
  pathname: string
  startupTimeoutMs: number
}): Promise<ProbeResult> {
  const deadline = Date.now() + input.startupTimeoutMs
  let last: ProbeResult = { body: "", ok: false }

  while (Date.now() < deadline) {
    const exited = await Promise.race([
      input.child.exited.then((code) => code),
      delay(0).then(() => undefined),
    ])
    if (exited !== undefined) {
      return {
        body: `Buddy Node backend exited before ${input.pathname} became healthy (code=${exited})`,
        ok: false,
      }
    }

    last = await probe({
      baseUrl: input.baseUrl,
      pathname: input.pathname,
      timeoutMs: DEFAULT_POLL_INTERVAL_MS,
    })
    if (last.ok) return last
    await delay(DEFAULT_POLL_INTERVAL_MS)
  }

  return last
}

export function cleanupRuntimeRoot(runtimeRoot: string, keepRuntime: boolean) {
  if (keepRuntime) {
    console.log(`Kept runtime root at ${runtimeRoot}`)
    return
  }

  rmSync(runtimeRoot, { recursive: true, force: true })
}

export function cleanupArtifactRoot(artifactRoot: string, keepRuntime: boolean) {
  if (keepRuntime) {
    console.log(`Kept artifact root at ${artifactRoot}`)
    return
  }

  rmSync(artifactRoot, { recursive: true, force: true })
}
