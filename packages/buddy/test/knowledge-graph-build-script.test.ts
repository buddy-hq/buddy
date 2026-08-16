import { mkdirSync } from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { describe, expect, test } from "bun:test"
import { decompress, init as initZstd } from "@bokuweb/zstd-wasm"
import { Database } from "bun:sqlite"
import { runKnowledgeGraphUpdate } from "../script/knowledge-graph/build"
import {
  validateKnowledgeGraphNodeSchema,
  validateKnowledgeGraphRelationshipSchema,
} from "../script/knowledge-graph/schema"
import { runKnowledgeGraphVerify } from "../script/knowledge-graph/verify"
import { materializeBundledKnowledgeGraphDatabase } from "../src/learning/features/standards/path"
import {
  KNOWLEDGE_GRAPH_ARCHIVE_CHECKSUM_FILENAME,
  KNOWLEDGE_GRAPH_DB_ARCHIVE_FILENAME,
  KNOWLEDGE_GRAPH_DB_FILENAME,
  KNOWLEDGE_GRAPH_LOCKFILE_FILENAME,
  KNOWLEDGE_GRAPH_MANIFEST_FILENAME,
} from "../src/learning/features/standards/constants"
import { parseKnowledgeGraphArtifactManifest } from "../src/learning/features/standards/artifact"
import { parseKnowledgeGraphLockfile } from "../src/learning/features/standards/lockfile"
import { tmpdir } from "./helpers/tmpdir"
import { requireParsed } from "./helpers/parse"

