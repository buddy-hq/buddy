import { describe, expect, test } from "bun:test"
import { evaluatePermission } from "@buddy/transcript-contract/permission-rules"
import { buildRuntimeSessionPermissionRules } from "../../src/learning/agent-execution/permissions/session-policy"
import type { PermissionRuleset } from "@buddy/transcript-contract/permission-rules"
const catalog = {
  toolIDs: ["ingest_full_text", "save_question_set"],
  subagentIDs: ["practice-agent"],
  skillNames: [],
  dynamicToolIDs: ["dynamic_one"],
}

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
        permission: "subagent",
        pattern: "*",
        action: "deny",
      },
    ]

    expect(
      buildRuntimeSessionPermissionRules({
        catalog,
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
        permission: "subagent",
        pattern: "*",
        action: "deny",
      },
    ]

    const nextPermission = buildRuntimeSessionPermissionRules({
      catalog,
      existing: existingPermission,
      hasParentSession: false,
    })

    expect(
      nextPermission.some(
        (rule) =>
          rule.permission === "ingest_full_text" && rule.pattern === "*" && rule.action === "allow",
      ),
    ).toBe(false)
    expect(
      nextPermission.some(
        (rule) => rule.permission === "subagent" && rule.pattern === "*" && rule.action === "deny",
      ),
    ).toBe(true)
  })
})

describe("v2 Buddy runtime policy", () => {
  test("preserves unmanaged rules after managed allows and before managed denies", () => {
    const preserved: PermissionRuleset = [
      { permission: "read", pattern: ".env", action: "ask" },
      { permission: "ingest_full_text", pattern: "private/*", action: "deny" },
      { permission: "shell", pattern: "ls *", action: "allow" },
    ]
    const rules = buildRuntimeSessionPermissionRules({
      catalog,
      existing: preserved,
      sessionRuntime: {
        access: {
          tools: { ingest_full_text: "allow", save_question_set: "ask" },
          subagents: { "practice-agent": "ask" },
          skills: { "custom-skill": "ask" },
        },
      },
    })
    expect(
      rules.filter(
        (rule) =>
          rule.permission === "read" || rule.permission === "shell" || rule.pattern === "private/*",
      ),
    ).toEqual(preserved)
    expect(evaluatePermission("ingest_full_text", "private/file", rules).action).toBe("deny")
    expect(evaluatePermission("ingest_full_text", "other/file", rules).action).toBe("allow")
    expect(evaluatePermission("save_question_set", "*", rules).action).toBe("ask")
    expect(evaluatePermission("skill", "custom-skill", rules).action).toBe("ask")
    expect(evaluatePermission("subagent", "practice-agent", rules).action).toBe("ask")
  })
})
