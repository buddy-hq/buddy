import { afterEach, describe, expect, test } from "bun:test"
import { continueSubagentsInBackground } from "../src/lib/use-running-subagents"
import { installTestFetch, restoreTestFetch } from "./test-utils"

const DIRECTORY = "/repo-background"

const originalFetch = globalThis.fetch

describe("continueSubagentsInBackground", () => {
  afterEach(() => {
    restoreTestFetch(originalFetch)
  })

  test("backgrounds the owner session's blocking work through the session route", async () => {
    const requests: Array<{ method: string; path: string; directory: string | null }> = []
    installTestFetch(async (input, init) => {
      const request =
        input instanceof Request
          ? input
          : new Request(new URL(String(input), "http://buddy.test"), init)
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
    installTestFetch(async () => Response.json({ error: "Session not found" }, { status: 404 }))

    await expect(continueSubagentsInBackground(DIRECTORY, "ses_missing")).rejects.toThrow(
      "Session not found",
    )
  })
})
