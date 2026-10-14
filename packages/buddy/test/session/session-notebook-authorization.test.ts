import { afterAll, describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { Hono } from "hono"
import { TEST_SANDBOX } from "../../../../script/test-preload"
import { getOpenCodeClient } from "../../src/opencode-runtime/client"
import { closeOpenCodeHost } from "../../src/opencode-runtime/runtime"
import { SessionRoutes } from "../../src/routes/session"
import { resolveDirectory } from "../../src/project"
import { temporaryDirectory } from "../helpers/temporary-directory"
import { temporaryEnvironment } from "../helpers/temporary-environment"
import { requireJsonArray, requireJsonObject, requireString } from "../helpers/parse"

afterAll(closeOpenCodeHost)

const app = new Hono().route("/session", SessionRoutes)

async function emptyGitNotebooks() {
  const root = await temporaryDirectory({ parentDirectory: TEST_SANDBOX.root, prefix: "session-notebooks-" })
  const notebook = resolveDirectory(path.join(root.path, "notebook"))
  const other = resolveDirectory(path.join(root.path, "notebook-other"))
  try {
    for (const cwd of [notebook, other]) {
      await fs.mkdir(cwd, { recursive: true })
      const git = Bun.spawn(["git", "init", "--quiet"], { cwd, stdout: "ignore", stderr: "pipe" })
      expect(await git.exited).toBe(0)
    }
    const environment = temporaryEnvironment({ BUDDY_ALLOWED_DIRECTORY_ROOTS: notebook })
    return {
      notebook, other, headers: { "x-buddy-directory": notebook, "content-type": "application/json" },
      async [Symbol.asyncDispose]() {
        try { await closeOpenCodeHost() } finally {
          environment[Symbol.dispose]()
          await root[Symbol.asyncDispose]()
        }
      },
    }
  } catch (cause) { await root[Symbol.asyncDispose](); throw cause }
}

describe("session notebook authorization", () => {
  test("rejects creation that names another notebook's session as its ID or parent before writing", async () => {
    await using notebooks = await emptyGitNotebooks()
    const { notebook, other, headers } = notebooks
    const host = await getOpenCodeClient()
    const foreign = await host.sessions.create({ location: { directory: other }, title: "Other private chat", metadata: { secret: "other notebook" } })
    expect(foreign.projectID).toBe("global")
    const lookup = await app.request(`/session/${foreign.id}`, { headers })
    expect(lookup.status).toBe(404)

    const existing = await app.request("/session", { method: "POST", headers, body: JSON.stringify({ id: foreign.id }) })
    expect(existing.status).toBe(404)
    expect(await existing.text()).not.toContain("Other private chat")

    const child = await app.request("/session", { method: "POST", headers, body: JSON.stringify({ parentID: foreign.id, title: "Smuggled child" }) })
    expect(child.status).toBe(404)
    expect((await host.sessions.list({ parentID: foreign.id })).data).toEqual([])
    expect((await host.sessions.list({ directory: other })).data.map((session) => session.id)).toEqual([foreign.id])

    const missingParent = await app.request("/session", { method: "POST", headers, body: JSON.stringify({ parentID: "ses_missing_parent" }) })
    expect(missingParent.status).toBe(404)

    const created = await app.request("/session", { method: "POST", headers, body: JSON.stringify({ title: "Own chat" }) })
    expect(created.status).toBe(200)
    const own = requireJsonObject(await created.json())
    expect(own.directory).toBe(notebook)
    const retried = await app.request("/session", { method: "POST", headers, body: JSON.stringify({ id: own.id }) })
    expect(retried.status).toBe(200)
    expect(requireJsonObject(await retried.json())).toMatchObject({ id: own.id, title: "Own chat" })
    const ownChild = await app.request("/session", { method: "POST", headers, body: JSON.stringify({ parentID: own.id }) })
    expect(ownChild.status).toBe(200)
    expect(requireJsonObject(await ownChild.json())).toMatchObject({ parentID: own.id, directory: notebook })
  }, 30_000)

  test("filters header-only collection listings to the requested notebook before applying the limit", async () => {
    await using notebooks = await emptyGitNotebooks()
    const { notebook, other, headers } = notebooks
    const host = await getOpenCodeClient()
    const nested = path.join(notebook, "nested")
    await fs.mkdir(nested)
    const own = await host.sessions.create({ location: { directory: notebook }, title: "Own chat" })
    const nestedSession = await host.sessions.create({ location: { directory: nested }, title: "Nested chat" })
    const foreign: string[] = []
    for (const index of [1, 2, 3]) {
      foreign.push((await host.sessions.create({ location: { directory: other }, title: `Other private chat ${index}`, metadata: { secret: "other notebook" } })).id)
    }
    expect(new Set([own.projectID, nestedSession.projectID, ...await Promise.all(foreign.map(async (id) => (await host.sessions.get({ sessionID: id })).projectID))])).toEqual(new Set(["global"]))
    const gone = path.join(path.dirname(notebook), "notebook-removed")
    await fs.mkdir(gone)
    expect(await Bun.spawn(["git", "init", "--quiet"], { cwd: gone, stdout: "ignore", stderr: "ignore" }).exited).toBe(0)
    const removed = await host.sessions.create({ location: { directory: gone }, title: "Removed notebook chat" })
    expect(removed.projectID).toBe("global")
    await closeOpenCodeHost()
    await fs.rm(gone, { recursive: true, force: true })

    const listed = await app.request("/session", { headers })
    expect(listed.status).toBe(200)
    const ids = requireJsonArray(await listed.json()).map((session) => requireString(requireJsonObject(session).id))
    expect(ids).toContain(own.id)
    expect(ids).toContain(nestedSession.id)
    expect(ids.filter((id) => foreign.includes(id) || id === removed.id)).toEqual([])

    const limited = await app.request("/session?limit=1", { headers })
    expect(limited.status).toBe(200)
    const limitedIDs = requireJsonArray(await limited.json()).map((session) => requireString(requireJsonObject(session).id))
    expect(limitedIDs).toHaveLength(1)
    expect([own.id, nestedSession.id]).toContain(limitedIDs[0])

    const otherListing = await app.request("/session", { headers: { "x-buddy-directory": other } })
    expect(otherListing.status).toBe(403)
  }, 30_000)
})
