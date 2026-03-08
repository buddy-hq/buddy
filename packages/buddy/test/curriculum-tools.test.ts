import { describe, expect, test } from "bun:test"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { ensureCurriculumToolsRegistered } from "../src/learning/curriculum/tools/register.js"
import { tmpdir } from "./fixture/fixture"
import { createToolContext, requireTool } from "./helpers/tools"

describe("curriculum tools", () => {
  test("reads the generated learning-plan view and does not register direct edit tools", async () => {
    await using project = await tmpdir({ git: true })

    const result = await OpenCodeInstance.provide({
      directory: project.path,
      async fn() {
        await ensureCurriculumToolsRegistered(project.path)
        const tools = await ToolRegistry.tools({
          providerID: "opencode",
          modelID: "claude-sonnet",
        })
        const curriculumRead = requireTool(tools, "learner_snapshot_read")
        const curriculumUpdate = tools.find((tool) => tool.id === "curriculum_update")

        expect(curriculumUpdate).toBeUndefined()

        const ctx = createToolContext({
          sessionID: "ses_curriculum",
          messageID: "msg_curriculum",
          agent: "build",
        })
        return curriculumRead.execute({}, ctx)
      },
    })

    expect(result.output).toContain("# Learning Snapshot")
    expect(result.output).toContain("No active goals in this workspace yet.")
  })
})
