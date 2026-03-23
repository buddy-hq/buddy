import { describe, expect, test } from "bun:test"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { ensurePedagogyToolsRegistered } from "../../src/learning/capabilities"
import { writeTeachingSessionState } from "../../src/learning/agent-execution/state/session-state"
import { tmpdir } from "../helpers/tmpdir"
import { createToolContext, requireTool, TEST_TOOL_MODEL } from "../helpers/tools"

describe("pedagogy tools", () => {
  test("registers first-class pedagogy tools and generates grounded teaching artifacts", async () => {
    await using project = await tmpdir({ git: true })

    const result = await OpenCodeInstance.provide({
      directory: project.path,
      async fn() {
        writeTeachingSessionState(project.path, {
          sessionId: "ses_pedagogy",
          persona: "buddy",
          intent: "learn",
          currentSurface: "curriculum",
          workspaceState: "chat",
          focusGoalIds: [],
        })

        await ensurePedagogyToolsRegistered(project.path)
        const tools = await ToolRegistry.tools(TEST_TOOL_MODEL)
        const toolIds = tools.map((tool) => tool.id)

        expect(toolIds).toContain("pedagogy_guided_practice")
        expect(toolIds).toContain("pedagogy_mastery_check")
        expect(toolIds).not.toContain("pedagogy_explanation")
        expect(toolIds.every((id) => !id.startsWith("legacy_"))).toBe(true)

        const guidedPractice = requireTool(tools, "pedagogy_guided_practice")
        const masteryCheck = requireTool(tools, "pedagogy_mastery_check")
        const ctx = createToolContext({
          sessionID: "ses_pedagogy",
          messageID: "msg_pedagogy",
          agent: "buddy",
        })

        return {
          guidedPractice: await guidedPractice.execute(
            { topic: "input validation in Tauri commands" },
            ctx,
          ),
          masteryCheck: await masteryCheck.execute(
            { topic: "input validation in Tauri commands" },
            ctx,
          ),
        }
      },
    })

    expect(result.guidedPractice.output).toContain(
      '<pedagogy_tool_output name="pedagogy_guided_practice">',
    )
    expect(result.guidedPractice.output).toContain("Hint ladder:")
    expect(result.masteryCheck.output).toContain(
      '<pedagogy_tool_output name="pedagogy_mastery_check">',
    )
    expect(result.masteryCheck.output).toContain("input validation in Tauri commands")
  })
})
