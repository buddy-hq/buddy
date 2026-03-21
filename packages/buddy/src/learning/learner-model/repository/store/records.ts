import type z from 'zod'
import { LearnerArtifactPath } from '../path'
import type { LearnerArtifactKind, WorkspaceRecordArtifactKind } from '../types'
import { parseMarkdownArtifact } from '../markdown'
import type { ArtifactRecord, ArtifactRecordWithRaw } from './contracts'
import { listMarkdownFiles, readIfFound, readMarkdownFile, writeMarkdownFile } from './io'
import { WORKSPACE_ARTIFACT_KINDS, schemaForKind } from './schema'

async function readKindArtifacts(
  directory: string,
  kind: Exclude<LearnerArtifactKind, 'workspace-context' | 'profile'>,
  input?: {
    includeRaw?: boolean
  },
): Promise<Array<ArtifactRecord | ArtifactRecordWithRaw>> {
  const files = await listMarkdownFiles(LearnerArtifactPath.kindDirectory(directory, kind))
  const schema = schemaForKind(kind)
  const artifacts: Array<ArtifactRecord | ArtifactRecordWithRaw> = []

  for (const file of files) {
    const raw = await readIfFound(file)
    if (raw === undefined) continue

    const parsed = parseMarkdownArtifact(raw, schema as z.ZodType<ArtifactRecord>)
    if (input?.includeRaw) {
      artifacts.push({
        ...parsed.frontmatter,
        raw,
      })
      continue
    }

    artifacts.push(parsed.frontmatter)
  }

  return artifacts.sort((left, right) => left.createdAt.localeCompare(right.createdAt))
}

export async function upsertArtifact(
  directory: string,
  kind: WorkspaceRecordArtifactKind,
  artifact: ArtifactRecord,
  body?: string,
) {
  if (artifact.kind !== kind) {
    throw new Error(`Artifact kind mismatch: expected ${kind}, received ${artifact.kind}`)
  }

  const schema = schemaForKind(kind)
  const parsed = schema.safeParse(artifact)
  if (!parsed.success) {
    throw new Error(
      `Invalid ${kind} artifact: ${parsed.error.issues[0]?.message ?? 'parse failed'}`,
    )
  }

  const filepath = LearnerArtifactPath.artifactFile(directory, kind, parsed.data.id)
  await writeMarkdownFile(filepath, parsed.data, body)
  return parsed.data
}

export async function readArtifacts(
  directory: string,
  kind: WorkspaceRecordArtifactKind,
  input?: {
    includeRaw?: boolean
    workspaceId?: string
    inputHash?: string
  },
) {
  const records = await readKindArtifacts(directory, kind, input)
  return records.filter((record) => {
    if (input?.workspaceId && record.workspaceId !== input.workspaceId) return false
    if (input?.inputHash && 'inputHash' in record && record.inputHash !== input.inputHash)
      return false
    return true
  })
}

export async function readArtifactById(
  directory: string,
  kind: WorkspaceRecordArtifactKind,
  artifactId: string,
  input?: {
    includeRaw?: boolean
  },
) {
  const filepath = LearnerArtifactPath.artifactFile(directory, kind, artifactId)
  const schema = schemaForKind(kind)
  const parsed = await readMarkdownFile(filepath, schema as z.ZodType<ArtifactRecord>)
  if (!parsed) return undefined

  if (input?.includeRaw) {
    const raw = await readIfFound(filepath)
    if (raw === undefined) return undefined
    return {
      ...parsed.data,
      raw,
    } as ArtifactRecordWithRaw
  }

  return parsed.data
}

export async function listArtifacts(input: {
  directory: string
  kind?: WorkspaceRecordArtifactKind
  goalId?: string
  status?: string
  includeRaw?: boolean
}) {
  const kinds: WorkspaceRecordArtifactKind[] = input.kind
    ? [input.kind]
    : [...WORKSPACE_ARTIFACT_KINDS]

  const records = (
    await Promise.all(
      kinds.map((kind) =>
        readKindArtifacts(input.directory, kind, { includeRaw: input.includeRaw }),
      ),
    )
  ).flat()

  return records
    .filter((record) => (input.goalId ? record.goalIds.includes(input.goalId) : true))
    .filter((record) => {
      if (!input.status) return true
      if ('status' in record) return String(record.status) === input.status
      return false
    })
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}
