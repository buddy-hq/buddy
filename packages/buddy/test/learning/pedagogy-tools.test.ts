import { describe, expect, test } from "bun:test"
import { writeFileSync } from "node:fs"
import path from "node:path"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { writeTeachingSessionState } from "../../src/learning/agent-execution/state/session-state"
import { tmpdir } from "../helpers/tmpdir"
import {
  createToolContext,
  ensureBuddyPluginTools,
  requireTool,
  TEST_TOOL_MODEL,
} from "../helpers/tools"

describe("pedagogy tools", () => {
  test("registers first-class pedagogy tools and generates grounded teaching artifacts", async () => {
    await using project = await tmpdir({ git: true })
    const sampleResourcePath = path.join(project.path, "prepare-resource-sample.md")
    const invalidResourcePath = path.join(project.path, "download.pdf")
    writeFileSync(
      sampleResourcePath,
      "# Sample Resource\n\nThis is a sample resource used to validate tool-driven preparation.\n",
    )
    writeFileSync(
      invalidResourcePath,
      "<!DOCTYPE html><html><body>download portal</body></html>",
    )
    await ensureBuddyPluginTools(project.path)

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
          invalidResource: await prepareResource.execute(
            {
              sourcePath: invalidResourcePath,
              waitUntilReady: true,
            },
            ctx,
          ),
        }
      },
    })

    expect(result.prepareResource.title).toBe("prepare_resource")
    expect(result.prepareResource.output).toContain("Prepared resource prepare-resource-sample.")
    expect(result.prepareResource.output).toContain("status=ready")
    expect(result.prepareResource.output).toContain("timed_out=false")
    expect(result.prepareResource.metadata.buddyObjectResult.status).toBe("ok")
    expect(result.invalidResource.output).toContain("source_validity=invalid")
    expect(result.invalidResource.output).toContain("bench_reader=none")
    expect(result.invalidResource.metadata.buddyObjectResult).toMatchObject({
      status: "blocked",
      reason: "invalid_resource_source",
      primaryRef: null,
    })
  })
})
