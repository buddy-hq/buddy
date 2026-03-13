import { describe, expect, test } from "bun:test"
import path from "node:path"
import { Agent } from "@buddy/opencode-adapter/agent"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import { syncOpenCodeProjectConfig } from "@buddy/backend/config/runtime"
import { resolveBuddyBundledSkillRoots } from "@buddy/backend/config/runtime"
import { resolveCapabilityProfile } from "../../src/learning/resolve-capability-profile"
import { loadBundledSkill } from "../../src/learning/intents/capabilities"
import { buildBuddyRuntimeSessionPermissions } from "../../src/learning/agent-execution/permissions/session-permissions"
import { getBuddyPersona } from "../../src/learning/personas"
import { tmpdir } from "../helpers/tmpdir"
import { createToolContext, requireTool } from "../helpers/tools"

describe("skill tool visibility", () => {
  test("Buddy bundled skills resolve from a real filesystem root", async () => {
    const roots = await resolveBuddyBundledSkillRoots()
    const normalizedRoots = roots.map((root) => path.normalize(root))
    const expectedSuffix = path.join(
      "packages",
      "buddy",
      "src",
      "learning",
      "capabilities",
      "pedagogy",
      "skills",
    )

    expect(roots.length).toBeGreaterThan(0)
    expect(normalizedRoots.filter((root) => root.endsWith(expectedSuffix)).length).toBeGreaterThan(0)

    const loaded = await loadBundledSkill("buddy-pedagogy-explanation")
    expect(loaded?.name).toBe("buddy-pedagogy-explanation")
    expect(loaded?.content).toContain("# Role")
  })

  test("vendor skill tool exposes Buddy pedagogy skills through agent permissions", async () => {
    await using project = await tmpdir({ git: true })

    const result = await OpenCodeInstance.provide({
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
        const tools = await ToolRegistry.tools(
          {
            providerID: "opencode",
            modelID: "claude-sonnet",
          },
          agent,
        )
        const skillTool = requireTool(tools, "skill")
        expect(skillTool.description).toContain("buddy-pedagogy-explanation")
        expect(skillTool.description).toContain("buddy-pedagogy-worked-example")
        expect(skillTool.description).not.toContain("buddy-pedagogy-debug-attempt")

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

        return {
          description: skillTool.description,
          output: loaded.output,
        }
      },
    })

    expect(result.description).toContain("<available_skills>")
    expect(result.output).toContain('<skill_content name="buddy-pedagogy-explanation">')
    expect(result.output).toContain("# Skill: buddy-pedagogy-explanation")
  })
})
