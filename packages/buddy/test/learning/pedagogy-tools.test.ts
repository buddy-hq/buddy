import { describe, expect, test } from "bun:test"
import { writeFileSync } from "node:fs"
import path from "node:path"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { ensurePedagogyToolsRegistered } from "../../src/learning/capabilities/pedagogy/tools/register"
import { writeTeachingSessionState } from "../../src/learning/agent-execution/state/session-state"
import { tmpdir } from "../helpers/tmpdir"
import { createToolContext, requireTool, TEST_TOOL_MODEL } from "../helpers/tools"

describe("pedagogy tools", () => {
  test("registers first-class pedagogy tools and generates grounded teaching artifacts", async () => {
    await using project = await tmpdir({ git: true })
    const sampleResourcePath = path.join(project.path, "prepare-resource-sample.md")
    writeFileSync(
      sampleResourcePath,
      "# Sample Resource\n\nThis is a sample resource used to validate tool-driven preparation.\n",
    )

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
        expect(toolIds).toContain("pedagogy_prepare_resource")
        expect(toolIds).not.toContain("pedagogy_explanation")
        expect(toolIds.every((id) => !id.startsWith("legacy_"))).toBe(true)

        const guidedPractice = requireTool(tools, "pedagogy_guided_practice")
        const masteryCheck = requireTool(tools, "pedagogy_mastery_check")
        const prepareResource = requireTool(tools, "pedagogy_prepare_resource")
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
          prepareResource: await prepareResource.execute(
            {
              sourcePath: sampleResourcePath,
              waitUntilReady: true,
              maxWaitMs: 20_000,
            },
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
    expect(result.prepareResource.title).toBe("pedagogy_prepare_resource")
    expect(result.prepareResource.output).toContain("<resource_preparation")
    expect(result.prepareResource.output).toContain("status=ready")
    expect(result.prepareResource.output).toContain("timed_out=false")
  })
})
