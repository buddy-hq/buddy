import { describe, expect, test } from "bun:test"
import path from "node:path"
import { Agent } from "@buddy/opencode-adapter/agent"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import { syncOpenCodeProjectConfig } from "@buddy/backend/config/runtime"
import { resolveBuddyBundledSkillRoots } from "@buddy/backend/config/runtime"
import { resolveCapabilityProfile } from "../src/learning/resolve-capability-profile"
import { loadBundledActivitySkill } from "../src/learning/curriculum"
import { buildBuddyRuntimeSessionPermissions } from "../src/learning/agent-execution/permissions/session-permissions"
import { getBuddyPersona } from "../src/learning/personas"
import { tmpdir } from "./fixture/fixture"
import { createToolContext, requireTool } from "./helpers/tools"

describe("skill tool visibility", () => {
  test("Buddy bundled skills resolve from a real filesystem root", async () => {
    const roots = await resolveBuddyBundledSkillRoots()
    const normalizedRoots = roots.map((root) => path.normalize(root))
    const expectedSuffix = path.join("packages", "buddy", "src", "learning", "agents", "skills", "system")

    expect(roots.length).toBeGreaterThan(0)
    expect(normalizedRoots.filter((root) => root.endsWith(expectedSuffix)).length).toBeGreaterThan(0)

    const loaded = await loadBundledActivitySkill("buddy-learn-explanation")
    expect(loaded?.name).toBe("buddy-learn-explanation")
    expect(loaded?.content).toContain("# Role")
  })

  test("vendor skill tool exposes Buddy activity skills through agent permissions", async () => {
    await using project = await tmpdir({ git: true })

    const result = await OpenCodeInstance.provide({
      directory: project.path,
      async fn() {
        await syncOpenCodeProjectConfig(project.path, true)

        const runtimeProfile = resolveCapabilityProfile({
          persona: getBuddyPersona("buddy"),
          workspaceState: "chat",
          intentOverride: "learn",
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
        expect(skillTool.description).toContain("buddy-learn-explanation")
        expect(skillTool.description).toContain("buddy-learn-worked-example")
        expect(skillTool.description).not.toContain("buddy-practice-guided")

        const loaded = await skillTool.execute(
          {
            name: "buddy-learn-explanation",
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
    expect(result.output).toContain('<skill_content name="buddy-learn-explanation">')
    expect(result.output).toContain("# Skill: buddy-learn-explanation")
  })
})
