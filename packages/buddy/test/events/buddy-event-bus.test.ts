import { describe, expect, test } from "bun:test"
import path from "node:path"
import {
  publishFileSystemChange,
  publishGlobalEvent,
  subscribeGlobalEvent,
  workspaceRelativeFilePath,
  type BuddyGlobalEvent,
} from "../../src/events/buddy-event-bus"

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

  test("subscribes to and unsubscribes from the Buddy event bus", () => {
    const received: BuddyGlobalEvent[] = []
    const event: BuddyGlobalEvent = {
      directory: "/workspace",
      payload: {
        type: "notes.library.updated",
        properties: {},
      },
    }
    const unsubscribe = subscribeGlobalEvent((value) => received.push(value))

    publishGlobalEvent(event)
    unsubscribe()
    publishGlobalEvent(event)

    expect(received).toEqual([event])
  })
  test("publishes relative paths only for workspace-contained changes", () => {
    const directory = path.resolve("workspace")
    const received: BuddyGlobalEvent[] = []
    const unsubscribe = subscribeGlobalEvent((event) => received.push(event))
    try {
      publishFileSystemChange({ directory, filePath: path.join(directory, "assets", "image.svg"), event: "add" })
      publishFileSystemChange({ directory, filePath: path.resolve(directory, "..", "external.svg"), event: "change" })
      expect(received.map((event) => event.payload)).toEqual([
        { type: "file.edited", properties: { file: path.join(directory, "assets", "image.svg") } },
        { type: "file.watcher.updated", properties: { file: path.join(directory, "assets", "image.svg"), event: "add", relativePath: path.join("assets", "image.svg") } },
        { type: "file.edited", properties: { file: path.resolve(directory, "..", "external.svg") } },
        { type: "file.watcher.updated", properties: { file: path.resolve(directory, "..", "external.svg"), event: "change" } },
      ])
    } finally { unsubscribe() }
  })

})
