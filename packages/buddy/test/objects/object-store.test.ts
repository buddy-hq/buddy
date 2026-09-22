import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import { createToolMermaidObject } from "../../src/learning/features/diagrams/service/store"
import {
  BUDDY_OBJECT_KINDS,
  BuddyObjectPath,
  BuddyObjectTombstoneSchema,
  deleteObject,
  listObjects,
  listReadyObjectManifests,
  resolveObjectByID,
} from "../../src/objects"
import { tmpdir } from "../helpers/tmpdir"

describe("managed object store", () => {
  test("listing remains read-only when the resolver cache is absent", async () => {
    await using project = await tmpdir()
    const object = await createToolMermaidObject({
      directory: project.path,
      sessionID: "ses_read_only_list",
      messageID: "msg_read_only_list",
      callID: "call_read_only_list",
      alt: "Read-only list",
      source: "graph TD\nA-->B",
    })
    const indexPath = BuddyObjectPath.indexFile(project.path)
    await fs.rm(indexPath)

    const listed = await listObjects({ directory: project.path })

    expect(listed.objects.map((item) => item.objectID)).toContain(object.objectID)
    await expect(fs.stat(indexPath)).rejects.toMatchObject({ code: "ENOENT" })
  })

  test("lists live manifests for one kind without deleted objects", async () => {
    await using project = await tmpdir()
    const createDiagram = (callID: string) =>
      createToolMermaidObject({
        directory: project.path,
        sessionID: "ses_kind_manifests",
        messageID: "msg_kind_manifests",
        callID,
        alt: callID,
        source: "graph TD\nA-->B",
      })
    const kept = await createDiagram("call_kept")
    const deleted = await createDiagram("call_deleted")
    await deleteObject({
      directory: project.path,
      kind: BUDDY_OBJECT_KINDS.mermaid,
      objectID: deleted.objectID,
    })

    const manifests = await listReadyObjectManifests({
      directory: project.path,
      kind: BUDDY_OBJECT_KINDS.mermaid,
    })
    const otherKind = await listReadyObjectManifests({
      directory: project.path,
      kind: BUDDY_OBJECT_KINDS.mediaPresentation,
    })

    expect(manifests.map((manifest) => manifest.objectID)).toEqual([kept.objectID])
    expect(otherKind).toEqual([])
  })

  test("cached resolution rejects duplicate live object IDs", async () => {
    await using project = await tmpdir()
    const object = await createToolMermaidObject({
      directory: project.path,
      sessionID: "ses_duplicate_resolution",
      messageID: "msg_duplicate_resolution",
      callID: "call_duplicate_resolution",
      alt: "Duplicate resolution",
      source: "graph TD\nA-->B",
    })
    await fs.cp(
      BuddyObjectPath.objectDirectory(project.path, "mermaid", object.objectID),
      BuddyObjectPath.objectDirectory(project.path, "figure", object.objectID),
      { recursive: true },
    )

    const resolved = await resolveObjectByID({
      directory: project.path,
      objectID: object.objectID,
    })

    expect(resolved.status).toBe("error")
    if (resolved.status === "error") {
      expect(resolved.loadError.message).toContain("claimed by multiple live manifests")
    }
  })

  test("cached resolution gives tombstones precedence across kinds", async () => {
    await using project = await tmpdir()
    const object = await createToolMermaidObject({
      directory: project.path,
      sessionID: "ses_tombstone_resolution",
      messageID: "msg_tombstone_resolution",
      callID: "call_tombstone_resolution",
      alt: "Tombstone resolution",
      source: "graph TD\nA-->B",
    })
    const tombstonePath = BuddyObjectPath.tombstoneFile(project.path, "figure", object.objectID)
    await fs.mkdir(BuddyObjectPath.objectDirectory(project.path, "figure", object.objectID), {
      recursive: true,
    })
    await fs.writeFile(
      tombstonePath,
      JSON.stringify(
        BuddyObjectTombstoneSchema.parse({
          version: 1,
          kind: "figure",
          objectID: object.objectID,
          deletedAt: new Date().toISOString(),
          reason: "user_deleted",
        }),
      ),
    )

    const resolved = await resolveObjectByID({
      directory: project.path,
      objectID: object.objectID,
    })

    expect(resolved).toMatchObject({
      status: "unavailable",
      tombstone: { objectID: object.objectID },
    })
  })
})
