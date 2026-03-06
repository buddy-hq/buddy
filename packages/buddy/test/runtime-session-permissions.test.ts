import { describe, expect, test } from "bun:test"
import { PermissionNext } from "@buddy/opencode-adapter/permission"
import { compileRuntimeProfile } from "../src/learning/runtime/compiler.js"
import { buildBuddyRuntimeSessionPermissions } from "../src/learning/runtime/session-permissions.js"
import { getBuddyPersona } from "../src/personas/catalog.js"

describe("buildBuddyRuntimeSessionPermissions", () => {
  test("preserves unrelated rules while enforcing the runtime tool and helper policy", () => {
    const runtimeProfile = compileRuntimeProfile({
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
    expect(PermissionNext.evaluate("learner_state_query", "*", permissions).action).toBe("allow")
    expect(PermissionNext.evaluate("practice_record", "*", permissions).action).toBe("allow")
    expect(PermissionNext.evaluate("activity_explanation", "*", permissions).action).toBe("allow")
    expect(PermissionNext.evaluate("activity_guided_practice", "*", permissions).action).toBe("allow")
    expect(PermissionNext.evaluate("skill", "buddy-practice-guided", permissions).action).toBe("allow")
    expect(PermissionNext.evaluate("skill", "buddy-practice-debug-attempt", permissions).action).toBe("deny")
    expect(PermissionNext.evaluate("task", "goal-writer", permissions).action).toBe("allow")
    expect(PermissionNext.evaluate("task", "practice-agent", permissions).action).toBe("deny")
  })

  test("filters bundled skills down to the explicit teaching intent without touching unrelated permissions", () => {
    const runtimeProfile = compileRuntimeProfile({
      persona: getBuddyPersona("code-buddy"),
      workspaceState: "interactive",
      intentOverride: "practice",
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

    expect(PermissionNext.evaluate("skill", "buddy-practice-guided", permissions).action).toBe("allow")
    expect(PermissionNext.evaluate("skill", "buddy-practice-debug-attempt", permissions).action).toBe("allow")
    expect(PermissionNext.evaluate("skill", "buddy-assess-mastery-check", permissions).action).toBe("deny")
    expect(PermissionNext.evaluate("skill", "buddy-learn-explanation", permissions).action).toBe("deny")
    expect(PermissionNext.evaluate("activity_guided_practice", "*", permissions).action).toBe("allow")
    expect(PermissionNext.evaluate("activity_debug_attempt", "*", permissions).action).toBe("allow")
    expect(PermissionNext.evaluate("activity_mastery_check", "*", permissions).action).toBe("deny")
    expect(PermissionNext.evaluate("activity_explanation", "*", permissions).action).toBe("deny")
    expect(PermissionNext.evaluate("question", "*", permissions).action).toBe("allow")
  })

  test("clears the Buddy runtime overlay while keeping unrelated approvals", () => {
    const permissions = buildBuddyRuntimeSessionPermissions({
      existing: [
        {
          permission: "practice_record",
          pattern: "*",
          action: "allow",
        },
        {
          permission: "task",
          pattern: "practice-agent",
          action: "allow",
        },
        {
          permission: "curriculum_read",
          pattern: ".buddy/**",
          action: "allow",
        },
        {
          permission: "question",
          pattern: "*",
          action: "allow",
        },
        {
          permission: "skill",
          pattern: "buddy-practice-guided",
          action: "allow",
        },
      ],
    })

    expect(permissions).toEqual([
      {
        permission: "curriculum_read",
        pattern: ".buddy/**",
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
