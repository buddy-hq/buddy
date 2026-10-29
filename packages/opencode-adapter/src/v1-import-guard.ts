import { existsSync } from "node:fs"
import { parseJsonObjectFromText } from "@buddy/transcript-contract/parse-external"
import { SessionV1 } from "@opencode/schema/session-v1"
import { Option, Schema } from "effect"
import z from "zod"
import { Database } from "./legacy-migration-database"
import type { SeedSqlite } from "./seed-sqlite"

export const V1_IMPORT_GUARD_TABLE = "_buddy_v1_import"
const MIGRATION_STATE_KEY = "migration.v1-v2"
const ATTEMPT_KEY = "attempt"
const SKIPPED_KEY = "skipped"
const CONTENT_KEY = "content"
const COMMANDS_KEY = "commands"
const FAILURES_BEFORE_SKIP = 2
const INTERRUPTIONS_BEFORE_SKIP = 3
const MAXIMUM_SKIPPED_CHATS = 3
const STATUS_POLL_INTERVAL_MS = 1_000
const BUSY_TIMEOUT_MS = 5_000

const UNCOUNTED_FAILURE_PATTERNS = [
  "SQLITE_BUSY",
  "SQLITE_LOCKED",
  "SQLITE_FULL",
  "SQLITE_IOERR",
  "SQLITE_INTERRUPT",
  "SQLITE_NOMEM",
  "SQLITE_CORRUPT",
  "SQLITE_CANTOPEN",
  "SQLITE_READONLY",
  "SQLITE_PERM",
  "SQLITE_NOTADB",
  "SQLITE_PROTOCOL",
  "database is locked",
  "database table is locked",
  "database or disk is full",
  "disk I/O error",
  "database disk image is malformed",
  "unable to open database file",
  "attempt to write a readonly database",
  "file is not a database",
  "interrupted",
  "out of memory",
] as const

const attemptSchema = z.object({
  cursor: z.string().nullable(),
  candidate: z.string(),
  running: z.boolean(),
  failures: z.number().int().nonnegative(),
  interruptions: z.number().int().nonnegative(),
  lastError: z.string().nullable(),
})
export type V1ImportAttempt = z.infer<typeof attemptSchema>

const skippedChatSchema = z.object({ id: z.string(), at: z.number(), error: z.string() })
export type V1ImportSkippedChat = z.infer<typeof skippedChatSchema>

const contentLossSchema = z.object({
  sessionID: z.string(),
  subtaskPrompts: z.number().int().nonnegative(),
  subtaskResults: z.number().int().nonnegative(),
  assistantFiles: z.number().int().nonnegative(),
})
export type V1ImportContentLoss = z.infer<typeof contentLossSchema>

const commandDisplaySchema = z.object({ messageID: z.string(), display: z.string() })
const commandCandidateRowSchema = z.object({ messageID: z.string() }).catch({ messageID: "" })
const commandMessageRowSchema = z.object({ id: z.string(), sessionID: z.string(), data: z.string().nullable() }).catch({ id: "", sessionID: "", data: null })
const commandPartRowSchema = z.object({ id: z.string(), messageID: z.string(), sessionID: z.string(), data: z.string().nullable() }).catch({ id: "", messageID: "", sessionID: "", data: null })
const decodeV1Message = Schema.decodeUnknownOption(SessionV1.Info)
const decodeV1Part = Schema.decodeUnknownOption(SessionV1.Part)
const COMMAND_BATCH_SIZE = 200

const migrationStateSchema = z.union([
  z.object({ phase: z.literal("completed") }),
  z.object({ phase: z.literal("sessions"), cursor: z.string().optional() }),
])

const valueRowSchema = z.object({ value: z.string() })
const idRowSchema = z.object({ id: z.string() })
const nameRowSchema = z.object({ name: z.string() })
const sessionCountRowSchema = z.object({ sessionID: z.string(), count: z.number() })

export type V1ImportStatus =
  | { readonly status: "required" | "completed" }
  | { readonly status: "running"; readonly progress: { readonly label: string; readonly numerator?: number; readonly denominator?: number } }
  | { readonly status: "error"; readonly error: string }

