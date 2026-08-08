import { describe, expect, test } from "bun:test"
import { createEmptyBoardAndOpen } from "../src/components/directory-chat/right-workspace-boards-drawer"

describe("Boards drawer", () => {
  test("creates, refreshes, and opens a new empty board without a prompt action", async () => {
    const events: string[] = []
    const outcome = await createEmptyBoardAndOpen({
      directory: "/notebook",
      create: async () => {
        events.push("create")
        return { objectID: "whiteboard-object" }
      },
      refetch: async () => {
        events.push("refetch")
      },
      open: async (request) => {
        events.push("open")
        expect(request).toEqual({
          type: "object",
          directory: "/notebook",
          target: {
            type: "object",
            ref: {
              kind: "whiteboard",
              objectID: "whiteboard-object",
              revisionID: null,
              itemID: null,
            },
            viewID: "current",
          },
        })
        return "opened"
      },
    })

    expect(events).toEqual(["create", "refetch", "open"])
    expect(outcome).toBe("opened")
  })
})
