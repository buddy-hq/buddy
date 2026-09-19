import { Database } from "bun:sqlite"
import { afterEach, describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { nodeBrowserImportFiles } from "../src/main/browser-import/browser-import-files"
import type { BrowserImportHost } from "../src/main/browser-import/browser-import-host"
import {
  createBrowserImporter,
  type BrowserImportCookieDetails,
  type BrowserImportCookieSink,
} from "../src/main/browser-import/browser-importer"
import type { ReadOnlyDatabase } from "../src/main/browser-import/cookie-database"

const temporaryRoots: string[] = []

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function createTemporaryRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), "buddy-browser-import-test-"))
  temporaryRoots.push(root)
  return root
}

function openBunDatabase(databasePath: string): ReadOnlyDatabase {
  const database = new Database(databasePath, { readonly: true })
  return {
    all: (sql, parameters) => database.prepare(sql).all(...parameters),
    close: () => database.close(),
  }
}

function createTestHost(
  overrides: Partial<BrowserImportHost> & Pick<BrowserImportHost, "platform" | "home">,
): BrowserImportHost {
  return {
    path,
    localAppData: path.join(overrides.home, "AppData", "Local"),
    hostname: "buddy-test-host",
    temporaryDirectory: createTemporaryRoot(),
    files: nodeBrowserImportFiles,
    openDatabase: openBunDatabase,
    readKeychainPassword: async () => ({ _tag: "password", value: "fixture-secret" }),
    unprotectWindowsData: async () => ({ _tag: "failed" }),
    isProcessAlive: () => true,
    reportFailure: () => undefined,
    ...overrides,
  }
}

type RecordingSink = {
  readonly sink: BrowserImportCookieSink
  readonly written: BrowserImportCookieDetails[]
}

function recordingSink(): RecordingSink {
  const written: BrowserImportCookieDetails[] = []
  return {
    written,
    sink: {
      set: async (details) => {
        written.push(details)
      },
    },
  }
}

function chromeRoot(home: string): string {
  return path.join(home, "Library", "Application Support", "Google", "Chrome")
}

function createChromiumCookieSchema(database: Database): void {
  database.run("create table meta (key longvarchar not null unique primary key, value longvarchar)")
  database.run("insert into meta (key, value) values ('version', 14)")
  database.run(
    `create table cookies (host_key text not null, name text not null, value text not null,
      encrypted_value blob not null, path text not null, expires_utc integer not null,
      is_secure integer not null, is_httponly integer not null, samesite integer not null)`,
  )
}

function insertChromiumCookie(database: Database, name: string, value = "v"): void {
  database
    .prepare(
      `insert into cookies
        (host_key, name, value, encrypted_value, path, expires_utc, is_secure, is_httponly, samesite)
        values ('example.test', ?, ?, x'', '/', 0, 0, 0, 1)`,
    )
    .run(name, value)
}

function writeChromiumCookies(
  databasePath: string,
  cookies: readonly { readonly name: string; readonly value?: string }[],
): void {
  mkdirSync(path.dirname(databasePath), { recursive: true })
  const database = new Database(databasePath, { create: true })
  createChromiumCookieSchema(database)
  for (const cookie of cookies) insertChromiumCookie(database, cookie.name, cookie.value)
  database.close()
}

