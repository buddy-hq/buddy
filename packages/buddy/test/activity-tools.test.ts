import { describe, expect, test } from "bun:test"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { ensureActivityToolsRegistered } from "../src/learning/agents/curriculum"
import { writeTeachingSessionState } from "../src/learning/agent-execution"
import { tmpdir } from "./fixture/fixture"
import { createToolContext, requireTool } from "./helpers/tools"

describe("activity tools", () => {
  test("registers first-class activity tools and generates grounded activity artifacts", async () => {
    await using project = await tmpdir({ git: true })

    const result = await OpenCodeInstance.provide({
      directory: project.path,
      async fn() {
        writeTeachingSessionState(project.path, {
          sessionId: "ses_activity",
          persona: "buddy",
          intentOverride: "learn",
          currentSurface: "curriculum",
          workspaceState: "chat",
          focusGoalIds: [],
        })

        await ensureActivityToolsRegistered(project.path)
        const tools = await ToolRegistry.tools({
          providerID: "opencode",
          modelID: "claude-sonnet",
        })
        const toolIds = tools.map((tool) => tool.id)

        expect(toolIds).toContain("activity_explanation")
        expect(toolIds).toContain("activity_guided_practice")
        expect(toolIds).toContain("activity_mastery_check")

        const explanation = requireTool(tools, "activity_explanation")
        const guidedPractice = requireTool(tools, "activity_guided_practice")
        const ctx = createToolContext({
          sessionID: "ses_activity",
          messageID: "msg_activity",
          agent: "buddy",
        })

        return {
          explanation: await explanation.execute({ topic: "input validation in Tauri commands" }, ctx),
          guidedPractice: await guidedPractice.execute({ topic: "input validation in Tauri commands" }, ctx),
        }
      },
    })

    expect(result.explanation.output).toContain("<activity_tool_output name=\"activity_explanation\">")
    expect(result.explanation.output).toContain("input validation in Tauri commands")
    expect(result.guidedPractice.output).toContain("<activity_tool_output name=\"activity_guided_practice\">")
    expect(result.guidedPractice.output).toContain("Hint ladder:")
  })
})
