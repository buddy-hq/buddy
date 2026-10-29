import path from "node:path"
import { constants as fsConstants } from "node:fs"
import fs from "node:fs/promises"
import z from "zod"
import { Flock } from "@opencode/util/flock"
import { openSeedSqlite, type SeedSqlite } from "./seed-sqlite"
import {
  V1_IMPORT_GUARD_TABLE,
  writeV1ImportCommandDisplays,
  writeV1ImportContentCounts,
} from "./v1-import-guard"

const SEED_LOCK_NAME = "buddy-v2-database-seed"
const LOCK_DIRECTORY_NAME = ".locks"
const FREE_SPACE_MULTIPLE = 3
const SEED_RETRY_DELAY_MS = 60_000
const SIDECAR_SUFFIXES = ["-wal", "-shm", "-journal"] as const
const V1_TABLES = ["session", "message", "part"] as const
const V2_TABLE = "session_v2"

export type V2DatabaseSeedPaths = {
  readonly v1Database: string
  readonly v2Database: string
}

export type V2DatabaseSeedOptions = {
  readonly onUpgrade?: () => void
  readonly beforePrepare?: () => Promise<void>
}

export type V2DatabaseSeedSource = "v1" | "v2"

export type V2DatabaseSeedResult =
  | { readonly kind: "present" }
  | { readonly kind: "no-source" }
  | { readonly kind: "empty-source" }
  | { readonly kind: "published-elsewhere" }
  | {
      readonly kind: "seeded"
      readonly source: V2DatabaseSeedSource
      readonly sourceBytes: number
      readonly seededBytes: number
      readonly copyMs: number
      readonly prepareMs: number
      readonly totalMs: number
    }

type CopyOutcome =
  | { readonly kind: "empty-source" | "published-elsewhere" }
  | {
      readonly kind: "seeded"
      readonly source: V2DatabaseSeedSource
      readonly seededBytes: number
      readonly copyMs: number
      readonly prepareMs: number
    }

const tableRowSchema = z.object({ name: z.string() })
const quickCheckRowSchema = z.object({ quick_check: z.string() })
const migrationStateRowSchema = z.object({ value: z.string() })

const errnoSchema = z.object({ code: z.string() })

function errnoCode<TError>(error: TError): string | undefined {
  const parsed = errnoSchema.safeParse(error)
  return parsed.success ? parsed.data.code : undefined
}

async function fileSize(file: string): Promise<number | undefined> {
  try {
    return (await fs.stat(file)).size
  } catch (error) {
    if (errnoCode(error) === "ENOENT") return undefined
    throw error
  }
}

async function isInitializedDatabase(file: string): Promise<boolean> {
  const [main, wal] = await Promise.all([fileSize(file), fileSize(`${file}-wal`)])
  return (main ?? 0) > 0 || (wal ?? 0) > 0
}

async function removeUninitializedDatabase(file: string) {
  if ((await fileSize(file)) === undefined) return
  for (const suffix of SIDECAR_SUFFIXES) {
    if (((await fileSize(`${file}${suffix}`)) ?? 0) > 0) return
  }
  await Promise.all(
    [file, ...SIDECAR_SUFFIXES.map((suffix) => `${file}${suffix}`)].map((entry) =>
      fs.rm(entry, { force: true }),
    ),
  )
}

function temporaryNamePattern(v2Database: string) {
  const escaped = path.basename(v2Database).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")
  return new RegExp(`^${escaped}\\.\\d+\\.tmp(?:-wal|-shm|-journal)?$`, "u")
}

async function removeTemporaryCopies(v2Database: string) {
  const directory = path.dirname(v2Database)
  const pattern = temporaryNamePattern(v2Database)
  const entries = await fs.readdir(directory)
  await Promise.all(
    entries
      .filter((entry) => pattern.test(entry))
      .map((entry) => fs.rm(path.join(directory, entry), { recursive: true, force: true })),
  )
}

function formatBytes(bytes: number): string {
  const units = ["bytes", "KB", "MB", "GB", "TB"] as const
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return unit === 0 ? `${bytes} bytes` : `${value.toFixed(1)} ${units[unit]}`
}

export class V2DatabaseSeedError extends Error {
  constructor(message: string, options: { readonly cause?: Error } = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined)
    this.name = "V2DatabaseSeedError"
  }
}

