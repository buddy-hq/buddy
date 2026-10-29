import path from "node:path"
import os from "node:os"
import { createHash, randomUUID } from "node:crypto"
import { existsSync, mkdirSync } from "node:fs"
import { mkdir, readFile, rename, rm, stat, utimes, writeFile } from "node:fs/promises"
import { setTimeout as delay } from "node:timers/promises"
import z from "zod"
import type { Plugin } from "@opencode/plugin"
import type { OpenCode } from "@opencode/sdk"
import openCodeSdkPackage from "../../../vendor/opencode/packages/sdk/package.json"
import { Flock } from "@opencode/util/flock"
import { Path as OpenCodeGlobalPath } from "@opencode/util/global"
import { importV1GlobalConfig } from "./global-config-import"
import { repairLegacyOpenCodeMigrations } from "./legacy-migration-repair"
import { formatOpenCodeLogDetails, redactLogText } from "./log-redaction"
import { importV1McpSignIns } from "./mcp-auth-import"
import { ensureV2DatabaseSeeded, isV2DatabaseUpgrade, v2DatabaseLock, type V2DatabaseSeedResult } from "./seed-v2-database"
import {
  startV1ImportGuard,
  v1ImportNeedsLockAt,
  type V1ImportGuard,
  type V1ImportRecord,
  type V1ImportStatus,
} from "./v1-import-guard"
import { withBuddyToolPermissionReplies } from "./extension/tools"
import { observeHostShells } from "./shell-observer"

export type {
  OpenCodeEvent,
  PermissionReply,
  PermissionRequest,
  SessionInfo,
  SessionMessageInfo,
} from "@opencode/client"

export const OPENCODE_VERSION = openCodeSdkPackage.version
const OPENCODE_RELEASE_CHANNEL = "latest"
const MIGRATION_DIRECTORY_RELATIVE_PATH = "packages/buddy/migration"
const V1_IMPORT_LOCK_NAME = "buddy-v1-chat-import"
const V1_IMPORT_LOCK_TIMEOUT_MS = 30 * 60_000
const V1_IMPORT_OWNER_MAX_AGE_MS = 10 * 60_000
const v1ImportOwnerSchema = z.object({ pid: z.number().int().positive(), hostname: z.string(), token: z.string() })

export type OpenCodeHost = OpenCode.Interface
export type OpenCodeLogEntry = OpenCode.LogEntry
export type OpenCodeLogOptions = OpenCode.LogOptions

export type OpenCodeHostPaths = {
  readonly data: string
  readonly cache: string
  readonly config: string
  readonly state: string
  readonly tmp: string
}

export type OpenCodeHostOptions = {
  readonly clientName: string
  readonly paths: OpenCodeHostPaths
  readonly databasePath: string
  readonly plugins?: ReadonlyArray<Plugin.Plugin>
  readonly instances?: OpenCode.CreateOptions["instances"]
  readonly log?: OpenCodeLogOptions
  readonly fetchModels?: boolean
  readonly config?: OpenCode.CreateOptions["config"]
  readonly fs?: OpenCode.CreateOptions["fs"]
}

export type OpenCodeRuntimeDatabasePaths = OpenCodeHostPaths & {
  readonly database: string
  readonly v1Database: string
}

export type OpenCodeEnvironmentOptions = {
  readonly configDirectory: string
  readonly resolvePaths: () => OpenCodeRuntimeDatabasePaths
  readonly xdgOverrides?: {
    readonly data: string
    readonly cache: string
    readonly config: string
    readonly state: string
  }
}

export type OpenCodeUpgradeState =
  | { readonly state: "copying" }
  | { readonly state: "migrating" }
  | { readonly state: "ready" }
  | { readonly state: "failed"; readonly error: string }

export type OpenCodeUpgradeOptions = {
  readonly report: (state: OpenCodeUpgradeState) => void
  readonly seedPauseMs?: number
}

export type OpenCodeHostStartupOptions = {
  readonly environment: OpenCodeEnvironmentOptions
  readonly initializeStorage: () => Promise<void>
  readonly configure: () => Promise<Pick<OpenCodeHostOptions, "config" | "plugins" | "instances">>
  readonly decorate: (host: OpenCodeHost) => OpenCodeHost
  readonly upgrade?: OpenCodeUpgradeOptions
}

