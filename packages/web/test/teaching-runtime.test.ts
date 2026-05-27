import { beforeEach, describe, expect, test } from "bun:test"
import {
  teachingSelectionKey,
  teachingSessionKey,
  useTeachingRuntime,
} from "../src/state/teaching-runtime"

describe("teaching runtime", () => {
  beforeEach(() => {
    useTeachingRuntime.setState({
      selectedPersonaBySession: {},
      preferredLanguageBySession: {},
      workspaceBySession: {},
    })
  })

  test("clears a stored persona override", () => {
    const store = useTeachingRuntime.getState()
    const sessionKey = teachingSessionKey("/repo", "session-1")

    store.setSessionPersona(sessionKey, "buddy")
    store.clearSessionPersona(sessionKey)

    expect(useTeachingRuntime.getState().selectedPersonaBySession[sessionKey]).toBeUndefined()
  })

  test("migrates workspace persona selection into a new session when needed", () => {
    const store = useTeachingRuntime.getState()
    const workspaceKey = teachingSelectionKey("/repo")
    const sessionKey = teachingSessionKey("/repo", "session-1")

    store.setSessionPersona(workspaceKey, "buddy")
    store.migrateWorkspaceSelection("/repo", "session-1")

    expect(useTeachingRuntime.getState().selectedPersonaBySession[workspaceKey]).toBeUndefined()
    expect(useTeachingRuntime.getState().selectedPersonaBySession[sessionKey]).toBe("buddy")
  })
})
