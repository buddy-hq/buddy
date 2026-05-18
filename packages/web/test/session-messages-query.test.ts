import { describe, expect, test } from "bun:test"

import { directorySessionsQueryOptions } from "../src/state/directory-chat-query"
import {
  directorySessionMessagesQueryOptions,
  sessionMessagesQueryKeys,
} from "../src/state/session-messages-query"

describe("session messages query options", () => {
  test("builds a session-scoped message query key", () => {
    expect(sessionMessagesQueryKeys.messages("/tmp/notebook", "ses_123")).toEqual([
      "directory-chat",
      "messages",
      "/tmp/notebook",
      "ses_123",
    ])
  })

  test("normalizes empty directories to the global scope key", () => {
    expect(sessionMessagesQueryKeys.messages("   ", "ses_123")).toEqual([
      "directory-chat",
      "messages",
      "__global__",
      "ses_123",
    ])
  })

  test("keeps directory metadata fresh longer than before", () => {
    expect(directorySessionsQueryOptions("/tmp/notebook").staleTime).toBe(60_000)
  })

  test("prefetches session messages with a one minute stale window", () => {
    expect(directorySessionMessagesQueryOptions("/tmp/notebook", "ses_123").staleTime).toBe(60_000)
  })
})
