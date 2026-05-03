import { afterEach, describe, expect, test } from "bun:test"
import { Agent } from "@buddy/opencode-adapter/agent"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import { syncOpenCodeProjectConfig } from "@buddy/backend/config/runtime"
import { resolveSessionRuntime } from "../../src/learning/access/resolve-session-runtime"
import { buildBuddyRuntimeSessionPermissions } from "../../src/learning/agent-execution/permissions/session-permissions"
import { REGISTERED_BUDDY_PERSONAS } from "../../src/learning/personas/registry"
import { getBuddyPersona } from "../../src/learning/personas/wiring/persona-profiles"
import { tmpdir } from "../helpers/tmpdir"
import { createToolContext, requireTool, TEST_TOOL_MODEL } from "../helpers/tools"

afterEach(async () => {
  await OpenCodeInstance.disposeAll()
})

describe("skill tool visibility", () => {
  test("vendor skill tool exposes Buddy teaching skills through agent permissions", async () => {
    await using project = await tmpdir({ git: true })

    const output = await OpenCodeInstance.provide({
      directory: project.path,
      async fn() {
        await syncOpenCodeProjectConfig(project.path, true)

        const persona = getBuddyPersona("buddy")
        const personaDefinition = REGISTERED_BUDDY_PERSONAS.find(
          (definition) => definition.id === "buddy",
        )
        if (!personaDefinition) {
          throw new Error('Missing "buddy" persona definition')
        }
        const sessionRuntime = resolveSessionRuntime({
          persona: {
            id: persona.id,
            features: personaDefinition.features,
            defaultSurface: persona.defaultSurface,
          },
          teachingWorkspaceState: "inactive",
        })
        const permission = buildBuddyRuntimeSessionPermissions({
          sessionRuntime,
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
            name: "explain",
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

    expect(output).toContain("explain")
  })
})
