import { afterEach, describe, expect, test } from "bun:test"
import { writeFileSync } from "node:fs"
import path from "node:path"
import { Hono } from "hono"
import { McpRoutes } from "../../src/routes/mcp"
import { closeOpenCodeHost } from "../../src/opencode-runtime/runtime"
const app = new Hono().route("/api/mcp", McpRoutes)
afterEach(closeOpenCodeHost)
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

  test("hides MCP servers that only exist in raw OpenCode config", async () => {
    await using project = await tmpdir({ git: true })

    writeFileSync(
      path.join(project.path, "opencode.jsonc"),
      JSON.stringify(
        {
          mcp: {
            raw_opencode_test: {
              type: "local",
              command: ["bun", "--version"],
              disabled: true,
            },
          },
        },
        null,
        2,
      ) + "\n",
    )

    const response = await app.request("/api/mcp", {
      headers: {
        "x-buddy-directory": project.path,
      },
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({})
  })
  test("persists added MCP definitions and discovers them after a host restart", async () => {
    await using project = await tmpdir({ git: true })
    const response = await app.request("/api/mcp", {
      method: "POST", headers: { "x-buddy-directory": project.path, "content-type": "application/json" },
      body: JSON.stringify({ name: "persisted", config: { type: "local", command: ["bun", "--version"], enabled: false } }),
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ persisted: { status: "disabled" } })
    await closeOpenCodeHost()
    const status = await app.request("/api/mcp", { headers: { "x-buddy-directory": project.path } })
    expect(status.status).toBe(200)
    expect(await status.json()).toEqual({ persisted: { status: "disabled" } })
  })
})
