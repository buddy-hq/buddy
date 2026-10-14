import fs from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "bun:test"
import { openAPIRouteHandler } from "hono-openapi"
import { Hono } from "hono"
import { createOpenCodeHost, type OpenCodeHost } from "@buddy/opencode-adapter/host"
import { createPermissionRoutes } from "../../src/routes/permission"
import { TEST_SANDBOX } from "../../../../script/test-preload"
import { temporaryEnvironment } from "../helpers/temporary-environment"
import { BUDDY_ENV } from "../../src/storage/constants"

async function fixture(input: { emptyGit?: boolean } = {}) {
  const root = await fs.mkdtemp(path.join(TEST_SANDBOX.root, "permission-v2-"))
  const environment = temporaryEnvironment({ [BUDDY_ENV.RUNTIME_ROOT]: root })
  let host: OpenCodeHost | undefined
  try {
    const paths = { data: path.join(root, "data"), cache: path.join(root, "cache"), config: path.join(root, "config"), state: path.join(root, "state"), tmp: path.join(root, "tmp") }
    const directory = path.join(root, "notebook")
    const otherDirectory = path.join(root, "notebook-other")
    await Promise.all([...Object.values(paths), directory, otherDirectory].map((folder) => fs.mkdir(folder, { recursive: true })))
    if (input.emptyGit) {
      for (const cwd of [directory, otherDirectory]) {
        const git = Bun.spawn(["git", "init", "--quiet"], { cwd, stdout: "ignore", stderr: "pipe" })
        expect(await git.exited).toBe(0)
      }
    }
    await fs.writeFile(path.join(paths.config, "config.json"), JSON.stringify({ agents: { buddy_test: { permissions: [{ action: "*", resource: "*", effect: "allow" }] } } }))
    const client = await createOpenCodeHost({ clientName: "buddy-test", paths, databasePath: path.join(root, "opencode.db"), fetchModels: false })
    host = client
    const routes = new Hono().route("/permission", createPermissionRoutes(async () => client, (context) => context.req.header("x-buddy-directory") === directory ? { ok: true, directory, requestURL: new URL(context.req.url) } : { ok: false, response: Response.json({ error: "Forbidden" }, { status: 403 }) }))
    const headers = { "x-buddy-directory": directory, "content-type": "application/json" }
    return { host: client, routes, directory, otherDirectory, headers, async [Symbol.asyncDispose]() { try { await client.close() } finally { environment[Symbol.dispose](); await fs.rm(root, { recursive: true, force: true }) } } }
  } catch (error) {
    try { await host?.close() } finally { environment[Symbol.dispose](); await fs.rm(root, { recursive: true, force: true }) }
    throw error
  }
}

