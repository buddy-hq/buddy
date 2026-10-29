import { afterEach, describe, expect, test } from "bun:test"
import type { SessionAccess } from "@buddy/agent-runtime/extension"
import {
  clearAllTeachingSessionState,
  readTeachingSessionState,
  writeTeachingSessionState,
} from "../../src/learning/agent-execution/state/session-state"
import { orchestrateSessionMessageTransform } from "../../src/learning/agent-execution/transforms/message-transform-orchestration"
import { runWithLearnerMemoryLabContext } from "../../src/learning/features/memory/lab-context"
import type { TeachingSessionState } from "../../src/learning/shared/teaching-session-state"
import { closeAgentRuntime, getAgentRuntime } from "../../src/runtime/agent-runtime"
import { createBuddySubagentHooks } from "../../src/runtime/buddy-subagents"
import { tmpdir } from "../helpers/tmpdir"

const sessions: SessionAccess = {
  async get(sessionID) {
    return { id: sessionID, rules: [] }
  },
  async patchMetadata() {},
  async setRules() {},
  async agentRules() {
    return []
  },
  async toolPermissions() {
    return {}
  },
}

function deliveredState(sessionId: string): TeachingSessionState {
  return {
    sessionId,
    persona: "buddy",
    currentSurface: "curriculum",
    teachingWorkspaceState: "inactive",
    focusGoalIds: ["learn-compaction"],
    teachingTurnContextDigest: "current-teaching",
    readingTurnContextDigest: "current-reading",
    benchTurnContextDigest: "current-bench",
    learnerContextDigest: "current-learner",
    lastDeliveredTeachingTurnContextDigest: "delivered-teaching",
    lastDeliveredReadingTurnContextDigest: "delivered-reading",
    lastDeliveredBenchTurnContextDigest: "delivered-bench",
    lastDeliveredLearnerContextDigest: "delivered-learner",
    lastDeliveredLearnerContextItems: [{ key: "goal", section: "map", text: "Learn compaction" }],
    lastDeliveredLearnerContextMessageId: "learner-message",
  }
}

function expectUndelivered(state: TeachingSessionState | undefined) {
  expect(state).toBeDefined()
  expect(state?.lastDeliveredTeachingTurnContextDigest).toBeUndefined()
  expect(state?.lastDeliveredReadingTurnContextDigest).toBeUndefined()
  expect(state?.lastDeliveredBenchTurnContextDigest).toBeUndefined()
  expect(state?.lastDeliveredLearnerContextDigest).toBeUndefined()
  expect(state?.lastDeliveredLearnerContextItems).toBeUndefined()
  expect(state?.lastDeliveredLearnerContextMessageId).toBeUndefined()
}

afterEach(async () => {
  clearAllTeachingSessionState()
  await closeAgentRuntime()
})

describe("context delivery after compaction", () => {
  test("an overlapping transform and its rollback keep compacted context undelivered", async () => {
    await runWithLearnerMemoryLabContext({ settingsOverride: { enabled: true } }, async () => {
      await using project = await tmpdir()
      const runtime = await getAgentRuntime()
      const session = await runtime.conversations.create(project.path)
      writeTeachingSessionState(project.path, deliveredState(session.id))

      const paused = Promise.withResolvers<void>()
      const resume = Promise.withResolvers<void>()
      const originalGet = runtime.conversations.get
      let pauseNextRead = true
      runtime.conversations.get = async (sessionID) => {
        if (sessionID === session.id && pauseNextRead) {
          pauseNextRead = false
          paused.resolve()
          await resume.promise
        }
        return originalGet.call(runtime.conversations, sessionID)
      }
      const transform = orchestrateSessionMessageTransform({
        context: {
          directory: project.path,
          sessionID: session.id,
          request: new Request("http://localhost"),
        },
        body: { content: "Continue learning", persona: "buddy" },
      })
      void transform.catch(paused.reject)
      try {
        await paused.promise
        await createBuddySubagentHooks(project.path, sessions).compaction(session.id)
        resume.resolve()
        const result = await transform
        expectUndelivered(readTeachingSessionState(project.path, session.id))

        await result.onAccepted?.()
        expectUndelivered(readTeachingSessionState(project.path, session.id))

        result.rollbackState?.()
        const restored = readTeachingSessionState(project.path, session.id)
        expectUndelivered(restored)
        expect(restored?.focusGoalIds).toEqual(["learn-compaction"])
        expect(restored?.teachingTurnContextDigest).toBe("current-teaching")
      } finally {
        resume.resolve()
        await transform.catch(() => undefined)
        runtime.conversations.get = originalGet
      }
    })
  })

  test("compaction clears delivery markers in every directory for the session", async () => {
    await using owner = await tmpdir()
    await using continued = await tmpdir()
    const sessionId = "ses_compaction_directories"
    writeTeachingSessionState(owner.path, deliveredState(sessionId))
    writeTeachingSessionState(continued.path, deliveredState(sessionId))
    writeTeachingSessionState(continued.path, deliveredState("ses_unrelated"))

    await createBuddySubagentHooks(owner.path, sessions).compaction(sessionId)

    for (const directory of [owner.path, continued.path]) {
      const state = readTeachingSessionState(directory, sessionId)
      expectUndelivered(state)
      expect(state).toMatchObject({
        teachingTurnContextDigest: "current-teaching",
        readingTurnContextDigest: "current-reading",
        benchTurnContextDigest: "current-bench",
        learnerContextDigest: "current-learner",
        focusGoalIds: ["learn-compaction"],
      })
    }
    expect(
      readTeachingSessionState(continued.path, "ses_unrelated")
        ?.lastDeliveredTeachingTurnContextDigest,
    ).toBe("delivered-teaching")
  })
})
