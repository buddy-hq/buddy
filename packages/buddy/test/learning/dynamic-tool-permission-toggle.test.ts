import { describe, expect, test } from "bun:test"
import { constrainPermissionGrants, evaluatePermission, resetDynamicToolPermissionGrants, withDynamicToolPermissionGrants, type PermissionRuleset } from "@buddy/transcript-contract/permission-rules"
import { buildRuntimeSessionPermissionRules } from "../../src/learning/agent-execution/permissions/session-policy"
import { getAgentRuntime, closeAgentRuntime } from "../../src/runtime/agent-runtime"
import { syncOpenCodeProjectConfig } from "../../src/config/runtime/opencode-sync"
import { tmpdir } from "../helpers/tmpdir"

const reflection = "dynamic_reflection"
const dynamicToolIDs = [reflection, "dynamic_other"]
const catalog = { toolIDs: ["buddy_read"], subagentIDs: [], skillNames: [], dynamicToolIDs }

async function fixture(configured: PermissionRuleset = []) {
  const project = await tmpdir({ config: { permission: Object.fromEntries(configured.map((rule) => [rule.permission, { [rule.pattern]: rule.action }])) } })
  try {
    await syncOpenCodeProjectConfig(project.path)
    const runtime = await getAgentRuntime()
    const session = await runtime.conversations.create(project.path)
    await runtime.approvals.updateSessionRules(session.id, () => buildRuntimeSessionPermissionRules({ catalog, sessionRuntime: { access: { tools: { buddy_read: "allow" }, subagents: {}, skills: {} } } }))
    return { runtime, session, async rules() { return [...await runtime.catalog.agentRules(project.path, "buddy"), ...(await runtime.approvals.sessionRules(session.id))?.rules ?? []] }, async [Symbol.asyncDispose]() { try { await closeAgentRuntime() } finally { await project[Symbol.asyncDispose]() } } }
  } catch (error) {
    try { await closeAgentRuntime() } finally { await project[Symbol.asyncDispose]() }
    throw error
  }
}

describe("dynamic tool permission toggling", () => {
  test("grants apply through v2 session updates and keep unrelated tools denied", async () => {
    await using context = await fixture()
    const { runtime, session } = context
    expect(evaluatePermission(reflection, "*", await context.rules()).action).toBe("deny")
    await runtime.approvals.updateSessionRules(session.id, (existing) => withDynamicToolPermissionGrants({ existing, toolIDs: [reflection], managedToolIDs: dynamicToolIDs }))
    expect(evaluatePermission(reflection, "*", await context.rules()).action).toBe("allow")
    expect(evaluatePermission("dynamic_other", "*", await context.rules()).action).toBe("deny")
    const permissions = await runtime.approvals.sessionRules(session.id)
    expect(permissions?.rules).toContainEqual({ permission: reflection, pattern: "*", action: "allow" })
    expect(permissions?.rules).toContainEqual({ permission: "buddy_read", pattern: "*", action: "allow" })
  })

  test("releasing a grant restores deny while preserving rules Buddy does not manage", async () => {
    await using context = await fixture()
    const { runtime, session } = context
    await runtime.approvals.updateSessionRules(session.id, (existing) => withDynamicToolPermissionGrants({ existing: [...existing, { permission: "external_directory", pattern: "/trusted/*", action: "ask" }], toolIDs: [reflection], managedToolIDs: dynamicToolIDs }))
    await runtime.approvals.updateSessionRules(session.id, (existing) => resetDynamicToolPermissionGrants(existing, dynamicToolIDs))
    expect(evaluatePermission(reflection, "*", await context.rules()).action).toBe("deny")
    expect((await runtime.approvals.sessionRules(session.id))?.rules).toContainEqual({ permission: "external_directory", pattern: "/trusted/*", action: "ask" })
  })

  test("authored denies remain enforced when Buddy tries to grant a dynamic tool", async () => {
    const configured: PermissionRuleset = [{ permission: reflection, pattern: "private/*", action: "deny" }]
    await using context = await fixture(configured)
    const { runtime, session } = context
    await runtime.approvals.updateSessionRules(session.id, (existing) => constrainPermissionGrants(withDynamicToolPermissionGrants({ existing, toolIDs: [reflection], managedToolIDs: dynamicToolIDs }), configured, dynamicToolIDs))
    expect(evaluatePermission(reflection, "private/note", await context.rules()).action).toBe("deny")
    expect((await runtime.approvals.sessionRules(session.id))?.rules).not.toContainEqual({ permission: reflection, pattern: "*", action: "allow" })
  })
})
