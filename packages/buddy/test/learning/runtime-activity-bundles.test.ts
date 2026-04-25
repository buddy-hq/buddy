import { describe, expect, test } from "bun:test"
import { resolveIntentPermissions } from "../../src/learning/intents/capabilities/resolution"
import { getBuddyPersona } from "../../src/learning/personas/wiring/persona.orchestration"

describe("resolveIntentPermissions", () => {
  test("learn intent enables skills and keeps pedagogy tools unavailable", () => {
    const permissions = resolveIntentPermissions({
      persona: getBuddyPersona("buddy"),
      workspaceState: "chat",
      intent: "learn",
    })

    expect(permissions.tools.pedagogy_prepare_resource).toBe("allow")
    expect(permissions.tools.render_mermaid).toBe("allow")

    expect(permissions.skills["buddy-pedagogy-explanation"]).toBe("allow")
    expect(permissions.skills["buddy-pedagogy-worked-example"]).toBe("allow")
    expect(permissions.skills["buddy-pedagogy-concept-contrast"]).toBe("allow")
    expect(permissions.skills["buddy-pedagogy-reading-assistant"]).toBe("allow")
  })

  test("auto returns deduped union scoped by persona and workspace", () => {
    const permissions = resolveIntentPermissions({
      persona: getBuddyPersona("math-buddy"),
      workspaceState: "chat",
      intent: "auto",
    })

    expect(permissions.tools.pedagogy_prepare_resource).toBe("allow")
    expect(permissions.tools.pedagogy_stepwise_solve).toBe("allow")
    expect(permissions.tools.pedagogy_debug_attempt).toBe("deny")
    expect(permissions.tools.render_mermaid).toBe("allow")

    expect(permissions.skills["buddy-pedagogy-explanation"]).toBe("allow")
    expect(permissions.skills["buddy-pedagogy-worked-example"]).toBe("allow")
    expect(permissions.skills["buddy-pedagogy-concept-contrast"]).toBe("allow")
    expect(permissions.skills["buddy-pedagogy-analogy"]).toBe("allow")
    expect(permissions.skills["buddy-pedagogy-reading-assistant"]).toBe("allow")
    expect(Object.keys(permissions.tools).every((toolId) => !toolId.startsWith("activity_"))).toBe(
      true,
    )
  })

  test("explicit practice intent only allows practice-bound pedagogy capabilities", () => {
    const permissions = resolveIntentPermissions({
      persona: getBuddyPersona("code-buddy"),
      workspaceState: "interactive",
      intent: "practice",
    })

    expect(permissions.tools.pedagogy_prepare_resource).toBe("allow")
    expect(permissions.tools.pedagogy_debug_attempt).toBe("allow")

    expect(permissions.skills["buddy-pedagogy-explanation"]).toBe("deny")
    expect(permissions.skills["buddy-pedagogy-worked-example"]).toBe("deny")
    expect(permissions.skills["buddy-pedagogy-concept-contrast"]).toBe("deny")
    expect(permissions.skills["buddy-pedagogy-analogy"]).toBe("deny")
    expect(permissions.skills["buddy-pedagogy-reading-assistant"]).toBe("deny")
  })
})
