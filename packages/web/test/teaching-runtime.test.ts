import { beforeEach, describe, expect, test } from "bun:test"
import {
  teachingSelectionKey,
  teachingSessionKey,
  useTeachingRuntime,
} from "../src/state/teaching-runtime"
import type { TeachingWorkspace } from "../src/state/teaching-runtime"

function workspace(input: {
  activeRelativePath: string
  code: string
  lessonFilePath: string
  checkpointFilePath: string
  revision: number
}): TeachingWorkspace {
  return {
    sessionID: "session-1",
    workspaceRoot: "/repo/.buddy/teaching/session-1",
    language: "ts",
    lessonFilePath: input.lessonFilePath,
    checkpointFilePath: input.checkpointFilePath,
    files: [
      {
        relativePath: input.activeRelativePath,
        filePath: input.lessonFilePath,
        checkpointFilePath: input.checkpointFilePath,
        language: "ts",
      },
    ],
    activeRelativePath: input.activeRelativePath,
    revision: input.revision,
    code: input.code,
    lspAvailable: true,
    diagnostics: [],
  }
}

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

  test("loads a remote conflict version with matching active file metadata", () => {
    const store = useTeachingRuntime.getState()
    const sessionKey = teachingSessionKey("/repo", "session-1")

    store.applyRemoteSnapshot(
      sessionKey,
      workspace({
        activeRelativePath: "local.ts",
        code: "saved local",
        lessonFilePath: "/repo/.buddy/teaching/session-1/files/local.ts",
        checkpointFilePath: "/repo/.buddy/teaching/session-1/checkpoints/local.ts",
        revision: 1,
      }),
    )
    store.updateWorkspaceCode(sessionKey, "unsaved local")

    store.applyRemoteSnapshot(
      sessionKey,
      workspace({
        activeRelativePath: "remote.ts",
        code: "remote code",
        lessonFilePath: "/repo/.buddy/teaching/session-1/files/remote.ts",
        checkpointFilePath: "/repo/.buddy/teaching/session-1/checkpoints/remote.ts",
        revision: 2,
      }),
    )
    store.loadConflictVersion(sessionKey)

    const resolved = useTeachingRuntime.getState().workspaceBySession[sessionKey]
    expect(resolved?.code).toBe("remote code")
    expect(resolved?.savedCode).toBe("remote code")
    expect(resolved?.activeRelativePath).toBe("remote.ts")
    expect(resolved?.lessonFilePath).toBe("/repo/.buddy/teaching/session-1/files/remote.ts")
    expect(resolved?.checkpointFilePath).toBe(
      "/repo/.buddy/teaching/session-1/checkpoints/remote.ts",
    )
    expect(resolved?.revision).toBe(2)
    expect(resolved?.conflict).toBeUndefined()
  })

  test("loads conflict file lists from save conflicts", () => {
    const store = useTeachingRuntime.getState()
    const sessionKey = teachingSessionKey("/repo", "session-1")
    const localWorkspace = workspace({
      activeRelativePath: "local.ts",
      code: "saved local",
      lessonFilePath: "/repo/.buddy/teaching/session-1/files/local.ts",
      checkpointFilePath: "/repo/.buddy/teaching/session-1/checkpoints/local.ts",
      revision: 1,
    })
    const remoteWorkspace = workspace({
      activeRelativePath: "remote.ts",
      code: "remote code",
      lessonFilePath: "/repo/.buddy/teaching/session-1/files/remote.ts",
      checkpointFilePath: "/repo/.buddy/teaching/session-1/checkpoints/remote.ts",
      revision: 2,
    })

    store.setWorkspace(sessionKey, localWorkspace)
    store.setConflict(sessionKey, {
      code: remoteWorkspace.code,
      revision: remoteWorkspace.revision,
      files: remoteWorkspace.files,
      activeRelativePath: remoteWorkspace.activeRelativePath,
      lessonFilePath: remoteWorkspace.lessonFilePath,
      checkpointFilePath: remoteWorkspace.checkpointFilePath,
      language: remoteWorkspace.language,
      lspAvailable: remoteWorkspace.lspAvailable,
      diagnostics: remoteWorkspace.diagnostics,
    })
    store.loadConflictVersion(sessionKey)

    const resolved = useTeachingRuntime.getState().workspaceBySession[sessionKey]
    expect(resolved?.files.map((file) => file.relativePath)).toEqual(["remote.ts"])
    expect(resolved?.activeRelativePath).toBe("remote.ts")
    expect(resolved?.conflict).toBeUndefined()
  })
})
