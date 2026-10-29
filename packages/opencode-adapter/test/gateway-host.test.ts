import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import type { SessionMessageInfo } from "@opencode/client"
import { Plugin } from "@opencode/plugin"
import type { Context as PluginContext } from "@opencode/plugin/promise/plugin"
import { TEST_SANDBOX } from "../../../script/test-preload"
import { createOpenCodeHost, type OpenCodeHost } from "../src/host"
import { createOpenCodeRuntime } from "../src/runtime"
import { createPluginSessionAccess } from "../src/extension/hooks"
import { createSession, forkSession, getSession, updateSession, deleteSession } from "../src/gateway/session"
import { listMessages } from "../src/gateway/message"
import { sessionErrorStatus } from "../src/gateway/errors"

function assistant(id: string): SessionMessageInfo {
  return {
    id, type: "assistant", agent: "buddy", model: { id: "model", providerID: "provider" },
    content: [{ type: "text", text: "Answer" }], time: { created: 1, completed: 2 },
  }
}

async function pluginContext(host: OpenCodeHost, directory: string): Promise<PluginContext> {
  const ready = Promise.withResolvers<PluginContext>()
  await host.plugin(Plugin.define({ id: "buddy.test.af2-context", setup(ctx) { ready.resolve(ctx) } }))
  await host.agent.list({ location: { directory } })
  return ready.promise
}

describe("v2 gateway host", () => {
  test("concurrent plugin teaching, archive and runtime metadata edits preserve each other", async () => {
    const root = path.join(TEST_SANDBOX.root, "metadata-writers")
    const paths = { data: path.join(root, "data"), config: path.join(root, "config"), state: path.join(root, "state"), cache: path.join(root, "cache"), tmp: path.join(root, "tmp") }
    const directory = path.join(root, "workspace")
    await Promise.all([...Object.values(paths), directory].map((entry) => fs.mkdir(entry, { recursive: true })))
    await using host = await createOpenCodeHost({ clientName: "buddy-test", paths, databasePath: ":memory:", fetchModels: false, fs: { filewatcher: false, fff: false }, config: { project: false } })
    const ctx = await pluginContext(host, directory)
    let stored = await host.session.create({ location: { directory }, metadata: { retained: true, obsolete: true } })
    const client: OpenCodeHost = { ...host, session: {
      ...host.session,
      async get() {
        const current = structuredClone(stored)
        await Promise.resolve()
        return current
      },
      async update(input) {
        stored = { ...stored, title: input.title ?? stored.title, metadata: input.metadata ?? stored.metadata }
      },
    } }
    const runtime = createOpenCodeRuntime(client)
    const sessions = createPluginSessionAccess({ ...ctx, session: { ...ctx.session, get: client.session.get, update: client.session.update } })
    await Promise.all([
      sessions.patchMetadata(stored.id, { buddyTeaching: { revision: 2 } }),
      runtime.conversations.update(stored.id, { title: "Archived lesson", time: { archived: 123 } }),
      runtime.conversations.patchMetadata(stored.id, { obsolete: undefined, preference: "concise" }),
    ])
    const result = await runtime.conversations.get(stored.id)
    expect(result).toMatchObject({ title: "Archived lesson", time: { archived: 123 }, metadata: {
      retained: true, buddyTeaching: { revision: 2 }, "buddy.archivedAt": 123, preference: "concise",
    } })
    expect(result.metadata).not.toHaveProperty("obsolete")
  })

  test("creates, renames, queues a synthetic notice and handles empty forks through the real host", async () => {
    const root = path.join(TEST_SANDBOX.root, "gateway-host")
    const paths = { data: path.join(root, "data"), config: path.join(root, "config"), state: path.join(root, "state"), cache: path.join(root, "cache"), tmp: path.join(root, "tmp") }
    const directory = path.join(root, "workspace")
    await Promise.all([...Object.values(paths), directory].map((entry) => fs.mkdir(entry, { recursive: true })))
    await using host = await createOpenCodeHost({ clientName: "buddy-test", paths, databasePath: ":memory:", fetchModels: false, fs: { filewatcher: false, fff: false }, config: { project: false } })
    const session = await createSession(host, directory, { title: "Gateway" })
    expect(await getSession(host, session.id)).toMatchObject({ id: session.id, title: "Gateway", directory })
    const notice = await host.sessions.synthetic({ sessionID: session.id, text: "Finished", description: "Research", metadata: { source: "subagent", state: "completed" }, resume: false })
    expect(notice).toMatchObject({ type: "synthetic", payload: { text: "Finished", metadata: { source: "subagent", state: "completed" } } })
    expect(await updateSession(host, session.id, { title: "Renamed" })).toMatchObject({ title: "Renamed" })
    try {
      await listMessages(host, { sessionID: session.id, directory }, { before: "malformed-cursor" })
      throw new Error("Malformed cursor unexpectedly succeeded")
    } catch (error) {
      expect(error).toMatchObject({ _tag: "InvalidCursorError" })
      expect(sessionErrorStatus(error)).toBe(400)
    }
    await expect(forkSession(host, session.id)).rejects.toMatchObject({ _tag: "InvalidRequestError", kind: "empty_session" })
    expect(await deleteSession(host, session.id)).toBe(true)
  })

  test("single-message parents match history across long turns, notices and later prompts", async () => {
    const root = path.join(TEST_SANDBOX.root, "message-parents")
    const paths = { data: path.join(root, "data"), config: path.join(root, "config"), state: path.join(root, "state"), cache: path.join(root, "cache"), tmp: path.join(root, "tmp") }
    const directory = path.join(root, "workspace")
    await Promise.all([...Object.values(paths), directory].map((entry) => fs.mkdir(entry, { recursive: true })))
    await using host = await createOpenCodeHost({ clientName: "buddy-test", paths, databasePath: ":memory:", fetchModels: false, fs: { filewatcher: false, fff: false }, config: { project: false } })
    const original = await host.session.create({ location: { directory } })
    const session = await host.session.import({
      location: { directory },
      info: { ...original, id: "ses_message_parents" },
      messages: [
        assistant("msg_orphan"),
        { id: "msg_z_user", type: "user", text: "First prompt", time: { created: 1 } },
        ...Array.from({ length: 205 }, (_, index): SessionMessageInfo => ({ id: `msg_hidden_${index}`, type: "system", text: "Hidden", time: { created: 1 } })),
        assistant("msg_a_response"),
        { id: "msg_notice", type: "synthetic", text: "Notice", time: { created: 1 } },
        assistant("msg_second_step"),
        { id: "msg_later_user", type: "user", text: "Later prompt", time: { created: 1 } },
        assistant("msg_later_response"),
      ],
    })
    const runtime = createOpenCodeRuntime(host)
    const scope = { sessionID: session.id, directory }
    const { items } = await runtime.conversations.history(scope)
    const assistants = items.flatMap((message) => message.info.role === "assistant" ? [message.info] : [])
    expect(assistants.map((message) => message.parentID)).toEqual(["", "msg_z_user", "msg_z_user", "msg_z_user", "msg_later_user"])
    for (const message of assistants) {
      expect((await runtime.conversations.message(scope, message.id))?.info).toMatchObject({ id: message.id, parentID: message.parentID })
    }
  })
})
