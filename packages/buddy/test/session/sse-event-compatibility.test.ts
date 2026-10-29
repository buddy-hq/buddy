import { describe, expect, test } from "bun:test"
import { app } from "../../src/index.ts"
import { requireJsonObject } from "../helpers/parse"

describe("SSE event streaming compatibility", () => {
  test("rejects disallowed directories for event stream endpoint", async () => {
    const response = await app.request("/api/event?directory=%2F")
    expect(response.status).toBe(403)

    const body = requireJsonObject(await response.json())
    expect(body.error).toBe("Directory is outside allowed roots")
  })
})
