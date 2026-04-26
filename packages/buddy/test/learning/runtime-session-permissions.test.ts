import { describe, expect, test } from "bun:test"
import { PermissionNext } from "@buddy/opencode-adapter/permission"
import { buildBuddyRuntimeSessionPermissions } from "../../src/learning/agent-execution/permissions/session-permissions"
import { resolveCapabilityProfile } from "../../src/learning/resolve-capability-profile"
import { getBuddyPersona } from "../../src/learning/personas/wiring/persona.orchestration"

describe("buildBuddyRuntimeSessionPermissions", () => {
  test("preserves unrelated rules while enforcing the runtime tool and helper policy", () => {
    const runtimeProfile = resolveCapabilityProfile({
      persona: getBuddyPersona("buddy"),
      workspaceState: "chat",
    })
    const permissions = buildBuddyRuntimeSessionPermissions({
      existing: [
        {
          permission: "question",
          pattern: "*",
          action: "allow",
        },
      ],
      runtimeProfile,
    })

    expect(PermissionNext.evaluate("question", "*", permissions).action).toBe("allow")
    expect(PermissionNext.evaluate("learner_snapshot_read", "*", permissions).action).toBe("allow")
    expect(PermissionNext.evaluate("learner_practice_record", "*", permissions).action).toBe(
      "allow",
    )
    expect(PermissionNext.evaluate("pedagogy_prepare_resource", "*", permissions).action).toBe(
      "allow",
    )
    expect(PermissionNext.evaluate("render_mermaid", "*", permissions).action).toBe("allow")
    expect(PermissionNext.evaluate("skill", "buddy-pedagogy-explanation", permissions).action).toBe(
      "allow",
    )
    expect(PermissionNext.evaluate("skill", "buddy-pedagogy-analogy", permissions).action).toBe(
      "allow",
    )
    expect(
      PermissionNext.evaluate("skill", "buddy-pedagogy-reading-assistant", permissions).action,
    ).toBe("allow")
    expect(PermissionNext.evaluate("task", "goal-writer", permissions).action).toBe("allow")
    expect(PermissionNext.evaluate("task", "practice-agent", permissions).action).toBe("deny")
  })

  test("exposes all persona-level skills without touching unrelated permissions", () => {
    const runtimeProfile = resolveCapabilityProfile({
      persona: getBuddyPersona("code-buddy"),
      workspaceState: "interactive",
    })
    const permissions = buildBuddyRuntimeSessionPermissions({
      existing: [
        {
          permission: "question",
          pattern: "*",
          action: "allow",
        },
      ],
      runtimeProfile,
    })

    expect(PermissionNext.evaluate("skill", "buddy-pedagogy-explanation", permissions).action).toBe(
      "allow",
    )
    expect(
      PermissionNext.evaluate("skill", "buddy-pedagogy-worked-example", permissions).action,
    ).toBe("allow")
    expect(
      PermissionNext.evaluate("skill", "buddy-pedagogy-concept-contrast", permissions).action,
    ).toBe("allow")
    expect(PermissionNext.evaluate("skill", "buddy-pedagogy-analogy", permissions).action).toBe(
      "ask",
    )
    expect(
      PermissionNext.evaluate("skill", "buddy-pedagogy-reading-assistant", permissions).action,
    ).toBe("allow")
    expect(PermissionNext.evaluate("pedagogy_debug_attempt", "*", permissions).action).toBe("allow")
    expect(PermissionNext.evaluate("pedagogy_prepare_resource", "*", permissions).action).toBe(
      "allow",
    )
    expect(PermissionNext.evaluate("render_mermaid", "*", permissions).action).toBe("allow")
    expect(PermissionNext.evaluate("question", "*", permissions).action).toBe("allow")
  })

  test("respects configured tool toggles for Buddy-managed tools", () => {
    const runtimeProfile = resolveCapabilityProfile({
      persona: getBuddyPersona("buddy"),
      workspaceState: "chat",
      configuredToolToggles: {
        pedagogy_prepare_resource: false,
      },
    })
    const permissions = buildBuddyRuntimeSessionPermissions({
      runtimeProfile,
    })

    expect(PermissionNext.evaluate("pedagogy_prepare_resource", "*", permissions).action).toBe(
      "deny",
    )
  })

  test("clears the Buddy runtime overlay while keeping unrelated approvals", () => {
    const permissions = buildBuddyRuntimeSessionPermissions({
      existing: [
        {
          permission: "learner_practice_record",
          pattern: "*",
          action: "allow",
        },
        {
          permission: "task",
          pattern: "practice-agent",
          action: "allow",
        },
        {
          permission: "custom_review_tool",
          pattern: "*",
          action: "allow",
        },
        {
          permission: "question",
          pattern: "*",
          action: "allow",
        },
      ],
    })

    expect(permissions).toEqual([
      {
        permission: "custom_review_tool",
        pattern: "*",
        action: "allow",
      },
      {
        permission: "question",
        pattern: "*",
        action: "allow",
      },
    ])
  })
})
