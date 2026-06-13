import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import z from "zod"
import {
  ARTIFACT_CONTENT_FILES,
  ARTIFACT_KINDS,
  ARTIFACT_MANIFEST_FILE_NAME,
  ARTIFACT_MANIFEST_VERSION,
  ARTIFACTS_DIRECTORY_NAME,
  BUDDY_DIRECTORY_NAME,
  ArtifactIDSchema,
  ArtifactManifestBaseSchema,
  ArtifactToolOriginSchema,
  ArtifactPath,
  garbageCollectArtifactKindOrphans,
  generateArtifactID,
  listArtifactManifests,
  readArtifactTextFile,
  writeArtifactRecord,
} from "../../src/artifacts"
import { tmpdir } from "../helpers/tmpdir"

const TestManifestSchema = ArtifactManifestBaseSchema.extend({
  kind: z.literal(ARTIFACT_KINDS.htmlWidget),
  summary: z.object({
    label: z.string().min(1),
  }),
})

const TestRequiredToolOriginManifestSchema = TestManifestSchema.extend({
  origin: ArtifactToolOriginSchema,
})

type TestManifest = z.infer<typeof TestManifestSchema>

function testManifest(input: {
  artifactID: string
  createdAt: string
  title?: string
}): TestManifest {
  return TestManifestSchema.parse({
    version: ARTIFACT_MANIFEST_VERSION,
    artifactID: input.artifactID,
    kind: ARTIFACT_KINDS.htmlWidget,
    title: input.title ?? "Artifact",
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    summary: {
      label: input.title ?? "Artifact",
    },
  })
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

describe("artifact store", () => {
  test("generates ULID artifact IDs and builds the unified artifact layout", async () => {
    await using project = await tmpdir({ git: true })
    const artifactID = generateArtifactID()

    expect(ArtifactIDSchema.parse(artifactID)).toBe(artifactID)
    expect(ArtifactPath.artifactRoot(project.path)).toContain(
      `${BUDDY_DIRECTORY_NAME}/${ARTIFACTS_DIRECTORY_NAME}`,
    )
    expect(
      ArtifactPath.artifactDirectory(project.path, ARTIFACT_KINDS.htmlWidget, artifactID),
    ).toContain(
      `${BUDDY_DIRECTORY_NAME}/${ARTIFACTS_DIRECTORY_NAME}/${ARTIFACT_KINDS.htmlWidget}/${artifactID}`,
    )
    expect(
      ArtifactPath.relativeArtifactDirectory(ARTIFACT_KINDS.htmlWidget, artifactID),
    ).toBe(
      `${BUDDY_DIRECTORY_NAME}/${ARTIFACTS_DIRECTORY_NAME}/${ARTIFACT_KINDS.htmlWidget}/${artifactID}`,
    )
    expect(
      ArtifactPath.manifestFile(project.path, ARTIFACT_KINDS.htmlWidget, artifactID),
    ).toContain(ARTIFACT_MANIFEST_FILE_NAME)
  })

  test("atomically writes a manifest and content file under the artifact directory", async () => {
    await using project = await tmpdir({ git: true })
    const artifactID = generateArtifactID()
    const manifest = testManifest({
      artifactID,
      createdAt: "2026-01-01T00:00:00.000Z",
      title: "Widget",
    })

    await writeArtifactRecord({
      directory: project.path,
      kind: ARTIFACT_KINDS.htmlWidget,
      artifactID,
      manifest,
      files: [
        {
          relativePath: ARTIFACT_CONTENT_FILES.htmlWidget,
          format: "text",
          content: "<!doctype html><p>ok</p>",
        },
      ],
    })

    expect(
      await readArtifactTextFile({
        directory: project.path,
        kind: ARTIFACT_KINDS.htmlWidget,
        artifactID,
        relativePath: ARTIFACT_CONTENT_FILES.htmlWidget,
      }),
    ).toBe("<!doctype html><p>ok</p>")
  })

  test("does not expose a partially written artifact when staged creation fails", async () => {
    await using project = await tmpdir({ git: true })
    const artifactID = generateArtifactID()
    const cyclicContent: { self?: unknown } = {}
    cyclicContent.self = cyclicContent

    await expect(
      writeArtifactRecord({
        directory: project.path,
        kind: ARTIFACT_KINDS.htmlWidget,
        artifactID,
        manifest: testManifest({
          artifactID,
          createdAt: "2026-01-01T00:00:00.000Z",
        }),
        files: [
          {
            relativePath: "invalid.json",
            format: "json",
            content: cyclicContent,
          },
        ],
      }),
    ).rejects.toThrow()

    expect(
      await exists(
        ArtifactPath.artifactDirectory(project.path, ARTIFACT_KINDS.htmlWidget, artifactID),
      ),
    ).toBe(false)
    const entries = await fs.readdir(
      ArtifactPath.kindRoot(project.path, ARTIFACT_KINDS.htmlWidget),
    )
    expect(entries).toEqual([])
  })

  test("stages existing artifact updates and preserves sidecar files", async () => {
    await using project = await tmpdir({ git: true })
    const artifactID = generateArtifactID()
    const sidecarPath = ArtifactPath.artifactFile(
      project.path,
      ARTIFACT_KINDS.htmlWidget,
      artifactID,
      "sidecars",
      "note.txt",
    )

    await writeArtifactRecord({
      directory: project.path,
      kind: ARTIFACT_KINDS.htmlWidget,
      artifactID,
      manifest: testManifest({
        artifactID,
        createdAt: "2026-01-01T00:00:00.000Z",
        title: "Original",
      }),
      files: [
        {
          relativePath: ARTIFACT_CONTENT_FILES.htmlWidget,
          format: "text",
          content: "<p>original</p>",
        },
      ],
    })
    await fs.mkdir(path.dirname(sidecarPath), { recursive: true })
    await fs.writeFile(sidecarPath, "kept", "utf8")

    await writeArtifactRecord({
      directory: project.path,
      kind: ARTIFACT_KINDS.htmlWidget,
      artifactID,
      manifest: testManifest({
        artifactID,
        createdAt: "2026-01-02T00:00:00.000Z",
        title: "Updated",
      }),
      files: [
        {
          relativePath: ARTIFACT_CONTENT_FILES.htmlWidget,
          format: "text",
          content: "<p>updated</p>",
        },
      ],
    })

    expect(
      await readArtifactTextFile({
        directory: project.path,
        kind: ARTIFACT_KINDS.htmlWidget,
        artifactID,
        relativePath: ARTIFACT_CONTENT_FILES.htmlWidget,
      }),
    ).toBe("<p>updated</p>")
    expect(await fs.readFile(sidecarPath, "utf8")).toBe("kept")
    const entries = await fs.readdir(
      ArtifactPath.kindRoot(project.path, ARTIFACT_KINDS.htmlWidget),
    )
    expect(entries).toEqual([artifactID])
  })

  test("lists manifests newest first and reports invalid manifest load errors", async () => {
    await using project = await tmpdir({ git: true })
    const olderID = generateArtifactID()
    const newerID = generateArtifactID()
    const corruptID = generateArtifactID()

    await writeArtifactRecord({
      directory: project.path,
      kind: ARTIFACT_KINDS.htmlWidget,
      artifactID: olderID,
      manifest: testManifest({ artifactID: olderID, createdAt: "2026-01-01T00:00:00.000Z" }),
    })
    await writeArtifactRecord({
      directory: project.path,
      kind: ARTIFACT_KINDS.htmlWidget,
      artifactID: newerID,
      manifest: testManifest({ artifactID: newerID, createdAt: "2026-01-02T00:00:00.000Z" }),
    })
    await fs.mkdir(
      ArtifactPath.artifactDirectory(project.path, ARTIFACT_KINDS.htmlWidget, corruptID),
      { recursive: true },
    )
    await fs.writeFile(
      ArtifactPath.manifestFile(project.path, ARTIFACT_KINDS.htmlWidget, corruptID),
      "{",
      "utf8",
    )

    const result = await listArtifactManifests({
      directory: project.path,
      kind: ARTIFACT_KINDS.htmlWidget,
      schema: TestManifestSchema,
    })

    expect(result.items.map((item) => item.artifactID)).toEqual([newerID, olderID])
    expect(result.loadErrors).toHaveLength(1)
    expect(result.loadErrors[0]?.artifactID).toBe(corruptID)
  })

  test("ignores stale manifests with pre-discriminator origin metadata", async () => {
    await using project = await tmpdir({ git: true })
    const staleID = generateArtifactID()

    await fs.mkdir(
      ArtifactPath.artifactDirectory(project.path, ARTIFACT_KINDS.htmlWidget, staleID),
      { recursive: true },
    )
    await fs.writeFile(
      ArtifactPath.manifestFile(project.path, ARTIFACT_KINDS.htmlWidget, staleID),
      `${JSON.stringify({
        version: ARTIFACT_MANIFEST_VERSION,
        artifactID: staleID,
        kind: ARTIFACT_KINDS.htmlWidget,
        title: "Stale widget",
        origin: {
          sessionID: "ses_stale",
          messageID: "msg_stale",
          callID: "call_stale",
        },
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        summary: {
          label: "Stale widget",
        },
      })}\n`,
      "utf8",
    )

    const result = await listArtifactManifests({
      directory: project.path,
      kind: ARTIFACT_KINDS.htmlWidget,
      schema: TestRequiredToolOriginManifestSchema,
    })

    expect(result.items).toEqual([])
    expect(result.loadErrors).toEqual([])
  })

  test("explicit orphan GC removes directories without manifests", async () => {
    await using project = await tmpdir({ git: true })
    const orphanID = generateArtifactID()
    const orphanFile = ArtifactPath.artifactFile(
      project.path,
      ARTIFACT_KINDS.htmlWidget,
      orphanID,
      ARTIFACT_CONTENT_FILES.htmlWidget,
    )
    await fs.mkdir(
      ArtifactPath.artifactDirectory(project.path, ARTIFACT_KINDS.htmlWidget, orphanID),
      { recursive: true },
    )
    await fs.writeFile(orphanFile, "<!doctype html><p>orphan</p>", "utf8")

    const before = await listArtifactManifests({
      directory: project.path,
      kind: ARTIFACT_KINDS.htmlWidget,
      schema: TestManifestSchema,
    })
    expect(before.items).toEqual([])
    expect(before.loadErrors).toEqual([])

    await garbageCollectArtifactKindOrphans({
      directory: project.path,
      kind: ARTIFACT_KINDS.htmlWidget,
    })

    expect(
      await exists(
        ArtifactPath.artifactDirectory(project.path, ARTIFACT_KINDS.htmlWidget, orphanID),
      ),
    ).toBe(false)
  })

  test("explicit orphan GC removes abandoned staging directories", async () => {
    await using project = await tmpdir({ git: true })
    const artifactID = generateArtifactID()
    const stagingDirectory = path.join(
      ArtifactPath.kindRoot(project.path, ARTIFACT_KINDS.htmlWidget),
      `.artifact-${artifactID}.abandoned.tmp`,
    )
    await fs.mkdir(stagingDirectory, { recursive: true })
    await fs.writeFile(path.join(stagingDirectory, "index.html"), "<p>partial</p>", "utf8")

    await garbageCollectArtifactKindOrphans({
      directory: project.path,
      kind: ARTIFACT_KINDS.htmlWidget,
    })

    expect(await exists(stagingDirectory)).toBe(false)
  })
})
