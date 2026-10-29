import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { continueSubagentsInBackground } from "../src/lib/use-running-subagents"
import { createFetchStub } from "./test-utils"

const DIRECTORY = "/repo-background"

describe("continueSubagentsInBackground", () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test("backgrounds the owner session's blocking work through the session route", async () => {
    const requests: Array<{ method: string; path: string; directory: string | null }> = []
    globalThis.fetch = createFetchStub(async (input) => {
      const request = input instanceof Request ? input : new Request(String(input))
      requests.push({
        method: request.method,
        path: new URL(request.url, "http://buddy.test").pathname,
        directory: request.headers.get("x-buddy-directory"),
      })
      return new Response(null, { status: 204 })
    })

    await continueSubagentsInBackground(DIRECTORY, "ses_owner")

    expect(requests).toEqual([
      { method: "POST", path: "/api/session/ses_owner/background", directory: DIRECTORY },
    ])
  })

  test("surfaces a route failure", async () => {
    globalThis.fetch = createFetchStub(async () =>
      Response.json({ error: "Session not found" }, { status: 404 }),
    )

    await expect(continueSubagentsInBackground(DIRECTORY, "ses_missing")).rejects.toThrow(
      "Session not found",
    )
  })
})
