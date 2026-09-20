import {
  parseBrowserImportSourceID,
  type BrowserImportRequest,
  type BrowserImportResult,
  type BrowserImportSource,
  type BrowserImportSourceID,
} from "@buddy/browser-contract/browser-import"
import {
  inAppBrowserProfilePartition,
  parseInAppBrowserProfileID,
} from "@buddy/browser-contract/profiles"
import { parseTString } from "../shared/parse-external"
import type { BrowserImportLogger } from "./browser-import/browser-import"
import type {
  BrowserImportCookieDetails,
  BrowserImportCookieSink,
} from "./browser-import/browser-importer"

export type { BrowserImportLogger }

const FULL_DISK_ACCESS_SETTINGS_URL =
  "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_AllFiles"

/** Cookie jar Electron exposes on a partition session. */
export type InAppBrowserImportCookieStore = {
  set(details: BrowserImportCookieDetails): Promise<void>
  flushStore(): Promise<void>
}

/** Looks up the cookie jar for an in-app browser partition string. */
export type InAppBrowserImportSessions = {
  fromPartition(partition: string): { readonly cookies: InAppBrowserImportCookieStore }
}

/** Writes cookies from a source browser into an already-opened partition jar. */
export type InAppBrowserCookieImport = (input: {
  readonly sourceID: BrowserImportSourceID
  readonly sourceProfileID: string
  readonly cookies: BrowserImportCookieSink
  readonly logger: BrowserImportLogger
}) => Promise<BrowserImportResult>

/** Runtime dependencies for importing cookies into an in-app browser profile. */
export type InAppBrowserCookieImportDependencies = {
  readonly sessions: InAppBrowserImportSessions
  readonly importCookies: InAppBrowserCookieImport
}

/** List browsers on this machine whose cookies can be imported. */
export async function listInAppBrowserImportSources(
  logger: BrowserImportLogger,
): Promise<readonly BrowserImportSource[]> {
  const { listBrowserImportSources } = await import("./browser-import/browser-import")
  return listBrowserImportSources(logger)
}

/** Whether Safari's cookie jar is readable under Full Disk Access. */
export async function checkInAppBrowserSafariFullDiskAccess(
  logger: BrowserImportLogger,
): Promise<boolean> {
  const { checkSafariFullDiskAccess } = await import("./browser-import/browser-import")
  return checkSafariFullDiskAccess(logger)
}

/**
 * Copy cookies from an installed browser into a Buddy profile partition.
 *
 * The partition string is the same contract the webview `partition` attribute
 * uses. A successful write is flushed to disk; a flush failure is logged so
 * "imported" is not silent about durability.
 */
export async function importInAppBrowserCookies(
  input: BrowserImportRequest,
  logger: BrowserImportLogger,
  deps: InAppBrowserCookieImportDependencies,
): Promise<BrowserImportResult> {
  const sourceID = parseBrowserImportSourceID(input.sourceID)
  if (!sourceID) return { _tag: "failed", reason: "unknownSource" }
  const sourceProfileID = parseTString(input.sourceProfileID)
  if (!sourceProfileID) return { _tag: "failed", reason: "unknownSourceProfile" }
  const profileID = parseInAppBrowserProfileID(input.profileID)
  if (!profileID) return { _tag: "failed", reason: "sessionUnavailable" }
  const cookies = deps.sessions.fromPartition(inAppBrowserProfilePartition(profileID)).cookies
  const result = await deps.importCookies({ sourceID, sourceProfileID, cookies, logger })
  if (result["_tag"] !== "imported") return result
  try {
    await cookies.flushStore()
  } catch {
    logger.warn("Imported cookies could not be flushed to disk", { sourceID })
  }
  logger.info("browser cookie import completed", {
    sourceID,
    imported: result.imported,
    skipped: result.skipped,
  })
  return result
}

/** Open macOS System Settings at Full Disk Access. */
export async function openFullDiskAccessSettings(): Promise<void> {
  if (process.platform !== "darwin") return
  const { shell } = await import("electron")
  await shell.openExternal(FULL_DISK_ACCESS_SETTINGS_URL)
}