export type V1ImportRecord = {
  readonly skipped: readonly V1ImportSkippedChat[]
  readonly content: readonly V1ImportContentLoss[]
}

const EMPTY_RECORD: V1ImportRecord = { skipped: [], content: [] }

export type V1ImportStatusSource = {
  readonly status: () => Promise<V1ImportStatus>
}

export type V1ImportGuard = {
  readonly importRan: boolean
  readonly record: () => V1ImportRecord
  readonly hasCommandDisplays: () => boolean
  readonly commandDisplay: (messageID: string) => string | undefined
  readonly status: () => V1ImportStatus | undefined
  readonly watch: (source: V1ImportStatusSource) => void
  readonly close: () => Promise<void>
}

export type V1ImportGuardOptions = {
  readonly onSettled?: () => void
}

const PART_TYPE = "CASE WHEN json_valid(p.data) THEN json_extract(p.data, '$.type') END"
const PART_TOOL = "CASE WHEN json_valid(p.data) THEN json_extract(p.data, '$.tool') END"
const PART_IGNORED = "CASE WHEN json_valid(p.data) THEN coalesce(json_extract(p.data, '$.ignored'), 0) ELSE 0 END"
const MESSAGE_ROLE = "CASE WHEN json_valid(m.data) THEN json_extract(m.data, '$.role') END"
const MESSAGE_PARENT = "CASE WHEN json_valid(m.data) THEN json_extract(m.data, '$.parentID') END"

const SUBTASK_PROMPTS_SQL = `
  SELECT m.session_id AS sessionID, COUNT(*) AS count FROM message m
  WHERE ${MESSAGE_ROLE} = 'user'
    AND EXISTS (SELECT 1 FROM part p WHERE p.message_id = m.id AND ${PART_TYPE} = 'subtask')
    AND NOT EXISTS (
      SELECT 1 FROM part p WHERE p.message_id = m.id
        AND (${PART_TYPE} IN ('file', 'agent', 'compaction') OR (${PART_TYPE} = 'text' AND ${PART_IGNORED} = 0))
    )
  GROUP BY m.session_id`

const SUBTASK_RESULTS_SQL = `
  SELECT m.session_id AS sessionID, COUNT(*) AS count FROM message m
  WHERE ${MESSAGE_ROLE} = 'assistant'
    AND EXISTS (SELECT 1 FROM part p WHERE p.message_id = m.id AND ${PART_TYPE} = 'tool' AND ${PART_TOOL} = 'task')
    AND EXISTS (
      SELECT 1 FROM part p WHERE p.session_id = m.session_id AND p.message_id = ${MESSAGE_PARENT} AND ${PART_TYPE} = 'subtask'
    )
  GROUP BY m.session_id`

const ASSISTANT_FILES_SQL = `
  SELECT p.session_id AS sessionID, COUNT(*) AS count FROM part p JOIN message m ON m.id = p.message_id
  WHERE ${PART_TYPE} = 'file' AND ${MESSAGE_ROLE} = 'assistant'
  GROUP BY p.session_id`

const COMMAND_CANDIDATES_SQL = `
  SELECT DISTINCT p.message_id AS messageID FROM part p
  WHERE ${PART_TYPE} = 'text' AND ${PART_IGNORED} != 0
  ORDER BY p.message_id`

const CREATE_GUARD_TABLE_SQL = `CREATE TABLE IF NOT EXISTS ${V1_IMPORT_GUARD_TABLE} (key TEXT PRIMARY KEY, value TEXT NOT NULL)`

