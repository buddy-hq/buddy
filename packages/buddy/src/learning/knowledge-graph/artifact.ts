import {
  KNOWLEDGE_GRAPH_ARCHIVE_CHECKSUM_FILENAME,
  KNOWLEDGE_GRAPH_DB_ARCHIVE_FILENAME,
  KNOWLEDGE_GRAPH_DB_FILENAME,
  KNOWLEDGE_GRAPH_MANIFEST_FILENAME,
} from "./constants"

export type KnowledgeGraphArtifactManifest = {
  archiveChecksum: string
  archiveFilename: string
  archiveSizeBytes: number
  builtAt: string
  databaseChecksum: string
  databaseFilename: string
  databaseSizeBytes: number
  nodesURL: string
  relationshipsURL: string
  schemaVersion: string
  version: string
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
}

export function parseKnowledgeGraphArtifactManifest(
  value: unknown,
): KnowledgeGraphArtifactManifest | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined
  }

  const record = value as Record<string, unknown>
  if (
    !isNonEmptyString(record.archiveChecksum) ||
    !isNonEmptyString(record.archiveFilename) ||
    !isPositiveInteger(record.archiveSizeBytes) ||
    !isNonEmptyString(record.builtAt) ||
    !isNonEmptyString(record.databaseChecksum) ||
    !isNonEmptyString(record.databaseFilename) ||
    !isPositiveInteger(record.databaseSizeBytes) ||
    !isNonEmptyString(record.nodesURL) ||
    !isNonEmptyString(record.relationshipsURL) ||
    !isNonEmptyString(record.schemaVersion) ||
    !isNonEmptyString(record.version)
  ) {
    return undefined
  }

  return {
    archiveChecksum: record.archiveChecksum,
    archiveFilename: record.archiveFilename,
    archiveSizeBytes: record.archiveSizeBytes,
    builtAt: record.builtAt,
    databaseChecksum: record.databaseChecksum,
    databaseFilename: record.databaseFilename,
    databaseSizeBytes: record.databaseSizeBytes,
    nodesURL: record.nodesURL,
    relationshipsURL: record.relationshipsURL,
    schemaVersion: record.schemaVersion,
    version: record.version,
  }
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
