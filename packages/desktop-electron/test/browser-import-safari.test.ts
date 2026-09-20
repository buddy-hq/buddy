import { Database } from "bun:sqlite"
import { afterEach, describe, expect, test } from "bun:test"
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
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
import { parseBinaryCookies } from "../src/main/browser-import/safari-cookies"

const APPLE_EPOCH_OFFSET_SECONDS = 978_307_200
const FIRST_RECORD_START = 8 + 4 + 16
const WORK_PROFILE_UUID = "C561D071-67AD-4537-866F-54F65FB8E8DD"
const DELETED_PROFILE_UUID = "2875EB19-B938-4E38-BE92-5AE97C256BDD"

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
    readKeychainPassword: async () => ({ _tag: "failed", reason: "keychainUnavailable" }),
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

type SafariFixtureCookie = {
  readonly domain: string
  readonly name: string
  readonly path: string
  readonly value: string
  readonly flags: number
  readonly expiry: number
}

function encodeCookieRecord(cookie: SafariFixtureCookie): Buffer {
  const strings = [cookie.domain, cookie.name, cookie.path, cookie.value]
  const size = 56 + strings.reduce((total, text) => total + Buffer.byteLength(text) + 1, 0)
  const record = Buffer.alloc(size)
  record.writeUInt32LE(size, 0)
  record.writeUInt32LE(cookie.flags, 8)
  record.writeDoubleLE(cookie.expiry, 40)
  let cursor = 56
  for (const [index, text] of strings.entries()) {
    record.writeUInt32LE(cursor, 16 + index * 4)
    record.write(text, cursor, "utf8")
    cursor += Buffer.byteLength(text) + 1
  }
  return record
}

function encodeCookiePage(cookies: readonly SafariFixtureCookie[]): Buffer {
  const records = cookies.map(encodeCookieRecord)
  const headerSize = 12 + records.length * 4
  const page = Buffer.alloc(
    headerSize + records.reduce((total, record) => total + record.length, 0),
  )
  page.writeUInt32BE(0x0000_0100, 0)
  page.writeUInt32LE(records.length, 4)
  let cursor = headerSize
  for (const [index, record] of records.entries()) {
    page.writeUInt32LE(cursor, 8 + index * 4)
    record.copy(page, cursor)
    cursor += record.length
  }
  return page
}

function encodeBinaryCookies(
  pages: readonly Buffer[],
  pageSizes = pages.map((page) => page.length),
) {
  const header = Buffer.alloc(8 + pageSizes.length * 4)
  header.write("cook", 0, "latin1")
  header.writeUInt32BE(pageSizes.length, 4)
  for (const [index, size] of pageSizes.entries()) header.writeUInt32BE(size, 8 + index * 4)
  return Buffer.concat([header, ...pages])
}

function cookie(domain: string, name: string): SafariFixtureCookie {
  return { domain, name, path: "/", value: `${name}-value`, flags: 0, expiry: 0 }
}

function withUInt32LE(file: Buffer, offset: number, value: number): Buffer {
  const copy = Buffer.from(file)
  copy.writeUInt32LE(value, offset)
  return copy
}

function safariLibrary(home: string): string {
  return path.join(home, "Library", "Containers", "com.apple.Safari", "Data", "Library")
}

function writeJar(directory: string, cookies: readonly SafariFixtureCookie[]): string {
  mkdirSync(directory, { recursive: true })
  const jar = path.join(directory, "Cookies.binarycookies")
  writeFileSync(jar, encodeBinaryCookies([encodeCookiePage(cookies)]))
  return jar
}

