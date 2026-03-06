import fs from "node:fs/promises"
import path from "node:path"
import z from "zod"
import { LearnerPath } from "./path.js"
import {
  AlignmentProjectionSchema,
  AssessmentsFileSchema,
  type AssessmentRecord,
  ConstraintsFileSchema,
  EdgesFileSchema,
  EvidenceRecordSchema,
  type EvidenceRecord,
  FeedbackFileSchema,
  GoalsFileSchema,
  LearnerMetaSchema,
  LearnerConstraintsSchema,
  MisconceptionsFileSchema,
  PracticeFileSchema,
  ProgressProjectionSchema,
  ReviewProjectionSchema,
  WorkspaceContextSchema,
} from "./types.js"

async function ensureParent(filepath: string) {
  await fs.mkdir(path.dirname(filepath), { recursive: true })
}

async function readJsonFile<T>(filepath: string, schema: z.ZodType<T>, fallback: T): Promise<T> {
  const contents = await fs.readFile(filepath, "utf8").catch((error: unknown) => {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return undefined
    }
    throw error
  })

  if (contents === undefined) return fallback
  const parsed = JSON.parse(contents) as unknown
  const result = schema.safeParse(parsed)
  if (!result.success) {
    throw new Error(`Invalid learner store file at ${filepath}: ${result.error.issues[0]?.message ?? "parse failed"}`)
  }
  return result.data
}

async function readProjectionFile<T>(filepath: string, schema: z.ZodType<T>, fallback: T): Promise<T> {
  try {
    return await readJsonFile(filepath, schema, fallback)
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith(`Invalid learner store file at ${filepath}:`)
    ) {
      return fallback
    }
    throw error
  }
}

async function writeJsonFile(filepath: string, value: unknown) {
  await ensureParent(filepath)
  const tmpPath = `${filepath}.tmp`
  await fs.writeFile(tmpPath, `${JSON.stringify(value, null, 2)}\n`, "utf8")
  await fs.rename(tmpPath, filepath)
}

async function readEvidenceLines(): Promise<EvidenceRecord[]> {
  const filepath = LearnerPath.evidenceLog()
  const contents = await fs.readFile(filepath, "utf8").catch((error: unknown) => {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return undefined
    }
    throw error
  })

  if (!contents) return []

  const records: EvidenceRecord[] = []
  for (const line of contents.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const parsed = JSON.parse(trimmed) as unknown
    const result = EvidenceRecordSchema.safeParse(parsed)
    if (!result.success) {
      throw new Error(`Invalid learner evidence log at ${filepath}: ${result.error.issues[0]?.message ?? "parse failed"}`)
    }
    records.push(result.data)
  }
  return records
}

async function appendEvidenceLine(record: EvidenceRecord) {
  const filepath = LearnerPath.evidenceLog()
  await ensureParent(filepath)
  await fs.appendFile(filepath, `${JSON.stringify(record)}\n`, "utf8")
}

let evidenceAppendQueue: Promise<void> = Promise.resolve()

function queueEvidenceAppend(record: EvidenceRecord) {
  const write = async () => {
    await appendEvidenceLine(record)
  }
  const current = evidenceAppendQueue.then(write)
  evidenceAppendQueue = current.catch(() => undefined)
  return current
}

export namespace LearnerStore {
  export async function readMeta() {
    return readJsonFile(LearnerPath.meta(), LearnerMetaSchema, {
      schemaVersion: 1 as const,
      updatedAt: new Date(0).toISOString(),
      observerCursors: {},
    })
  }

  export async function writeMeta(meta: z.infer<typeof LearnerMetaSchema>) {
    await writeJsonFile(LearnerPath.meta(), meta)
  }

  export async function readGoals() {
    return readJsonFile(LearnerPath.goals(), GoalsFileSchema, { goals: [] })
  }

  export async function writeGoals(goals: Awaited<ReturnType<typeof readGoals>>["goals"]) {
    await writeJsonFile(LearnerPath.goals(), { goals })
  }

  export async function readEdges() {
    return readJsonFile(LearnerPath.edges(), EdgesFileSchema, { edges: [] })
  }

  export async function writeEdges(edges: Awaited<ReturnType<typeof readEdges>>["edges"]) {
    await writeJsonFile(LearnerPath.edges(), { edges })
  }

