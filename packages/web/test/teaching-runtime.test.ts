import { beforeEach, describe, expect, test } from "bun:test"
import {
  intentFromSelection,
  teachingSelectionKey,
  teachingSessionKey,
  useTeachingRuntime,
} from "../src/state/teaching-runtime"

describe("teaching runtime", () => {
  beforeEach(() => {
    useTeachingRuntime.setState({
      selectedPersonaBySession: {},
      selectedIntentBySession: {},
      preferredLanguageBySession: {},
      workspaceBySession: {},
    })
  })

  test("clears a stored persona override", () => {
    const store = useTeachingRuntime.getState()
    const sessionKey = teachingSessionKey("/repo", "session-1")

    store.setSessionPersona(sessionKey, "reading-buddy")
    store.clearSessionPersona(sessionKey)

    expect(useTeachingRuntime.getState().selectedPersonaBySession[sessionKey]).toBeUndefined()
  })

  test("migrates workspace persona selection into a new session when needed", () => {
    const store = useTeachingRuntime.getState()
    const workspaceKey = teachingSelectionKey("/repo")
    const sessionKey = teachingSessionKey("/repo", "session-1")

    store.setSessionPersona(workspaceKey, "reading-buddy")
    store.migrateWorkspaceSelection("/repo", "session-1")

    expect(useTeachingRuntime.getState().selectedPersonaBySession[workspaceKey]).toBeUndefined()
    expect(useTeachingRuntime.getState().selectedPersonaBySession[sessionKey]).toBe("reading-buddy")
  })

  test("can carry a tracked pre-reading persona from draft scope to a real session", () => {
    const draftKey = teachingSelectionKey("/repo")
    const sessionKey = teachingSelectionKey("/repo", "session-1")
    const previousPersonaBySession: Record<string, string | undefined> = {
      [draftKey]: "buddy",
    }

    if (!(sessionKey in previousPersonaBySession) && draftKey in previousPersonaBySession) {
      previousPersonaBySession[sessionKey] = previousPersonaBySession[draftKey]
      delete previousPersonaBySession[draftKey]
    }

    expect(previousPersonaBySession[sessionKey]).toBe("buddy")
    expect(previousPersonaBySession[draftKey]).toBeUndefined()
  })
})

describe("intentFromSelection", () => {
  test("returns auto when the UI is left on Auto", () => {
    expect(intentFromSelection("auto")).toBe("auto")
  })

  test("passes through explicit teaching intents", () => {
    expect(intentFromSelection("learn")).toBe("learn")
    expect(intentFromSelection("practice")).toBe("practice")
    expect(intentFromSelection("assess")).toBe("assess")
  })
})
