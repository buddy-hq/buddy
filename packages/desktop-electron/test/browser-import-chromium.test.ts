import { Database } from "bun:sqlite"
import { afterEach, describe, expect, test } from "bun:test"
import { createCipheriv, createHash } from "node:crypto"
import { mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import type {
  BrowserImportFailureReason,
  BrowserImportSourceID,
} from "@buddy/browser-contract/browser-import"
import { nodeBrowserImportFiles } from "../src/main/browser-import/browser-import-files"
import type {
  BrowserImportFailureDiagnostic,
  BrowserImportHost,
} from "../src/main/browser-import/browser-import-host"
import type { BrowserImportKeychainPasswordRead } from "../src/main/browser-import/browser-import-host"
import {
  createBrowserImporter,
  type BrowserImportCookieDetails,
  type BrowserImportCookieSink,
  type BrowserImporter,
} from "../src/main/browser-import/browser-importer"
import type { ReadOnlyDatabase } from "../src/main/browser-import/cookie-database"

// Chromium's macOS cookie key for the Keychain secret "macos-secret" (PBKDF2-SHA1, "saltysalt", 1003 rounds).
const MAC_SECRET = "macos-secret"
const MAC_KEY = Buffer.from("3df7306fb1eac353289565a2f6b64f74", "hex")
const WINDOWS_KEY = Buffer.from(
  "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
  "hex",
)
const WINDOWS_PROTECTED_KEY = Buffer.from("dpapi-protected-fixture-key")
// UNIX second 1_800_000_000 as Chromium stores it: microseconds since 1601-01-01.
const CHROMIUM_EXPIRY = 13_444_473_600_000_000n
const UNIX_EXPIRY = 1_800_000_000
const KEYCHAIN_SECRET = { _tag: "password", value: MAC_SECRET } as const

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

function recordingKeychain(respond: () => BrowserImportKeychainPasswordRead) {
  const requests: Array<{ service: string; account: string }> = []
  return {
    requests,
    readKeychainPassword: async (service: string, account: string) => {
      requests.push({ service, account })
      return respond()
    },
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

async function availabilityOf(importer: BrowserImporter, id: BrowserImportSourceID) {
  return (await importer.listSources()).find((source) => source.id === id)?.availability
}

type ChromiumFixtureCookie = {
  readonly host: string
  readonly name: string
  readonly value?: string
  readonly encrypted?: Uint8Array
  readonly path?: string
  readonly expiresUtc?: bigint
  readonly secure?: boolean
  readonly httpOnly?: boolean
  readonly sameSite?: number
  readonly topFrameSiteKey?: string
}

function writeChromiumCookies(
  databasePath: string,
  schemaVersion: number | string,
  cookies: readonly ChromiumFixtureCookie[],
): void {
  mkdirSync(path.dirname(databasePath), { recursive: true })
  const database = new Database(databasePath, { create: true })
  const partitioned = Number(schemaVersion) >= 15
  database.run("create table meta (key longvarchar not null unique primary key, value longvarchar)")
  database.prepare("insert into meta (key, value) values ('version', ?)").run(schemaVersion)
  database.run(
    `create table cookies (host_key text not null, name text not null, value text not null,
      encrypted_value blob not null, path text not null, expires_utc integer not null,
      is_secure integer not null, is_httponly integer not null, samesite integer not null
      ${partitioned ? ", top_frame_site_key text not null" : ""})`,
  )
  const insert = database.prepare(
    partitioned
      ? "insert into cookies values (?, ?, ?, coalesce(?, x''), ?, ?, ?, ?, ?, ?)"
      : "insert into cookies values (?, ?, ?, coalesce(?, x''), ?, ?, ?, ?, ?)",
  )
  for (const cookie of cookies) {
    const values = [
      cookie.host,
      cookie.name,
      cookie.value ?? "",
      cookie.encrypted ?? null,
      cookie.path ?? "/",
      cookie.expiresUtc ?? 0n,
      cookie.secure ? 1 : 0,
      cookie.httpOnly ? 1 : 0,
      cookie.sameSite ?? -1,
    ]
    insert.run(...(partitioned ? [...values, cookie.topFrameSiteKey ?? ""] : values))
  }
  database.close()
}

function encryptMacRecord(plaintext: Buffer, key: Buffer): Buffer {
  const cipher = createCipheriv("aes-128-cbc", key, Buffer.alloc(16, 0x20))
  return Buffer.concat([Buffer.from("v10"), cipher.update(plaintext), cipher.final()])
}

function encryptWindowsRecord(plaintext: Buffer, key: Buffer): Buffer {
  const nonce = Buffer.from("000102030405060708090a0b", "hex")
  const cipher = createCipheriv("aes-256-gcm", key, nonce)
  return Buffer.concat([
    Buffer.from("v10"),
    nonce,
    cipher.update(plaintext),
    cipher.final(),
    cipher.getAuthTag(),
  ])
}

function hostBound(host: string, value: string): Buffer {
  return Buffer.concat([createHash("sha256").update(host).digest(), Buffer.from(value)])
}

function macChromeRoot(home: string): string {
  return path.join(home, "Library", "Application Support", "Google", "Chrome")
}

function installMacChrome(home: string): string {
  const root = macChromeRoot(home)
  mkdirSync(root, { recursive: true })
  writeFileSync(
    path.join(root, "Local State"),
    JSON.stringify({ profile: { info_cache: { Default: { name: "Personal" } } } }),
  )
  writeChromiumCookies(path.join(root, "Default", "Network", "Cookies"), 24, [
    {
      host: ".example.test",
      name: "session",
      encrypted: encryptMacRecord(hostBound(".example.test", "signed-in"), MAC_KEY),
    },
  ])
  return root
}

function windowsChromiumRoot(localAppData: string, source: "chrome" | "edge"): string {
  return source === "chrome"
    ? path.join(localAppData, "Google", "Chrome", "User Data")
    : path.join(localAppData, "Microsoft", "Edge", "User Data")
}

function installWindowsChromium(
  localAppData: string,
  source: "chrome" | "edge",
  encryptedCookie: Uint8Array,
): string {
  const root = windowsChromiumRoot(localAppData, source)
  mkdirSync(root, { recursive: true })
  writeFileSync(
    path.join(root, "Local State"),
    JSON.stringify({
      os_crypt: {
        encrypted_key: Buffer.concat([Buffer.from("DPAPI"), WINDOWS_PROTECTED_KEY]).toString(
          "base64",
        ),
      },
      profile: { info_cache: { Default: { name: "Personal" } } },
    }),
  )
  writeChromiumCookies(path.join(root, "Default", "Network", "Cookies"), 24, [
    {
      host: ".example.test",
      name: "session",
      encrypted: encryptedCookie,
      secure: true,
      httpOnly: true,
    },
  ])
  return root
}

describe("Chromium cookie import on macOS", () => {
  test("imports a Chrome profile with its Keychain key and skips records it cannot import", async () => {
    const home = createTemporaryRoot()
    const root = macChromeRoot(home)
    mkdirSync(root, { recursive: true })
    writeFileSync(
      path.join(root, "Local State"),
      JSON.stringify({ profile: { info_cache: { Default: { name: "Personal" } } } }),
    )
    writeChromiumCookies(path.join(root, "Default", "Network", "Cookies"), 24, [
      {
        host: ".example.test",
        name: "session",
        encrypted: encryptMacRecord(hostBound(".example.test", "signed-in"), MAC_KEY),
        expiresUtc: CHROMIUM_EXPIRY,
        secure: true,
        httpOnly: true,
        sameSite: 1,
      },
      { host: "app.example.test", name: "theme", value: "dark", path: "/settings" },
      {
        host: ".partitioned.test",
        name: "embed",
        value: "partitioned",
        topFrameSiteKey: "https://top.test",
      },
      {
        host: "moved.example.test",
        name: "copied",
        encrypted: encryptMacRecord(hostBound("elsewhere.test", "bound elsewhere"), MAC_KEY),
      },
    ])
    const keychain = recordingKeychain(() => KEYCHAIN_SECRET)
    const host = createTestHost({
      platform: "darwin",
      home,
      readKeychainPassword: keychain.readKeychainPassword,
    })
    const importer = createBrowserImporter(host)
    const { sink, written } = recordingSink()

    expect((await importer.listSources()).find((source) => source.id === "chrome")).toEqual({
      id: "chrome",
      name: "Chrome",
      profiles: [{ id: "Default", name: "Personal", cookieCount: 4 }],
      availability: { _tag: "available" },
    })
    expect(keychain.requests).toEqual([])

    expect(
      await importer.importCookies({
        sourceID: "chrome",
        sourceProfileID: "Default",
        cookies: sink,
      }),
    ).toEqual({
      _tag: "imported",
      imported: 2,
      skipped: 2,
      skippedDomains: ["partitioned.test", "moved.example.test"],
    })
    expect(written).toStrictEqual([
      {
        url: "https://example.test/",
        name: "session",
        value: "signed-in",
        domain: ".example.test",
        path: "/",
        secure: true,
        httpOnly: true,
        expirationDate: UNIX_EXPIRY,
        sameSite: "lax",
      },
      {
        url: "http://app.example.test/settings",
        name: "theme",
        value: "dark",
        path: "/settings",
        secure: false,
        httpOnly: false,
        sameSite: "unspecified",
      },
    ])
    expect(keychain.requests).toEqual([{ service: "Chrome Safe Storage", account: "Chrome" }])
    expect(readdirSync(host.temporaryDirectory)).toEqual([])
  })

  test("reports the Keychain refusal the user can act on", async () => {
    const cases: readonly [BrowserImportKeychainPasswordRead, BrowserImportFailureReason][] = [
      [{ _tag: "failed", reason: "keychainItemMissing" }, "keychainItemMissing"],
      [{ _tag: "failed", reason: "needsKeychainApproval" }, "needsKeychainApproval"],
      [{ _tag: "failed", reason: "keychainUnavailable" }, "keychainUnavailable"],
    ]
    for (const [outcome, reason] of cases) {
      const home = createTemporaryRoot()
      installMacChrome(home)
      const importer = createBrowserImporter(
        createTestHost({ platform: "darwin", home, readKeychainPassword: async () => outcome }),
      )
      const { sink, written } = recordingSink()

      expect(
        await importer.importCookies({
          sourceID: "chrome",
          sourceProfileID: "Default",
          cookies: sink,
        }),
      ).toEqual({ _tag: "failed", reason })
      expect(written).toEqual([])
    }
  })

  test.skipIf(process.platform === "win32")(
    "does not ask the Keychain while Chrome holds its profile lock",
    async () => {
      const home = createTemporaryRoot()
      const root = installMacChrome(home)
      const lock = path.join(root, "SingletonLock")
      const liveProcessIDs = new Set<number>()
      const keychain = recordingKeychain(() => KEYCHAIN_SECRET)
      const importer = createBrowserImporter(
        createTestHost({
          platform: "darwin",
          home,
          readKeychainPassword: keychain.readKeychainPassword,
          isProcessAlive: (pid) => liveProcessIDs.has(pid),
        }),
      )
      const { sink } = recordingSink()
      const request = { sourceID: "chrome", sourceProfileID: "Default", cookies: sink } as const

      symlinkSync("another-machine-4242", lock)
      expect(await availabilityOf(importer, "chrome")).toEqual({
        _tag: "unavailable",
        reason: "browserRunning",
      })
      expect(await importer.importCookies(request)).toEqual({
        _tag: "failed",
        reason: "browserRunning",
      })

      rmSync(lock)
      symlinkSync("buddy-test-host-4242", lock)
      liveProcessIDs.add(4242)
      expect(await availabilityOf(importer, "chrome")).toEqual({
        _tag: "unavailable",
        reason: "browserRunning",
      })
      expect(keychain.requests).toEqual([])

      liveProcessIDs.delete(4242)
      expect(await importer.importCookies(request)).toEqual({
        _tag: "imported",
        imported: 1,
        skipped: 0,
        skippedDomains: [],
      })
    },
  )

  test("prefers the live Network/Cookies store over a stale root-level copy", async () => {
    const home = createTemporaryRoot()
    const root = installMacChrome(home)
    writeChromiumCookies(path.join(root, "Default", "Cookies"), 24, [
      { host: "example.test", name: "stale", value: "left behind by the Network/ move" },
    ])
    const importer = createBrowserImporter(
      createTestHost({
        platform: "darwin",
        home,
        readKeychainPassword: async () => KEYCHAIN_SECRET,
      }),
    )
    const { sink, written } = recordingSink()

    await importer.importCookies({ sourceID: "chrome", sourceProfileID: "Default", cookies: sink })

    expect(written.map((cookie) => cookie.name)).toEqual(["session"])
  })

  test("reads stores that predate Local State names, partitioning, and encryption", async () => {
    const home = createTemporaryRoot()
    const root = macChromeRoot(home)
    writeChromiumCookies(path.join(root, "Profile 1", "Cookies"), 14, [
      { host: "legacy.example.test", name: "old", encrypted: Buffer.from("stored in the clear") },
      { host: "linux.example.test", name: "keyring", encrypted: Buffer.from("v11ciphertext") },
    ])
    const importer = createBrowserImporter(
      createTestHost({
        platform: "darwin",
        home,
        readKeychainPassword: async () => KEYCHAIN_SECRET,
      }),
    )
    const { sink, written } = recordingSink()

    expect(
      (await importer.listSources()).find((source) => source.id === "chrome")?.profiles,
    ).toEqual([{ id: "Profile 1", name: "Profile 1", cookieCount: 2 }])
    expect(
      await importer.importCookies({
        sourceID: "chrome",
        sourceProfileID: "Profile 1",
        cookies: sink,
      }),
    ).toEqual({
      _tag: "imported",
      imported: 1,
      skipped: 1,
      skippedDomains: ["linux.example.test"],
    })
    expect(written.map((cookie) => cookie.value)).toEqual(["stored in the clear"])
  })

  test("fails the import when the store's schema version is malformed", async () => {
    const home = createTemporaryRoot()
    const failures: BrowserImportFailureDiagnostic[] = []
    writeChromiumCookies(path.join(macChromeRoot(home), "Default", "Cookies"), "not-a-version", [
      { host: "example.test", name: "plain", value: "value" },
    ])
    const importer = createBrowserImporter(
      createTestHost({
        platform: "darwin",
        home,
        readKeychainPassword: async () => KEYCHAIN_SECRET,
        reportFailure: (diagnostic) => failures.push(diagnostic),
      }),
    )
    const { sink, written } = recordingSink()

    expect(
      await importer.importCookies({
        sourceID: "chrome",
        sourceProfileID: "Default",
        cookies: sink,
      }),
    ).toEqual({ _tag: "failed", reason: "readFailed" })
    expect(written).toEqual([])
    expect(failures.map(({ sourceID, reason, stage }) => ({ sourceID, reason, stage }))).toEqual([
      { sourceID: "chrome", reason: "readFailed", stage: "readCookieStore" },
    ])
    expect(failures[0]?.cause).toBeInstanceOf(Error)
  })
})

describe("Chromium cookie import on Windows", () => {
  test("discovers Chrome and Edge profiles and imports DPAPI-keyed AES-GCM cookies", async () => {
    const home = createTemporaryRoot()
    const localAppData = path.join(home, "AppData", "Local")
    const encrypted = encryptWindowsRecord(
      hostBound(".example.test", "signed-in-on-windows"),
      WINDOWS_KEY,
    )

    for (const sourceID of ["chrome", "edge"] as const) {
      installWindowsChromium(localAppData, sourceID, encrypted)
    }

    const unprotected: Uint8Array[] = []
    const importer = createBrowserImporter(
      createTestHost({
        platform: "win32",
        home,
        localAppData,
        unprotectWindowsData: async (bytes) => {
          unprotected.push(bytes)
          return Buffer.from(bytes).equals(WINDOWS_PROTECTED_KEY)
            ? { _tag: "decrypted", bytes: WINDOWS_KEY }
            : { _tag: "failed" }
        },
      }),
    )
    const sources = await importer.listSources()

    for (const sourceID of ["chrome", "edge"] as const) {
      expect(sources.find((source) => source.id === sourceID)).toEqual({
        id: sourceID,
        name: sourceID === "chrome" ? "Chrome" : "Microsoft Edge",
        profiles: [{ id: "Default", name: "Personal", cookieCount: 1 }],
        availability: { _tag: "available" },
      })
      const { sink, written } = recordingSink()
      expect(
        await importer.importCookies({ sourceID, sourceProfileID: "Default", cookies: sink }),
      ).toEqual({ _tag: "imported", imported: 1, skipped: 0, skippedDomains: [] })
      expect(written).toEqual([
        {
          url: "https://example.test/",
          name: "session",
          value: "signed-in-on-windows",
          domain: ".example.test",
          path: "/",
          secure: true,
          httpOnly: true,
          sameSite: "unspecified",
        },
      ])
    }
    expect(unprotected).toHaveLength(2)
    expect(
      unprotected.every((bytes) => Buffer.from(bytes).equals(WINDOWS_PROTECTED_KEY)),
    ).toBeTrue()
  })

  test("does not touch DPAPI while the Windows browser lock is held", async () => {
    const home = createTemporaryRoot()
    const localAppData = path.join(home, "AppData", "Local")
    installWindowsChromium(
      localAppData,
      "chrome",
      encryptWindowsRecord(hostBound(".example.test", "signed-in"), WINDOWS_KEY),
    )
    let unprotectCalls = 0
    const importer = createBrowserImporter(
      createTestHost({
        platform: "win32",
        home,
        localAppData,
        files: {
          ...nodeBrowserImportFiles,
          probeOpen: async (filePath, access) =>
            filePath.endsWith("lockfile") && access === "readWrite"
              ? "busy"
              : nodeBrowserImportFiles.probeOpen(filePath, access),
        },
        unprotectWindowsData: async () => {
          unprotectCalls += 1
          return { _tag: "decrypted", bytes: WINDOWS_KEY }
        },
      }),
    )
    const { sink } = recordingSink()

    expect(await availabilityOf(importer, "chrome")).toEqual({
      _tag: "unavailable",
      reason: "browserRunning",
    })
    expect(
      await importer.importCookies({
        sourceID: "chrome",
        sourceProfileID: "Default",
        cookies: sink,
      }),
    ).toEqual({ _tag: "failed", reason: "browserRunning" })
    expect(unprotectCalls).toBe(0)
  })

  test("reports a Windows account that cannot decrypt the browser key", async () => {
    const home = createTemporaryRoot()
    const localAppData = path.join(home, "AppData", "Local")
    installWindowsChromium(
      localAppData,
      "edge",
      encryptWindowsRecord(hostBound(".example.test", "signed-in"), WINDOWS_KEY),
    )
    const importer = createBrowserImporter(
      createTestHost({
        platform: "win32",
        home,
        localAppData,
        unprotectWindowsData: async () => ({
          _tag: "failed",
          cause: new Error("DPAPI user mismatch"),
        }),
      }),
    )
    const { sink, written } = recordingSink()

    expect(
      await importer.importCookies({ sourceID: "edge", sourceProfileID: "Default", cookies: sink }),
    ).toEqual({ _tag: "failed", reason: "windowsDataProtectionUnavailable" })
    expect(written).toEqual([])
  })

  test("explains when every cookie is protected by Windows App-Bound Encryption", async () => {
    const home = createTemporaryRoot()
    const localAppData = path.join(home, "AppData", "Local")
    installWindowsChromium(
      localAppData,
      "chrome",
      Buffer.concat([Buffer.from("v20"), Buffer.alloc(48, 7)]),
    )
    let unprotectCalls = 0
    const importer = createBrowserImporter(
      createTestHost({
        platform: "win32",
        home,
        localAppData,
        unprotectWindowsData: async () => {
          unprotectCalls += 1
          return { _tag: "failed" }
        },
      }),
    )
    const { sink, written } = recordingSink()

    expect(
      await importer.importCookies({
        sourceID: "chrome",
        sourceProfileID: "Default",
        cookies: sink,
      }),
    ).toEqual({ _tag: "failed", reason: "appBoundEncryptionUnsupported" })
    expect(written).toEqual([])
    expect(unprotectCalls).toBe(0)
  })
})
