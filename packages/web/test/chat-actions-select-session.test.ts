import "../happydom"
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import type { PermissionRequest } from "../src/state/permission-types"

const DIRECTORY = "/workspace/select-session-permissions-test"
const REQUEST: PermissionRequest = {
  id: "permission-A",
  sessionID: "A",
  action: "shell",
  resources: ["ls"],
}
const permissionList = mock(async ({ sessionID }: { sessionID: string }) => ({
  data: sessionID === "A" ? [REQUEST] : [],
  error: undefined,
  response: new Response(null, { status: 200 }),
}))

const buddyClient = await import("../src/lib/buddy-client")
mock.module("@/lib/buddy-client", () => ({
  ...buddyClient,
  getBuddyClient: () => ({
    session: {
      messages: async () => ({
        data: [],
        error: undefined,
        response: new Response(null, { status: 200 }),
      }),
    },
    permission: { list: permissionList },
  }),
}))

const [{ selectSession }, { useChatStore }, { resetTranscriptRepositoryForTests }] =
  await Promise.all([
    import("../src/state/chat-actions"),
    import("../src/state/chat-store"),
    import("../src/state/transcript-repository"),
  ])

describe("selectSession", () => {
  beforeEach(() => {
    localStorage.clear()
    permissionList.mockClear()
    resetTranscriptRepositoryForTests()
    useChatStore.setState({ directories: {}, lastSessionByDirectory: {}, openProjects: [] })
  })

  afterEach(() => {
    useChatStore.setState({ directories: {}, lastSessionByDirectory: {}, openProjects: [] })
    resetTranscriptRepositoryForTests()
  })

  test("loads approvals asked while another chat was selected", async () => {
    const store = useChatStore.getState()
    store.ensureOpenProject(DIRECTORY)
    store.setSessions(DIRECTORY, [
      { id: "A", title: "Chat A", time: { created: 1, updated: 1 } },
      { id: "B", title: "Chat B", time: { created: 2, updated: 2 } },
    ])
    store.setActiveSession(DIRECTORY, "B")
    expect(useChatStore.getState().directories[DIRECTORY]?.pendingPermissions).toEqual([])

    await expect(selectSession(DIRECTORY, "A")).resolves.toMatchObject({
      outcome: "requested",
      sessionID: "A",
    })
    await permissionList.mock.results.at(-1)?.value

    expect(useChatStore.getState().directories[DIRECTORY]?.pendingPermissions).toEqual([REQUEST])
  })
})
