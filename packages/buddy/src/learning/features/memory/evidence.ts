import fs from "node:fs/promises"
import path from "node:path"
import { writeJsonFileAtomic } from "../../../storage/atomic-file"
import { LearnerMemoryPath } from "./paths"
import {
  LearnerEventSchema,
  LearnerEvidenceSchema,
  LearnerMemorySourcePointerSchema,
  type LearnerEvent,
  type LearnerEvidence,
  type LearnerMemory,
  type LearnerMemorySourcePointer,
} from "./types"
import { LEARNER_MEMORY_STORAGE_TUNING } from "./tuning"

type LearnerEventRecord = {
  event: LearnerEvent
  path: string
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await writeJsonFileAtomic(filePath, value, LEARNER_MEMORY_STORAGE_TUNING.jsonIndentSpaces)
}

async function writeLearnerEvidence(directory: string, evidence: LearnerEvidence): Promise<void> {
  await writeJsonFile(
    LearnerMemoryPath.evidenceFile(directory, evidence.id),
    LearnerEvidenceSchema.parse(evidence),
  )
}

async function writeLearnerEvidenceForEvent(input: {
  directory: string
  event: LearnerEvent
  title: string
  note: string
  tags?: string[]
  artifactId?: string
  payload?: Record<string, unknown>
  memoryEffects?: LearnerEvidence["memoryEffects"]
}): Promise<LearnerEvidence> {
  const evidence = LearnerEvidenceSchema.parse({
    schemaVersion: 1,
    id: input.event.id,
    kind: input.event.type,
    createdAt: input.event.createdAt,
    ...(input.event.sessionId ? { sessionId: input.event.sessionId } : {}),
    ...(input.event.projectPath ? { projectPath: input.event.projectPath } : {}),
    ...(input.artifactId ? { artifactId: input.artifactId } : {}),
    title: input.title,
    tags: input.tags ?? [],
    note: input.note,
    payload: input.payload ?? input.event.payload,
    memoryEffects: input.memoryEffects ?? [],
  })
  await writeLearnerEvidence(input.directory, evidence)
  return evidence
}

async function readLearnerEvidence(filePath: string): Promise<LearnerEvidence> {
  return LearnerEvidenceSchema.parse(JSON.parse(await fs.readFile(filePath, "utf8")) as unknown)
}

async function listLearnerEvidence(directory: string): Promise<LearnerEvidence[]> {
  const directoryPath = LearnerMemoryPath.evidenceDirectory(directory)
  const entries = await fs.readdir(directoryPath, { withFileTypes: true }).catch(() => [])
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => LearnerMemoryPath.evidenceFile(directory, path.basename(entry.name, ".json")))
    .toSorted()

  return Promise.all(files.map((filePath) => readLearnerEvidence(filePath)))
}

async function findLearnerEvidence(
  directory: string,
  eventId: string,
): Promise<LearnerEvidence | undefined> {
  const filePath = LearnerMemoryPath.evidenceFile(directory, eventId)
  return readLearnerEvidence(filePath).catch(() => undefined)
}

async function listLearnerEventRecords(directory: string): Promise<LearnerEventRecord[]> {
  const eventsDirectory = LearnerMemoryPath.eventsDirectory(directory)
  const entries = await fs.readdir(eventsDirectory, { withFileTypes: true }).catch(() => [])
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
    .map((entry) => LearnerMemoryPath.eventFile(directory, path.basename(entry.name, ".jsonl")))
    .toSorted()

  const records = await Promise.all(
    files.map(async (filePath) => {
      const text = await fs.readFile(filePath, "utf8")
      return text
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .flatMap((line): LearnerEventRecord[] => {
          try {
            const parsedLine: unknown = JSON.parse(line)
            return [
              {
                event: LearnerEventSchema.parse(parsedLine),
                path: filePath,
              },
            ]
          } catch {
            return []
          }
        })
    }),
  )

  return records.flat()
}

async function findLearnerEventRecord(
  directory: string,
  eventId: string,
): Promise<LearnerEventRecord | undefined> {
  return (await listLearnerEventRecords(directory)).find((record) => record.event.id === eventId)
}

async function buildLearnerMemorySourcePointers(input: {
  directory: string
  memory: LearnerMemory
}): Promise<LearnerMemorySourcePointer[]> {
  const pointers = await Promise.all(
    input.memory.sourceEventIds.map(async (eventId) => {
      const evidence = await findLearnerEvidence(input.directory, eventId)
      if (evidence) {
        return LearnerMemorySourcePointerSchema.parse({
          eventId,
          note: evidence.note,
          path: LearnerMemoryPath.evidenceFile(input.directory, eventId),
        })
      }

      const eventRecord = await findLearnerEventRecord(input.directory, eventId)
      if (eventRecord) {
        return LearnerMemorySourcePointerSchema.parse({
          eventId,
          note: eventRecord.event.searchableText,
          path: eventRecord.path,
        })
      }

      return LearnerMemorySourcePointerSchema.parse({
        eventId,
        note: `Missing source record for ${eventId}.`,
        path: LearnerMemoryPath.eventFile(input.directory, "unknown"),
      })
    }),
  )

  return pointers
}

export {
  buildLearnerMemorySourcePointers,
  findLearnerEvidence,
  findLearnerEventRecord,
  listLearnerEvidence,
  listLearnerEventRecords,
  readLearnerEvidence,
  writeLearnerEvidence,
  writeLearnerEvidenceForEvent,
}

export type { LearnerEventRecord }
