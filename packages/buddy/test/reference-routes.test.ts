import { afterAll, describe, expect, test } from "bun:test"
import { closeAgentRuntime } from "../src/runtime/agent-runtime"
import { Hono } from "hono"
import { ReferenceRoutes } from "../src/routes/reference"
const app = new Hono().route("/api/reference", ReferenceRoutes)

describe("OpenCode v2 reference routes", () => {
  afterAll(async () => {
    await closeAgentRuntime()
  })

  test("rejects reference reads outside allowed roots", async () => {
    const response = await app.request("/api/reference", {
      headers: {
        "x-buddy-directory": "/",
      },
    })

    expect(response.status).toBe(403)
  })
})
