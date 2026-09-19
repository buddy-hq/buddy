import type {
  InAppBrowserClearProfileDataRequest,
  InAppBrowserCommandResult,
} from "@buddy/browser-contract"
import {
  inAppBrowserProfilePartition,
  parseInAppBrowserProfileID,
} from "@buddy/browser-contract/profiles"
import { z } from "zod"

const SITE_DATA_STORAGES = ["cookies", "localstorage", "indexdb", "serviceworkers"] as const

const clearRequestSchema = z.object({
  profileID: z.string(),
  data: z.enum(["cookies", "cache", "everything"]),
})

/** Options Electron's `Session.clearStorageData` accepts for a targeted wipe. */
export type InAppBrowserClearStorageDataOptions = {
  readonly storages?: readonly string[]
}

/** Chromium session operations used to wipe one in-app browser profile. */
export type InAppBrowserProfileStorageSession = {
  clearStorageData(options?: InAppBrowserClearStorageDataOptions): Promise<void>
  clearCache(): Promise<void>
}

/** Looks up the Chromium session for an in-app browser partition string. */
export type InAppBrowserProfileStorageSessions = {
  fromPartition(partition: string): InAppBrowserProfileStorageSession
}

/**
 * Wipe cookies, cache, or all site data for one in-app browser profile.
 *
 * Opens the profile's partition session even when no tab has used it this run,
 * so a clear after restart still reaches data on disk.
 */
export async function clearInAppBrowserProfileData(
  input: InAppBrowserClearProfileDataRequest,
  sessions: InAppBrowserProfileStorageSessions,
): Promise<InAppBrowserCommandResult> {
  const request = clearRequestSchema.safeParse(input)
  const profileID = request.success ? parseInAppBrowserProfileID(request.data.profileID) : undefined
  if (!request.success || !profileID) return { _tag: "failed", reason: "invalid-request" }

  const browserSession = sessions.fromPartition(inAppBrowserProfilePartition(profileID))
  const { data } = request.data
  try {
    if (data === "cookies") {
      await browserSession.clearStorageData({ storages: [...SITE_DATA_STORAGES] })
    }
    if (data === "everything") await browserSession.clearStorageData()
    if (data !== "cookies") await browserSession.clearCache()
    return { _tag: "done" }
  } catch {
    return { _tag: "failed", reason: "operation-failed" }
  }
}
