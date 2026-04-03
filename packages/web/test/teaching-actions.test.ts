import { beforeEach, describe, expect, mock, test } from "bun:test"

type MockBuddyResult<T> = {
  data: T | undefined
  error: unknown
  response: Response | undefined
}

const readTeachingWorkspaceMock = mock<() => Promise<MockBuddyResult<unknown>>>()

mock.module("../src/lib/buddy-client", () => ({
  buddyResultMessage(result: { error: unknown; response: Response | undefined }) {
    if (result.error instanceof Error && result.error.message) {
      return result.error.message
    }
    return `Request failed (${result.response?.status ?? "no response"})`
  },
  getBuddyClient() {
    return {
      teaching: {
        workspace: {
          read: readTeachingWorkspaceMock,
        },
      },
    }
  },
  requireBuddyData() {
    throw new Error("requireBuddyData is not used in these tests")
  },
}))

describe("teaching actions", () => {
  beforeEach(() => {
    readTeachingWorkspaceMock.mockReset()
  })

  test("surfaces transport failures when loading the teaching workspace", async () => {
    readTeachingWorkspaceMock.mockResolvedValue({
      data: undefined,
      error: new Error("network down"),
      response: undefined,
    })

    const { loadTeachingWorkspace } = await import("../src/state/teaching-actions")

    await expect(
      loadTeachingWorkspace({
        directory: "/repo",
        sessionID: "session-1",
      }),
    ).rejects.toThrow("network down")
  })

  test("still reports an unprovisioned workspace for 204 responses", async () => {
    readTeachingWorkspaceMock.mockResolvedValue({
      data: undefined,
      error: undefined,
      response: new Response(undefined, { status: 204 }),
    })

    const { loadTeachingWorkspace } = await import("../src/state/teaching-actions")

    await expect(
      loadTeachingWorkspace({
        directory: "/repo",
        sessionID: "session-1",
      }),
    ).rejects.toThrow("Teaching workspace is not provisioned for this session.")
  })
})