export async function writeV1ImportContentCounts(db: SeedSqlite): Promise<readonly V1ImportContentLoss[]> {
  const [prompts, results, files] = await Promise.all([
    db.all(sessionCountRowSchema, SUBTASK_PROMPTS_SQL),
    db.all(sessionCountRowSchema, SUBTASK_RESULTS_SQL),
    db.all(sessionCountRowSchema, ASSISTANT_FILES_SQL),
  ])
  const bySession = new Map<string, V1ImportContentLoss>()
  const entry = (sessionID: string) => {
    const existing = bySession.get(sessionID)
    if (existing) return existing
    const created = { sessionID, subtaskPrompts: 0, subtaskResults: 0, assistantFiles: 0 }
    bySession.set(sessionID, created)
    return created
  }
  for (const row of prompts) bySession.set(row.sessionID, { ...entry(row.sessionID), subtaskPrompts: row.count })
  for (const row of results) bySession.set(row.sessionID, { ...entry(row.sessionID), subtaskResults: row.count })
  for (const row of files) bySession.set(row.sessionID, { ...entry(row.sessionID), assistantFiles: row.count })
  const content = [...bySession.values()].toSorted((left, right) => left.sessionID.localeCompare(right.sessionID))
  await db.exec(CREATE_GUARD_TABLE_SQL)
  await db.run(`INSERT OR REPLACE INTO ${V1_IMPORT_GUARD_TABLE} (key, value) VALUES (?, ?)`, [CONTENT_KEY, JSON.stringify(content)])
  return content
}

function importedCommandDisplay(message: z.infer<typeof commandMessageRowSchema>, rows: readonly z.infer<typeof commandPartRowSchema>[]): string | undefined {
  const info = message.data === null ? undefined : parseJsonObjectFromText(message.data)
  const decoded = info && Option.getOrUndefined(decodeV1Message({ ...info, id: message.id, sessionID: message.sessionID }))
  if (decoded?.role !== "user") return undefined
  const parts = rows
    .toSorted((left, right) => left.id.localeCompare(right.id))
    .flatMap((row) => {
      const value = row.data === null ? undefined : parseJsonObjectFromText(row.data)
      const part = value && Option.getOrUndefined(decodeV1Part({ ...value, id: row.id, messageID: row.messageID, sessionID: row.sessionID }))
      return part ? [part] : []
    })
  if (parts.some((part) => part.type === "compaction" || part.type === "agent")) return undefined
  if (parts.some((part) => part.type === "file" && (!part.url.startsWith("data:") || part.url.includes(",")))) return undefined
  const visible = parts.filter((part) => part.type === "text" && !part.ignored)
  if (visible.some((part) => part.type === "text" && !part.synthetic) || visible.length === 0) return undefined
  const display = parts.find((part) => part.type === "text" && part.ignored === true && part.text.trim() !== "")
  return display?.type === "text" ? display.text : undefined
}

export async function writeV1ImportCommandDisplays(db: SeedSqlite): Promise<void> {
  const candidates = (await db.all(commandCandidateRowSchema, COMMAND_CANDIDATES_SQL)).map((row) => row.messageID).filter((id) => id !== "")
  const displays: { messageID: string; display: string }[] = []
  for (let start = 0; start < candidates.length; start += COMMAND_BATCH_SIZE) {
    const batch = candidates.slice(start, start + COMMAND_BATCH_SIZE)
    const placeholders = batch.map(() => "?").join(", ")
    const [messages, parts] = await Promise.all([
      db.all(commandMessageRowSchema, `SELECT id, session_id AS sessionID, data FROM message WHERE id IN (${placeholders})`, batch),
      db.all(commandPartRowSchema, `SELECT id, message_id AS messageID, session_id AS sessionID, data FROM part WHERE message_id IN (${placeholders})`, batch),
    ])
    const byMessage = Map.groupBy(parts, (part) => part.messageID)
    for (const message of messages) {
      const display = importedCommandDisplay(message, byMessage.get(message.id) ?? [])
      if (display !== undefined) displays.push({ messageID: message.id, display })
    }
  }
  await db.exec(CREATE_GUARD_TABLE_SQL)
  await db.run(`INSERT OR REPLACE INTO ${V1_IMPORT_GUARD_TABLE} (key, value) VALUES (?, ?)`, [COMMANDS_KEY, JSON.stringify(displays)])
}

function failureCauses(error: string): readonly string[] {
  return error.split(/\r?\nCaused by: /u).filter((segment) => !segment.trimStart().startsWith("Failed query:"))
}