describe("Safari binary cookie jars", () => {
  test("reads cookies across pages and rebases Safari's 2001 epoch", () => {
    const file = encodeBinaryCookies([
      encodeCookiePage([
        {
          domain: ".apple.com",
          name: "session",
          path: "/",
          value: "abc",
          flags: 0x1 | 0x4,
          expiry: 800_000_000,
        },
      ]),
      encodeCookiePage([
        { domain: "example.test", name: "plain", path: "/app", value: "v", flags: 0, expiry: 0 },
        { domain: "::1", name: "local", path: "", value: "w", flags: 0, expiry: 0 },
      ]),
    ])

    expect(parseBinaryCookies(file)).toStrictEqual({
      _tag: "parsed",
      cookies: [
        {
          url: "https://apple.com/",
          domain: ".apple.com",
          name: "session",
          value: "abc",
          path: "/",
          secure: true,
          httpOnly: true,
          expirationDate: 800_000_000 + APPLE_EPOCH_OFFSET_SECONDS,
          sameSite: "lax",
        },
        {
          url: "http://example.test/app",
          domain: undefined,
          name: "plain",
          value: "v",
          path: "/app",
          secure: false,
          httpOnly: false,
          expirationDate: undefined,
          sameSite: "lax",
        },
        {
          url: "http://[::1]/",
          domain: undefined,
          name: "local",
          value: "w",
          path: "/",
          secure: false,
          httpOnly: false,
          expirationDate: undefined,
          sameSite: "lax",
        },
      ],
    })
  })

  test("accepts Safari's checksum and property-list trailer but no undeclared bytes", () => {
    const file = encodeBinaryCookies([encodeCookiePage([cookie("a.test", "one")])])
    const propertyList = Buffer.from("bplist00 stub")
    const propertyListLength = Buffer.alloc(4)
    propertyListLength.writeUInt32BE(propertyList.length, 0)
    const wrongLength = Buffer.alloc(4)
    wrongLength.writeUInt32BE(99, 0)

    expect(parseBinaryCookies(Buffer.concat([file, Buffer.alloc(8)]))["_tag"]).toBe("parsed")
    expect(
      parseBinaryCookies(Buffer.concat([file, Buffer.alloc(8), propertyListLength, propertyList]))[
        "_tag"
      ],
    ).toBe("parsed")
    expect(
      parseBinaryCookies(Buffer.concat([file, encodeCookiePage([cookie("b.test", "two")])])),
    ).toEqual({ _tag: "malformed" })
    expect(
      parseBinaryCookies(Buffer.concat([file, Buffer.alloc(8), wrongLength, Buffer.from("x")])),
    ).toEqual({ _tag: "malformed" })
  })

  test("rejects jars whose declared structures point outside their bounds", () => {
    const first = encodeCookiePage([cookie("a.test", "one")])
    const second = encodeCookiePage([cookie("b.test", "two")])
    const onePage = encodeBinaryCookies([first])
    const twoRecords = encodeBinaryCookies([
      encodeCookiePage([cookie("a.test", "one"), cookie("b.test", "two")]),
    ])
    const secondOffsetField = 8 + 4 + 12
    const malformed = [
      Buffer.from("not a cookie jar"),
      encodeBinaryCookies([first, second], [first.length + second.length + 32, second.length]),
      withUInt32LE(onePage, FIRST_RECORD_START, 0xffff),
      withUInt32LE(onePage, FIRST_RECORD_START, 55),
      withUInt32LE(twoRecords, secondOffsetField, 4),
      withUInt32LE(twoRecords, secondOffsetField, twoRecords.readUInt32LE(8 + 4 + 8)),
      ...[16, 20, 24, 28].map((field) => withUInt32LE(onePage, FIRST_RECORD_START + field, 55)),
    ]

    for (const file of malformed) expect(parseBinaryCookies(file)).toEqual({ _tag: "malformed" })
    expect(parseBinaryCookies(twoRecords)["_tag"]).toBe("parsed")
  })
})

