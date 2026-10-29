import { afterEach, describe, expect, test } from "bun:test"
import { writeFileSync } from "node:fs"
import path from "node:path"
import { Hono } from "hono"
import { McpRoutes } from "../../src/routes/mcp"
import { closeAgentRuntime } from "../../src/runtime/agent-runtime"
const app = new Hono().route("/api/mcp", McpRoutes)
afterEach(closeAgentRuntime)
import { tmpdir } from "../helpers/tmpdir"

describe("mcp routes", () => {
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
})
