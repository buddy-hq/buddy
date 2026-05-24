import { describe, expect, test } from "bun:test"
import { getOpenCodeClient } from "../src/opencode-runtime/client"
import { tmpdir } from "./helpers/tmpdir"

describe("OpenCode SDK client helper", () => {
  test("creates a client that can call health endpoint", async () => {
    const client = await getOpenCodeClient()
    const result = await client.global.health()
    expect(result.data).toMatchObject({ healthy: true })
  })

  test("creates a client that can list sessions", async () => {
    await using project = await tmpdir({ git: true })
    const client = await getOpenCodeClient(project.path)
    const result = await client.session.list({ directory: project.path })
    expect(Array.isArray(result.data)).toBe(true)
  })
})