describe("Safari cookie import", () => {
  test("asks for Full Disk Access when macOS refuses to read the jar", async () => {
    const home = createTemporaryRoot()
    const jar = writeJar(path.join(safariLibrary(home), "Cookies"), [cookie("a.test", "one")])
    let probeDenied = true
    const importer = createBrowserImporter(
      createTestHost({
        platform: "darwin",
        home,
        files: {
          ...nodeBrowserImportFiles,
          probeOpen: async (filePath, access) =>
            probeDenied && filePath === jar && access === "read" ? "accessDenied" : "opened",
          readBytes: async (filePath) =>
            filePath === jar
              ? { _tag: "accessDenied" }
              : nodeBrowserImportFiles.readBytes(filePath),
        },
      }),
    )
    const { sink, written } = recordingSink()
    const request = { sourceID: "safari", sourceProfileID: ".", cookies: sink } as const

    expect((await importer.listSources()).find((source) => source.id === "safari")).toEqual({
      id: "safari",
      name: "Safari",
      profiles: [],
      availability: { _tag: "unavailable", reason: "needsFullDiskAccess" },
    })
    expect(await importer.importCookies(request)).toEqual({
      _tag: "failed",
      reason: "needsFullDiskAccess",
    })
    expect(await importer.checkSafariFullDiskAccess()).toBe(false)

    probeDenied = false
    expect(await importer.checkSafariFullDiskAccess()).toBe(true)
    expect(await importer.importCookies(request)).toEqual({
      _tag: "failed",
      reason: "needsFullDiskAccess",
    })
    expect(written).toEqual([])
  })

  test.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "does not send an ordinary permission failure to the Full Disk Access grant",
    async () => {
      const home = createTemporaryRoot()
      const jar = writeJar(path.join(safariLibrary(home), "Cookies"), [cookie("a.test", "one")])
      chmodSync(jar, 0o000)
      const importer = createBrowserImporter(createTestHost({ platform: "darwin", home }))
      const { sink } = recordingSink()

      expect(
        await importer.importCookies({ sourceID: "safari", sourceProfileID: ".", cookies: sink }),
      ).toEqual({ _tag: "failed", reason: "readFailed" })
    },
  )

  test("imports only the named profile the user picked", async () => {
    const home = createTemporaryRoot()
    const library = safariLibrary(home)
    const store = (uuid: string) =>
      path.join(library, "WebKit", "WebsiteDataStore", uuid.toLowerCase(), "Cookies")
    writeJar(path.join(library, "Cookies"), [cookie("personal.test", "personal")])
    writeJar(store(WORK_PROFILE_UUID), [cookie("work.test", "work")])
    writeJar(store(DELETED_PROFILE_UUID), [cookie("deleted.test", "deleted")])
    mkdirSync(path.join(library, "Safari"), { recursive: true })
    const metadata = new Database(path.join(library, "Safari", "SafariTabs.db"), { create: true })
    metadata.run(
      `create table bookmarks (title text, external_uuid text, parent integer default 0,
        type integer default 1, subtype integer default 2, deleted integer default 0,
        order_index integer default 0)`,
    )
    const insert = metadata.prepare(
      "insert into bookmarks (title, external_uuid, deleted, subtype, order_index) values (?, ?, ?, ?, ?)",
    )
    insert.run("", "DefaultProfile", 0, 2, 0)
    insert.run("Work", WORK_PROFILE_UUID, 0, 2, 1)
    insert.run("Deleted", DELETED_PROFILE_UUID, 1, 2, 2)
    insert.run("Unsafe", "../../outside", 0, 2, 3)
    insert.run("Tab group", "tab-group", 0, 1, 4)
    metadata.close()
    const importer = createBrowserImporter(
      createTestHost({
        platform: "darwin",
        home,
        temporaryDirectory: path.join(home, "missing", "temporary-directory"),
      }),
    )
    const { sink, written } = recordingSink()

    expect(
      (await importer.listSources()).find((source) => source.id === "safari")?.profiles,
    ).toEqual([
      { id: ".", name: "Personal" },
      { id: store(WORK_PROFILE_UUID), name: "Work" },
    ])
    expect(
      await importer.importCookies({
        sourceID: "safari",
        sourceProfileID: store(WORK_PROFILE_UUID),
        cookies: sink,
      }),
    ).toEqual({ _tag: "imported", imported: 1, skipped: 0, skippedDomains: [] })
    expect(written.map((details) => details.name)).toEqual(["work"])
  })

  test("recovers named profile stores when Safari's profile metadata cannot be read", async () => {
    const home = createTemporaryRoot()
    const library = safariLibrary(home)
    const stores = path.join(library, "WebKit", "WebsiteDataStore")
    writeJar(path.join(stores, WORK_PROFILE_UUID.toLowerCase(), "Cookies"), [
      cookie("work.test", "w"),
    ])
    mkdirSync(path.join(stores, DELETED_PROFILE_UUID.toLowerCase(), "Cookies"), { recursive: true })
    mkdirSync(path.join(library, "Safari"), { recursive: true })
    writeFileSync(path.join(library, "Safari", "SafariTabs.db"), "not a database")
    const importer = createBrowserImporter(createTestHost({ platform: "darwin", home }))

    expect(
      (await importer.listSources()).find((source) => source.id === "safari")?.profiles,
    ).toEqual([
      { id: ".", name: "Safari" },
      {
        id: path.join(stores, WORK_PROFILE_UUID.toLowerCase(), "Cookies"),
        name: WORK_PROFILE_UUID.toLowerCase(),
      },
    ])
  })

  test("checks Full Disk Access against a named profile when no default jar exists", async () => {
    const home = createTemporaryRoot()
    const library = safariLibrary(home)
    const store = path.join(
      library,
      "WebKit",
      "WebsiteDataStore",
      WORK_PROFILE_UUID.toLowerCase(),
      "Cookies",
    )
    const jar = writeJar(store, [cookie("work.test", "work")])
    let probeDenied = true
    const importer = createBrowserImporter(
      createTestHost({
        platform: "darwin",
        home,
        files: {
          ...nodeBrowserImportFiles,
          probeOpen: async (filePath, access) =>
            probeDenied && filePath === jar && access === "read" ? "accessDenied" : "opened",
        },
      }),
    )

    expect(await importer.checkSafariFullDiskAccess()).toBe(false)
    probeDenied = false
    expect(await importer.checkSafariFullDiskAccess()).toBe(true)
  })
})
