import { afterEach, expect, test } from "bun:test"
import type { PermissionRuleset } from "@buddy/transcript-contract/permission-rules"
import { app } from "../../src/app"
import { closeAgentRuntime, getAgentRuntime } from "../../src/runtime/agent-runtime"
import { runtimeHost } from "../helpers/opencode"
import { tmpdir } from "../helpers/tmpdir"

afterEach(closeAgentRuntime)

function headers(directory: string) {
  return { "x-buddy-directory": directory }
}

function jsonHeaders(directory: string) {
  return { "x-buddy-directory": directory, "content-type": "application/json" }
}

async function putAccess(directory: string, sessionID: string, mode: string) {
  return app.request(`/api/session/${sessionID}/access`, {
    method: "PUT",
    headers: jsonHeaders(directory),
    body: JSON.stringify({ mode }),
  })
}

function withShellAsk(rules: PermissionRuleset): PermissionRuleset {
  return [...rules, { permission: "shell", pattern: "*", action: "ask" }]
}

test("gets default and stores each access mode on the root chat", async () => {
  await using project = await tmpdir({ git: true })
  const runtime = await getAgentRuntime()
  const session = await runtime.conversations.create(project.path)
  const initial = await app.request(`/api/session/${session.id}/access`, {
    headers: headers(project.path),
  })
  expect(initial.status).toBe(200)
  expect(await initial.json()).toEqual({ mode: "default" })
  expect((await runtime.conversations.get(session.id)).metadata?.buddyAccess).toBeUndefined()

  const supervised = await putAccess(project.path, session.id, "supervised")
  expect(supervised.status).toBe(200)
  expect(await supervised.json()).toEqual({ mode: "supervised" })
  expect((await runtime.conversations.get(session.id)).metadata?.buddyAccess).toEqual({
    mode: "supervised",
  })

  const full = await putAccess(project.path, session.id, "full")
  expect(full.status).toBe(200)
  expect(await full.json()).toEqual({ mode: "full" })
  expect((await runtime.conversations.get(session.id)).metadata?.buddyAccess).toEqual({
    mode: "full",
  })

  const restored = await putAccess(project.path, session.id, "default")
  expect(restored.status).toBe(200)
  expect(await restored.json()).toEqual({ mode: "default" })
  expect((await runtime.conversations.get(session.id)).metadata?.buddyAccess).toBeUndefined()
  const reread = await app.request(`/api/session/${session.id}/access`, {
    headers: headers(project.path),
  })
  expect(await reread.json()).toEqual({ mode: "default" })
})

test("reads a child from its root and rejects setting access on the child", async () => {
  await using project = await tmpdir({ git: true })
  const runtime = await getAgentRuntime()
  const parent = await runtime.conversations.create(project.path)
  const child = await runtime.conversations.create(project.path, { parentID: parent.id })
  const updated = await putAccess(project.path, parent.id, "full")
  expect(updated.status).toBe(200)
  const childRead = await app.request(`/api/session/${child.id}/access`, {
    headers: headers(project.path),
  })
  expect(childRead.status).toBe(200)
  expect(await childRead.json()).toEqual({ mode: "full" })
  const rejected = await putAccess(project.path, child.id, "supervised")
  expect(rejected.status).toBe(400)
  expect(await rejected.json()).toEqual({
    error: "Child chats follow the root chat's access mode",
    code: "request.invalid",
  })
  expect((await runtime.conversations.get(child.id)).metadata?.buddyAccess).toBeUndefined()
  expect((await runtime.conversations.get(parent.id)).metadata?.buddyAccess).toEqual({
    mode: "full",
  })
})

test("switching to full access replies once to pending requests of the root and a child", async () => {
  await using project = await tmpdir({ git: true })
  const runtime = await getAgentRuntime()
  const parent = await runtime.conversations.create(project.path)
  const child = await runtime.conversations.create(project.path, { parentID: parent.id })
  await runtime.approvals.updateSessionRules(parent.id, withShellAsk)
  await runtime.approvals.updateSessionRules(child.id, withShellAsk)
  const host = runtimeHost(runtime)
  const rootPending = await host.permission.create({
    sessionID: parent.id,
    action: "shell",
    resources: ["echo root"],
    save: ["echo *"],
  })
  const childPending = await host.permission.create({
    sessionID: child.id,
    action: "shell",
    resources: ["echo child"],
    save: ["echo *"],
  })
  expect(rootPending.effect).toBe("ask")
  expect(childPending.effect).toBe("ask")
  const abort = new AbortController()
  const updates = host.event
    .subscribe({
      signal: AbortSignal.any([abort.signal, AbortSignal.timeout(20_000)]),
    })
    [Symbol.asyncIterator]()
  try {
    expect((await updates.next()).value?.type).toBe("server.connected")
    const updated = await putAccess(project.path, parent.id, "full")
    expect(updated.status).toBe(200)
    expect(await updated.json()).toEqual({ mode: "full" })
    const replies = []
    while (replies.length < 2) {
      const next = await updates.next()
      if (next.done) throw new Error("Runtime ended before both permission replies")
      if (next.value.type !== "permission.replied") continue
      if (next.value.data.sessionID !== parent.id && next.value.data.sessionID !== child.id)
        continue
      replies.push(next.value.data)
    }
    expect(replies).toEqual(
      expect.arrayContaining([
        { sessionID: parent.id, requestID: rootPending.id, reply: "once" },
        { sessionID: child.id, requestID: childPending.id, reply: "once" },
      ]),
    )
    expect(await runtime.approvals.pending({ sessions: [parent.id, child.id] })).toEqual([])
  } finally {
    abort.abort()
    await updates.return?.()
  }
})
