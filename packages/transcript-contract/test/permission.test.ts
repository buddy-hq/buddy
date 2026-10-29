import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import {
  PermissionRequest,
  PermissionReplyInput,
  PermissionEvent,
  parsePermissionRequest,
  permissionReplyInput,
} from "../src/permission"
import {
  evaluatePermission,
  matchPermissionPattern,
  permissionRulesFromConfig,
  withDynamicToolPermissionGrants,
  constrainPermissionGrants,
} from "../src/permission-rules"

const decodeRequest = Schema.decodeUnknownSync(PermissionRequest)

describe("Buddy permission contract", () => {
  test("decodes tool provenance, reusable patterns and reject feedback", () => {
    expect(
      decodeRequest({
        id: "per_1",
        sessionID: "ses_child",
        action: "shell",
        resources: ["ls"],
        save: ["ls *"],
        source: { messageID: "msg_1", callID: "call_1" },
        message: "Needs access",
      }).source,
    ).toEqual({ messageID: "msg_1", callID: "call_1" })
    expect(
      Schema.decodeUnknownSync(PermissionReplyInput)({
        reply: "reject",
        message: "Use another file",
      }),
    ).toEqual({ reply: "reject", message: "Use another file" })
    expect(
      parsePermissionRequest({
        id: "per_legacy",
        sessionID: "ses_1",
        permission: "bash",
        patterns: ["ls"],
        always: ["ls *"],
      }),
    ).toBeUndefined()
    expect(permissionReplyInput({ reply: "reject", message: "Try another file" })).toEqual({
      reply: "reject",
      message: "Try another file",
    })
    expect(permissionReplyInput("always").reply).toBe("always")
    expect(() =>
      Schema.decodeUnknownSync(PermissionEvent)({
        type: "permission.replied",
        properties: { sessionID: "ses_1", requestID: "per_1", reply: "allow" },
      }),
    ).toThrow()
  })
})

describe("PermissionV2 wildcard semantics", () => {
  test.each([
    ["ls", "ls *", true],
    ["ls -l", "ls *", true],
    ["lsof", "ls *", false],
    ["a\nb", "a*b", true],
    ["a.b", "a.b", true],
    ["axb", "a.b", false],
    ["file1.md", "file?.md", true],
    ["file12.md", "file?.md", false],
    ["C:\\notes\\page.md", "C:/notes/*", true],
    ["x[1]", "x[1]", true],
  ])("matches %s against %s", (input, pattern, matches) => {
    expect(matchPermissionPattern(input, pattern)).toBe(matches)
  })
  test("uses case-insensitive Windows rules without weakening macOS matching", () => {
    expect(matchPermissionPattern("C:\\NOTES\\Page.md", "c:/notes/*", "win32")).toBe(true)
    expect(matchPermissionPattern("/NOTES/Page.md", "/notes/*", "posix")).toBe(false)
  })
  test("evaluates authored rules in last-match order and defaults to ask", () => {
    const rules = permissionRulesFromConfig({ "*": "allow", shell: { "*": "deny", "ls *": "ask" } })
    expect(evaluatePermission("shell", "ls", rules).action).toBe("ask")
    expect(evaluatePermission("shell", "rm file", rules).action).toBe("deny")
    expect(evaluatePermission("read", "file", rules).action).toBe("allow")
    expect(evaluatePermission("read", "file", []).action).toBe("ask")
    expect(evaluatePermission("shell", "ls", rules.toReversed()).action).toBe("allow")
  })
})

describe("dynamic permission grants", () => {
  test("grants one tool without bypassing unmanaged denies or revealing other dynamic tools", () => {
    const rules = withDynamicToolPermissionGrants({
      managedToolIDs: ["dynamic_one", "dynamic_two"],
      toolIDs: ["dynamic_one"],
      existing: [
        { permission: "*", pattern: "*", action: "ask" },
        { permission: "dynamic_one", pattern: "*", action: "deny" },
        { permission: "dynamic_one", pattern: "private/*", action: "deny" },
      ],
    })
    expect(evaluatePermission("dynamic_one", "private/file", rules).action).toBe("deny")
    expect(evaluatePermission("dynamic_one", "other/file", rules).action).toBe("ask")
    expect(evaluatePermission("dynamic_two", "*", rules).action).toBe("deny")
  })
})

test("Buddy grants leave authored tool restrictions under runtime evaluation", () => {
  const rules = constrainPermissionGrants(
    [
      { permission: "buddy_tool", pattern: "*", action: "allow" },
      { permission: "other_tool", pattern: "*", action: "deny" },
      { permission: "skill", pattern: "safe", action: "allow" },
    ],
    [{ permission: "buddy_tool", pattern: "private/*", action: "deny" }],
    ["buddy_tool", "other_tool", "skill"],
  )
  expect(rules).toEqual([
    { permission: "other_tool", pattern: "*", action: "deny" },
    { permission: "skill", pattern: "safe", action: "allow" },
  ])
})
