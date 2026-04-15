import { describe, expect, test } from "bun:test"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { ensureCurriculumToolsRegistered } from "../../src/learning/curriculum/planning/tools/register"
import { tmpdir } from "../helpers/tmpdir"
import { TEST_TOOL_MODEL } from "../helpers/tools"

describe("curriculum tools", () => {
  test("does not register the legacy curriculum_read tool", async () => {
    await using project = await tmpdir({ git: true })

    const tools = await OpenCodeInstance.provide({
      directory: project.path,
      async fn() {
        await ensureCurriculumToolsRegistered(project.path)
        return ToolRegistry.tools(TEST_TOOL_MODEL)
      },
    })

    expect(tools.some((tool) => tool.id === "curriculum_read")).toBe(false)
  })
})
