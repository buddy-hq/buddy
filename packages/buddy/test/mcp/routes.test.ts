import { describe, expect, test } from "bun:test"
import { app } from "../../src/index.ts"
import { tmpdir } from "../helpers/tmpdir"

describe("mcp routes", () => {
  test("rejects MCP add requests that omit the required name", async () => {
    await using project = await tmpdir({ git: true })

    const response = await app.request("/api/mcp", {
      method: "POST",
      headers: {
        "x-buddy-directory": project.path,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        config: {
          type: "local",
          command: ["bun", "--version"],
          enabled: false,
        },
      }),
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: "Invalid MCP payload",
    })

    const statusResponse = await app.request("/api/mcp", {
      headers: {
        "x-buddy-directory": project.path,
      },
    })

    expect(statusResponse.status).toBe(200)
    await expect(statusResponse.json()).resolves.toEqual({})
  })
})
