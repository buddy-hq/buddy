import { mkdtemp, rm } from "node:fs/promises"
import { basename, join } from "node:path"

export type SqliteParameter = null | number | bigint | string | Uint8Array

export type ReadOnlyDatabase = {
  all(sql: string, parameters: readonly SqliteParameter[]): readonly unknown[]
  close(): void
}

export type OpenReadOnlyDatabase = (path: string) => ReadOnlyDatabase

export type DatabaseSnapshotRead<TValue> =
  | { readonly _tag: "read"; readonly value: TValue }
  | { readonly _tag: "failed"; readonly cause: unknown }

export type DatabaseSnapshotRequest<TValue> = {
  readonly databasePath: string
  readonly temporaryDirectory: string
  readonly openDatabase: OpenReadOnlyDatabase
  readonly read: (database: ReadOnlyDatabase) => TValue
}

const SNAPSHOT_DIRECTORY_PREFIX = "buddy-cookie-import-"

function useDatabase<TValue>(
  database: ReadOnlyDatabase,
  use: (database: ReadOnlyDatabase) => TValue,
): TValue {
  try {
    return use(database)
  } finally {
    database.close()
  }
}

// VACUUM INTO reads through SQLite's locking, WAL included, without writing the source.
// The copy is deleted before resolving so imported cookie data does not remain in the temp root.
export async function readDatabaseSnapshot<TValue>(
  request: DatabaseSnapshotRequest<TValue>,
): Promise<DatabaseSnapshotRead<TValue>> {
  let directory: string | undefined
  try {
    directory = await mkdtemp(join(request.temporaryDirectory, SNAPSHOT_DIRECTORY_PREFIX))
    const snapshotPath = join(directory, basename(request.databasePath))
    useDatabase(request.openDatabase(request.databasePath), (source) =>
      source.all("VACUUM INTO ?", [snapshotPath]),
    )
    return { _tag: "read", value: useDatabase(request.openDatabase(snapshotPath), request.read) }
  } catch (cause) {
    return { _tag: "failed", cause }
  } finally {
    if (directory !== undefined) {
      await rm(directory, { recursive: true, force: true }).catch(() => undefined)
    }
  }
}