export function isUncountedV1ImportFailure(error: string): boolean {
  return failureCauses(error).some((segment) => {
    const text = segment.toLowerCase()
    return UNCOUNTED_FAILURE_PATTERNS.some((pattern) => text.includes(pattern.toLowerCase()))
  })
}

function hasTable(db: Database, name: string): boolean {
  return nameRowSchema.safeParse(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name)).success
}

function parseJsonText<TValue>(text: string, schema: z.ZodType<TValue>): TValue | undefined {
  try {
    const parsed = schema.safeParse(JSON.parse(text))
    return parsed.success ? parsed.data : undefined
  } catch {
    return undefined
  }
}

function readGuardValue<TValue>(db: Database, key: string, schema: z.ZodType<TValue>): TValue | undefined {
  if (!hasTable(db, V1_IMPORT_GUARD_TABLE)) return undefined
  const row = valueRowSchema.safeParse(db.prepare(`SELECT value FROM ${V1_IMPORT_GUARD_TABLE} WHERE key = ?`).get(key))
  return row.success ? parseJsonText(row.data.value, schema) : undefined
}

function writeGuardValue<TValue>(db: Database, key: string, value: TValue) {
  db.exec(CREATE_GUARD_TABLE_SQL)
  db.prepare(`INSERT OR REPLACE INTO ${V1_IMPORT_GUARD_TABLE} (key, value) VALUES (?, ?)`).run(key, JSON.stringify(value))
}

function deleteGuardValue(db: Database, key: string) {
  if (!hasTable(db, V1_IMPORT_GUARD_TABLE)) return
  db.prepare(`DELETE FROM ${V1_IMPORT_GUARD_TABLE} WHERE key = ?`).run(key)
}

function readRecord(db: Database): V1ImportRecord {
  return {
    skipped: readGuardValue(db, SKIPPED_KEY, z.array(skippedChatSchema)) ?? [],
    content: readGuardValue(db, CONTENT_KEY, z.array(contentLossSchema)) ?? [],
  }
}

export type V1ImportPosition = {
  readonly stateText: string
  readonly cursor: string | null
  readonly candidate: string
}

export function v1ImportMayRun(db: Database): boolean {
  if (!hasTable(db, "session")) return false
  if (!hasTable(db, "kv")) return true
  const row = valueRowSchema.safeParse(db.prepare("SELECT value FROM kv WHERE key = ?").get(MIGRATION_STATE_KEY))
  if (!row.success) return true
  return parseJsonText(row.data.value, migrationStateSchema)?.phase !== "completed"
}

export function readV1ImportPosition(db: Database): V1ImportPosition | undefined {
  if (!hasTable(db, "kv") || !hasTable(db, "session")) return undefined
  const row = valueRowSchema.safeParse(db.prepare("SELECT value FROM kv WHERE key = ?").get(MIGRATION_STATE_KEY))
  if (!row.success) return undefined
  const state = parseJsonText(row.data.value, migrationStateSchema)
  if (state?.phase !== "sessions") return undefined
  const cursor = state.cursor ?? null
  const next = idRowSchema.safeParse(
    cursor === null
      ? db.prepare("SELECT id FROM session ORDER BY id DESC LIMIT 1").get()
      : db.prepare("SELECT id FROM session WHERE id < ? ORDER BY id DESC LIMIT 1").get(cursor),
  )
  if (!next.success) return undefined
  return { stateText: row.data.value, cursor, candidate: next.data.id }
}

function freshAttempt(position: V1ImportPosition): V1ImportAttempt {
  return { cursor: position.cursor, candidate: position.candidate, running: false, failures: 0, interruptions: 0, lastError: null }
}

function matches(attempt: V1ImportAttempt | undefined, position: V1ImportPosition): attempt is V1ImportAttempt {
  return attempt !== undefined && attempt.cursor === position.cursor && attempt.candidate === position.candidate
}

