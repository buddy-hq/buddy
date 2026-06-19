import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import { createToolMermaidObject } from "../../src/learning/features/diagrams/service/store"
import {
  BuddyObjectPath,
  BuddyObjectTombstoneSchema,
  listObjects,
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
