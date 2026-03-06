import { describe, expect, test } from "bun:test"
import { Agent } from "@buddy/opencode-adapter/agent"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import { syncOpenCodeProjectConfig } from "../src/config/compatibility.js"
import { resolveBuddyBundledSkillRoots } from "../src/config/opencode/skills.js"
import { compileRuntimeProfile } from "../src/learning/runtime/compiler.js"
import { loadBundledActivitySkill } from "../src/learning/runtime/activity-skills.js"
import { buildBuddyRuntimeSessionPermissions } from "../src/learning/runtime/session-permissions.js"
import { getBuddyPersona } from "../src/personas/catalog.js"
import { tmpdir } from "./fixture/fixture"

function createToolContext() {
  return {
    sessionID: "ses_skill",
    messageID: "msg_skill",
    agent: "buddy",
    abort: new AbortController().signal,
    messages: [],
    metadata() {},
    async ask() {},
  }
}

describe("skill tool visibility", () => {
  test("Buddy bundled skills resolve from a real filesystem root", async () => {
    const roots = await resolveBuddyBundledSkillRoots()
    expect(roots.length).toBeGreaterThan(0)
    expect(roots.some((root) => root.endsWith("/packages/buddy/src/skills/system"))).toBe(true)

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

        const runtimeProfile = compileRuntimeProfile({
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
        const skillTool = tools.find((tool) => tool.id === "skill")
        expect(skillTool).toBeDefined()
        expect(skillTool?.description).toContain("buddy-learn-explanation")
        expect(skillTool?.description).toContain("buddy-learn-worked-example")
        expect(skillTool?.description).not.toContain("buddy-practice-guided")

        const loaded = await skillTool!.execute(
          {
            name: "buddy-learn-explanation",
          },
          createToolContext(),
        )

        return {
          description: skillTool!.description,
          output: loaded.output,
        }
      },
    })

    expect(result.description).toContain("<available_skills>")
    expect(result.output).toContain("<skill_content name=\"buddy-learn-explanation\">")
    expect(result.output).toContain("# Skill: buddy-learn-explanation")
  })
})
