#!/usr/bin/env bun

import os from "node:os"
import path from "node:path"
import { Database } from "bun:sqlite"
import {
  BUDDY_APP_NAME,
  BUDDY_ENV,
  BUDDY_OPENCODE_DB_FILENAME,
  BUDDY_OPENCODE_RUNTIME_DIRECTORY_NAME,
  RUNTIME_ROOT_SEGMENTS,
  XDG_DEFAULT_SEGMENTS,
  XDG_ENV,
} from "@buddy/script/storage-env"

const TRACE_SCHEMA_VERSION = 1
const JSON_INDENT_SPACES = 2
const SQLITE_INTERNAL_TABLE_PREFIX = "sqlite_"
const DEV_APP_ID = "ai.buddy.desktop.dev"
const DEV_XDG_DIRECTORY_NAME = "xdg"
const CLI_FLAGS = {
  channel: "--channel",
  database: "--database",
  output: "--output",
  sessionID: "--session-id",
  title: "--title",
  userData: "--user-data",
} as const
const TRACE_CHANNELS = ["dev", "prod"] as const

type SqliteValue = bigint | number | string | Uint8Array | null
type DatabaseRow = Record<string, SqliteValue>

type SessionLookupRow = {
  directory: string
  id: string
  time_created: number
  time_updated: number
  title: string
}

type TableNameRow = {
  name: string
}

type TableColumnRow = {
  name: string
}

type CliOptions = {
  channel: TraceChannel
  databasePath: string
  outputPath: string
  selector:
    | {
        kind: "session-id"
        value: string
      }
    | {
        kind: "title"
        value: string
      }
}

type TraceChannel = (typeof TRACE_CHANNELS)[number]

type SessionTrace = {
  exportedAt: string
  schemaVersion: number
  selector: {
    requestedSessionID?: string
    requestedTitle?: string
    resolvedSessionID: string
  }
  session: Record<string, unknown>
  sessionTables: Record<string, Array<Record<string, unknown>>>
  durableEvents: Array<Record<string, unknown>>
  eventSequence: Record<string, unknown> | null
  source: {
    channel: TraceChannel
    databasePath: string
    mode: "read-only"
  }
}

await main()

async function main(): Promise<void> {
  const options = parseCliOptions(process.argv.slice(2))
  const database = new Database(options.databasePath, {
    create: false,
    readonly: true,
  })

  try {
    const sessionID = resolveSessionID(database, options.selector)
    const trace = exportSessionTrace({
      channel: options.channel,
      database,
      databasePath: options.databasePath,
      selector: options.selector,
      sessionID,
    })
    const serialized = `${JSON.stringify(trace, null, JSON_INDENT_SPACES)}\n`
    await Bun.write(options.outputPath, serialized)
    console.log(
      JSON.stringify({
        bytes: Buffer.byteLength(serialized),
        outputPath: path.resolve(options.outputPath),
        sessionID,
      }),
    )
  } finally {
    database.close()
  }
}

function exportSessionTrace(input: {
  channel: TraceChannel
  database: Database
  databasePath: string
  selector: CliOptions["selector"]
  sessionID: string
}): SessionTrace {
  const session = input.database
    .query<DatabaseRow, [string]>("select * from session where id = ?")
    .get(input.sessionID)

  if (!session) {
    throw new Error(`Session does not exist: ${input.sessionID}`)
  }

  const sessionTables: Record<string, Array<Record<string, unknown>>> = {}
  for (const table of listSessionScopedTables(input.database)) {
    sessionTables[table.name] = readSessionTable(input.database, table, input.sessionID)
  }

  const durableEvents = input.database
    .query<DatabaseRow, [string]>(
      "select * from event where aggregate_id = ? order by seq, id",
    )
    .all(input.sessionID)
    .map(normalizeRow)

  const eventSequence =
    input.database
      .query<DatabaseRow, [string]>("select * from event_sequence where aggregate_id = ?")
      .get(input.sessionID) ?? null

  return {
    schemaVersion: TRACE_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    source: {
      channel: input.channel,
      databasePath: path.resolve(input.databasePath),
      mode: "read-only",
    },
    selector:
      input.selector.kind === "title"
        ? {
            requestedTitle: input.selector.value,
            resolvedSessionID: input.sessionID,
          }
        : {
            requestedSessionID: input.selector.value,
            resolvedSessionID: input.sessionID,
          },
    session: normalizeRow(session),
    sessionTables,
    durableEvents,
    eventSequence: eventSequence ? normalizeRow(eventSequence) : null,
  }
}

function resolveSessionID(database: Database, selector: CliOptions["selector"]): string {
  if (selector.kind === "session-id") {
    return selector.value
  }

  const matches = database
    .query<SessionLookupRow, [string]>(
      `
        select id, title, directory, time_created, time_updated
        from session
        where title = ? collate nocase
        order by time_updated desc, id
      `,
    )
    .all(selector.value)

  if (matches.length === 0) {
    throw new Error(`No production session has the exact title: ${selector.value}`)
  }

  if (matches.length > 1) {
    throw new Error(
      `Multiple production sessions have the title "${selector.value}". ` +
        `Use ${CLI_FLAGS.sessionID} with one of these candidates:\n${JSON.stringify(
          matches,
          null,
          JSON_INDENT_SPACES,
        )}`,
    )
  }

  return matches[0]!.id
}

function listSessionScopedTables(database: Database): Array<{
  columns: string[]
  name: string
}> {
  const tables = database
    .query<TableNameRow, []>(
      `
        select name
        from sqlite_master
        where type = 'table'
          and name not like '${SQLITE_INTERNAL_TABLE_PREFIX}%'
        order by name
      `,
    )
    .all()

  return tables.flatMap((table) => {
    if (table.name === "session") return []

    const columns = database
      .query<TableColumnRow, []>(`pragma table_info(${quoteIdentifier(table.name)})`)
      .all()
      .map((column) => column.name)

    if (!columns.includes("session_id")) return []
    return [{ name: table.name, columns }]
  })
}