export type OpenCodeV1ImportReport = V1ImportRecord & {
  readonly status: V1ImportStatus | undefined
  readonly importRan: boolean
}

function findRepoPath(relativePath: string): string | undefined {
  const searchRoots = [process.cwd(), path.dirname(process.execPath)]

  for (const root of searchRoots) {
    let current = path.resolve(root)

    while (true) {
      const candidate = path.join(current, relativePath)
      if (existsSync(candidate)) {
        return candidate
      }

      const parent = path.dirname(current)
      if (parent === current) {
        break
      }
      current = parent
    }
  }

  return undefined
}

function applyOptionalPathEnv(name: string, resolvedPath: string | undefined) {
  const current = process.env[name]

  if (current && current !== "undefined") {
    return
  }

  if (resolvedPath) {
    process.env[name] = resolvedPath
    return
  }

  delete process.env[name]
}

export function installOpenCodeEnvironment(options: OpenCodeEnvironmentOptions) {
  if (options.xdgOverrides) {
    process.env.XDG_DATA_HOME = options.xdgOverrides.data
    process.env.XDG_CACHE_HOME = options.xdgOverrides.cache
    process.env.XDG_CONFIG_HOME = options.xdgOverrides.config
    process.env.XDG_STATE_HOME = options.xdgOverrides.state
  }
  process.env.BUDDY_GLOBAL_CONFIG_DIR = options.configDirectory
  applyOptionalPathEnv("BUDDY_MIGRATION_DIR", findRepoPath(MIGRATION_DIRECTORY_RELATIVE_PATH))

  const runtimePaths = options.resolvePaths()
  for (const directory of [
    runtimePaths.data,
    runtimePaths.cache,
    runtimePaths.config,
    runtimePaths.state,
    runtimePaths.tmp,
  ]) {
    mkdirSync(directory, { recursive: true })
  }
  configureOpenCodeGlobalPaths(runtimePaths)
  return runtimePaths
}

export function configureOpenCodeGlobalPaths(paths: OpenCodeHostPaths) {
  OpenCodeGlobalPath.data = paths.data
  OpenCodeGlobalPath.cache = paths.cache
  OpenCodeGlobalPath.config = paths.config
  OpenCodeGlobalPath.state = paths.state
  OpenCodeGlobalPath.tmp = paths.tmp
  OpenCodeGlobalPath.bin = path.join(paths.cache, "bin")
  OpenCodeGlobalPath.log = path.join(paths.data, "log")
  OpenCodeGlobalPath.repos = path.join(paths.data, "repos")
  Flock.setGlobal({ state: paths.state })
}

export async function createOpenCodeHost(options: OpenCodeHostOptions): Promise<OpenCodeHost> {
  configureOpenCodeGlobalPaths(options.paths)
  const { OpenCode } = await import("@opencode/sdk")
  return observeHostShells(await OpenCode.create({
    app: {
      name: options.clientName,
      version: OPENCODE_VERSION,
      channel: OPENCODE_RELEASE_CHANNEL,
    },
    database: { path: options.databasePath },
    config: { ...options.config, directory: options.paths.config },
    fs: options.fs,
    models: { fetch: options.fetchModels ?? true },
    plugins: options.plugins,
    instances: options.instances,
    log: options.log,
  }))
}

async function ensureRuntimeDirectories(temporaryDirectory: string) {
  const directories = [
    process.env.XDG_DATA_HOME,
    process.env.XDG_CACHE_HOME,
    process.env.XDG_CONFIG_HOME,
    process.env.XDG_STATE_HOME,
    temporaryDirectory,
  ].filter((directory): directory is string => directory !== undefined && directory.length > 0)

  await Promise.all(directories.map((directory) => mkdir(directory, { recursive: true })))
}

function isEnabledFlag(value: string | undefined) {
  const normalized = value?.trim().toLowerCase()
  return normalized === "1" || normalized === "true"
}

function forwardOpenCodeLog(entry: OpenCodeLogEntry) {
  const message = redactLogText(entry.message)
  const details = formatOpenCodeLogDetails(entry)
  if (entry.level === "error" || entry.level === "fatal") {
    console.error("[opencode]", message, ...details)
    return
  }
  console.warn("[opencode]", message, ...details)
}

