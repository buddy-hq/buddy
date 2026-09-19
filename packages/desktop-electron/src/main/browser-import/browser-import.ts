import { homedir, hostname, tmpdir } from "node:os"
import path from "node:path"
import type {
  BrowserImportResult,
  BrowserImportSource,
  BrowserImportSourceID,
} from "@buddy/browser-contract/browser-import"
import { hasSystemErrorCode, nodeBrowserImportFiles } from "./browser-import-files"
import {
  createBrowserImporter,
  type BrowserImportCookieSink,
  type BrowserImporter,
} from "./browser-importer"
import { openNodeSqliteDatabase } from "./node-sqlite-database"
import type { BrowserImportKeychainPasswordRead } from "./browser-import-host"
import type { BrowserImportFailureDiagnostic } from "./browser-import-host"
import type { BrowserImportWindowsDataRead } from "./browser-import-host"

/** Logging capability used by the browser-import runtime boundary. */
export type BrowserImportLogger = {
  readonly info: (...args: unknown[]) => void
  readonly warn: (...args: unknown[]) => void
  readonly error: (...args: unknown[]) => void
}

type BrowserImportErrorDetails = {
  readonly name: string
  readonly message?: string
}

function errorDetails<TCause>(cause: TCause): BrowserImportErrorDetails | undefined {
  if (cause === undefined) return undefined
  if (!(cause instanceof Error)) return { name: "NonErrorCause" }
  if (cause.name === "ZodError") return { name: cause.name }
  return { name: cause.name, message: cause.message }
}

export type { BrowserImportCookieDetails, BrowserImportCookieSink } from "./browser-importer"

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (cause) {
    // Signal 0 only probes: ESRCH means gone, EPERM means it exists.
    return !hasSystemErrorCode(cause, "ESRCH")
  }
}

async function readKeychainPassword(
  service: string,
  account: string,
): Promise<BrowserImportKeychainPasswordRead> {
  let keyring: typeof import("@napi-rs/keyring")
  try {
    keyring = await import("@napi-rs/keyring")
  } catch (cause) {
    return { _tag: "failed", reason: "keychainUnavailable", cause }
  }
  try {
    const value = new keyring.Entry(service, account).getPassword()
    return value ? { _tag: "password", value } : { _tag: "failed", reason: "keychainItemMissing" }
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    return {
      _tag: "failed",
      reason: /no (matching )?entry|not found/iu.test(message)
        ? "keychainItemMissing"
        : "needsKeychainApproval",
      cause,
    }
  }
}

async function unprotectWindowsData(encrypted: Uint8Array): Promise<BrowserImportWindowsDataRead> {
  try {
    const { Dpapi, isPlatformSupported } = await import("@primno/dpapi")
    if (!isPlatformSupported) {
      return { _tag: "failed", cause: new Error("DPAPI binding is unavailable") }
    }
    return {
      _tag: "decrypted",
      bytes: Dpapi.unprotectData(encrypted, null, "CurrentUser"),
    }
  } catch (cause) {
    return { _tag: "failed", cause }
  }
}

function createMachineBrowserImporter(logger: BrowserImportLogger): BrowserImporter {
  const home = homedir()
  return createBrowserImporter({
    platform: process.platform,
    path,
    home,
    localAppData: process.env.LOCALAPPDATA?.trim() || path.join(home, "AppData", "Local"),
    hostname: hostname(),
    temporaryDirectory: tmpdir(),
    files: nodeBrowserImportFiles,
    openDatabase: openNodeSqliteDatabase,
    readKeychainPassword,
    unprotectWindowsData,
    isProcessAlive,
    reportFailure(diagnostic: BrowserImportFailureDiagnostic) {
      logger.warn("browser cookie import failed", {
        sourceID: diagnostic.sourceID,
        reason: diagnostic.reason,
        stage: diagnostic.stage,
        cause: errorDetails(diagnostic.cause),
      })
    },
  })
}

export async function listBrowserImportSources(
  logger: BrowserImportLogger,
): Promise<readonly BrowserImportSource[]> {
  try {
    return await createMachineBrowserImporter(logger).listSources()
  } catch (cause) {
    logger.error("listing browser cookie import sources failed", errorDetails(cause))
    throw cause
  }
}

export async function checkSafariFullDiskAccess(logger: BrowserImportLogger): Promise<boolean> {
  try {
    return await createMachineBrowserImporter(logger).checkSafariFullDiskAccess()
  } catch (cause) {
    logger.error("checking Safari Full Disk Access failed", errorDetails(cause))
    throw cause
  }
}

export function importBrowserCookies(input: {
  readonly sourceID: BrowserImportSourceID
  readonly sourceProfileID: string
  readonly cookies: BrowserImportCookieSink
  readonly logger: BrowserImportLogger
}): Promise<BrowserImportResult> {
  return createMachineBrowserImporter(input.logger).importCookies(input)
}