export function skipV1ImportCandidate(db: Database, position: V1ImportPosition, attempt: V1ImportAttempt, skipped: readonly V1ImportSkippedChat[]) {
  db.exec("BEGIN IMMEDIATE")
  try {
    const moved = db
      .prepare("UPDATE kv SET value = ?, time_updated = ? WHERE key = ? AND value = ?")
      .run(JSON.stringify({ phase: "sessions", cursor: position.candidate }), Date.now(), MIGRATION_STATE_KEY, position.stateText)
    if (moved?.changes === 1) {
      const error = attempt.lastError ?? `The import stopped ${attempt.interruptions} times on this chat without finishing`
      writeGuardValue(db, SKIPPED_KEY, [...skipped, { id: position.candidate, at: Date.now(), error }])
      deleteGuardValue(db, ATTEMPT_KEY)
    }
    db.exec("COMMIT")
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  }
}

export function prepareV1ImportAttempt(db: Database): V1ImportAttempt | undefined {
  const position = readV1ImportPosition(db)
  if (!position) return undefined
  const stored = readGuardValue(db, ATTEMPT_KEY, attemptSchema)
  const current = matches(stored, position)
    ? { ...stored, interruptions: stored.running ? stored.interruptions + 1 : stored.interruptions }
    : freshAttempt(position)
  const skipped = readGuardValue(db, SKIPPED_KEY, z.array(skippedChatSchema)) ?? []
  const eligible = current.failures >= FAILURES_BEFORE_SKIP || current.interruptions >= INTERRUPTIONS_BEFORE_SKIP
  if (eligible && skipped.length < MAXIMUM_SKIPPED_CHATS) {
    skipV1ImportCandidate(db, position, current, skipped)
    const next = readV1ImportPosition(db)
    if (!next) return undefined
    const marked = { ...freshAttempt(next), running: true }
    writeGuardValue(db, ATTEMPT_KEY, marked)
    return marked
  }
  const marked = { ...current, running: true }
  writeGuardValue(db, ATTEMPT_KEY, marked)
  return marked
}

export function recordV1ImportOutcome(db: Database, status: V1ImportStatus) {
  if (status.status === "completed") {
    deleteGuardValue(db, ATTEMPT_KEY)
    return
  }
  if (status.status !== "error") return
  const stored = readGuardValue(db, ATTEMPT_KEY, attemptSchema)
  if (isUncountedV1ImportFailure(status.error)) {
    if (stored) writeGuardValue(db, ATTEMPT_KEY, { ...stored, running: false })
    return
  }
  const position = readV1ImportPosition(db)
  if (!position) {
    if (stored) writeGuardValue(db, ATTEMPT_KEY, { ...stored, running: false })
    return
  }
  const base = matches(stored, position) ? stored : freshAttempt(position)
  writeGuardValue(db, ATTEMPT_KEY, { ...base, running: false, failures: base.failures + 1, lastError: status.error })
}

export function releaseV1ImportAttempt(db: Database) {
  const stored = readGuardValue(db, ATTEMPT_KEY, attemptSchema)
  if (stored?.running) writeGuardValue(db, ATTEMPT_KEY, { ...stored, running: false })
}