async function repairLegacyMigrations(databasePath: string) {
  try {
    const repaired = await repairLegacyOpenCodeMigrations(databasePath)
    if (repaired.length > 0) {
      console.warn("Repaired legacy OpenCode migration journal entries:", repaired)
    }
  } catch (error) {
    console.warn("Skipping legacy OpenCode migration repair:", error)
  }
}

let currentV1ImportGuard: V1ImportGuard | undefined
let reportedUpgradeFailure = false

export function openCodeV1ImportReport(): OpenCodeV1ImportReport | undefined {
  const guard = currentV1ImportGuard
  if (!guard) return undefined
  const status = guard.status()
  return { ...guard.record(), status, importRan: guard.importRan }
}

export function openCodeV1ImportCommandDisplay(messageID: string): string | undefined {
  return currentV1ImportGuard?.commandDisplay(messageID)
}

export function openCodeV1ImportHasCommandDisplays(): boolean {
  return currentV1ImportGuard?.hasCommandDisplays() ?? false
}

function errorText<TError>(error: TError): string {
  return error instanceof Error ? error.message : String(error)
}

let loggedSeed: V2DatabaseSeedResult | undefined

function logSeedResult(seed: V2DatabaseSeedResult) {
  if (seed.kind !== "seeded" || seed === loggedSeed) return
  loggedSeed = seed
  console.warn("Copied chats from the previous version's database:", {
    source: seed.source,
    sourceBytes: seed.sourceBytes,
    seededBytes: seed.seededBytes,
    copyMs: Math.round(seed.copyMs),
    prepareMs: Math.round(seed.prepareMs),
    totalMs: Math.round(seed.totalMs),
  })
}

function mayRunV1Import(databasePath: string): boolean {
  try {
    return v1ImportNeedsLockAt(databasePath)
  } catch (error) {
    console.warn("Could not check whether the v1 chat import may run:", errorText(error))
    return true
  }
}

async function releaseV1ImportLock(lease: Flock.Lease) {
  try {
    await lease.release()
  } catch (error) {
    console.warn("Could not release the v1 chat import lock:", errorText(error))
  }
}

async function readV1ImportOwner(recordPath: string) {
  try {
    const parsed = v1ImportOwnerSchema.safeParse(JSON.parse(await readFile(recordPath, "utf8")))
    return parsed.success ? parsed.data : undefined
  } catch {
    return undefined
  }
}

async function liveV1ImportOwner(recordPath: string): Promise<boolean> {
  const owner = await readV1ImportOwner(recordPath)
  if (!owner || owner.hostname !== os.hostname()) return false
  const metadata = await stat(recordPath).catch(() => undefined)
  if (!metadata || Date.now() - metadata.mtimeMs >= V1_IMPORT_OWNER_MAX_AGE_MS) return false
  try {
    process.kill(owner.pid, 0)
    return true
  } catch (error) {
    return z.object({ code: z.literal("EPERM") }).safeParse(error).success
  }
}

async function trackV1ImportOwner(lease: Flock.Lease, recordPath: string): Promise<Flock.Lease> {
  const owner = { pid: process.pid, hostname: os.hostname(), token: randomUUID() }
  const temporary = `${recordPath}.${owner.token}.tmp`
  try {
    await writeFile(temporary, JSON.stringify(owner), { flag: "wx" })
    await rename(temporary, recordPath)
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined)
    await releaseV1ImportLock(lease)
    throw error
  }
  const heartbeat = setInterval(() => {
    const now = new Date()
    void utimes(recordPath, now, now).catch(() => undefined)
  }, 20_000)
  heartbeat.unref?.()
  const release = async () => {
    clearInterval(heartbeat)
    try {
      if ((await readV1ImportOwner(recordPath))?.token === owner.token) await rm(recordPath, { force: true })
    } catch (error) {
      console.warn("Could not release the v1 chat import lock:", errorText(error))
    }
    await releaseV1ImportLock(lease)
  }
  return { release, [Symbol.asyncDispose]: release }
}