describe("browser import sources", () => {
  test("reports every supported import source so the renderer can apply availability policy", async () => {
    const importer = createBrowserImporter(
      createTestHost({ platform: "darwin", home: createTemporaryRoot() }),
    )

    expect((await importer.listSources()).map((source) => source.id)).toEqual([
      "chrome",
      "edge",
      "safari",
    ])
  })

  test("lists Chrome only once a profile holds a cookie store", async () => {
    const home = createTemporaryRoot()
    const root = chromeRoot(home)
    mkdirSync(path.join(root, "NativeMessagingHosts"), { recursive: true })
    mkdirSync(path.join(root, "Broken", "Cookies"), { recursive: true })
    const importer = createBrowserImporter(createTestHost({ platform: "darwin", home }))
    const chrome = async () =>
      (await importer.listSources()).find((source) => source.id === "chrome")

    expect(await chrome()).toEqual({
      id: "chrome",
      name: "Chrome",
      profiles: [],
      availability: { _tag: "unavailable", reason: "notInstalled" },
    })

    mkdirSync(path.join(root, "Profile 1", "Network"), { recursive: true })
    writeFileSync(path.join(root, "Profile 1", "Network", "Cookies"), "")
    expect(await chrome()).toEqual({
      id: "chrome",
      name: "Chrome",
      profiles: [{ id: "Profile 1", name: "Profile 1" }],
      availability: { _tag: "available" },
    })
  })

  test("lists profile cookie counts without asking for the decryption key", async () => {
    const home = createTemporaryRoot()
    const databasePath = path.join(chromeRoot(home), "Default", "Network", "Cookies")
    writeChromiumCookies(databasePath, [{ name: "session" }, { name: "preferences" }])
    let keychainReads = 0
    const importer = createBrowserImporter(
      createTestHost({
        platform: "darwin",
        home,
        temporaryDirectory: path.join(home, "missing", "temporary-directory"),
        readKeychainPassword: async () => {
          keychainReads += 1
          return { _tag: "password", value: "fixture-secret" }
        },
      }),
    )

    expect((await importer.listSources()).find((source) => source.id === "chrome")?.profiles).toEqual(
      [{ id: "Default", name: "Default", cookieCount: 2 }],
    )
    expect(keychainReads).toBe(0)
  })

  test("never reads a cookie store outside the profiles Chrome declares", async () => {
    const home = createTemporaryRoot()
    const root = chromeRoot(home)
    mkdirSync(path.join(root, "Default"), { recursive: true })
    writeFileSync(path.join(root, "Default", "Cookies"), "")
    writeFileSync(
      path.join(root, "Local State"),
      JSON.stringify({
        profile: {
          info_cache: {
            Default: { name: "You" },
            "../../../../secrets": { name: "Escape" },
            "a/b": { name: "Nested" },
            "..": { name: "Parent" },
          },
        },
      }),
    )
    const secrets = path.join(home, "secrets")
    mkdirSync(secrets, { recursive: true })
    writeFileSync(path.join(secrets, "Cookies"), "")
    const importer = createBrowserImporter(createTestHost({ platform: "darwin", home }))
    const { sink } = recordingSink()

    expect((await importer.listSources()).find((source) => source.id === "chrome")?.profiles).toEqual(
      [{ id: "Default", name: "You" }],
    )
    expect(
      await importer.importCookies({
        sourceID: "chrome",
        sourceProfileID: path.relative(root, secrets),
        cookies: sink,
      }),
    ).toEqual({ _tag: "failed", reason: "unknownSourceProfile" })
  })
})

describe("browser cookie import", () => {
  test("counts cookies the session rejects as skipped and keeps importing", async () => {
    const home = createTemporaryRoot()
    writeChromiumCookies(path.join(chromeRoot(home), "Default", "Cookies"), [
      { name: "first" },
      { name: "rejected" },
      { name: "last" },
    ])
    const importer = createBrowserImporter(createTestHost({ platform: "darwin", home }))
    const written: string[] = []

    const result = await importer.importCookies({
      sourceID: "chrome",
      sourceProfileID: "Default",
      cookies: {
        set: async (details) => {
          if (details.name === "rejected") throw new Error("Electron rejected the cookie")
          written.push(details.name)
        },
      },
    })

    expect(result).toEqual({
      _tag: "imported",
      imported: 2,
      skipped: 1,
      skippedDomains: ["example.test"],
    })
    expect(written).toEqual(["first", "last"])
  })

  test("imports committed WAL data from a store Chrome still has open", async () => {
    const home = createTemporaryRoot()
    const databasePath = path.join(chromeRoot(home), "Default", "Cookies")
    mkdirSync(path.dirname(databasePath), { recursive: true })
    const live = new Database(databasePath, { create: true })
    try {
      live.run("pragma journal_mode = WAL")
      live.run("pragma wal_autocheckpoint = 0")
      createChromiumCookieSchema(live)
      insertChromiumCookie(live, "fresh", "from-wal")
      expect(existsSync(`${databasePath}-wal`)).toBe(true)
      const host = createTestHost({ platform: "darwin", home })
      const importer = createBrowserImporter(host)
      const { sink, written } = recordingSink()

      expect(
        await importer.importCookies({
          sourceID: "chrome",
          sourceProfileID: "Default",
          cookies: sink,
        }),
      ).toEqual({ _tag: "imported", imported: 1, skipped: 0, skippedDomains: [] })
      expect(written.map((details) => details.value)).toEqual(["from-wal"])
      expect(readdirSync(host.temporaryDirectory)).toEqual([])
    } finally {
      live.close()
    }
  })

  test("fails a store that is not SQLite and removes its snapshot directory", async () => {
    const home = createTemporaryRoot()
    const databasePath = path.join(chromeRoot(home), "Default", "Cookies")
    mkdirSync(path.dirname(databasePath), { recursive: true })
    writeFileSync(databasePath, "not a sqlite database")
    const host = createTestHost({ platform: "darwin", home })
    const importer = createBrowserImporter(host)
    const { sink, written } = recordingSink()

    expect(
      await importer.importCookies({
        sourceID: "chrome",
        sourceProfileID: "Default",
        cookies: sink,
      }),
    ).toEqual({ _tag: "failed", reason: "readFailed" })
    expect(written).toEqual([])
    expect(readdirSync(host.temporaryDirectory)).toEqual([])
  })
})
