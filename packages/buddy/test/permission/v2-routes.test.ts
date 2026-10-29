import fs from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "bun:test"
import { openAPIRouteHandler } from "hono-openapi"
import { Hono } from "hono"
import { RuntimeError } from "@buddy/agent-runtime/errors"
import type { PermissionRequest } from "@buddy/transcript-contract/permission"
import { Session } from "@buddy/transcript-contract/session"
import { createPermissionRoutes } from "../../src/routes/permission"
import { getAgentRuntime, closeAgentRuntime } from "../../src/runtime/agent-runtime"
import { temporaryDirectory } from "../helpers/temporary-directory"
import { runtimeHost } from "../helpers/opencode"

const session = (id: string, directory: string, parentID?: string) => Session.make({ id, directory, projectID: "global", parentID, title: id, time: { created: 0, updated: 0 } })

async function fixture() {
  const root = await temporaryDirectory({ prefix: "permission-notebook-" })
  try {
    const directory = path.join(root.path, "notebook")
    const otherDirectory = path.join(root.path, "notebook-other")
    const nested = path.join(directory, "nested")
    const outsideLink = path.join(directory, "outside-link")
    await Promise.all([fs.mkdir(nested, { recursive: true }), fs.mkdir(otherDirectory)])
    await fs.symlink(otherDirectory, outsideLink, process.platform === "win32" ? "junction" : "dir")
    const sessions = [session("parent", directory), session("child", nested, "parent"), session("other", otherDirectory), session("outside-child", outsideLink, "parent"), session("reentered", nested, "outside-child")]
    const pending: PermissionRequest[] = ["child", "other", "outside-child", "reentered"].map((sessionID) => ({ id: `request-${sessionID}`, sessionID, action: "read", resources: ["private.md"] }))
    const runtime = await getAgentRuntime()
    const routes = new Hono().route("/permission", createPermissionRoutes(async () => ({
      ...runtime,
      conversations: { ...runtime.conversations,
        async get(id) {
          const found = sessions.find((entry) => entry.id === id)
          if (!found) throw new RuntimeError("not_found", "Session not found", { subject: "session" })
          return found
        },
        async children(id) { return sessions.filter((entry) => entry.parentID === id) },
      },
      approvals: { ...runtime.approvals,
        async pending(scope) { return pending.filter((request) => scope.sessions.includes(request.sessionID)) },
        async get(sessionID, requestID) {
          const found = pending.find((entry) => entry.sessionID === sessionID && entry.id === requestID)
          if (!found) throw new RuntimeError("not_found", "Permission not found", { subject: "permission" })
          return found
        },
        async reply(input) {
          const index = pending.findIndex((entry) => entry.id === input.requestID && entry.sessionID === input.sessionID)
          if (index >= 0) pending.splice(index, 1)
        },
      },
    }), () => ({ ok: true, directory, requestURL: new URL("http://localhost/permission") })))
    const headers = { "x-buddy-directory": directory, "content-type": "application/json" }
    return { routes, headers, pending, async [Symbol.asyncDispose]() { try { await closeAgentRuntime() } finally { await root[Symbol.asyncDispose]() } } }
  } catch (error) {
    try { await closeAgentRuntime() } finally { await root[Symbol.asyncDispose]() }
    throw error
  }
}

