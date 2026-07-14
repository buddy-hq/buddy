import { describe, expect, test } from "bun:test"
import path from "node:path"
import {
  publishGlobalEvent,
  subscribeGlobalEvent,
  workspaceRelativeFilePath,
  type BuddyGlobalEvent,
} from "../src/global-event"

describe("global filesystem events", () => {
  test("includes only paths contained by the workspace", () => {
    const workspace = path.resolve("workspace")

    expect(
      workspaceRelativeFilePath(workspace, path.join(workspace, "assets", "ethanol.svg")),
    ).toBe(path.join("assets", "ethanol.svg"))
    expect(workspaceRelativeFilePath(workspace, workspace)).toBeUndefined()
    expect(
      workspaceRelativeFilePath(workspace, path.resolve(workspace, "..", "outside.svg")),
    ).toBeUndefined()
  })

  test("subscribes to and unsubscribes from the vendor global event bus", () => {
    const received: BuddyGlobalEvent[] = []
    const event: BuddyGlobalEvent = {
      directory: "/workspace",
      payload: {
        type: "message.updated",
        properties: { sessionID: "ses_test" },
      },
    }
    const unsubscribe = subscribeGlobalEvent((value) => received.push(value))

    publishGlobalEvent(event)
    unsubscribe()
    publishGlobalEvent(event)

    expect(received).toEqual([event])
  })
})
