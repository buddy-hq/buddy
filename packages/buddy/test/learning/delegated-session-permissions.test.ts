import { describe, expect, test } from "bun:test"
import {
  evaluatePermission,
  type PermissionRuleset,
} from "@buddy/transcript-contract/permission-rules"
import { buildDelegatedChildSessionPermissions } from "../../src/learning/agent-execution/permissions/delegated-permissions"

const parentRuntime = {
  access: {
    tools: { save_question_set: "deny", save_flashcard_deck: "deny", dynamic_probe: "deny" },
    subagents: { general: "allow" },
    skills: { reading: "allow" },
  },
} satisfies Parameters<typeof buildDelegatedChildSessionPermissions>[0]["parentRuntime"]
const source: PermissionRuleset = [
  { permission: "*", pattern: "*", action: "allow" },
  { permission: "websearch", pattern: "*", action: "deny" },
  { permission: "save_question_set", pattern: "*", action: "deny" },
  { permission: "save_flashcard_deck", pattern: "*", action: "deny" },
  { permission: "edit", pattern: "notes/*", action: "ask" },
  { permission: "edit", pattern: "private/*", action: "deny" },
  { permission: "skill", pattern: "private-*", action: "deny" },
  { permission: "subagent", pattern: "private-*", action: "deny" },
]

function compile(
  extraTools: string[],
  configured: PermissionRuleset = [],
  rolePermissions: PermissionRuleset = [],
) {
  return buildDelegatedChildSessionPermissions({
    parentRuntime,
    existing: source,
    source,
    extraTools,
    configured,
    rolePermissions,
    denyTools: ["subagent"],
    toolActions: { custom_write: "edit" },
  })
}

describe("snapshot delegated policy", () => {
  test("adds only eligible author tools and retains ordered resource effects and dynamic exclusions", () => {
    const question = compile(["save_question_set"])
    expect(evaluatePermission("save_question_set", "*", question).action).toBe("allow")
    expect(evaluatePermission("save_flashcard_deck", "*", question).action).toBe("deny")
    expect(evaluatePermission("websearch", "*", question).action).toBe("deny")
    expect(evaluatePermission("edit", "notes/a.md", question).action).toBe("ask")
    expect(evaluatePermission("edit", "private/a.md", question).action).toBe("deny")
    expect(evaluatePermission("skill", "private-skill", question).action).toBe("deny")
    expect(evaluatePermission("subagent", "general", question).action).toBe("deny")
    expect(evaluatePermission("dynamic_probe", "*", question).action).toBe("deny")
    const granted = buildDelegatedChildSessionPermissions({
      parentRuntime: { access: { ...parentRuntime.access, tools: { dynamic_probe: "allow" } } },
      existing: [],
      source: [...source, { permission: "dynamic_probe", pattern: "*", action: "allow" }],
    })
    expect(evaluatePermission("dynamic_probe", "*", granted).action).toBe("allow")
    const flashcard = compile(["save_flashcard_deck"])
    expect(evaluatePermission("save_flashcard_deck", "*", flashcard).action).toBe("allow")
    expect(evaluatePermission("save_question_set", "*", flashcard).action).toBe("deny")
  })

  test("configured offs and role denies override extras without widening declared edit actions", () => {
    expect(
      evaluatePermission(
        "save_question_set",
        "*",
        compile(
          ["save_question_set"],
          [{ permission: "save_question_set", pattern: "*", action: "deny" }],
        ),
      ).action,
    ).toBe("deny")
    expect(evaluatePermission("save_question_set", "*", compile([])).action).toBe("deny")
    const rules = compile(
      ["custom_write"],
      [],
      [{ permission: "edit", pattern: "*", action: "deny" }],
    )
    expect(evaluatePermission("edit", "notes/a.md", rules).action).toBe("deny")
    expect(rules).not.toContainEqual({ permission: "custom_write", pattern: "*", action: "allow" })
  })

  test("restrictive roles retain parent scoped restrictions and changing rule order changes the result", () => {
    const role: PermissionRuleset = [
      { permission: "*", pattern: "*", action: "deny" },
      { permission: "edit", pattern: "*", action: "allow" },
      { permission: "websearch", pattern: "*", action: "allow" },
    ]
    const rules = compile([], [], role)
    expect(evaluatePermission("edit", "other/a.md", rules).action).toBe("allow")
    expect(evaluatePermission("edit", "notes/a.md", rules).action).toBe("ask")
    expect(evaluatePermission("edit", "private/a.md", rules).action).toBe("deny")
    expect(evaluatePermission("websearch", "*", rules).action).toBe("deny")
    const allow = {
      permission: "read",
      pattern: "notes/*",
      action: "allow",
    } satisfies PermissionRuleset[number]
    const deny = {
      permission: "read",
      pattern: "*",
      action: "deny",
    } satisfies PermissionRuleset[number]
    const build = (rules: PermissionRuleset) =>
      buildDelegatedChildSessionPermissions({ parentRuntime, existing: [], source: rules })
    expect(evaluatePermission("read", "notes/a.md", build([deny, allow])).action).toBe("allow")
    expect(evaluatePermission("read", "notes/a.md", build([allow, deny])).action).toBe("deny")
  })

  test("retains Windows resource restrictions when a role allows the shared edit action", () => {
    const rules = buildDelegatedChildSessionPermissions({
      parentRuntime,
      existing: [],
      platform: "win32",
      source: [
        { permission: "*", pattern: "*", action: "allow" },
        { permission: "edit", pattern: "C:\\Notebook\\Notes\\*", action: "ask" },
        { permission: "edit", pattern: "C:\\Notebook\\Private\\*", action: "deny" },
      ],
      rolePermissions: [
        { permission: "*", pattern: "*", action: "deny" },
        { permission: "edit", pattern: "*", action: "allow" },
      ],
    })
    expect(evaluatePermission("edit", "c:/notebook/notes/lesson.md", rules, "win32").action).toBe(
      "ask",
    )
    expect(evaluatePermission("edit", "c:/notebook/private/lesson.md", rules, "win32").action).toBe(
      "deny",
    )
    expect(
      evaluatePermission("edit", "C:\\Notebook\\Public\\lesson.md", rules, "win32").action,
    ).toBe("allow")
  })
})
