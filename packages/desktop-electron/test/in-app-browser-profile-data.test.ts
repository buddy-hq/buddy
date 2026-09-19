import { describe, expect, test } from "bun:test"
import type { InAppBrowserProfileData } from "@buddy/browser-contract"
import {
  clearInAppBrowserProfileData,
  type InAppBrowserClearStorageDataOptions,
  type InAppBrowserProfileStorageSession,
} from "../src/main/in-app-browser-profile-data"

const COOKIE_SITE_DATA = ["cookies", "localstorage", "indexdb", "serviceworkers"] as const
const WORK_PARTITION = "persist:buddy-browser-profile-work"
const DEFAULT_PARTITION = "persist:buddy-browser"

type StorageOp =
  | { readonly op: "clearStorageData"; readonly options?: InAppBrowserClearStorageDataOptions }
  | { readonly op: "clearCache" }

function createStorageSession(): InAppBrowserProfileStorageSession & {
  readonly ops: StorageOp[]
} {
  const ops: StorageOp[] = []
  return {
    ops,
    async clearStorageData(options) {
      ops.push(
        options === undefined ? { op: "clearStorageData" } : { op: "clearStorageData", options },
      )
    },
    async clearCache() {
      ops.push({ op: "clearCache" })
    },
  }
}

function createEmptyPartitionSessions() {
  const byPartition = new Map<string, ReturnType<typeof createStorageSession>>()
  return {
    byPartition,
    fromPartition(partition: string) {
      const existing = byPartition.get(partition)
      if (existing) return existing
      const created = createStorageSession()
      byPartition.set(partition, created)
      return created
    },
  }
}

describe("in-app browser profile data", () => {
  test("clears cookies as site data and leaves the HTTP cache", async () => {
    const sessions = createEmptyPartitionSessions()

    expect(
      await clearInAppBrowserProfileData({ profileID: "work", data: "cookies" }, sessions),
    ).toEqual({ _tag: "done" })

    expect([...sessions.byPartition.keys()]).toEqual([WORK_PARTITION])
    expect(sessions.byPartition.get(WORK_PARTITION)?.ops).toEqual([
      { op: "clearStorageData", options: { storages: [...COOKIE_SITE_DATA] } },
    ])
  })

  test("clears cache without touching site data", async () => {
    const sessions = createEmptyPartitionSessions()

    expect(
      await clearInAppBrowserProfileData({ profileID: "work", data: "cache" }, sessions),
    ).toEqual({ _tag: "done" })

    expect(sessions.byPartition.get(WORK_PARTITION)?.ops).toEqual([{ op: "clearCache" }])
  })

  test("clears every storage kind and the HTTP cache", async () => {
    const sessions = createEmptyPartitionSessions()

    expect(
      await clearInAppBrowserProfileData({ profileID: "work", data: "everything" }, sessions),
    ).toEqual({ _tag: "done" })

    expect(sessions.byPartition.get(WORK_PARTITION)?.ops).toEqual([
      { op: "clearStorageData" },
      { op: "clearCache" },
    ])
  })

  test("opens a never-used profile partition so a post-restart clear still wipes it", async () => {
    const sessions = createEmptyPartitionSessions()
    expect(sessions.byPartition.size).toBe(0)

    expect(
      await clearInAppBrowserProfileData({ profileID: "work", data: "cookies" }, sessions),
    ).toEqual({ _tag: "done" })

    expect([...sessions.byPartition.keys()]).toEqual([WORK_PARTITION])
    expect(sessions.byPartition.get(DEFAULT_PARTITION)).toBeUndefined()
    expect(sessions.byPartition.get(WORK_PARTITION)?.ops).toHaveLength(1)
  })

  test("rejects an unusable request without opening a partition", async () => {
    const sessions = createEmptyPartitionSessions()

    expect(
      await clearInAppBrowserProfileData(
        { profileID: "../default", data: "cookies" },
        sessions,
      ),
    ).toEqual({ _tag: "failed", reason: "invalid-request" })
    expect(
      await clearInAppBrowserProfileData(
        // SAFETY: Renderer IPC can send any string; this is not a valid data kind and exists only to exercise the Zod reject path.
        { profileID: "work", data: "history" as InAppBrowserProfileData },
        sessions,
      ),
    ).toEqual({ _tag: "failed", reason: "invalid-request" })

    expect(sessions.byPartition.size).toBe(0)
  })

  test("reports an operation failure when Chromium rejects the wipe", async () => {
    expect(
      await clearInAppBrowserProfileData(
        { profileID: "work", data: "cookies" },
        {
          fromPartition: () => ({
            clearStorageData: async () => {
              throw new Error("session closed")
            },
            clearCache: async () => undefined,
          }),
        },
      ),
    ).toEqual({ _tag: "failed", reason: "operation-failed" })
  })
})
