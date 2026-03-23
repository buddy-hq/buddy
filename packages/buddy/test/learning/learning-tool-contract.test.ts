import { describe, expect, test } from "bun:test"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import type { BuddyTool } from "../../src/learning/tools"
import {
  allLearningToolIds,
  assertUniqueLearningToolIds,
  allLearningTools,
} from "../../src/learning/tools/tool-catalog"
import { buildBuddyRuntimeSessionPermissions } from "../../src/learning/agent-execution/permissions/session-permissions"
import { resolveCapabilityProfile } from "../../src/learning/resolve-capability-profile"
import { getBuddyPersona } from "../../src/learning/personas"
import { ensureCurriculumToolsRegistered } from "../../src/learning/curriculum"
import { ensureLearnerToolsRegistered } from "../../src/learning/learner-model"
import { tmpdir } from "../helpers/tmpdir"
import { createToolContext, requireTool, TEST_TOOL_MODEL } from "../helpers/tools"

function fakeTool(id: string): BuddyTool {
  return {
    id,
    toTool() {
      throw new Error("Tool conversion is not used in this test")
    },
  }
}

describe("learning tool contract", () => {
  test("fails fast when duplicate learning tool IDs are present", () => {
    const duplicated = [fakeTool("duplicate_tool"), fakeTool("duplicate_tool")]

    expect(() => assertUniqueLearningToolIds(duplicated)).toThrow(
      /Duplicate learning tool IDs detected: duplicate_tool/,
    )
  })

  test("keeps derived tool IDs aligned with registered learning tools and runtime permission overlay", () => {
    const registeredToolIds = allLearningTools()
      .map((tool) => tool.id)
      .toSorted((left, right) => left.localeCompare(right))
    const runtimeToolIds = allLearningToolIds().toSorted((left, right) => left.localeCompare(right))

    expect(registeredToolIds).toEqual(runtimeToolIds)

    const runtimeProfile = resolveCapabilityProfile({
      persona: getBuddyPersona("code-buddy"),
      workspaceState: "interactive",
      intent: "practice",
    })
    const permissionRules = buildBuddyRuntimeSessionPermissions({
      runtimeProfile,
    })

    const runtimeToolIdSet = new Set<string>(runtimeToolIds)
    const runtimePermissions = permissionRules
      .filter((rule) => rule.pattern === "*")
      .map((rule) => rule.permission)
      .filter((permission) => runtimeToolIdSet.has(permission))
      .toSorted((left, right) => left.localeCompare(right))

    expect(runtimePermissions).toEqual(runtimeToolIds)
  })

  test("registers learner_snapshot_read and omits the legacy curriculum_read tool", async () => {
    await using project = await tmpdir({ git: true })

    const result = await OpenCodeInstance.provide({
      directory: project.path,
      async fn() {
        await ensureCurriculumToolsRegistered(project.path)
        await ensureLearnerToolsRegistered(project.path)

        const tools = await ToolRegistry.tools(TEST_TOOL_MODEL)

        const learnerRead = requireTool(tools, "learner_snapshot_read")

        const ctx = createToolContext({
          sessionID: "ses_tools",
          messageID: "msg_tools",
          agent: "buddy",
        })

        const learnerResult = await learnerRead.execute({}, ctx)

        return {
          hasCurriculumRead: tools.some((tool) => tool.id === "curriculum_read"),
          learnerTitle: learnerResult.title,
          learnerOutput: learnerResult.output,
        }
      },
    })

    expect(result.hasCurriculumRead).toBe(false)
    expect(result.learnerTitle).toBe("learner_state")
    expect(result.learnerOutput).toContain("# Learning Snapshot")
  })
})
