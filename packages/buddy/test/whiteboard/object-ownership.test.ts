import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import { applyWhiteboardDrawingProgram } from "../../src/learning/features/whiteboard/service/program"
import {
  createBlankWhiteboardObject,
  createWhiteboardObject,
  ensureWhiteboardObjectForToolCall,
  readWhiteboardObject,
} from "../../src/learning/features/whiteboard/service/store"
import { WhiteboardPath } from "../../src/learning/features/whiteboard/service/path"
import {
  LegacyWhiteboardSessionStateSchema,
  WhiteboardObjectStateSchema,
} from "../../src/learning/features/whiteboard/service/types"
import {
  BUDDY_OBJECT_KINDS,
  BuddyObjectManifestSchema,
  readObjectManifest,
  writeObjectManifest,
} from "../../src/objects"
import { tmpdir } from "../helpers/tmpdir"

describe("whiteboard object ownership", () => {
  test("creates a directly editable blank board without a chat session", async () => {
    await using project = await tmpdir()

    const created = await createBlankWhiteboardObject({
      directory: project.path,
      origin: { kind: "app", reason: "test-direct-create" },
    })

    expect(created.currentBoard).toMatchObject({
      origin: "learner",
      elements: [],
    })
    expect(created.currentBoard?.boardID).toBeString()
    const manifest = await readObjectManifest({
      directory: project.path,
      kind: BUDDY_OBJECT_KINDS.whiteboard,
      objectID: created.objectID,
    })
    expect(manifest.origin).toEqual({ kind: "app", reason: "test-direct-create" })
    expect(manifest.summary).toMatchObject({ boardID: created.currentBoard?.boardID })
  })

  test("serializes concurrent edits by object id without session ownership", async () => {
    await using project = await tmpdir()
    const object = await createWhiteboardObject({ directory: project.path })

    await Promise.all([
      applyWhiteboardDrawingProgram({
        directory: project.path,
        objectID: object.objectID,
        writeMode: "continue",
        elements: JSON.stringify([{ type: "text", id: "from-chat-a", x: 0, y: 0, text: "A" }]),
      }),
      applyWhiteboardDrawingProgram({
        directory: project.path,
        objectID: object.objectID,
        writeMode: "continue",
        elements: JSON.stringify([{ type: "text", id: "from-chat-b", x: 0, y: 40, text: "B" }]),
      }),
    ])

    const state = await readWhiteboardObject(project.path, object.objectID)
    expect(state.currentBoard?.elements.map((element) => element.id).toSorted()).toEqual([
      "from-chat-a",
      "from-chat-b",
    ])
  })

  test("stores semantic titles and preserves them unless an edit renames the board", async () => {
    await using project = await tmpdir()
    const object = await createWhiteboardObject({
      directory: project.path,
      title: "How Buddy handles a request",
    })

    await applyWhiteboardDrawingProgram({
      directory: project.path,
      objectID: object.objectID,
      writeMode: "continue",
      elements: JSON.stringify([{ type: "text", id: "first", x: 0, y: 0, text: "First" }]),
    })
    expect(
      (
        await readObjectManifest({
          directory: project.path,
          kind: BUDDY_OBJECT_KINDS.whiteboard,
          objectID: object.objectID,
        })
      ).title,
    ).toBe("How Buddy handles a request")

    await applyWhiteboardDrawingProgram({
      directory: project.path,
      objectID: object.objectID,
      title: "Buddy request flow",
      writeMode: "continue",
      elements: JSON.stringify([{ type: "text", id: "second", x: 0, y: 40, text: "Second" }]),
    })
    expect(
      (
        await readObjectManifest({
          directory: project.path,
          kind: BUDDY_OBJECT_KINDS.whiteboard,
          objectID: object.objectID,
        })
      ).title,
    ).toBe("Buddy request flow")
  })

  test("reserves one directory object idempotently for a streaming tool call", async () => {
    await using project = await tmpdir()
    const reservation = {
      sessionID: "origin-session",
      messageID: "assistant-message",
      callID: "whiteboard-call",
    }

    const [first, second] = await Promise.all([
      ensureWhiteboardObjectForToolCall({ directory: project.path, reservation }),
      ensureWhiteboardObjectForToolCall({ directory: project.path, reservation }),
    ])

    expect(second.objectID).toBe(first.objectID)
    expect(await readWhiteboardObject(project.path, first.objectID)).toEqual({
      objectID: first.objectID,
      currentBoard: null,
    })
    const manifest = await readObjectManifest({
      directory: project.path,
      kind: BUDDY_OBJECT_KINDS.whiteboard,
      objectID: first.objectID,
    })
    expect(manifest.origin).toEqual({ kind: "tool", ...reservation })

    const other = await ensureWhiteboardObjectForToolCall({
      directory: project.path,
      reservation: { ...reservation, callID: "other-whiteboard-call" },
    })
    expect(other.objectID).not.toBe(first.objectID)
  })

  test("migrates a legacy session-owned board in place on object read", async () => {
    await using project = await tmpdir()
    const object = await createWhiteboardObject({ directory: project.path })
    await applyWhiteboardDrawingProgram({
      directory: project.path,
      objectID: object.objectID,
      writeMode: "continue",
      elements: JSON.stringify([{ type: "text", id: "preserved", x: 0, y: 0, text: "Keep me" }]),
    })

    const objectStatePath = WhiteboardPath.objectStateFile(project.path, object.objectID)
    const state: unknown = JSON.parse(await fs.readFile(objectStatePath, "utf8"))
    const current = WhiteboardObjectStateSchema.parse(state)
    const legacy = LegacyWhiteboardSessionStateSchema.parse({
      ...current,
      version: 2,
      sessionID: "legacy-session",
    })
    await fs.writeFile(
      WhiteboardPath.legacySessionStateFile(project.path, object.objectID),
      `${JSON.stringify(legacy, null, 2)}\n`,
      "utf8",
    )
    await fs.unlink(objectStatePath)

    const manifest = await readObjectManifest({
      directory: project.path,
      kind: BUDDY_OBJECT_KINDS.whiteboard,
      objectID: object.objectID,
    })
    await writeObjectManifest({
      directory: project.path,
      manifest: BuddyObjectManifestSchema.parse({
        ...manifest,
        summary: {
          kind: BUDDY_OBJECT_KINDS.whiteboard,
          sessionID: "legacy-session",
          boardID: current.currentBoard?.boardID ?? null,
          continuationHandle: "current",
        },
      }),
    })

    const migrated = await readWhiteboardObject(project.path, object.objectID)
    expect(migrated.objectID).toBe(object.objectID)
    expect(migrated.currentBoard?.elements.map((element) => element.id)).toEqual(["preserved"])
    await fs.access(objectStatePath)

    const migratedManifest = await readObjectManifest({
      directory: project.path,
      kind: BUDDY_OBJECT_KINDS.whiteboard,
      objectID: object.objectID,
    })
    expect(migratedManifest.summary).not.toHaveProperty("sessionID")
  })
})