describe("knowledge graph build script", () => {
  test("validates the expected core schema envelopes", () => {
    expect(() =>
      validateKnowledgeGraphNodeSchema({
        type: "node",
        identifier: "node-1",
        labels: ["Lesson"],
        properties: {},
      }),
    ).not.toThrow()

    expect(() =>
      validateKnowledgeGraphRelationshipSchema({
        type: "relationship",
        identifier: "rel-1",
        label: "hasChild",
        properties: {},
        source_identifier: "a",
        source_labels: ["StandardsFrameworkItem"],
        target_identifier: "b",
        target_labels: ["StandardsFrameworkItem"],
      }),
    ).not.toThrow()

    expect(() =>
      validateKnowledgeGraphNodeSchema({
        type: "node",
        identifier: "node-1",
        labels: ["Lesson"],
        properties: {},
        extra: true,
      }),
    ).toThrow()
  })

  test("builds and verifies a compressed artifact bundle from fetched jsonl exports", async () => {
    await using project = await tmpdir({ git: true })

    const sourceDir = path.join(project.path, "fixture with spaces")
    mkdirSync(sourceDir, { recursive: true })

    const nodesPath = path.join(sourceDir, "nodes.jsonl")
    const relationshipsPath = path.join(sourceDir, "relationships.jsonl")
    const outputDir = path.join(project.path, "output")

    await Bun.write(
      nodesPath,
      [
        JSON.stringify({
          type: "node",
          identifier: "std-1",
          labels: ["StandardsFrameworkItem"],
          properties: {
            statementCode: "6.NS.B.4",
            description: "Find the greatest common factor and least common multiple.",
            academicSubject: "Mathematics",
            jurisdiction: "Multi-State",
            gradeLevel: '["6"]',
            caseIdentifierUUID: "uuid-std-1",
          },
        }),
        JSON.stringify({
          type: "node",
          identifier: "lc-1",
          labels: ["LearningComponent"],
          properties: {
            description: "Find common factors and multiples.",
            academicSubject: "Mathematics",
          },
        }),
        "",
      ].join("\n"),
    )

    await Bun.write(
      relationshipsPath,
      [
        JSON.stringify({
          type: "relationship",
          identifier: "rel-1",
          label: "supports",
          properties: {},
          source_identifier: "lc-1",
          source_labels: ["LearningComponent"],
          target_identifier: "std-1",
          target_labels: ["StandardsFrameworkItem"],
        }),
        JSON.stringify({
          type: "relationship",
          identifier: "rel-1",
          label: "hasStandardAlignment",
          properties: {},
          source_identifier: "std-1",
          source_labels: ["StandardsFrameworkItem"],
          target_identifier: "std-2",
          target_labels: ["StandardsFrameworkItem"],
        }),
        "",
      ].join("\n"),
    )

    const previousNodesURL = process.env.BUDDY_KNOWLEDGE_GRAPH_NODES_URL
    const previousRelationshipsURL = process.env.BUDDY_KNOWLEDGE_GRAPH_RELATIONSHIPS_URL
    const previousOutputDir = process.env.BUDDY_KNOWLEDGE_GRAPH_OUTPUT_DIR
    const previousVersion = process.env.BUDDY_KNOWLEDGE_GRAPH_VERSION

    process.env.BUDDY_KNOWLEDGE_GRAPH_NODES_URL = pathToFileURL(nodesPath).href
    process.env.BUDDY_KNOWLEDGE_GRAPH_RELATIONSHIPS_URL = pathToFileURL(relationshipsPath).href
    process.env.BUDDY_KNOWLEDGE_GRAPH_OUTPUT_DIR = outputDir
    process.env.BUDDY_KNOWLEDGE_GRAPH_VERSION = "test-version"

    try {
      await runKnowledgeGraphUpdate(["--force"])
      await runKnowledgeGraphVerify()

      const archivePath = path.join(outputDir, KNOWLEDGE_GRAPH_DB_ARCHIVE_FILENAME)
      const manifestPath = path.join(outputDir, KNOWLEDGE_GRAPH_MANIFEST_FILENAME)
      const checksumPath = path.join(outputDir, KNOWLEDGE_GRAPH_ARCHIVE_CHECKSUM_FILENAME)
      const lockfilePath = path.join(outputDir, KNOWLEDGE_GRAPH_LOCKFILE_FILENAME)
      const extractedDatabasePath = path.join(project.path, KNOWLEDGE_GRAPH_DB_FILENAME)

      expect(await Bun.file(archivePath).exists()).toBe(true)
      expect(await Bun.file(manifestPath).exists()).toBe(true)
      expect(await Bun.file(checksumPath).exists()).toBe(true)
      expect(await Bun.file(lockfilePath).exists()).toBe(true)

      const materializedDatabasePath = materializeBundledKnowledgeGraphDatabase(outputDir)
      expect(materializedDatabasePath).toBeString()

      const materializedDatabase = new Database(materializedDatabasePath ?? "", {
        readonly: true,
        create: false,
      })

      try {
        const materializedStandardCount = materializedDatabase
          .query<{ count: number }, []>("select count(*) as count from standards")
          .get()

        expect(materializedStandardCount?.count).toBe(1)
      } finally {
        materializedDatabase.close()
      }

      await initZstd()
      const archiveBytes = await Bun.file(archivePath).bytes()
      await Bun.write(extractedDatabasePath, Buffer.from(decompress(archiveBytes)))

      const database = new Database(extractedDatabasePath, {
        readonly: true,
        create: false,
      })

      try {
        const standardCount = database
          .query<{ count: number }, []>("select count(*) as count from standards")
          .get()
        const componentCount = database
          .query<{ count: number }, []>("select count(*) as count from learning_components")
          .get()
        const relationshipCount = database
          .query<{ count: number }, []>("select count(*) as count from relationships")
          .get()
        const graphRelationshipCount = database
          .query<{ count: number }, []>("select count(*) as count from graph_relationships")
          .get()

        expect(standardCount?.count).toBe(1)
        expect(componentCount?.count).toBe(1)
        expect(relationshipCount?.count).toBe(2)
        expect(graphRelationshipCount?.count).toBe(2)

        const manifest = requireParsed(
          parseKnowledgeGraphArtifactManifest(JSON.parse(await Bun.file(manifestPath).text())),
          "knowledge graph artifact manifest",
        )
        expect(manifest.version).toBe("test-version")
        expect(manifest.archiveFilename).toBe(KNOWLEDGE_GRAPH_DB_ARCHIVE_FILENAME)
        expect(manifest.databaseFilename).toBe(KNOWLEDGE_GRAPH_DB_FILENAME)

        const lockfile = requireParsed(
          parseKnowledgeGraphLockfile(JSON.parse(await Bun.file(lockfilePath).text())),
          "knowledge graph lockfile",
        )
        expect(lockfile.source.version).toBe("test-version")
        expect(lockfile.build.schemaVersion).toBe("1")

        const checksumText = await Bun.file(checksumPath).text()
        expect(checksumText).toContain(KNOWLEDGE_GRAPH_DB_ARCHIVE_FILENAME)
      } finally {
        database.close()
      }
    } finally {
      if (previousNodesURL === undefined) {
        delete process.env.BUDDY_KNOWLEDGE_GRAPH_NODES_URL
      } else {
        process.env.BUDDY_KNOWLEDGE_GRAPH_NODES_URL = previousNodesURL
      }

      if (previousRelationshipsURL === undefined) {
        delete process.env.BUDDY_KNOWLEDGE_GRAPH_RELATIONSHIPS_URL
      } else {
        process.env.BUDDY_KNOWLEDGE_GRAPH_RELATIONSHIPS_URL = previousRelationshipsURL
      }

      if (previousOutputDir === undefined) {
        delete process.env.BUDDY_KNOWLEDGE_GRAPH_OUTPUT_DIR
      } else {
        process.env.BUDDY_KNOWLEDGE_GRAPH_OUTPUT_DIR = previousOutputDir
      }

      if (previousVersion === undefined) {
        delete process.env.BUDDY_KNOWLEDGE_GRAPH_VERSION
      } else {
        process.env.BUDDY_KNOWLEDGE_GRAPH_VERSION = previousVersion
      }
    }
  })
})