function readSessionTable(
  database: Database,
  table: {
    columns: string[]
    name: string
  },
  sessionID: string,
): Array<Record<string, unknown>> {
  const orderBy = resolveOrderBy(table.columns)
  const sql =
    `select * from ${quoteIdentifier(table.name)} where session_id = ?` +
    (orderBy ? ` order by ${orderBy}` : "")

  return database
    .query<DatabaseRow, [string]>(sql)
    .all(sessionID)
    .map(normalizeRow)
}

function resolveOrderBy(columns: string[]): string | undefined {
  if (columns.includes("seq") && columns.includes("id")) return "seq, id"
  if (columns.includes("time_created") && columns.includes("id")) return "time_created, id"
  if (columns.includes("time_created")) return "time_created"
  if (columns.includes("id")) return "id"
  return undefined
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`
}

function normalizeRow(row: DatabaseRow): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, normalizeValue(value)]),
  )
}

function normalizeValue(value: SqliteValue): unknown {
  if (typeof value === "bigint") return value.toString()
  if (value instanceof Uint8Array) {
    return {
      encoding: "base64",
      value: Buffer.from(value).toString("base64"),
    }
  }
  if (typeof value !== "string") return value

  const trimmed = value.trimStart()
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return value

  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function parseCliOptions(args: string[]): CliOptions {
  let channel: TraceChannel = "prod"
  let configuredDatabasePath: string | undefined
  let outputPath: string | undefined
  let sessionID: string | undefined
  let title: string | undefined
  let userDataPath: string | undefined

  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index]
    const value = args[index + 1]
    if (!value) {
      throw new Error(`Missing value for ${flag ?? "unknown argument"}`)
    }

    if (flag === CLI_FLAGS.channel) {
      if (!isTraceChannel(value)) {
        throw new Error(
          `Unsupported channel "${value}". Expected one of: ${TRACE_CHANNELS.join(", ")}`,
        )
      }
      channel = value
    } else if (flag === CLI_FLAGS.database) {
      configuredDatabasePath = value
    } else if (flag === CLI_FLAGS.output) {
      outputPath = value
    } else if (flag === CLI_FLAGS.sessionID) {
      sessionID = value
    } else if (flag === CLI_FLAGS.title) {
      title = value
    } else if (flag === CLI_FLAGS.userData) {
      userDataPath = value
    } else {
      throw new Error(`Unknown argument: ${flag}`)
    }
    index += 1
  }

  if (!outputPath) {
    throw new Error(`Required argument missing: ${CLI_FLAGS.output}`)
  }
  if (sessionID && title) {
    throw new Error(
      `Pass exactly one selector: ${CLI_FLAGS.sessionID} or ${CLI_FLAGS.title}`,
    )
  }
  if (!(sessionID || title)) {
    throw new Error(
      `Pass exactly one selector: ${CLI_FLAGS.sessionID} or ${CLI_FLAGS.title}`,
    )
  }

  return {
    channel,
    databasePath: path.resolve(
      configuredDatabasePath ?? resolveDefaultDatabasePath({ channel, userDataPath }),
    ),
    outputPath: path.resolve(outputPath),
    selector: sessionID
      ? { kind: "session-id", value: sessionID }
      : { kind: "title", value: title },
  }
}

function resolveDefaultDatabasePath(input: {
  channel: TraceChannel
  userDataPath: string | undefined
}): string {
  if (input.channel === "dev") {
    const userDataPath =
      resolveConfiguredPath(input.userDataPath) ?? resolveDefaultDevUserDataPath()
    return path.join(
      userDataPath,
      DEV_XDG_DIRECTORY_NAME,
      RUNTIME_ROOT_SEGMENTS.data,
      BUDDY_APP_NAME,
      BUDDY_OPENCODE_RUNTIME_DIRECTORY_NAME,
      BUDDY_OPENCODE_DB_FILENAME,
    )
  }

  const configuredBuddyDataDir = resolveConfiguredPath(process.env[BUDDY_ENV.DATA_DIR])
  const configuredXdgDataHome = resolveConfiguredPath(process.env[XDG_ENV.DATA_HOME])
  const buddyDataDir =
    configuredBuddyDataDir ??
    path.join(
      configuredXdgDataHome ?? path.join(os.homedir(), ...XDG_DEFAULT_SEGMENTS.data),
      BUDDY_APP_NAME,
    )

  return path.join(
    buddyDataDir,
    BUDDY_OPENCODE_RUNTIME_DIRECTORY_NAME,
    BUDDY_OPENCODE_DB_FILENAME,
  )
}

function resolveDefaultDevUserDataPath(): string {
  if (process.platform === "win32") {
    const appDataPath =
      resolveConfiguredPath(process.env.APPDATA) ??
      path.join(os.homedir(), "AppData", "Roaming")
    return path.join(appDataPath, DEV_APP_ID)
  }

  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", DEV_APP_ID)
  }

  const appDataPath =
    resolveConfiguredPath(process.env[XDG_ENV.CONFIG_HOME]) ??
    path.join(os.homedir(), ...XDG_DEFAULT_SEGMENTS.config)
  return path.join(appDataPath, DEV_APP_ID)
}

function isTraceChannel(value: string): value is TraceChannel {
  return TRACE_CHANNELS.some((channel) => channel === value)
}

function resolveConfiguredPath(value: string | undefined): string | undefined {
  const configured = value?.trim()
  if (!configured || configured === "undefined") return undefined
  return configured
}
