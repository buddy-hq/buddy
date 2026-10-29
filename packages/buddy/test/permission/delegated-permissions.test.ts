import { describe, expect, test } from "bun:test"
import { evaluatePermission } from "@buddy/transcript-contract/permission-rules"
import { buildDelegatedChildSessionPermissions } from "../../src/learning/agent-execution/permissions/delegated-permissions"

describe("delegated child permission policy", () => {
  test("preserves inherited restrictions, delegates ask and applies child tool denies", () => {
    const parentRuntime = {
      access: {
        tools: { ingest_full_text: "allow", save_question_set: "ask" } as const,
        subagents: { "practice-agent": "ask" } as const,
        skills: { "custom-skill": "allow" } as const,
      },
    }
    const buddy = buildDelegatedChildSessionPermissions({
      parentRuntime,
      denyTools: ["ingest_full_text"],
      existing: [
        { permission: "read", pattern: ".env", action: "deny" },
        { permission: "save_question_set", pattern: "private/*", action: "deny" },
        { permission: "subagent", pattern: "general", action: "deny" },
      ],
    })
    expect(evaluatePermission("ingest_full_text", "*", buddy).action).toBe("deny")
    expect(evaluatePermission("save_question_set", "other/file", buddy).action).toBe("ask")
    expect(evaluatePermission("save_question_set", "private/file", buddy).action).toBe("deny")
    expect(evaluatePermission("read", ".env", buddy).action).toBe("deny")
    expect(evaluatePermission("skill", "custom-skill", buddy).action).toBe("allow")
    expect(evaluatePermission("subagent", "general", buddy).action).toBe("deny")
    expect(evaluatePermission("subagent", "practice-agent", buddy).action).toBe("ask")
    expect(parentRuntime.access.tools.ingest_full_text).toBe("allow")
  })

  test("legacy actions cannot bypass authored rules using the v2 action names", () => {
    const rules = buildDelegatedChildSessionPermissions({
      parentRuntime: {
        access: { tools: { bash: "allow", write: "allow" }, subagents: {}, skills: {} },
      },
      existing: [],
      configured: [
        { permission: "shell", pattern: "rm *", action: "deny" },
        { permission: "edit", pattern: "private/*", action: "deny" },
      ],
    })
    expect(rules).not.toContainEqual({ permission: "shell", pattern: "*", action: "allow" })
    expect(rules).not.toContainEqual({ permission: "edit", pattern: "*", action: "allow" })
  })
})
