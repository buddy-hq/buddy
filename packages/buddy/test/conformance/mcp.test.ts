import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import z from "zod"
import { createConfigConformanceHarness, type ConfigConformanceHarness } from "./harness-config"

let harness: ConfigConformanceHarness
const statuses = z.record(z.string(), z.object({ status: z.string() }))

describe("MCP port conformance", () => {
  beforeAll(async () => {
    harness = await createConfigConformanceHarness()
  })
  afterAll(async () => {
    await harness?.[Symbol.asyncDispose]()
  })

  test("saved server definitions are readable and reported as disabled until connected", async () => {
    const notebook = await harness.notebook("mcp-definition")
    expect(await notebook.json("/mcp", statuses)).toEqual({})
    const config = { type: "local", command: harness.localMcpCommand, enabled: false }
    expect(
      await notebook.json("/mcp", statuses, { body: { name: "fixture", config } }),
    ).toMatchObject({ fixture: { status: "disabled" } })
    expect(await notebook.json("/config/raw", z.json())).toMatchObject({ mcp: { fixture: config } })
    expect(await notebook.json("/global/dispose", z.boolean(), { method: "POST" })).toBe(true)
    expect(await notebook.json("/mcp", statuses)).toMatchObject({ fixture: { status: "disabled" } })
  })

  test("a local server connects and disconnects without an external service", async () => {
    const notebook = await harness.notebook("mcp-connection")
    await notebook.json("/mcp", statuses, {
      body: {
        name: "fixture",
        config: { type: "local", command: harness.localMcpCommand, enabled: false },
      },
    })
    expect(await notebook.json("/mcp/fixture/connect", z.boolean(), { method: "POST" })).toBe(true)
    expect(await notebook.json("/mcp", statuses)).toMatchObject({
      fixture: { status: "connected" },
    })
    expect(await notebook.json("/mcp/fixture/disconnect", z.boolean(), { method: "POST" })).toBe(
      true,
    )
    expect(await notebook.json("/mcp", statuses)).toMatchObject({ fixture: { status: "disabled" } })
  })

  test("invalid server definitions are rejected without adding a server", async () => {
    const notebook = await harness.notebook("mcp-invalid")
    const response = await notebook.request("/mcp", {
      body: { config: { type: "local", command: harness.localMcpCommand, enabled: false } },
    })
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: expect.any(String) })
    expect(await notebook.json("/mcp", statuses)).toEqual({})
  })
})
