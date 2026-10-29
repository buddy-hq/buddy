import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { PermissionAction } from "@buddy/transcript-contract/permission-rules"
import { OpenCode } from "@opencode/client"
import { toSessionPermissionRules, toBuddyPermissionRules, permissionRulesEqual } from "@buddy/transcript-contract/permission-rules"
import { toBuddyPermissionEvent, updateSessionPermissions } from "../src/gateway/permission"

describe("permission gateway", () => {
  test("translates legacy notebook actions without changing order or effects", () => {
    const rules = toSessionPermissionRules([
      { permission: "task", pattern: "general", action: "ask" },
      { permission: "bash", pattern: "ls *", action: "allow" },
      { permission: "write", pattern: "secret/*", action: "deny" },
      { permission: "apply_patch", pattern: "src/*", action: "ask" },
      { permission: "patch", pattern: "*", action: "deny" },
      { permission: "docs_search", pattern: "*", action: "ask" },
      { permission: "list_mcp_resources", pattern: "*", action: "allow" },
    ])
    expect(rules).toEqual([
      { action: "subagent", resource: "general", effect: "ask" },
      { action: "shell", resource: "ls *", effect: "allow" },
      { action: "edit", resource: "secret/*", effect: "deny" },
      { action: "edit", resource: "src/*", effect: "ask" },
      { action: "edit", resource: "*", effect: "deny" },
      { action: "docs_search", resource: "*", effect: "ask" },
      { action: "opencode_list_mcp_resources", resource: "*", effect: "allow" },
    ])
    expect(toSessionPermissionRules(toBuddyPermissionRules(rules))).toEqual(rules)
    expect(permissionRulesEqual(rules, rules.toReversed())).toBe(false)
  })
  test("maps both ephemeral events to the Buddy SSE contract", () => {
    expect(toBuddyPermissionEvent({ id: "evt_1", created: 1, type: "permission.asked", data: { id: "per_1", sessionID: "ses_child", action: "shell", resources: ["ls"], save: ["ls *"], metadata: { filepath: "/workspace/notes.md", command: "ls" }, source: { type: "tool", messageID: "msg_1", id: "call_1" }, message: "Needs access" } })).toEqual({ type: "permission.asked", properties: { id: "per_1", sessionID: "ses_child", action: "shell", file: "/workspace/notes.md", command: "ls", resources: ["ls"], save: ["ls *"], metadata: { filepath: "/workspace/notes.md", command: "ls" }, source: { messageID: "msg_1", callID: "call_1" }, message: "Needs access" } })
    expect(toBuddyPermissionEvent({ id: "evt_2", created: 2, type: "permission.replied", data: { sessionID: "ses_child", requestID: "per_1", reply: "reject" } })).toEqual({ type: "permission.replied", properties: { sessionID: "ses_child", requestID: "per_1", reply: "reject" } })
  })
  test("reports unchanged rules and preserves reordered and concurrent updates", async () => {
    let permissions: Array<{ action: string; resource: string; effect: "allow" | "deny" | "ask" }> = [{ action: "shell", resource: "*", effect: "deny" as const }, { action: "shell", resource: "ls *", effect: "allow" as const }]
    const client = OpenCode.make({ baseUrl: "http://permission.test", fetch: Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init)
      if (request.method === "PATCH") {
        const body = Schema.decodeUnknownSync(Schema.Struct({ permissions: Schema.Array(Schema.Struct({ action: Schema.String, resource: Schema.String, effect: PermissionAction })) }))(await request.json())
        permissions = [...body.permissions]
        return new Response(null, { status: 204 })
      }
      return Response.json({ data: { id: "ses_1", permissions } })
    }, { preconnect: fetch.preconnect }) })
    const port = { sessions: client.session }
    expect(await updateSessionPermissions(port, "ses_1", (rules) => rules)).toBe("unchanged")
    expect(await updateSessionPermissions(port, "ses_1", (rules) => rules.toReversed())).toBe("updated")
    expect(permissions[0]?.resource).toBe("ls *")
    await Promise.all([
      updateSessionPermissions(port, "ses_1", (rules) => [...rules, { permission: "buddy_one", pattern: "*", action: "ask" }]),
      updateSessionPermissions(port, "ses_1", (rules) => [...rules, { permission: "buddy_two", pattern: "*", action: "ask" }]),
    ])
    expect(permissions.map((rule) => rule.action)).toContain("buddy_one")
    expect(permissions.map((rule) => rule.action)).toContain("buddy_two")
  })
})
