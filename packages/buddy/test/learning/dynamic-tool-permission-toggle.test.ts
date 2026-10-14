import fs from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "bun:test"
import { createOpenCodeHost } from "@buddy/opencode-adapter/host"
import { readSessionPermissions, toSessionPermissionRules, updateSessionPermissions } from "@buddy/opencode-adapter/gateway/permission"
import { constrainPermissionGrants, resetDynamicToolPermissionGrants, withDynamicToolPermissionGrants, type PermissionRuleset } from "@buddy/transcript-contract/permission-rules"
import { buildRuntimeSessionPermissionRules } from "../../src/learning/agent-execution/permissions/session-policy"
import { TEST_SANDBOX } from "../../../../script/test-preload"

const reflection = "dynamic_reflection"
const dynamicToolIDs = [reflection, "dynamic_other"]
const catalog = { toolIDs: ["buddy_read"], subagentIDs: [], skillNames: [], dynamicToolIDs }

async function fixture(configured: PermissionRuleset = []) {
  const root = await fs.mkdtemp(path.join(TEST_SANDBOX.root, "dynamic-permissions-"))
  const paths = { data: path.join(root, "data"), cache: path.join(root, "cache"), config: path.join(root, "config"), state: path.join(root, "state"), tmp: path.join(root, "tmp") }
  const directory = path.join(root, "notebook")
  await Promise.all([...Object.values(paths), directory].map((folder) => fs.mkdir(folder, { recursive: true })))
  await fs.writeFile(path.join(paths.config, "config.json"), JSON.stringify({ agents: { buddy_test: { permissions: [{ action: "*", resource: "*", effect: "allow" }, ...toSessionPermissionRules(configured)] } } }))
  const host = await createOpenCodeHost({ clientName: "buddy-test", paths, databasePath: path.join(root, "opencode.db"), fetchModels: false })
  const session = await host.sessions.create({ location: { directory }, agent: "buddy_test", permissions: toSessionPermissionRules(buildRuntimeSessionPermissionRules({ catalog, sessionRuntime: { access: { tools: { buddy_read: "allow" }, subagents: {}, skills: {} } } })) })
  return { host, session, async [Symbol.asyncDispose]() { await host.close(); await fs.rm(root, { recursive: true, force: true }) } }
}

describe("dynamic tool permission toggling", () => {
  test("grants apply through v2 session updates and keep unrelated tools denied", async () => {
    await using context = await fixture()
    const { host, session } = context
    expect((await host.permission.create({ sessionID: session.id, action: reflection, resources: ["*"] })).effect).toBe("deny")
    await updateSessionPermissions(host, session.id, (existing) => withDynamicToolPermissionGrants({ existing, toolIDs: [reflection], managedToolIDs: dynamicToolIDs }))
    expect((await host.permission.create({ sessionID: session.id, action: reflection, resources: ["*"] })).effect).toBe("allow")
    expect((await host.permission.create({ sessionID: session.id, action: "dynamic_other", resources: ["*"] })).effect).toBe("deny")
    const permissions = await readSessionPermissions(host, session.id)
    expect(permissions?.permissions).toContainEqual({ permission: reflection, pattern: "*", action: "allow" })
    expect(permissions?.permissions).toContainEqual({ permission: "buddy_read", pattern: "*", action: "allow" })
  })

  test("releasing a grant restores deny while preserving rules Buddy does not manage", async () => {
    await using context = await fixture()
    const { host, session } = context
    await updateSessionPermissions(host, session.id, (existing) => withDynamicToolPermissionGrants({ existing: [...existing, { permission: "external_directory", pattern: "/trusted/*", action: "ask" }], toolIDs: [reflection], managedToolIDs: dynamicToolIDs }))
    await updateSessionPermissions(host, session.id, (existing) => resetDynamicToolPermissionGrants(existing, dynamicToolIDs))
    expect((await host.permission.create({ sessionID: session.id, action: reflection, resources: ["*"] })).effect).toBe("deny")
    expect((await readSessionPermissions(host, session.id))?.permissions).toContainEqual({ permission: "external_directory", pattern: "/trusted/*", action: "ask" })
  })

  test("authored denies remain enforced when Buddy tries to grant a dynamic tool", async () => {
    const configured: PermissionRuleset = [{ permission: reflection, pattern: "private/*", action: "deny" }]
    await using context = await fixture(configured)
    const { host, session } = context
    await updateSessionPermissions(host, session.id, (existing) => constrainPermissionGrants(withDynamicToolPermissionGrants({ existing, toolIDs: [reflection], managedToolIDs: dynamicToolIDs }), configured, dynamicToolIDs))
    expect((await host.permission.create({ sessionID: session.id, action: reflection, resources: ["private/note"] })).effect).toBe("deny")
    expect((await readSessionPermissions(host, session.id))?.permissions).not.toContainEqual({ permission: reflection, pattern: "*", action: "allow" })
  })
})
