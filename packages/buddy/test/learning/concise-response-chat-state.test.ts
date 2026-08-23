import { afterEach, describe, expect, test } from "bun:test"
import { MessageID, ModelID, ProviderID, SessionID } from "@buddy/opencode-adapter/id"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { Session as OpenCodeSession } from "@buddy/opencode-adapter/session"
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
  await OpenCodeInstance.disposeAll()
})

async function createSession(directory: string) {
  return OpenCodeInstance.provide({
    directory,
    fn: () => OpenCodeSession.create({}),
  })
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
    await using project = await tmpdir({ git: true })
    const session = await createSession(project.path)

    await OpenCodeInstance.provide({
      directory: project.path,
      fn: () =>
        OpenCodeSession.updateMessage({
          id: MessageID.ascending(),
          sessionID: SessionID.make(session.id),
          role: "user",
          time: { created: Date.now() },
          agent: "buddy",
          model: {
            providerID: ProviderID.openai,
            modelID: ModelID.make("gpt-5.4-mini"),
          },
          tools: {},
        }),
    })

    expect(
      await readConciseResponseChatState({
        directory: project.path,
        sessionID: session.id,
        configured: false,
      }),
    ).toEqual({ base: true, applied: true })
  })
})
