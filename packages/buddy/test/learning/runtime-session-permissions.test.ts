import { describe, expect, test } from "bun:test"
import type { PermissionRuleset } from "@buddy/opencode-adapter/permission"
import { nextManagedPermission } from "../../src/learning/agent-execution/permissions/runtime-session-permissions"

describe("runtime session permissions", () => {
  test("preserves delegated child-session permissions without a runtime snapshot", () => {
    const delegatedPermission: PermissionRuleset = [
      {
        permission: "ingest_full_text",
        pattern: "*",
        action: "allow",
      },
      {
        permission: "save_question_set",
        pattern: "*",
        action: "allow",
      },
      {
        permission: "task",
        pattern: "*",
        action: "deny",
      },
    ]

    expect(
      nextManagedPermission({
        existing: delegatedPermission,
        hasParentSession: true,
      }),
    ).toEqual(delegatedPermission)
  })

  test("standalone sessions still rebuild from Buddy runtime defaults", () => {
    const existingPermission: PermissionRuleset = [
      {
        permission: "ingest_full_text",
        pattern: "*",
        action: "allow",
      },
      {
        permission: "task",
        pattern: "*",
        action: "deny",
      },
    ]

    const nextPermission = nextManagedPermission({
      existing: existingPermission,
      hasParentSession: false,
    })

    expect(
      nextPermission.some(
        (rule) => rule.permission === "ingest_full_text" && rule.pattern === "*" && rule.action === "allow",
      ),
    ).toBe(false)
    expect(
      nextPermission.some(
        (rule) => rule.permission === "task" && rule.pattern === "*" && rule.action === "deny",
      ),
    ).toBe(true)
  })
})
