import { afterEach, describe, expect, test } from "bun:test"
import type { SessionAccess, SessionView } from "@buddy/agent-runtime/extension"
import { clearAllTeachingSessionState } from "../../src/learning/agent-execution/state/session-state"
import {
  BuddyTeachingSnapshot,
  hydrateBuddyTeachingState,
  publishBuddyDelegationSource,
} from "../../src/learning/agent-execution/state/teaching-session-metadata"
import { tmpdir } from "../helpers/tmpdir"

function inheritedSnapshot(): BuddyTeachingSnapshot {
  return BuddyTeachingSnapshot.parse({
    version: 1,
    ownerSessionID: "ses_source",
    rootSessionID: "ses_source",
    revision: "source-revision",
    teaching: {
      persona: "buddy",
      currentSurface: "flashcard",
      teachingWorkspaceState: "inactive",
      focusGoalIds: [],
      conciseResponses: false,
      baseConciseResponses: false,
    },
    source: {
      rules: [],
      access: { tools: {}, subagents: {}, skills: {} },
      enabledFeatureIDs: [],
      extraToolsByRole: {},
      denyToolsByRole: {},
    },
  })
}

function fakeSessions(
  initial: SessionView,
): Pick<SessionAccess, "get" | "patchMetadata" | "agentRules"> {
  let session = initial
  const sessions: Pick<SessionAccess, "get" | "patchMetadata" | "agentRules"> = {
    async get(sessionID) {
      if (sessionID !== session.id) throw new Error(`Unknown session: ${sessionID}`)
      return session
    },
    async patchMetadata(sessionID, patch) {
      const current = await sessions.get(sessionID)
      const metadata = { ...current.metadata }
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) delete metadata[key]
        else metadata[key] = value
      }
      session = { ...current, metadata }
    },
    async agentRules() {
      return []
    },
  }
  return sessions
}

afterEach(() => {
  clearAllTeachingSessionState()
})

describe("forked teaching snapshots", () => {
  test("hydrates a root fork with its inherited teaching surface and its own session ID", async () => {
    await using project = await tmpdir()
    const sessions = fakeSessions({
      id: "ses_fork",
      rules: [],
      metadata: { buddyTeaching: inheritedSnapshot() },
    })

    const state = await hydrateBuddyTeachingState({
      sessions,
      directory: project.path,
      sessionID: "ses_fork",
    })

    expect(state).toMatchObject({ sessionId: "ses_fork", currentSurface: "flashcard" })
  })

  test("publishes a fresh fork as its own owner and root while keeping its inherited surface", async () => {
    await using project = await tmpdir()
    const sessions = fakeSessions({
      id: "ses_fork",
      rules: [],
      metadata: { buddyTeaching: inheritedSnapshot() },
    })

    await publishBuddyDelegationSource({ sessions, directory: project.path, sessionID: "ses_fork" })

    expect((await sessions.get("ses_fork")).metadata?.buddyTeaching).toMatchObject({
      ownerSessionID: "ses_fork",
      rootSessionID: "ses_fork",
      teaching: { currentSurface: "flashcard" },
    })
  })

  test("rejects a child whose snapshot belongs to another owner", async () => {
    await using project = await tmpdir()
    const snapshot = BuddyTeachingSnapshot.parse({
      ...inheritedSnapshot(),
      roleID: "practice-agent",
      policyRevision: "child-policy",
    })
    const sessions = fakeSessions({
      id: "ses_child",
      parentID: "ses_source",
      agent: "practice-agent",
      rules: [],
      metadata: { buddyTeaching: snapshot },
    })

    await expect(
      hydrateBuddyTeachingState({
        sessions,
        directory: project.path,
        sessionID: "ses_child",
      }),
    ).rejects.toThrow("Buddy child is not prepared: ses_child")
  })
})
