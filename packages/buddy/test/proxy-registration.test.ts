import { describe, expect, test } from "bun:test"
import { tmpdir } from "./helpers/tmpdir"
import { ensureBuddyPluginTools } from "./helpers/tools"

const BUDDY_FEATURE_TOOL_IDS = ["goal_lint", "goal_commit", "prepare_resource", "ingest_full_text"]

describe("runtime registration", () => {
  test("retains Buddy feature tools after a host request and notebook config resync", async () => {
    await using project = await tmpdir({ git: true })
    await using runtime = await ensureBuddyPluginTools(project.path)
    const before = (await runtime.listTools()).map((tool) => tool.name)
    for (const id of BUDDY_FEATURE_TOOL_IDS) expect(before).toContain(id)
    await runtime.host.session.active()
    const { syncNotebookRuntimeConfig } = await import("../src/config/runtime/opencode-sync")
    await syncNotebookRuntimeConfig(runtime.host, project.path)
    const after = (await runtime.listTools()).map((tool) => tool.name)
    for (const id of BUDDY_FEATURE_TOOL_IDS) expect(after).toContain(id)
  })
})