async function requireFreeSpace(v1Database: string, directory: string) {
  const [main, wal] = await Promise.all([fileSize(v1Database), fileSize(`${v1Database}-wal`)])
  const sourceBytes = (main ?? 0) + (wal ?? 0)
  const needed = sourceBytes * FREE_SPACE_MULTIPLE
  const stats = await fs.statfs(directory)
  const available = Number(stats.bavail) * Number(stats.bsize)
  if (available < needed) {
    throw new V2DatabaseSeedError(
      `Not enough disk space to upgrade your chats: need ${formatBytes(needed)}, have ${formatBytes(available)}`,
    )
  }
  return sourceBytes
}

async function tableNames(db: SeedSqlite): Promise<ReadonlySet<string>> {
  const rows = await db.all(tableRowSchema, "SELECT name FROM sqlite_master WHERE type = 'table'")
  return new Set(rows.map((row) => row.name))
}

async function classifySource(db: SeedSqlite): Promise<V2DatabaseSeedSource | undefined> {
  const tables = await tableNames(db)
  if (tables.has(V2_TABLE)) return "v2"
  if (!V1_TABLES.every((table) => tables.has(table))) return undefined
  if (!tables.has("kv")) return "v1"
  const state = await db.all(
    migrationStateRowSchema,
    "SELECT value FROM kv WHERE key = 'migration.v1-v2'",
  )
  return state.length === 0 ? "v1" : "v2"
}

async function prepareCopy(db: SeedSqlite, source: V2DatabaseSeedSource) {
  await db.exec("PRAGMA journal_mode = DELETE")
  if (source === "v1") {
    const tables = await tableNames(db)
    if (tables.has("event")) await db.exec("DELETE FROM event")
    await writeV1ImportContentCounts(db)
    await writeV1ImportCommandDisplays(db)
    await db.exec("VACUUM")
  }
  const check = await db.all(quickCheckRowSchema, "PRAGMA quick_check")
  if (check.length !== 1 || check[0]?.quick_check !== "ok") {
    throw new V2DatabaseSeedError(
      `The copied chat database failed its integrity check: ${check.map((row) => row.quick_check).join("; ")}`,
    )
  }
  const tables = await tableNames(db)
  const required = source === "v1" ? [...V1_TABLES, V1_IMPORT_GUARD_TABLE] : [V2_TABLE]
  const missing = required.filter((table) => !tables.has(table))
  if (missing.length > 0)
    throw new V2DatabaseSeedError(`The copied chat database is missing ${missing.join(", ")}`)
}

async function syncFile(file: string, flags: number) {
  const handle = await fs.open(file, flags)
  try {
    await handle.sync()
  } finally {
    await handle.close()
  }
}

export async function publish(
  temporary: string,
  v2Database: string,
  link: (existing: string, target: string) => Promise<void> = fs.link,
): Promise<boolean> {
  if (process.platform !== "win32") await fs.chmod(temporary, 0o600)
  await syncFile(temporary, fsConstants.O_RDWR)
  try {
    await link(temporary, v2Database)
  } catch (error) {
    const code = errnoCode(error)
    if (code === "EEXIST") return false
    if (!["EPERM", "ENOTSUP", "EOPNOTSUPP", "ENOSYS", "EINVAL", "EXDEV"].includes(code ?? ""))
      throw error
    if ((await fileSize(v2Database)) !== undefined) return false
    await fs.rename(temporary, v2Database)
  }
  if (process.platform !== "win32") await syncFile(path.dirname(v2Database), fsConstants.O_RDONLY)
  return true
}

function asError<TError>(error: TError): Error {
  return error instanceof Error ? error : new Error(String(error))
}

async function withSeedSqlite<TResult>(
  file: string,
  options: { readonly readOnly: boolean },
  run: (db: SeedSqlite) => Promise<TResult>,
): Promise<TResult> {
  const db = await openSeedSqlite(file, options)
  let result: TResult
  try {
    result = await run(db)
  } catch (error) {
    await db.close().catch(() => undefined)
    throw error
  }
  await db.close()
  return result
}

