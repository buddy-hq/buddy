import { describe, expect, test } from "bun:test"
import { syncOpenCodeProjectConfig } from "../../src/config/runtime/opencode-sync"
import { getOpenCodeClient } from "../../src/opencode-runtime/client"
import { loadOpenCodeApp } from "../../src/opencode-runtime/runtime"
import { tmpdir } from "../helpers/tmpdir"

describe("in-process OpenCode fetch overlay", () => {
  test("loads Buddy agents when SDK requests run through fetchOpenCodeApp", async () => {
    await using project = await tmpdir({ git: true })

    await loadOpenCodeApp()
    await syncOpenCodeProjectConfig(project.path, true)

    const client = await getOpenCodeClient(project.path)
    const response = await client.app.agents({
      directory: project.path,
    })

    expect(response.error).toBeUndefined()
    expect(response.data?.some((agent) => agent.name === "buddy")).toBe(true)
  }, 30_000)
})
