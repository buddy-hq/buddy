import { describe, expect, test } from "bun:test"
import { writeFileSync } from "node:fs"
import path from "node:path"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { registerBuddyTools } from "../../src/learning/runtime/register-buddy-tools"
import {
  dynamicDebugAttemptTool,
  debugAttemptTool,
} from "../../src/learning/features/debug-guidance/tools/debug-attempt"
import {
  dynamicReflectionTool,
  reflectionTool,
} from "../../src/learning/features/teaching-guidance/tools/reflection"
import {
  dynamicStepwiseSolveTool,
  stepwiseSolveTool,
} from "../../src/learning/features/stepwise-solving/tools/stepwise-solve"
import { prepareResourceTool } from "../../src/learning/features/reading/tools/prepare-resource"
import { ingestFullTextTool } from "../../src/learning/features/reading/tools/ingest-full-text"
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
          currentSurface: "curriculum",
          teachingWorkspaceState: "inactive",
          focusGoalIds: [],
        })

        await registerBuddyTools(project.path, [
          debugAttemptTool,
          stepwiseSolveTool,
          reflectionTool,
          prepareResourceTool,
          ingestFullTextTool,
          dynamicDebugAttemptTool,
          dynamicReflectionTool,
          dynamicStepwiseSolveTool,
        ])
        const tools = await ToolRegistry.tools(TEST_TOOL_MODEL)
        const toolIds = tools.map((tool) => tool.id)

        expect(toolIds).toContain("prepare_resource")
        expect(toolIds).toContain("debug_attempt")
        expect(toolIds.every((id) => !id.startsWith("legacy_"))).toBe(true)

        const prepareResource = requireTool(tools, "prepare_resource")
        const ctx = createToolContext({
          sessionID: "ses_pedagogy",
          messageID: "msg_pedagogy",
          agent: "buddy",
        })

        return {
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

    expect(result.prepareResource.title).toBe("prepare_resource")
    expect(result.prepareResource.output).toContain("<resource_preparation")
    expect(result.prepareResource.output).toContain("status=ready")
    expect(result.prepareResource.output).toContain("timed_out=false")
  })
})
