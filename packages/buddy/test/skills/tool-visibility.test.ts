import { describe, expect, test } from "bun:test"
import { Agent } from "@buddy/opencode-adapter/agent"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import { syncOpenCodeProjectConfig } from "@buddy/backend/config/runtime"
import { resolveCapabilityProfile } from "../../src/learning/resolve-capability-profile"
import { buildBuddyRuntimeSessionPermissions } from "../../src/learning/agent-execution/permissions/session-permissions"
import { getBuddyPersona } from "../../src/learning/personas"
import { tmpdir } from "../helpers/tmpdir"
import { createToolContext, requireTool, TEST_TOOL_MODEL } from "../helpers/tools"

describe("skill tool visibility", () => {
  test("vendor skill tool exposes Buddy pedagogy skills through agent permissions", async () => {
    await using project = await tmpdir({ git: true })

    const output = await OpenCodeInstance.provide({
      directory: project.path,
      async fn() {
        await syncOpenCodeProjectConfig(project.path, true)

        const runtimeProfile = resolveCapabilityProfile({
          persona: getBuddyPersona("buddy"),
          workspaceState: "chat",
          intent: "learn",
        })
        const permission = buildBuddyRuntimeSessionPermissions({
          runtimeProfile,
        })
        const agent = Agent.Info.parse({
          name: "buddy",
          mode: "primary",
          permission,
          options: {},
        })
        const tools = await ToolRegistry.tools(TEST_TOOL_MODEL, agent)
        const skillTool = requireTool(tools, "skill")
        const loaded = await skillTool.execute(
          {
            name: "buddy-pedagogy-explanation",
          },
          createToolContext({
            sessionID: "ses_skill",
            messageID: "msg_skill",
            agent: "buddy",
          }),
        )

        return loaded.output
      },
    })

    expect(output).toContain("buddy-pedagogy-explanation")
  })
})
