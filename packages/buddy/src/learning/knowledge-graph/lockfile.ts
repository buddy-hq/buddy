import z from "zod"
import {
  KNOWLEDGE_GRAPH_DB_ARCHIVE_FILENAME,
  KNOWLEDGE_GRAPH_DB_FILENAME,
  KNOWLEDGE_GRAPH_LOCKFILE_FILENAME,
} from "./constants"

const knowledgeGraphLockfileEntrySchema = z.object({
  sha256: z.string().trim().min(1),
  size: z.number().int().nonnegative(),
  url: z.string().trim().min(1),
})

const knowledgeGraphLockfileSchema = z.object({
  artifact: z.object({
    archiveFilename: z.string().trim().min(1),
    archiveSha256: z.string().trim().min(1),
    databaseFilename: z.string().trim().min(1),
    databaseSha256: z.string().trim().min(1),
  }),
  build: z.object({
    schemaVersion: z.string().trim().min(1),
  }),
  source: z.object({
    nodes: knowledgeGraphLockfileEntrySchema,
    relationships: knowledgeGraphLockfileEntrySchema,
    version: z.string().trim().min(1),
  }),
})

export type KnowledgeGraphLockfile = z.infer<typeof knowledgeGraphLockfileSchema>

export function parseKnowledgeGraphLockfile(value: unknown): KnowledgeGraphLockfile | undefined {
  const parsed = knowledgeGraphLockfileSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

export function createKnowledgeGraphLockfile(input: {
  archiveSha256: string
  databaseSha256: string
  build: {
    schemaVersion: string
  }
  source: {
    nodes: {
      sha256: string
      size: number
      url: string
    }
    relationships: {
      sha256: string
      size: number
      url: string
    }
    version: string
  }
}): KnowledgeGraphLockfile {
  return knowledgeGraphLockfileSchema.parse({
    artifact: {
      archiveFilename: KNOWLEDGE_GRAPH_DB_ARCHIVE_FILENAME,
      archiveSha256: input.archiveSha256,
      databaseFilename: KNOWLEDGE_GRAPH_DB_FILENAME,
      databaseSha256: input.databaseSha256,
    },
    build: input.build,
    source: input.source,
  })
}

export const KNOWLEDGE_GRAPH_LOCKFILE_BASENAME = KNOWLEDGE_GRAPH_LOCKFILE_FILENAME