async function acquireV1ImportLock(databasePath: string, onWait: () => void): Promise<Flock.Lease | undefined> {
  if (!mayRunV1Import(databasePath)) return undefined
  const lock = await v2DatabaseLock(databasePath, V1_IMPORT_LOCK_NAME)
  const recordPath = path.join(lock.dir, `buddy-v1-import-owner-${createHash("sha256").update(lock.key).digest("hex").slice(0, 16)}.json`)
  const timeout = new AbortController()
  const timer = setTimeout(() => timeout.abort(), V1_IMPORT_LOCK_TIMEOUT_MS)
  timer.unref?.()
  let lease: Flock.Lease
  try {
    while (true) {
      while (await liveV1ImportOwner(recordPath)) {
        onWait()
        await delay(1_000, undefined, { signal: timeout.signal })
      }
      try {
        lease = await Flock.acquire(lock.key, {
          dir: lock.dir,
          signal: timeout.signal,
          timeoutMs: 5_000,
          onWait,
        })
        break
      } catch (error) {
        if (timeout.signal.aborted || !(error instanceof Error && error.message === `Timed out waiting for lock: ${lock.key}`)) throw error
      }
    }
  } catch (error) {
    if (!timeout.signal.aborted) throw error
    throw new Error("Another Buddy window is still importing your chats from the previous version. Try again once it has finished.", { cause: error })
  } finally {
    clearTimeout(timer)
  }
  if (mayRunV1Import(databasePath)) return trackV1ImportOwner(lease, recordPath)
  await releaseV1ImportLock(lease)
  return undefined
}

export async function startV1ImportLaunch(databasePath: string, options: { readonly onWait: () => void }): Promise<V1ImportGuard> {
  const lease = await acquireV1ImportLock(databasePath, options.onWait)
  let released = false
  const release = async () => {
    if (!lease || released) return
    released = true
    await releaseV1ImportLock(lease)
  }
  const guard = startV1ImportGuard(databasePath, { onSettled: () => void release() })
  return {
    ...guard,
    async close() {
      try {
        await guard.close()
      } finally {
        await release()
      }
    },
  }
}

function withGuardClose(host: OpenCodeHost, guard: V1ImportGuard): OpenCodeHost {
  return {
    ...host,
    async close() {
      try {
        await host.close()
      } finally {
        await guard.close()
      }
    },
  }
}

function seedPause(pauseMs: number | undefined) {
  if (!pauseMs || pauseMs <= 0) return undefined
  return () => delay(pauseMs)
}

export async function startOpenCodeHost(options: OpenCodeHostStartupOptions): Promise<OpenCodeHost> {
  const paths = installOpenCodeEnvironment(options.environment)
  await ensureRuntimeDirectories(paths.tmp)
  await options.initializeStorage()
  const report = options.upgrade?.report ?? (() => undefined)
  const reportFailed = <TError>(error: TError) => {
    reportedUpgradeFailure = true
    report({ state: "failed", error: errorText(error) })
  }
  let migrating = false
  const reportMigrating = () => {
    if (migrating) return
    migrating = true
    report({ state: "migrating" })
  }
  let seed: V2DatabaseSeedResult
  try {
    seed = await ensureV2DatabaseSeeded(
      { v1Database: paths.v1Database, v2Database: paths.database },
      { onUpgrade: () => report({ state: "copying" }), beforePrepare: seedPause(options.upgrade?.seedPauseMs) },
    )
  } catch (error) {
    reportFailed(error)
    throw error
  }
  logSeedResult(seed)
  if (isV2DatabaseUpgrade(seed)) reportMigrating()
  await repairLegacyMigrations(paths.database)
  let guard: V1ImportGuard
  try {
    guard = await startV1ImportLaunch(paths.database, { onWait: reportMigrating })
  } catch (error) {
    if (migrating) reportFailed(error)
    throw error
  }
  currentV1ImportGuard = guard
  await importV1GlobalConfig(paths.config)
  let host: OpenCodeHost
  try {
    host = await createOpenCodeHost({
      clientName: "buddy",
      paths,
      databasePath: paths.database,
      ...await options.configure(),
      log: { level: "warn", emit: forwardOpenCodeLog },
      fetchModels: !isEnabledFlag(process.env.OPENCODE_DISABLE_MODELS_FETCH),
    })
  } catch (error) {
    await guard.close()
    if (migrating) reportFailed(error)
    throw error
  }
  const started = host
  await importV1McpSignIns(started, paths)
  guard.watch({ status: () => started.migration.v1.status() })
  if (migrating || reportedUpgradeFailure) report({ state: "ready" })
  reportedUpgradeFailure = false
  return withBuddyToolPermissionReplies(options.decorate(withGuardClose(host, guard)))
}
