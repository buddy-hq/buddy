import { describe, expect, test } from "bun:test"
import { writeFileSync } from "node:fs"
import path from "node:path"
import { writeTeachingSessionState } from "../../src/learning/agent-execution/state/session-state"
import { BuddyObjectResultSchema } from "../../src/objects"
import { tmpdir } from "../helpers/tmpdir"
import {
  createBuddyToolContext,
  requireTool,
  listBuddyTools,
  ensureBuddyPluginTools,
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
    writeFileSync(invalidResourcePath, "<!DOCTYPE html><html><body>download portal</body></html>")

    await using runtime = await ensureBuddyPluginTools(project.path)
    const registeredIDs = (await runtime.listTools()).map((tool) => tool.name)
    expect(registeredIDs).toContain("prepare_resource")
    expect(registeredIDs).toContain("debug_attempt")
    expect(registeredIDs.every((id) => !id.startsWith("legacy_"))).toBe(true)

    writeTeachingSessionState(project.path, {
      sessionId: "ses_pedagogy",
      persona: "buddy",
      currentSurface: "curriculum",
      teachingWorkspaceState: "inactive",
      focusGoalIds: [],
    })
    const tools = await listBuddyTools()
    const prepareResource = requireTool(tools, "prepare_resource")
    const ctx = createBuddyToolContext({
      directory: project.path,
      sessionID: "ses_pedagogy",
      messageID: "msg_pedagogy",
      agent: "buddy",
    })
    const result = {
      prepareResource: await prepareResource.run(
        {
          sourcePath: sampleResourcePath,
          waitUntilReady: true,
          maxWaitMs: 20_000,
        },
        ctx,
      ),
      invalidResource: await prepareResource.run(
        {
          sourcePath: invalidResourcePath,
          waitUntilReady: true,
        },
        ctx,
      ),
    }

    expect(result.prepareResource.title).toBe("prepare_resource")
    expect(result.prepareResource.output).toContain("Prepared resource prepare-resource-sample.")
    expect(result.prepareResource.output).toContain("status=ready")
    expect(result.prepareResource.output).toContain("timed_out=false")
    expect(BuddyObjectResultSchema.parse(result.prepareResource.metadata.buddyObjectResult).status).toBe("ok")
    expect(result.invalidResource.output).toContain("source_validity=invalid")
    expect(result.invalidResource.output).toContain("bench_reader=none")
    expect(result.invalidResource.metadata.buddyObjectResult).toMatchObject({
      status: "blocked",
      reason: "invalid_resource_source",
      primaryRef: null,
    })
  })
})