describe("notebook permission boundaries", () => {
  test.each(["list", "reply"])("requires sessionID for a permission %s", async (operation) => {
    await using context = await fixture()
    const reply = operation === "reply"
    const response = await context.routes.request(reply ? "/permission/request-child/reply" : "/permission", {
      headers: context.headers,
      method: reply ? "POST" : "GET",
      body: reply ? JSON.stringify({ reply: "once" }) : undefined,
    })
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ code: "request.invalid", error: "sessionID is required" })
    expect(context.pending.some((request) => request.id === "request-child")).toBe(true)
  })

  test("lists and replies to a pending request in the selected chat copy", async () => {
    await using root = await temporaryDirectory({ prefix: "permission-chat-copy-" })
    const runtime = await getAgentRuntime()
    try {
      const directory = await fs.realpath(root.path)
      const chat = await runtime.conversations.create(directory, { permissions: [{ permission: "read", pattern: "*", action: "ask" }] })
      const host = runtimeHost(runtime)
      const pending = await host.permission.create({ sessionID: chat.id, action: "read", resources: ["private.md"] })
      expect(pending.effect).toBe("ask")
      expect((await host.permission.request.list({ location: { directory } })).data).toEqual([])
      const routes = new Hono().route("/permission", createPermissionRoutes(async () => runtime, () => ({ ok: true, directory, requestURL: new URL("http://localhost/permission") })))
      const listed = await routes.request(`/permission?sessionID=${chat.id}`)
      expect(listed.status).toBe(200)
      expect(await listed.json()).toMatchObject([{ id: pending.id, sessionID: chat.id, action: "read" }])
      const replied = await routes.request(`/permission/${pending.id}/reply?sessionID=${chat.id}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reply: "once" }),
      })
      expect(replied.status).toBe(200)
      expect(await replied.json()).toBe(true)
      expect(await host.permission.list({ sessionID: chat.id })).toEqual([])
    } finally {
      await closeAgentRuntime()
    }
  })

  test("rejects a session in another notebook even when its project ID matches", async () => {
    await using context = await fixture()
    const { routes, headers, pending } = context
    for (const url of ["/permission?sessionID=other", "/permission/request-other/reply?sessionID=other"]) {
      const reply = url.includes("reply")
      const response = await routes.request(url, { headers, method: reply ? "POST" : "GET", body: reply ? JSON.stringify({ reply: "once" }) : undefined })
      expect(response.status).toBe(404)
      expect(await response.json()).toEqual({ code: "session.not_found", error: "Session not found in this notebook" })
    }
    expect(pending.some((request) => request.id === "request-other")).toBe(true)
  })

  test("prunes outside descendants and canonical symlink escapes from the authorized tree", async () => {
    await using context = await fixture()
    const { routes, headers, pending } = context
    const listed = await routes.request("/permission?sessionID=parent", { headers })
    expect(listed.status).toBe(200)
    expect(await listed.json()).toMatchObject([{ id: "request-child", sessionID: "child" }])
    const forbidden = await routes.request("/permission/request-outside-child/reply?sessionID=outside-child", { method: "POST", headers, body: JSON.stringify({ reply: "once" }) })
    expect(forbidden.status).toBe(404)
    expect(pending.some((request) => request.id === "request-outside-child")).toBe(true)
    const allowed = await routes.request("/permission/request-child/reply?sessionID=child", { method: "POST", headers, body: JSON.stringify({ reply: "once" }) })
    expect(allowed.status).toBe(200)
    expect(pending.some((request) => request.id === "request-child")).toBe(false)
  })

  test("keeps Buddy's permission vocabulary and required reply inputs in OpenAPI", async () => {
    const routes = new Hono().route("/permission", createPermissionRoutes(async () => { throw new Error("No host is needed for schema generation") }))
    routes.get("/doc", openAPIRouteHandler(routes, { documentation: { info: { title: "Permissions", version: "1" } } }))
    const response = await routes.request("/doc")
    expect(response.status).toBe(200)
    const document = await response.json()
    expect(document).toMatchObject({ components: { schemas: { PermissionRequest: { properties: { action: { type: "string" }, resources: { type: "array" } } } } } })
    const requiredSessionQuery = expect.arrayContaining([
      expect.objectContaining({ name: "sessionID", in: "query", required: true }),
    ])
    expect(document).toMatchObject({
      paths: {
        "/permission": { get: { parameters: requiredSessionQuery } },
        "/permission/{requestID}/reply": { post: { parameters: requiredSessionQuery } },
      },
    })
    expect(document).toMatchObject({
      paths: {
        "/permission/{requestID}/reply": {
          post: {
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: {
                    required: ["reply"],
                    properties: { reply: { enum: ["once", "always", "reject"] } },
                  },
                },
              },
            },
          },
        },
      },
    })
  })

})
