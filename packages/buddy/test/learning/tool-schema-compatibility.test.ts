import { afterEach, describe, expect, test } from "bun:test"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import { ToolJsonSchema } from "@buddy/opencode-adapter/tool"
import { syncOpenCodeProjectConfig } from "../../src/config/runtime/opencode-sync"
import { dynamicToolSearchTools } from "../../src/learning/runtime/dynamic-tool-discovery"
import { allBuddyTools } from "../../src/learning/runtime/feature-registry"
import { AdvancedMathRuntimeService } from "../../src/local-runtimes/advanced-math/service"
import { StandardsRuntimeService } from "../../src/local-runtimes/standards/service"
import { loadOpenCodeApp } from "../../src/opencode-runtime"
import { TEST_TOOL_MODEL } from "../helpers/tools"
import { tmpdir } from "../helpers/tmpdir"

const CREATED_BUDDY_TOOL_IDS = new Set([
  ...allBuddyTools().map((tool) => tool.id),
  ...dynamicToolSearchTools.map((tool) => tool.id),
])

const originalAdvancedMathReady = AdvancedMathRuntimeService.isReady.bind(
  AdvancedMathRuntimeService,
)
const originalStandardsReady = StandardsRuntimeService.isReady.bind(StandardsRuntimeService)

afterEach(async () => {
  AdvancedMathRuntimeService.isReady = originalAdvancedMathReady
  StandardsRuntimeService.isReady = originalStandardsReady
  await OpenCodeInstance.disposeAll()
})

describe("tool schema compatibility", () => {
  test("all Buddy createBuddyTool schemas serialize to object-root JSON Schema", async () => {
    AdvancedMathRuntimeService.isReady = () => true
    StandardsRuntimeService.isReady = () => true

    await using project = await tmpdir({ git: true })

    await loadOpenCodeApp()
    await syncOpenCodeProjectConfig(project.path)

    const toolSchemas = await OpenCodeInstance.provide({
      directory: project.path,
      async fn() {
        const tools = await ToolRegistry.tools(TEST_TOOL_MODEL)
        return tools
          .filter((tool) => CREATED_BUDDY_TOOL_IDS.has(tool.id))
          .map((tool) => ({
            id: tool.id,
            schema: tool.jsonSchema ?? ToolJsonSchema.fromSchema(tool.parameters),
          }))
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
  }, 30_000)
})
