import { describe, expect, test } from "bun:test"
import { getOpenCodeClient } from "../src/opencode-runtime/client"
import { tmpdir } from "./helpers/tmpdir"

describe("OpenCode v2 SDK client helper", () => {
  test("calls the desktop session surface through the v2 SDK client", async () => {
    await using project = await tmpdir({ git: true })
    const client = await getOpenCodeClient()
    await client.location.get({ location: { directory: project.path } })
    const result = await client.sessions.list({ directory: project.path })
    expect(Array.isArray(result.data)).toBe(true)
  })
})
