import { describe, expect, test } from "bun:test"
import type { BrowserImportResult } from "@buddy/browser-contract/browser-import"
import type { BrowserImportCookieDetails } from "../src/main/browser-import/browser-importer"
import {
  importInAppBrowserCookies,
  type BrowserImportLogger,
  type InAppBrowserCookieImport,
  type InAppBrowserImportCookieStore,
} from "../src/main/in-app-browser-import"

const DEFAULT_PARTITION = "persist:buddy-browser"
const INCOGNITO_PARTITION = "buddy-browser-incognito"
const WORK_PARTITION = "persist:buddy-browser-profile-work"

const IMPORTED_COOKIE: BrowserImportCookieDetails = {
  url: "https://example.test/",
  name: "session",
  value: "signed-in",
  path: "/",
  secure: true,
  httpOnly: true,
  sameSite: "lax",
}

type CookieImportLogDetails = {
  readonly sourceID?: string
  readonly imported?: number
  readonly skipped?: number
}

type CookieImportLogEntry = {
  readonly level: "info" | "warn" | "error"
  readonly message: string
  readonly details?: CookieImportLogDetails
}

function createLogger() {
  const entries: CookieImportLogEntry[] = []
  const recorder = {
    info: (message: string, details?: CookieImportLogDetails) => {
      entries.push({ level: "info", message, details })
    },
    warn: (message: string, details?: CookieImportLogDetails) => {
      entries.push({ level: "warn", message, details })
    },
    error: (message: string, details?: CookieImportLogDetails) => {
      entries.push({ level: "error", message, details })
    },
  }
  return {
    entries,
    // SAFETY: importInAppBrowserCookies only logs a string message plus optional source/count details.
    logger: recorder as BrowserImportLogger,
  }
}

function createCookieStore(flush: () => Promise<void> = async () => undefined): InAppBrowserImportCookieStore & {
  readonly written: BrowserImportCookieDetails[]
  readonly flushes: number
} {
  const written: BrowserImportCookieDetails[] = []
  let flushes = 0
  const store = {
    written,
    get flushes() {
      return flushes
    },
    async set(details: BrowserImportCookieDetails) {
      written.push(details)
    },
    async flushStore() {
      flushes += 1
      await flush()
    },
  }
  return store
}

function createPartitionSessions() {
  const byPartition = new Map<string, ReturnType<typeof createCookieStore>>()
  return {
    byPartition,
    fromPartition(partition: string) {
      const existing = byPartition.get(partition)
      if (existing) return { cookies: existing }
      const created = createCookieStore()
      byPartition.set(partition, created)
      return { cookies: created }
    },
  }
}

function writeImportedCookie(): InAppBrowserCookieImport {
  return async ({ cookies }) => {
    await cookies.set(IMPORTED_COOKIE)
    return { _tag: "imported", imported: 1, skipped: 0, skippedDomains: [] }
  }
}

async function importIntoProfile(profileID: string, importCookies: InAppBrowserCookieImport) {
  const sessions = createPartitionSessions()
  const { logger, entries } = createLogger()
  const result = await importInAppBrowserCookies(
    { sourceID: "chrome", sourceProfileID: "Default", profileID },
    logger,
    { sessions, importCookies },
  )
  return { result, sessions, entries }
}

describe("in-app browser cookie import", () => {
  test("writes into the same partition the webview contract uses", async () => {
    const cases: readonly { profileID: string; partition: string }[] = [
      { profileID: "default", partition: DEFAULT_PARTITION },
      { profileID: "incognito", partition: INCOGNITO_PARTITION },
      { profileID: "work", partition: WORK_PARTITION },
    ]

    for (const { profileID, partition } of cases) {
      const { result, sessions } = await importIntoProfile(profileID, writeImportedCookie())

      expect(result).toEqual({
        _tag: "imported",
        imported: 1,
        skipped: 0,
        skippedDomains: [],
      })
      expect([...sessions.byPartition.keys()]).toEqual([partition])
      expect(sessions.byPartition.get(partition)?.written).toEqual([IMPORTED_COOKIE])
    }
  })

  test("flushes the imported jar so a crash after Done cannot drop the cookies", async () => {
    const { result, sessions } = await importIntoProfile("work", writeImportedCookie())

    expect(result._tag).toBe("imported")
    expect(sessions.byPartition.get(WORK_PARTITION)?.flushes).toBe(1)
  })

  test("logs a failed flush instead of silently claiming the cookies are on disk", async () => {
    const cookies = createCookieStore(async () => {
      throw new Error("store closed")
    })
    const { logger, entries } = createLogger()

    const result = await importInAppBrowserCookies(
      { sourceID: "chrome", sourceProfileID: "Default", profileID: "work" },
      logger,
      {
        sessions: { fromPartition: () => ({ cookies }) },
        importCookies: writeImportedCookie(),
      },
    )

    expect(result).toEqual({
      _tag: "imported",
      imported: 1,
      skipped: 0,
      skippedDomains: [],
    })
    expect(cookies.written).toEqual([IMPORTED_COOKIE])
    expect(cookies.flushes).toBe(1)
    expect(entries).toContainEqual({
      level: "warn",
      message: "Imported cookies could not be flushed to disk",
      details: { sourceID: "chrome" },
    })
  })

  test("does not flush when the source read fails", async () => {
    const failed: BrowserImportResult = { _tag: "failed", reason: "browserRunning" }
    const { result, sessions, entries } = await importIntoProfile("work", async () => failed)

    expect(result).toEqual(failed)
    expect(sessions.byPartition.get(WORK_PARTITION)?.written).toEqual([])
    expect(sessions.byPartition.get(WORK_PARTITION)?.flushes).toBe(0)
    expect(entries.filter((entry) => entry.level === "warn")).toEqual([])
  })

  test("does not open a partition until the target profile is usable", async () => {
    const sessions = createPartitionSessions()
    const { logger } = createLogger()

    expect(
      await importInAppBrowserCookies(
        { sourceID: "chrome", sourceProfileID: "Default", profileID: "../default" },
        logger,
        { sessions, importCookies: writeImportedCookie() },
      ),
    ).toEqual({ _tag: "failed", reason: "sessionUnavailable" })
    expect(sessions.byPartition.size).toBe(0)
  })
})
