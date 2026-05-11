import { afterEach, describe, expect, test } from "bun:test"
import z from "zod"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import { dynamicToolSearchTools } from "../../src/learning/runtime/dynamic-tool-discovery"
import { allBuddyFeatureIds, allBuddyTools } from "../../src/learning/runtime/feature-registry"
import { registerRuntimeTools } from "../../src/learning/runtime/register-tools"
import { TEST_TOOL_MODEL } from "../helpers/tools"
import { tmpdir } from "../helpers/tmpdir"

function enabledToolFlags(): Record<string, boolean> {
  return Object.fromEntries(allBuddyFeatureIds().map((featureId) => [featureId, true]))
}

const CREATED_BUDDY_TOOL_IDS = new Set([
  ...allBuddyTools().map((tool) => tool.id),
  ...dynamicToolSearchTools.map((tool) => tool.id),
])

afterEach(async () => {
  await OpenCodeInstance.disposeAll()
})

describe("tool schema compatibility", () => {
  test("all Buddy createBuddyTool schemas serialize to object-root JSON Schema", async () => {
    await using project = await tmpdir({ git: true })

    await registerRuntimeTools(project.path, enabledToolFlags())

    const toolSchemas = await OpenCodeInstance.provide({
      directory: project.path,
      async fn() {
        const tools = await ToolRegistry.tools(TEST_TOOL_MODEL)
        return tools
          .filter((tool) => CREATED_BUDDY_TOOL_IDS.has(tool.id))
          .map((tool) => ({ id: tool.id, schema: z.toJSONSchema(tool.parameters) }))
      },
    })

    const checkedToolIDs = new Set(toolSchemas.map((entry) => entry.id))
    const missingToolIDs = [...CREATED_BUDDY_TOOL_IDS].filter(
      (toolID) => !checkedToolIDs.has(toolID),
    )
    expect(missingToolIDs).toEqual([])

    const invalidSchemas = toolSchemas
      .filter((entry) => entry.schema.type !== "object")
      .map((entry) => ({
        id: entry.id,
        rootType: entry.schema.type,
        keys: Object.keys(entry.schema),
      }))

    expect(invalidSchemas).toEqual([])
  })
})