describe("Buddy PermissionV2 routes", () => {
  test("rejects another empty Git notebook's session despite matching global project IDs", async () => {
    await using context = await fixture({ emptyGit: true })
    const { host, directory, otherDirectory, routes, headers } = context
    const allowed = await host.sessions.create({ location: { directory }, agent: "buddy_test" })
    const forbidden = await host.sessions.create({ location: { directory: otherDirectory }, agent: "buddy_test", permissions: [{ action: "buddy_test", resource: "*", effect: "ask" }] })
    expect(allowed.projectID).toBe("global")
    expect(forbidden.projectID).toBe("global")
    const asked = await host.permission.create({ sessionID: forbidden.id, action: "buddy_test", resources: ["private.md"] })
    expect(asked.effect).toBe("ask")
    const listed = await routes.request(`/permission?sessionID=${forbidden.id}`, { headers })
    expect(listed.status).toBe(404)
    expect(await listed.json()).toEqual({ error: "Session not found in this notebook" })
    const reply = await routes.request(`/permission/${asked.id}/reply?sessionID=${forbidden.id}`, { method: "POST", headers, body: JSON.stringify({ reply: "once" }) })
    expect(reply.status).toBe(404)
    expect(await reply.json()).toEqual({ error: "Session not found in this notebook" })
    expect(await host.permission.list({ sessionID: forbidden.id })).toMatchObject([{ id: asked.id }])
  })
  test("only exposes descendant requests whose canonical locations stay inside the authorized notebook", async () => {
    await using context = await fixture({ emptyGit: true })
    const { host, directory, otherDirectory, routes, headers } = context
    const parent = await host.sessions.create({ location: { directory }, agent: "buddy_test", permissions: [{ action: "buddy_test", resource: "*", effect: "ask" }] })
    const nestedDirectory = path.join(directory, "nested")
    await fs.mkdir(nestedDirectory)
    const child = await host.sessions.create({ parentID: parent.id, location: { directory: nestedDirectory }, agent: "buddy_test" })
    const otherChild = await host.sessions.create({ parentID: parent.id, location: { directory: otherDirectory }, agent: "buddy_test" })
    await host.sessions.move({ sessionID: child.id, directory: nestedDirectory })
    await host.sessions.wait({ sessionID: child.id }, { signal: AbortSignal.timeout(10_000) })
    await host.sessions.move({ sessionID: otherChild.id, directory: otherDirectory })
    await host.sessions.wait({ sessionID: otherChild.id }, { signal: AbortSignal.timeout(10_000) })
    expect((await host.sessions.get({ sessionID: child.id })).location.directory).toBe(nestedDirectory)
    expect((await host.sessions.get({ sessionID: otherChild.id })).location.directory).toBe(otherDirectory)
    expect(otherChild.projectID).toBe(parent.projectID)
    const allowed = await host.permission.create({ sessionID: child.id, action: "buddy_test", resources: ["visible.md"] })
    const forbidden = await host.permission.create({ sessionID: otherChild.id, action: "buddy_test", resources: ["private.md"] })
    expect(allowed.effect).toBe("ask")
    expect(forbidden.effect).toBe("ask")
    const listed = await routes.request(`/permission?sessionID=${parent.id}`, { headers })
    expect(listed.status).toBe(200)
    expect(await listed.json()).toMatchObject([{ id: allowed.id, sessionID: child.id }])
    const reply = await routes.request(`/permission/${forbidden.id}/reply?sessionID=${otherChild.id}`, { method: "POST", headers, body: JSON.stringify({ reply: "once" }) })
    expect(reply.status).toBe(404)
    expect(await host.permission.list({ sessionID: otherChild.id })).toMatchObject([{ id: forbidden.id }])
    expect((await routes.request(`/permission/${allowed.id}/reply?sessionID=${child.id}`, { method: "POST", headers, body: JSON.stringify({ reply: "once" }) })).status).toBe(200)
    expect(await host.permission.list({ sessionID: child.id })).toEqual([])
  })
  test("lists child requests, replies once, remembers save patterns and preserves configured denies", async () => {
    await using context = await fixture()
    const { host, directory, routes, headers } = context
    const parent = await host.sessions.create({ location: { directory }, agent: "buddy_test", permissions: [{ action: "buddy_test", resource: "*", effect: "ask" }] })
    const child = await host.sessions.create({ parentID: parent.id, location: { directory }, agent: "buddy_test" })
    const asked = await host.permission.create({ sessionID: child.id, action: "buddy_test", resources: ["file.md"], save: ["*.md"] })
    expect(asked.effect).toBe("ask")
    expect((await routes.request(`/permission?sessionID=${parent.id}missing`, { headers })).status).toBe(404)
    expect((await routes.request(`/permission/${asked.id}missing/reply`, { method: "POST", headers, body: JSON.stringify({ reply: "once" }) })).status).toBe(404)
    const listed = await routes.request(`/permission?sessionID=${parent.id}`, { headers })
    expect(listed.status).toBe(200)
    expect(await listed.json()).toMatchObject([{ id: asked.id, sessionID: child.id, action: "buddy_test", resources: ["file.md"] }])
    const reply = await routes.request(`/permission/${asked.id}/reply?sessionID=${child.id}`, { method: "POST", headers, body: JSON.stringify({ reply: "once" }) })
    expect(reply.status).toBe(200)
    expect(await host.permission.list({ sessionID: child.id })).toEqual([])
    expect(await (await routes.request(`/permission?sessionID=${parent.id}`, { headers })).json()).toEqual([])
    const second = await host.permission.create({ sessionID: child.id, action: "buddy_test", resources: ["file.md"], save: ["*.md"] })
    expect((await routes.request(`/permission/${second.id}/reply`, { method: "POST", headers, body: JSON.stringify({ reply: "always" }) })).status).toBe(200)
    const saved = await routes.request("/permission/saved", { headers })
    expect(saved.status).toBe(200)
    expect(await saved.json()).toMatchObject([{ projectID: parent.projectID, action: "buddy_test", resource: "*.md" }])
    expect((await host.permission.create({ sessionID: child.id, action: "buddy_test", resources: ["another.md"] })).effect).toBe("allow")
    await host.sessions.update({ sessionID: child.id, permissions: [{ action: "buddy_test", resource: "*", effect: "deny" }] })
    expect((await host.permission.create({ sessionID: child.id, action: "buddy_test", resources: ["another.md"] })).effect).toBe("deny")
    const approval = (await host.permission.saved.list({ projectID: parent.projectID }))[0]
    expect(approval).toBeDefined()
    if (approval === undefined) throw new Error("Missing saved approval")
    expect((await routes.request(`/permission/saved/${approval.id}`, { method: "DELETE", headers })).status).toBe(200)
    expect(await host.permission.saved.list({ projectID: parent.projectID })).toEqual([])
  })
  test("reject feedback clears sibling requests without broadening the rules", async () => {
    await using context = await fixture()
    const { host, directory, routes, headers } = context
    const session = await host.sessions.create({ location: { directory }, agent: "buddy_test", permissions: [{ action: "buddy_test", resource: "*", effect: "ask" }] })
    const first = await host.permission.create({ sessionID: session.id, action: "buddy_test", resources: ["first"] })
    await host.permission.create({ sessionID: session.id, action: "buddy_test", resources: ["second"] })
    const response = await routes.request(`/permission/${first.id}/reply`, { method: "POST", headers, body: JSON.stringify({ reply: "reject", message: "Try another file" }) })
    expect(response.status).toBe(200)
    expect(await host.permission.list({ sessionID: session.id })).toEqual([])
    expect((await host.permission.create({ sessionID: session.id, action: "buddy_test", resources: ["third"] })).effect).toBe("ask")
  })
  test("keeps the PermissionRequest OpenAPI component in Buddy's vocabulary", async () => {
    const routes = new Hono().route("/permission", createPermissionRoutes(async () => { throw new Error("No host is needed for schema generation") }))
    routes.get("/doc", openAPIRouteHandler(routes, { documentation: { info: { title: "Permissions", version: "1" } } }))
    const response = await routes.request("/doc")
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ components: { schemas: { PermissionRequest: { properties: { action: { type: "string" }, resources: { type: "array" } } } } } })
  })

})
