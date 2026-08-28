import { describe, expect, test } from "bun:test"
import { getOpenCodeClient } from "../src/opencode-runtime/client"
import { tmpdir } from "./helpers/tmpdir"

describe("OpenCode v2 SDK client helper", () => {
  test("calls the desktop health surface through the v2 SDK client", async () => {
    const client = await getOpenCodeClient()
    const result = await client.global.health()
    expect(result.data).toMatchObject({ healthy: true })
  })

  test("calls the desktop session surface through the v2 SDK client", async () => {
    await using project = await tmpdir({ git: true })
    const client = await getOpenCodeClient(project.path)
    const result = await client.session.list({ directory: project.path })
    expect(Array.isArray(result.data)).toBe(true)
  })
})
