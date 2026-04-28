import { describe, expect, test } from "bun:test"
import { getBuddyPersona } from "../../src/learning/personas/wiring/persona.orchestration"
import { managedBuddySkillNames } from "../../src/learning/skills/managed-buddy-skills"
import { compileRuntimeLearningToolPermissions } from "../../src/learning/tools/tool-permission-compiler"

describe("managed buddy skills", () => {
  test("collects skill names from all registered persona skills", () => {
    const names = managedBuddySkillNames()

    expect(names).toContain("buddy-pedagogy-explanation")
    expect(names).toContain("buddy-pedagogy-worked-example")
    expect(names).toContain("buddy-pedagogy-concept-contrast")
    expect(names).toContain("buddy-pedagogy-reading-assistant")
    expect(names).toContain("buddy-pedagogy-analogy")
    expect(names).toContain("buddy-pedagogy-learn")
    expect(names).toContain("buddy-pedagogy-practice")
    expect(names).toContain("buddy-pedagogy-assess")
  })

  test("compileRuntimeLearningToolPermissions grants persona-default tools", () => {
    const permissions = compileRuntimeLearningToolPermissions({
      persona: getBuddyPersona("buddy"),
      workspaceState: "chat",
    })

    expect(permissions.tools.pedagogy_prepare_resource).toBe("allow")
    expect(permissions.tools.render_mermaid).toBe("allow")

    expect(permissions.skills["buddy-pedagogy-explanation"]).toBe("allow")
    expect(permissions.skills["buddy-pedagogy-worked-example"]).toBe("allow")
    expect(permissions.skills["buddy-pedagogy-concept-contrast"]).toBe("allow")
    expect(permissions.skills["buddy-pedagogy-reading-assistant"]).toBe("allow")
  })

  test("compileRuntimeLearningToolPermissions respects persona workspace constraints", () => {
    const permissions = compileRuntimeLearningToolPermissions({
      persona: getBuddyPersona("code-buddy"),
      workspaceState: "interactive",
    })

    expect(permissions.tools.learning_tool_search).toBe("allow")
    expect(permissions.tools.learning_tool_load).toBe("allow")
    expect(permissions.tools.pedagogy_debug_attempt).not.toBe("allow")
    expect(permissions.tools.pedagogy_prepare_resource).toBe("allow")
  })
})
