import { describe, expect, test } from "bun:test"
import { getBuddyPersona } from "../../src/learning/personas/wiring/persona.orchestration"
import { getLearningTool } from "../../src/learning/tools/tool-catalog"
import {
  derivePersonaStaticLearningToolPermissions,
  toolMatchesPersonaWorkspaceConstraints,
} from "../../src/learning/tools/tool-capability-policy"

function requireLearningTool(toolID: Parameters<typeof getLearningTool>[0]) {
  const tool = getLearningTool(toolID)
  if (tool) {
    return tool
  }

  throw new Error(`Missing learning tool ${toolID}`)
}

describe("tool capability policy", () => {
  test("derives persona and workspace constraints from tool metadata", () => {
    const codeBuddy = getBuddyPersona("code-buddy")
    const readingBuddy = getBuddyPersona("reading-buddy")
    const checkpointTool = requireLearningTool("teaching_checkpoint")
    const figureTool = requireLearningTool("render_figure")

    expect(
      toolMatchesPersonaWorkspaceConstraints({
        tool: checkpointTool,
        persona: codeBuddy,
        workspaceState: "interactive",
      }),
    ).toBe(true)
    expect(
      toolMatchesPersonaWorkspaceConstraints({
        tool: checkpointTool,
        persona: codeBuddy,
        workspaceState: "chat",
      }),
    ).toBe(false)
    expect(
      toolMatchesPersonaWorkspaceConstraints({
        tool: checkpointTool,
        persona: readingBuddy,
        workspaceState: "interactive",
      }),
    ).toBe(false)
    expect(
      toolMatchesPersonaWorkspaceConstraints({
        tool: figureTool,
        persona: getBuddyPersona("math-buddy"),
        workspaceState: "chat",
      }),
    ).toBe(true)
    expect(
      toolMatchesPersonaWorkspaceConstraints({
        tool: figureTool,
        persona: codeBuddy,
        workspaceState: "interactive",
      }),
    ).toBe(false)
  })

  test("derives static persona learning-tool permissions from canonical Buddy policy", () => {
    const buddyPermissions = derivePersonaStaticLearningToolPermissions(getBuddyPersona("buddy"))
    const codeBuddyPermissions = derivePersonaStaticLearningToolPermissions(
      getBuddyPersona("code-buddy"),
    )
    const mathBuddyPermissions = derivePersonaStaticLearningToolPermissions(
      getBuddyPersona("math-buddy"),
    )
    const readingBuddyPermissions = derivePersonaStaticLearningToolPermissions(
      getBuddyPersona("reading-buddy"),
    )

    expect(buddyPermissions.search_standards).toBe("allow")
    expect(buddyPermissions.teaching_start_lesson).toBe("deny")

    expect(codeBuddyPermissions.teaching_start_lesson).toBe("allow")
    expect(codeBuddyPermissions.pedagogy_mastery_check).toBe("allow")
    expect(codeBuddyPermissions.python_calculator).toBe("deny")

    expect(mathBuddyPermissions.render_figure).toBe("allow")
    expect(mathBuddyPermissions.python_calculator).toBe("allow")
    expect(mathBuddyPermissions.teaching_start_lesson).toBe("deny")

    expect(readingBuddyPermissions.search_standards).toBe("allow")
    expect(readingBuddyPermissions.render_saved_question_set).toBe("allow")
    expect(readingBuddyPermissions.teaching_start_lesson).toBe("deny")
  })
})
