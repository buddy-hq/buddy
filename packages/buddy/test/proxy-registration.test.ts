import { afterEach, describe, expect, test } from "bun:test"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import { allBuddyFeatureIds } from "../src/learning/runtime/feature-registry"
import { registerRuntimeTools } from "../src/learning/runtime/register-tools"
import { fetchOpenCode } from "../src/http"
import { TEST_TOOL_MODEL } from "./helpers/tools"
import { tmpdir } from "./helpers/tmpdir"

const CURRICULUM_PLANNING_FEATURE_ID = "curriculum-planning"
const READING_FEATURE_ID = "reading"
const SESSION_STATUS_PATH = "/session/status"
const BUDDY_FEATURE_TOOL_IDS = [
  "goal_lint",
  "goal_commit",
  "prepare_resource",
  "ingest_full_text",
] as const

function disabledToolFlags(): Record<string, boolean> {
  return Object.fromEntries(allBuddyFeatureIds().map((featureID) => [featureID, false]))
}

async function listToolIDs(directory: string): Promise<string[]> {
  return OpenCodeInstance.provide({
    directory,
    async fn() {
      const tools = await ToolRegistry.tools(TEST_TOOL_MODEL)
      return tools.map((tool) => tool.id)
    },
  })
}

afterEach(async () => {
  await OpenCodeInstance.disposeAll()
})

describe("proxy registration", () => {
  test("does not unregister Buddy feature tools when a proxied request omits registrations", async () => {
    await using project = await tmpdir({ git: true })

    await registerRuntimeTools(project.path, {
      ...disabledToolFlags(),
      [CURRICULUM_PLANNING_FEATURE_ID]: true,
      [READING_FEATURE_ID]: true,
    })

    const beforeToolIDs = await listToolIDs(project.path)
    for (const toolID of BUDDY_FEATURE_TOOL_IDS) {
      expect(beforeToolIDs).toContain(toolID)
    }

    await fetchOpenCode({
      directory: project.path,
      method: "GET",
      path: SESSION_STATUS_PATH,
      headers: new Headers(),
    })

    const afterToolIDs = await listToolIDs(project.path)
    for (const toolID of BUDDY_FEATURE_TOOL_IDS) {
      expect(afterToolIDs).toContain(toolID)
    }
  })
})
