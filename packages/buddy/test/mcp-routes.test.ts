import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import path from "node:path"
import { app } from "../src/index.ts"
import { createGitRepo } from "./helpers/repo"

describe("mcp routes", () => {
  test("syncs disabled Buddy MCP entries into Buddy project config and reports disabled status", async () => {
    const repo = createGitRepo("buddy-route-mcp-disabled")

    const saveResponse = await app.request(
      `/api/config/mcp/demo?directory=${encodeURIComponent(repo)}`,
      {
        method: "PUT",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          type: "local",
          command: ["node", "-e", "process.stdin.resume()"],
          enabled: false,
        }),
      },
    )

    expect(saveResponse.status).toBe(200)

    const statusResponse = await app.request(`/api/mcp?directory=${encodeURIComponent(repo)}`)
    expect(statusResponse.status).toBe(200)
    await expect(statusResponse.json()).resolves.toEqual({
      demo: {
        status: "disabled",
      },
    })

    const piConfigPath = path.join(repo, ".buddy", "mcp.json")
    expect(JSON.parse(readFileSync(piConfigPath, "utf8"))).toEqual({
      mcpServers: {},
    })
  })
})
