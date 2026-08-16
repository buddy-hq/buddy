import z from "zod"
import {
  KNOWLEDGE_GRAPH_ARCHIVE_CHECKSUM_FILENAME,
  KNOWLEDGE_GRAPH_DB_ARCHIVE_FILENAME,
  KNOWLEDGE_GRAPH_DB_FILENAME,
  KNOWLEDGE_GRAPH_MANIFEST_FILENAME,
} from "./constants"

const nonEmptyStringSchema = z.string().refine((value) => value.trim().length > 0)
const nonNegativeIntegerSchema = z.number().int().nonnegative()

const knowledgeGraphArtifactManifestSchema = z.object({
  archiveChecksum: nonEmptyStringSchema,
  archiveFilename: nonEmptyStringSchema,
  archiveSizeBytes: nonNegativeIntegerSchema,
  builtAt: nonEmptyStringSchema,
  databaseChecksum: nonEmptyStringSchema,
  databaseFilename: nonEmptyStringSchema,
  databaseSizeBytes: nonNegativeIntegerSchema,
  nodesURL: nonEmptyStringSchema,
  relationshipsURL: nonEmptyStringSchema,
  schemaVersion: nonEmptyStringSchema,
  version: nonEmptyStringSchema,
})

export type KnowledgeGraphArtifactManifest = z.infer<typeof knowledgeGraphArtifactManifestSchema>

export function parseKnowledgeGraphArtifactManifest<TValue>(
  value: TValue,
): KnowledgeGraphArtifactManifest | undefined {
  const parsed = knowledgeGraphArtifactManifestSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

export function createKnowledgeGraphArtifactManifest(input: {
  archiveChecksum: string
  archiveSizeBytes: number
  builtAt: string
  databaseChecksum: string
  databaseSizeBytes: number
  nodesURL: string
  relationshipsURL: string
  schemaVersion: string
  version: string
}): KnowledgeGraphArtifactManifest {
  return {
    archiveChecksum: input.archiveChecksum,
    archiveFilename: KNOWLEDGE_GRAPH_DB_ARCHIVE_FILENAME,
    archiveSizeBytes: input.archiveSizeBytes,
    builtAt: input.builtAt,
    databaseChecksum: input.databaseChecksum,
    databaseFilename: KNOWLEDGE_GRAPH_DB_FILENAME,
    databaseSizeBytes: input.databaseSizeBytes,
    nodesURL: input.nodesURL,
    relationshipsURL: input.relationshipsURL,
    schemaVersion: input.schemaVersion,
    version: input.version,
  }
}

export function knowledgeGraphArchiveChecksumFileContents(
  manifest: KnowledgeGraphArtifactManifest,
) {
  return `${manifest.archiveChecksum}  ${manifest.archiveFilename}\n`
}

export const KNOWLEDGE_GRAPH_ARTIFACT_FILENAMES = {
  archive: KNOWLEDGE_GRAPH_DB_ARCHIVE_FILENAME,
  archiveChecksum: KNOWLEDGE_GRAPH_ARCHIVE_CHECKSUM_FILENAME,
  database: KNOWLEDGE_GRAPH_DB_FILENAME,
  manifest: KNOWLEDGE_GRAPH_MANIFEST_FILENAME,
} as const
