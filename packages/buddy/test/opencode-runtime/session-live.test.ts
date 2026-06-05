import { afterEach, describe, expect, test } from "bun:test"
import { ProjectID, SessionID } from "@buddy/opencode-adapter/id"
import {
  canonicalizeSession,
  removeCachedSession,
} from "@buddy/opencode-adapter/session-live"
import type { Session } from "@buddy/opencode-adapter/session"

const TEST_SESSION_ID = SessionID.descending("ses_session_live_cache")

afterEach(() => {
  removeCachedSession(TEST_SESSION_ID)
})

function sessionInfo(input: { title: string; updated: number }): Session.Info {
  return {
    id: TEST_SESSION_ID,
    slug: "session-live-cache",
    projectID: ProjectID.global,
    directory: "/tmp/buddy-session-live-cache",
    title: input.title,
    version: "0.0.0",
    time: {
      created: 1,
      updated: input.updated,
    },
    permission: [
      {
        permission: "tool",
        pattern: "render_mermaid",
        action: "ask",
      },
    ],
  }
}

describe("session live cache", () => {
  test("returns cloned cached sessions so caller mutation cannot leak back", () => {
    const first = canonicalizeSession(sessionInfo({ title: "Original", updated: 1 }))
    first.title = "Mutated outside cache"
    first.time.updated = 999
    first.permission?.push({
      permission: "tool",
      pattern: "python_calculator",
      action: "allow",
    })

    const second = canonicalizeSession(sessionInfo({ title: "Original", updated: 2 }))

    expect(second.title).toBe("Original")
    expect(second.time.updated).toBe(2)
    expect(second.permission).toEqual([
      {
        permission: "tool",
        pattern: "render_mermaid",
        action: "ask",
      },
    ])
  })
})