async function copyAndPublish(
  paths: V2DatabaseSeedPaths,
  workDirectory: string,
  options: V2DatabaseSeedOptions,
): Promise<CopyOutcome> {
  const temporary = path.join(workDirectory, path.basename(paths.v2Database))
  const copied = await withSeedSqlite(paths.v1Database, { readOnly: true }, async (source) => {
    const kind = await classifySource(source)
    if (!kind) return undefined
    await fs.mkdir(workDirectory, { mode: 0o700 })
    const started = performance.now()
    await source.copyTo(temporary)
    return { kind, copyMs: performance.now() - started }
  })
  if (!copied) return { kind: "empty-source" }
  await options.beforePrepare?.()
  const prepareStarted = performance.now()
  await withSeedSqlite(temporary, { readOnly: false }, (copy) => prepareCopy(copy, copied.kind))
  const prepareMs = performance.now() - prepareStarted
  const seededBytes = (await fileSize(temporary)) ?? 0
  if (!(await publish(temporary, paths.v2Database))) return { kind: "published-elsewhere" }
  return { kind: "seeded", source: copied.kind, seededBytes, copyMs: copied.copyMs, prepareMs }
}

async function copyUnderLock(
  paths: V2DatabaseSeedPaths,
  options: V2DatabaseSeedOptions,
): Promise<V2DatabaseSeedResult> {
  const started = performance.now()
  if (await isInitializedDatabase(paths.v2Database)) return { kind: "published-elsewhere" }
  if ((await fileSize(paths.v1Database)) === undefined) return { kind: "no-source" }
  await removeUninitializedDatabase(paths.v2Database)
  if ((await fileSize(paths.v2Database)) !== undefined) return { kind: "published-elsewhere" }
  await removeTemporaryCopies(paths.v2Database)
  const sourceBytes = await requireFreeSpace(paths.v1Database, path.dirname(paths.v2Database))
  const workDirectory = `${paths.v2Database}.${process.pid}.tmp`
  let outcome: CopyOutcome
  try {
    outcome = await copyAndPublish(paths, workDirectory, options)
  } catch (error) {
    await fs.rm(workDirectory, { recursive: true, force: true }).catch(() => undefined)
    if (error instanceof V2DatabaseSeedError) throw error
    throw new V2DatabaseSeedError(
      `Could not copy your chats to the new version: ${asError(error).message}`,
      { cause: asError(error) },
    )
  }
  await fs.rm(workDirectory, { recursive: true, force: true }).catch((error) => {
    console.warn("Could not remove the temporary copy of your chats:", asError(error).message)
  })
  if (outcome.kind !== "seeded") return outcome
  return { ...outcome, sourceBytes, totalMs: performance.now() - started }
}

export type V2DatabaseLock = {
  readonly key: string
  readonly dir: string
}

export async function v2DatabaseLock(v2Database: string, name: string): Promise<V2DatabaseLock> {
  const directory = await fs
    .realpath(path.dirname(v2Database))
    .catch(() => path.resolve(path.dirname(v2Database)))
  return {
    key: `${name}:${path.join(directory, path.basename(v2Database))}`,
    dir: path.join(directory, LOCK_DIRECTORY_NAME),
  }
}

export async function seedV2Database(
  paths: V2DatabaseSeedPaths,
  options: V2DatabaseSeedOptions = {},
): Promise<V2DatabaseSeedResult> {
  if (await isInitializedDatabase(paths.v2Database)) return { kind: "present" }
  if ((await fileSize(paths.v1Database)) === undefined) return { kind: "no-source" }
  options.onUpgrade?.()
  await fs.mkdir(path.dirname(paths.v2Database), { recursive: true })
  const lock = await v2DatabaseLock(paths.v2Database, SEED_LOCK_NAME)
  return Flock.withLock(lock.key, () => copyUnderLock(paths, options), { dir: lock.dir })
}

export function isV2DatabaseUpgrade(result: V2DatabaseSeedResult) {
  return result.kind !== "present" && result.kind !== "no-source"
}

type SeedAttempt = { readonly pending: Promise<V2DatabaseSeedResult>; failedAt?: number }

const seeded = new Map<string, SeedAttempt>()

export function ensureV2DatabaseSeeded(
  paths: V2DatabaseSeedPaths,
  options: V2DatabaseSeedOptions = {},
): Promise<V2DatabaseSeedResult> {
  const key = path.resolve(paths.v2Database)
  const existing = seeded.get(key)
  if (
    existing &&
    (existing.failedAt === undefined || Date.now() - existing.failedAt < SEED_RETRY_DELAY_MS)
  )
    return existing.pending
  const attempt: SeedAttempt = { pending: seedV2Database(paths, options) }
  seeded.set(key, attempt)
  void attempt.pending.then(
    (result) => {
      if (!isV2DatabaseUpgrade(result) && seeded.get(key) === attempt) seeded.delete(key)
    },
    () => {
      attempt.failedAt = Date.now()
    },
  )
  return attempt.pending
}
