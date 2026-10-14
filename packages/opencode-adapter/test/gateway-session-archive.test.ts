import { describe, expect, test } from "bun:test"
import type { SessionInfo } from "@opencode/client"
import { isSessionArchived } from "../src/gateway/session"

const session: SessionInfo = {
  id: "ses_archive",
  projectID: "global",
  location: { directory: "/notebook" },
  cost: 0,
  tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  time: { created: 1, updated: 2 },
}

describe("session archive state", () => {
  test("recognizes native and Buddy metadata timestamps, including zero", () => {
    expect(isSessionArchived({ ...session, time: { ...session.time, archived: 0 } })).toBe(true)
    expect(isSessionArchived({ ...session, metadata: { "buddy.archivedAt": 0 } })).toBe(true)
    expect(isSessionArchived({ ...session, metadata: { "buddy.archivedAt": 12345 } })).toBe(true)
    expect(isSessionArchived(session)).toBe(false)
    expect(isSessionArchived({ ...session, metadata: { "buddy.archivedAt": "12345" } })).toBe(false)
    expect(isSessionArchived({ ...session, metadata: { "buddy.archivedAt": null } })).toBe(false)
    expect(isSessionArchived({ ...session, time: { ...session.time, archived: 12345 }, metadata: { "buddy.archivedAt": "invalid" } })).toBe(true)
  })
})