function openGuardDatabase(databasePath: string): Database {
  const db = new Database(databasePath)
  try {
    db.exec(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`)
  } catch (error) {
    db.close()
    throw error
  }
  return db
}

function withGuardDatabase<TResult>(databasePath: string, run: (db: Database) => TResult): TResult {
  const db = openGuardDatabase(databasePath)
  try {
    return run(db)
  } finally {
    db.close()
  }
}

export function v1ImportMayRunAt(databasePath: string): boolean {
  if (!existsSync(databasePath)) return false
  return withGuardDatabase(databasePath, v1ImportMayRun)
}

export function v1ImportNeedsLockAt(databasePath: string): boolean {
  if (!existsSync(databasePath)) return true
  return withGuardDatabase(databasePath, (db) => !hasTable(db, "session") || v1ImportMayRun(db))
}

export function readV1ImportRecord(databasePath: string): V1ImportRecord {
  if (!existsSync(databasePath)) return EMPTY_RECORD
  return withGuardDatabase(databasePath, readRecord)
}

export function readV1ImportCommandDisplays(databasePath: string): ReadonlyMap<string, string> {
  if (!existsSync(databasePath)) return new Map()
  const displays = withGuardDatabase(databasePath, (db) => readGuardValue(db, COMMANDS_KEY, z.array(commandDisplaySchema))) ?? []
  return new Map(displays.map((entry) => [entry.messageID, entry.display]))
}

export function readV1ImportEntryAt<TValue>(databasePath: string, key: string, schema: z.ZodType<TValue>): TValue | undefined {
  if (!existsSync(databasePath)) return undefined
  return withGuardDatabase(databasePath, (db) => readGuardValue(db, key, schema))
}

export function writeV1ImportEntryAt<TValue>(databasePath: string, key: string, value: TValue) {
  withGuardDatabase(databasePath, (db) => writeGuardValue(db, key, value))
}

function errorMessage<TError>(error: TError): string {
  return error instanceof Error ? error.message : String(error)
}

function bestEffort<TResult>(failure: string, run: () => TResult): TResult | undefined {
  try {
    return run()
  } catch (error) {
    console.warn(failure, errorMessage(error))
    return undefined
  }
}

function prepareLaunch(databasePath: string, importRan: boolean): boolean {
  if (!importRan) return false
  return bestEffort("Could not prepare the v1 chat import attempt:", () => {
    withGuardDatabase(databasePath, prepareV1ImportAttempt)
    return true
  }) ?? false
}

export function startV1ImportGuard(databasePath: string, options: V1ImportGuardOptions = {}): V1ImportGuard {
  const importRan = bestEffort("Could not check whether the v1 chat import may run:", () => v1ImportMayRunAt(databasePath)) ?? true
  const prepared = prepareLaunch(databasePath, importRan)
  let record = bestEffort("Could not read the v1 chat import record:", () => readV1ImportRecord(databasePath))
  let commandDisplays: ReadonlyMap<string, string> | undefined
  let latest: V1ImportStatus | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let settled = false
  let closed = false

  const loadCommandDisplays = () => {
    commandDisplays ??= bestEffort("Could not read the imported v1 command texts:", () => readV1ImportCommandDisplays(databasePath)) ?? new Map()
    return commandDisplays
  }

  const poll = async (source: V1ImportStatusSource) => {
    timer = undefined
    if (closed) return
    try {
      latest = await source.status()
    } catch (error) {
      if (!closed) console.warn("Could not read the v1 chat import status:", errorMessage(error))
    }
    if (closed) return
    if (latest?.status === "completed" || latest?.status === "error") {
      const outcome = latest
      if (!settled) {
        settled = true
        if (prepared) {
          bestEffort("Could not record the v1 chat import outcome:", () => withGuardDatabase(databasePath, (database) => recordV1ImportOutcome(database, outcome)))
        }
        options.onSettled?.()
      }
      return
    }
    timer = setTimeout(() => void poll(source), STATUS_POLL_INTERVAL_MS)
    timer.unref?.()
  }

  return {
    importRan,
    record() {
      if (!record) {
        try {
          record = readV1ImportRecord(databasePath)
        } catch {
          return EMPTY_RECORD
        }
      }
      return record
    },
    hasCommandDisplays() {
      return loadCommandDisplays().size > 0
    },
    commandDisplay(messageID) {
      return loadCommandDisplays().get(messageID)
    },
    status() {
      if (latest?.status === "error" && !closed) {
        const pending = bestEffort("Could not check whether another window finished the v1 chat import:", () => v1ImportMayRunAt(databasePath))
        if (pending === false) {
          latest = { status: "completed" }
          record = undefined
        }
      }
      return latest
    },
    watch(source) {
      if (closed || timer) return
      void poll(source)
    },
    async close() {
      if (closed) return
      closed = true
      if (timer) clearTimeout(timer)
      timer = undefined
      if (settled) return
      settled = true
      if (prepared) bestEffort("Could not release the v1 chat import attempt:", () => withGuardDatabase(databasePath, releaseV1ImportAttempt))
    },
  }
}
