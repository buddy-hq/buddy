import { describe, expect, test } from "bun:test"
import { app } from "../src/index.ts"

describe("SSE event streaming compatibility", () => {
  test("rejects disallowed directories for event stream endpoint", async () => {
    const response = await app.request("/api/event?directory=%2F")
    expect(response.status).toBe(403)

    const body = (await response.json()) as { error?: string }
    expect(body.error).toBe("Directory is outside allowed roots")
  })

  test("proxies OpenCode SSE stream with the expected content-type", async () => {
    const response = await app.request("/api/event", {
      headers: {
        accept: "text/event-stream",
        "x-buddy-directory": process.cwd(),
      },
    })

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("text/event-stream")

    await response.body?.cancel()
  })
})
