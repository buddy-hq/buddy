import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { TEST_SANDBOX } from "../../../script/test-preload"
import { createOpenCodeHost } from "../src/host"
import { createSession, forkSession, getSession, updateSession, deleteSession } from "../src/gateway/session"
import { listMessages } from "../src/gateway/message"
import { sessionErrorStatus } from "../src/gateway/errors"


describe("v2 gateway host", () => {
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
})
