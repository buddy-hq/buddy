import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { Session } from "@buddy/transcript-contract/session"
import { resolveDirectory } from "../../src/project/directory"
import { getAgentRuntime } from "../../src/runtime/agent-runtime"
import {
  dynamicLearningToolSearchCandidateIDsForSession,
  recordDynamicLearningToolSearchCandidates,
} from "../../src/learning/runtime/dynamic-tool-grants"
import { createRuntimeHarness, scenario } from "../conformance/harness"

describe("session API behavior", () => {
  test("deleting a session family also clears its dynamic tool candidates", async () => {
    await using api = await createRuntimeHarness()
    const parent = await api.create({ title: "Parent" })
    const child = await api.create({ parentID: parent.id, title: "Child" })
    const directory = resolveDirectory(api.directory)
    for (const sessionID of [parent.id, child.id])
      recordDynamicLearningToolSearchCandidates({
        directory,
        sessionID,
        toolIDs: ["dynamic-test-tool"],
      })
    expect(await api.json(`/session/${parent.id}`, { method: "DELETE" })).toBe(true)
    for (const sessionID of [parent.id, child.id]) {
      expect((await api.request(`/session/${sessionID}`)).status).toBe(404)
      expect(dynamicLearningToolSearchCandidateIDsForSession({ directory, sessionID })).toEqual(
        new Set(),
      )
    }
  })

  test("a full fork retains multipart prompt presentation", async () => {
    await using api = await createRuntimeHarness()
    const runtime = await getAgentRuntime()
    const session = await api.create()
    const result = await runtime.execution.prompt(
      {
        sessionID: session.id,
        text: "firstsecond",
        metadata: {
          buddy: {
            prompt: {
              segments: [
                { start: 0, end: 5 },
                { start: 5, end: 11 },
              ],
            },
          },
        },
      },
      { directory: api.directory },
    )
    expect(result.ok).toBe(true)
    const fork = Schema.decodeUnknownSync(Session)(
      await api.json(`/session/${session.id}/fork`, { method: "POST" }),
    )
    const user = (await api.messages(fork.id)).find((message) => message.info.role === "user")
    expect(user?.parts.filter((part) => part.type === "text").map((part) => part.text)).toEqual([
      "first",
      "second",
    ])
  })

  test("revert rejects individual part boundaries", async () => {
    await using api = await createRuntimeHarness()
    const session = await api.create()
    expect((await api.prompt(session.id, scenario({ kind: "reply", text: "Answer" }))).status).toBe(
      200,
    )
    const first = (await api.messages(session.id))[0]
    if (!first || !first.parts[0]) throw new Error("Missing prompt part")
    const response = await api.request(`/session/${session.id}/revert`, {
      method: "POST",
      body: JSON.stringify({ messageID: first.info.id, partID: first.parts[0].id }),
    })
    expect(response.status).toBe(400)
  })

  test("revert can move backwards and forwards before unrevert clears the boundary", async () => {
    await using api = await createRuntimeHarness()
    const session = await api.create()
    for (const text of ["First", "Second", "Third"])
      expect((await api.prompt(session.id, scenario({ kind: "reply", text }))).status).toBe(200)
    const users = (await api.messages(session.id)).filter((message) => message.info.role === "user")
    const second = users[1]
    const third = users[2]
    if (!second || !third) throw new Error("Missing revert boundaries")
    for (const messageID of [third.info.id, second.info.id, third.info.id]) {
      const reverted = Schema.decodeUnknownSync(Session)(
        await api.json(`/session/${session.id}/revert`, {
          method: "POST",
          body: JSON.stringify({ messageID }),
        }),
      )
      expect(reverted.revert?.messageID).toBe(messageID)
    }
    await api.json(`/session/${session.id}/unrevert`, { method: "POST" })
    expect((await api.session(session.id)).revert).toBeUndefined()
  })
})
