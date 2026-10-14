import { afterEach, describe, expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { listMessages } from "@buddy/opencode-adapter/gateway/message"
import { getOpenCodeClient } from "../../src/opencode-runtime/client"
import { closeOpenCodeHost } from "../../src/opencode-runtime/runtime"
import { app } from "../../src/index.ts"
import {
  dynamicLearningToolSearchCandidateIDsForSession,
  recordDynamicLearningToolSearchCandidates,
} from "../../src/learning/runtime/dynamic-tool-grants"
import { resolveDirectory } from "../../src/project"
import { tmpdir } from "../helpers/tmpdir"
import { parseJsonObject, requireJsonObject, requireString } from "../helpers/parse"

const DYNAMIC_TEST_TOOL_ID = "dynamic-test-tool"

afterEach(async () => {
  await closeOpenCodeHost()
})

async function createSession(directory: string, title?: string) {
  return (await getOpenCodeClient()).session.create({ location: { directory }, title })
}

async function seedMultiPartMessage(input: { directory: string; sessionID: string }) {
  const host = await getOpenCodeClient()
  const current = await host.session.export({ sessionID: input.sessionID })
  const messageID = `msg_${randomUUID()}`
  const message = { id: messageID, type: "user" as const, text: "firstsecond", metadata: { buddy: { prompt: { segments: [{ start: 0, end: 5 }, { start: 5, end: 11 }] } } }, time: { created: current.messages.length + 1 } }
  await host.session.remove({ sessionID: input.sessionID })
  const messages = [...current.messages, message]
  await host.session.import({ location: { directory: input.directory }, info: current.info, messages })
  return { messageID, secondPartID: `prt_${messageID}_00000001_text` }
}

async function readRevertBoundary(response: Response): Promise<string | undefined> {
  const body = requireJsonObject(await response.json(), "session response")
  const revert = parseJsonObject(body.revert)
  if (revert === undefined) return undefined
  return requireString(revert.messageID, "session revert messageID")
}

describe("Buddy session API parity", () => {
  test("delete route permanently removes a session and its children", async () => {
    await using project = await tmpdir({ git: true })
    const parent = await createSession(project.path, "Parent")
    const child = await (await getOpenCodeClient()).session.create({ location: { directory: project.path }, parentID: parent.id, title: "Child" })
    const resolvedProjectDirectory = resolveDirectory(project.path)
    recordDynamicLearningToolSearchCandidates({
      directory: resolvedProjectDirectory,
      sessionID: parent.id,
      toolIDs: [DYNAMIC_TEST_TOOL_ID],
    })
    recordDynamicLearningToolSearchCandidates({
      directory: resolvedProjectDirectory,
      sessionID: child.id,
      toolIDs: [DYNAMIC_TEST_TOOL_ID],
    })

    const response = await app.request(`/api/session/${parent.id}`, {
      method: "DELETE",
      headers: {
        "x-buddy-directory": project.path,
      },
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toBe(true)

    const { data: sessions } = await (await getOpenCodeClient()).session.list({ directory: project.path })
    expect(sessions.some((session) => session.id === parent.id)).toBe(false)
    expect(sessions.some((session) => session.id === child.id)).toBe(false)
    expect(
      dynamicLearningToolSearchCandidateIDsForSession({
        directory: resolvedProjectDirectory,
        sessionID: parent.id,
      }),
    ).toEqual(new Set())
    expect(
      dynamicLearningToolSearchCandidateIDsForSession({
        directory: resolvedProjectDirectory,
        sessionID: child.id,
      }),
    ).toEqual(new Set())
  })

  test("fork route clones the full session when messageID is omitted", async () => {
    await using project = await tmpdir({ git: true })
    const session = await createSession(project.path, "Fork title")
    await seedMultiPartMessage({
      directory: project.path,
      sessionID: session.id,
    })

    const response = await app.request(`/api/session/${session.id}/fork`, {
      method: "POST",
      headers: {
        "x-buddy-directory": project.path,
      },
    })

    expect(response.status).toBe(200)
    const body = requireJsonObject(await response.json(), "fork session")
    const forkedSessionID = requireString(body.id, "forked session id")
    expect(body.title).toBe("Fork title (2)")

    const { items: forkedMessages } = await listMessages(await getOpenCodeClient(), { directory: project.path, sessionID: forkedSessionID })
    expect(forkedMessages).toHaveLength(1)
    expect(forkedMessages[0]?.parts).toHaveLength(2)

    const secondForkResponse = await app.request(`/api/session/${body.id}/fork`, {
      method: "POST",
      headers: {
        "x-buddy-directory": project.path,
      },
    })
    expect(secondForkResponse.status).toBe(200)
    const secondFork = requireJsonObject(await secondForkResponse.json(), "second fork session")
    expect(secondFork.title).toBe("Fork title (3)")
  })

  test("fork route preserves the vendor exclusive message boundary", async () => {
    await using project = await tmpdir({ git: true })
    const session = await createSession(project.path)
    await seedMultiPartMessage({
      directory: project.path,
      sessionID: session.id,
    })
    const secondMessage = await seedMultiPartMessage({
      directory: project.path,
      sessionID: session.id,
    })

    const response = await app.request(`/api/session/${session.id}/fork`, {
      method: "POST",
      headers: {
        "x-buddy-directory": project.path,
        "content-type": "application/json",
      },
      body: JSON.stringify({ messageID: secondMessage.messageID }),
    })

    expect(response.status).toBe(200)
    const body = requireJsonObject(await response.json(), "fork session")
    const forkedSessionID = requireString(body.id, "forked session id")

    const { items: forkedMessages } = await listMessages(await getOpenCodeClient(), { directory: project.path, sessionID: forkedSessionID })
    expect(forkedMessages).toHaveLength(1)
  })

  test("revert route rejects legacy part boundaries", async () => {
    await using project = await tmpdir({ git: true })
    const session = await createSession(project.path)
    const seeded = await seedMultiPartMessage({
      directory: project.path,
      sessionID: session.id,
    })

    const response = await app.request(`/api/session/${session.id}/revert`, {
      method: "POST",
      headers: {
        "x-buddy-directory": project.path,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        messageID: seeded.messageID,
        partID: seeded.secondPartID,
      }),
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: "Reverting individual parts is unavailable" })
  })

  test("revert and unrevert routes preserve the vendor undo and redo sequence", async () => {
    await using project = await tmpdir({ git: true })
    const session = await createSession(project.path)
    const first = await seedMultiPartMessage({
      directory: project.path,
      sessionID: session.id,
    })
    const second = await seedMultiPartMessage({
      directory: project.path,
      sessionID: session.id,
    })
    const third = await seedMultiPartMessage({
      directory: project.path,
      sessionID: session.id,
    })

    const revert = (messageID: string) =>
      app.request(`/api/session/${session.id}/revert`, {
        method: "POST",
        headers: {
          "x-buddy-directory": project.path,
          "content-type": "application/json",
        },
        body: JSON.stringify({ messageID }),
      })

    const firstUndo = await revert(third.messageID)
    expect(firstUndo.status).toBe(200)
    expect(await readRevertBoundary(firstUndo)).toBe(third.messageID)

    const secondUndo = await revert(second.messageID)
    expect(secondUndo.status).toBe(200)
    expect(await readRevertBoundary(secondUndo)).toBe(second.messageID)

    const firstRedo = await revert(third.messageID)
    expect(firstRedo.status).toBe(200)
    expect(await readRevertBoundary(firstRedo)).toBe(third.messageID)

    const finalRedo = await app.request(`/api/session/${session.id}/unrevert`, {
      method: "POST",
      headers: {
        "x-buddy-directory": project.path,
      },
    })
    expect(finalRedo.status).toBe(200)
    expect(await readRevertBoundary(finalRedo)).toBeUndefined()

    expect(new Set([first.messageID, second.messageID, third.messageID]).size).toBe(3)
  })
})
