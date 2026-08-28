import { afterEach, describe, expect, test } from "bun:test"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import { syncOpenCodeProjectConfig } from "../src/config/runtime/opencode-sync"
import { fetchInProcessOpenCode, loadOpenCodeApp } from "../src/opencode-runtime"
import { tmpdir } from "./helpers/tmpdir"

const SESSION_STATUS_PATH = "/session/status"
const BUDDY_FEATURE_TOOL_IDS = [
  "goal_lint",
  "goal_commit",
  "prepare_resource",
  "ingest_full_text",
] as const

async function ensureBuddyPluginTools(directory: string) {
  await loadOpenCodeApp()
  await syncOpenCodeProjectConfig(directory)
}

async function listRegisteredToolIDs(directory: string): Promise<string[]> {
  return OpenCodeInstance.provide({
    directory,
    fn: () => ToolRegistry.ids(),
  })
}

afterEach(async () => {
  await OpenCodeInstance.disposeAll()
})

describe("proxy registration", () => {
  test("does not unregister Buddy feature tools when a proxied request omits registrations", async () => {
    await using project = await tmpdir({ git: true })

    await ensureBuddyPluginTools(project.path)

    const beforeToolIDs = await listRegisteredToolIDs(project.path)
    for (const toolID of BUDDY_FEATURE_TOOL_IDS) {
      expect(beforeToolIDs).toContain(toolID)
    }

    await fetchInProcessOpenCode({
      directory: project.path,
      method: "GET",
      path: SESSION_STATUS_PATH,
      headers: new Headers(),
    })

    await ensureBuddyPluginTools(project.path)

    const afterToolIDs = await listRegisteredToolIDs(project.path)
    for (const toolID of BUDDY_FEATURE_TOOL_IDS) {
      expect(afterToolIDs).toContain(toolID)
    }
  }, 30_000)
})
