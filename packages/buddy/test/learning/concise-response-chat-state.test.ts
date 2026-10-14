import { afterEach, describe, expect, test } from "bun:test"
import { getOpenCodeClient } from "../../src/opencode-runtime/client"
import { closeOpenCodeHost } from "../../src/opencode-runtime/runtime"
import { promptSession } from "@buddy/opencode-adapter/gateway/write"
import { createWriteFixture } from "../session/v2-write-fixture"
import {
  persistConciseResponseChatState,
  readConciseResponseChatState,
} from "../../src/learning/agent-execution/transforms/concise-response-chat-state"
import { createSessionCommandTransform } from "../../src/learning/agent-execution/transforms/command-transform"
import { orchestrateSessionMessageTransform } from "../../src/learning/agent-execution/transforms/message-transform-orchestration"
import {
  deleteTeachingSessionState,
  readTeachingSessionState,
  writeTeachingSessionState,
} from "../../src/learning/agent-execution/state/session-state"
import { tmpdir } from "../helpers/tmpdir"

afterEach(async () => {
  await closeOpenCodeHost()
})

async function createSession(directory: string) {
  return (await getOpenCodeClient()).session.create({ location: { directory } })
}

describe("concise response chat state", () => {
  test("preserves a flexible chat across an accepted command", async () => {
    await using project = await tmpdir({ git: true })
    const session = await createSession(project.path)
    writeTeachingSessionState(project.path, {
      sessionId: session.id,
      persona: "buddy",
      currentSurface: "curriculum",
      teachingWorkspaceState: "inactive",
      baseConciseResponses: false,
      conciseResponses: false,
      focusGoalIds: [],
    })

    const transform = createSessionCommandTransform({
      context: {
        directory: project.path,
        sessionID: session.id,
        request: new Request("http://localhost"),
      },
    })
    await transform.onTransform({ persona: "buddy" })

    expect(readTeachingSessionState(project.path, session.id)).toMatchObject({
      baseConciseResponses: false,
      conciseResponses: false,
    })

    await transform.onAccepted?.()
    deleteTeachingSessionState(project.path, session.id)

    expect(
      await readConciseResponseChatState({
        directory: project.path,
        sessionID: session.id,
        configured: true,
      }),
    ).toEqual({ base: false, applied: false })
  })

  test("advances the applied setting only after the prompt is accepted", async () => {
    await using project = await tmpdir({ git: true })
    const session = await createSession(project.path)

    await persistConciseResponseChatState({
      directory: project.path,
      sessionID: session.id,
      base: false,
      applied: false,
    })

    const result = await orchestrateSessionMessageTransform({
      context: {
        directory: project.path,
        sessionID: session.id,
        request: new Request("http://localhost"),
      },
      body: {
        content: "Explain loops.",
        persona: "buddy",
      },
    })

    expect(
      await readConciseResponseChatState({
        directory: project.path,
        sessionID: session.id,
        configured: true,
      }),
    ).toEqual({ base: false, applied: false })

    await result.onAccepted?.()

    expect(
      await readConciseResponseChatState({
        directory: project.path,
        sessionID: session.id,
        configured: true,
      }),
    ).toEqual({ base: false, applied: true })
  })

  test("keeps the captured base separate from later applied settings", async () => {
    await using project = await tmpdir({ git: true })
    const session = await createSession(project.path)

    const initial = await readConciseResponseChatState({
      directory: project.path,
      sessionID: session.id,
      configured: false,
    })
    expect(initial).toEqual({ base: false, applied: false })

    await persistConciseResponseChatState({
      directory: project.path,
      sessionID: session.id,
      base: initial.base,
      applied: initial.applied,
    })
    expect(
      await readConciseResponseChatState({
        directory: project.path,
        sessionID: session.id,
        configured: true,
      }),
    ).toEqual({ base: false, applied: false })

    await persistConciseResponseChatState({
      directory: project.path,
      sessionID: session.id,
      base: initial.base,
      applied: true,
    })
    expect(
      await readConciseResponseChatState({
        directory: project.path,
        sessionID: session.id,
        configured: true,
      }),
    ).toEqual({ base: false, applied: true })
  })

  test("treats a pre-toggle chat as having the original concise base", async () => {
    await using fixture = await createWriteFixture()
    const { host, directory } = fixture
    const session = await host.session.create({ location: { directory }, agent: "buddy" })
    expect((await promptSession(host, { sessionID: session.id, text: "Existing chat" }, { directory }, AbortSignal.timeout(10_000))).ok).toBe(true)
    expect(await readConciseResponseChatState({ directory, sessionID: session.id, configured: false }, host)).toEqual({ base: true, applied: true })
  })
})