  export async function readEvidence() {
    return readEvidenceLines()
  }

  export async function appendEvidence(record: EvidenceRecord) {
    await queueEvidenceAppend(record)
  }

  export async function readPractice() {
    return readJsonFile(LearnerPath.practice(), PracticeFileSchema, {
      templates: [],
      attempts: [],
    })
  }

  export async function writePractice(value: Awaited<ReturnType<typeof readPractice>>) {
    await writeJsonFile(LearnerPath.practice(), value)
  }

  export async function readAssessments() {
    return readJsonFile(LearnerPath.assessments(), AssessmentsFileSchema, {
      records: [],
    })
  }

  export async function writeAssessments(records: AssessmentRecord[]) {
    await writeJsonFile(LearnerPath.assessments(), { records })
  }

  export async function readMisconceptions() {
    return readJsonFile(LearnerPath.misconceptions(), MisconceptionsFileSchema, {
      records: [],
    })
  }

  export async function writeMisconceptions(records: Awaited<ReturnType<typeof readMisconceptions>>["records"]) {
    await writeJsonFile(LearnerPath.misconceptions(), { records })
  }

  export async function readConstraints() {
    return readJsonFile(LearnerPath.constraints(), ConstraintsFileSchema, {
      value: {
        background: [],
        knownPrerequisites: [],
        availableTimePatterns: [],
        toolEnvironmentLimits: [],
        motivationAnchors: [],
        opportunities: [],
        learnerPreferences: [],
        updatedAt: new Date(0).toISOString(),
      },
    })
  }

  export async function writeConstraints(value: z.infer<typeof LearnerConstraintsSchema>) {
    await writeJsonFile(LearnerPath.constraints(), { value })
  }

  export async function readFeedback() {
    return readJsonFile(LearnerPath.feedback(), FeedbackFileSchema, {
      records: [],
    })
  }

  export async function writeFeedback(records: Awaited<ReturnType<typeof readFeedback>>["records"]) {
    await writeJsonFile(LearnerPath.feedback(), { records })
  }

  export async function readProgressProjection() {
    return readProjectionFile(LearnerPath.progressProjection(), ProgressProjectionSchema, {
      updatedAt: new Date(0).toISOString(),
      records: [],
    })
  }

  export async function writeProgressProjection(records: Awaited<ReturnType<typeof readProgressProjection>>["records"]) {
    await writeJsonFile(LearnerPath.progressProjection(), {
      updatedAt: new Date().toISOString(),
      records,
    })
  }

  export async function readReviewProjection() {
    return readProjectionFile(LearnerPath.reviewProjection(), ReviewProjectionSchema, {
      updatedAt: new Date(0).toISOString(),
      records: [],
    })
  }

  export async function writeReviewProjection(records: Awaited<ReturnType<typeof readReviewProjection>>["records"]) {
    await writeJsonFile(LearnerPath.reviewProjection(), {
      updatedAt: new Date().toISOString(),
      records,
    })
  }

  export async function readAlignmentProjection() {
    return readProjectionFile(LearnerPath.alignmentProjection(), AlignmentProjectionSchema, {
      updatedAt: new Date(0).toISOString(),
      records: [],
    })
  }

  export async function writeAlignmentProjection(
    records: Awaited<ReturnType<typeof readAlignmentProjection>>["records"],
  ) {
    await writeJsonFile(LearnerPath.alignmentProjection(), {
      updatedAt: new Date().toISOString(),
      records,
    })
  }

  export async function readWorkspaceContext(directory: string) {
    const filepath = LearnerPath.workspaceContext(directory)
    const contents = await fs.readFile(filepath, "utf8").catch((error: unknown) => {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        return undefined
      }
      throw error
    })

    if (contents === undefined) return undefined
    const parsed = JSON.parse(contents) as unknown
    const result = WorkspaceContextSchema.safeParse(parsed)
    if (!result.success) {
      throw new Error(
        `Invalid workspace context at ${filepath}: ${result.error.issues[0]?.message ?? "parse failed"}`,
      )
    }
    return result.data
  }

  export async function writeWorkspaceContext(directory: string, context: z.infer<typeof WorkspaceContextSchema>) {
    await ensureParent(LearnerPath.workspaceContext(directory))
    await writeJsonFile(LearnerPath.workspaceContext(directory), context)
  }
}
