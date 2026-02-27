import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import { TeachingPath } from "./teaching-path.js"
import type {
  TeachingLanguage,
  TeachingWorkspaceRecord,
  TeachingWorkspaceResponse,
  TeachingWorkspaceUpdateRequest,
} from "./types.js"
import { TeachingWorkspaceRecordSchema } from "./types.js"

function hashContent(value: string) {
  return createHash("sha1").update(value).digest("hex")
}

function initialCode() {
  return ""
}

async function readFileOrDefault(filepath: string, fallback = "") {
  return fs.readFile(filepath, "utf8").catch(() => fallback)
}

async function writeRecord(directory: string, record: TeachingWorkspaceRecord) {
  const filepath = TeachingPath.metadata(directory, record.sessionID)
  await fs.writeFile(filepath, JSON.stringify(record, null, 2), "utf8")
}

async function readRecord(directory: string, sessionID: string) {
  const filepath = TeachingPath.metadata(directory, sessionID)
  const raw = await fs.readFile(filepath, "utf8").catch(() => undefined)
  if (!raw) return undefined

  const parsed = JSON.parse(raw) as unknown
  return TeachingWorkspaceRecordSchema.parse(parsed)
}

async function syncRecord(directory: string, record: TeachingWorkspaceRecord) {
  const lessonCode = await readFileOrDefault(record.lessonFilePath, initialCode())
  const lessonHash = hashContent(lessonCode)

  if (lessonHash !== record.fileHash) {
    const next: TeachingWorkspaceRecord = {
      ...record,
      revision: record.revision + 1,
      fileHash: lessonHash,
      timeUpdated: Date.now(),
    }
    await writeRecord(directory, next)
    return {
      record: next,
      code: lessonCode,
    }
  }

  return {
    record,
    code: lessonCode,
  }
}

async function buildResponse(directory: string, record: TeachingWorkspaceRecord) {
  const synced = await syncRecord(directory, record)
  return {
    sessionID: synced.record.sessionID,
    workspaceRoot: TeachingPath.root(directory, synced.record.sessionID),
    language: synced.record.language,
    lessonFilePath: synced.record.lessonFilePath,
    checkpointFilePath: synced.record.checkpointFilePath,
    revision: synced.record.revision,
    code: synced.code,
  } satisfies TeachingWorkspaceResponse
}

export class TeachingWorkspaceNotFoundError extends Error {
  constructor(sessionID: string) {
    super(`Teaching workspace not found for session ${sessionID}`)
    this.name = "TeachingWorkspaceNotFoundError"
  }
}

export class TeachingRevisionConflictError extends Error {
  response: {
    revision: number
    code: string
    lessonFilePath: string
  }

  constructor(input: { revision: number; code: string; lessonFilePath: string }) {
    super("Teaching workspace has changed on disk")
    this.name = "TeachingRevisionConflictError"
    this.response = input
  }
}

export namespace TeachingService {
  export async function ensure(
    directory: string,
    sessionID: string,
    language: TeachingLanguage = "ts",
  ): Promise<TeachingWorkspaceResponse> {
    const existing = await readRecord(directory, sessionID)
    if (existing) {
      return buildResponse(directory, existing)
    }

    const workspaceRoot = TeachingPath.root(directory, sessionID)
    const lessonFilePath = TeachingPath.lessonFile(directory, sessionID, language)
    const checkpointFilePath = TeachingPath.checkpointFile(directory, sessionID, language)
    const code = initialCode()
    const now = Date.now()
    const record: TeachingWorkspaceRecord = {
      sessionID,
      language,
      lessonFilePath,
      checkpointFilePath,
      revision: 0,
      timeCreated: now,
      timeUpdated: now,
      fileHash: hashContent(code),
    }

    await fs.mkdir(workspaceRoot, { recursive: true })
    await Promise.all([
      fs.writeFile(lessonFilePath, code, "utf8"),
      fs.writeFile(checkpointFilePath, code, "utf8"),
      writeRecord(directory, record),
    ])

    return {
      sessionID,
      workspaceRoot,
      language,
      lessonFilePath,
      checkpointFilePath,
      revision: 0,
      code,
    }
  }

  export async function read(directory: string, sessionID: string): Promise<TeachingWorkspaceResponse> {
    const record = await readRecord(directory, sessionID)
    if (!record) {
      throw new TeachingWorkspaceNotFoundError(sessionID)
    }

    return buildResponse(directory, record)
  }

  export async function save(
    directory: string,
    sessionID: string,
    input: TeachingWorkspaceUpdateRequest,
  ): Promise<TeachingWorkspaceResponse> {
    const existing = await readRecord(directory, sessionID)
    if (!existing) {
      throw new TeachingWorkspaceNotFoundError(sessionID)
    }

    const synced = await syncRecord(directory, existing)
    if (input.expectedRevision !== synced.record.revision) {
      throw new TeachingRevisionConflictError({
        revision: synced.record.revision,
        code: synced.code,
        lessonFilePath: synced.record.lessonFilePath,
      })
    }

    const nextLanguage = input.language ?? synced.record.language
    const nextLessonFilePath = TeachingPath.lessonFile(directory, sessionID, nextLanguage)
    const nextCheckpointFilePath = TeachingPath.checkpointFile(directory, sessionID, nextLanguage)
    const checkpointCode = await readFileOrDefault(synced.record.checkpointFilePath, initialCode())

    const nextRecord: TeachingWorkspaceRecord = {
      ...synced.record,
      language: nextLanguage,
      lessonFilePath: nextLessonFilePath,
      checkpointFilePath: nextCheckpointFilePath,
      revision: synced.record.revision + 1,
      timeUpdated: Date.now(),
      fileHash: hashContent(input.code),
    }

    await fs.mkdir(TeachingPath.root(directory, sessionID), { recursive: true })
    await fs.writeFile(nextLessonFilePath, input.code, "utf8")

    if (nextCheckpointFilePath !== synced.record.checkpointFilePath) {
      await fs.writeFile(nextCheckpointFilePath, checkpointCode, "utf8")
    }

    await writeRecord(directory, nextRecord)

    if (nextLessonFilePath !== synced.record.lessonFilePath) {
      await fs.rm(synced.record.lessonFilePath, { force: true })
    }

    if (nextCheckpointFilePath !== synced.record.checkpointFilePath) {
      await fs.rm(synced.record.checkpointFilePath, { force: true })
    }

    return {
      sessionID,
      workspaceRoot: TeachingPath.root(directory, sessionID),
      language: nextLanguage,
      lessonFilePath: nextLessonFilePath,
      checkpointFilePath: nextCheckpointFilePath,
      revision: nextRecord.revision,
      code: input.code,
    }
  }

  export async function checkpoint(directory: string, sessionID: string) {
    const existing = await readRecord(directory, sessionID)
    if (!existing) {
      throw new TeachingWorkspaceNotFoundError(sessionID)
    }

    const synced = await syncRecord(directory, existing)
    const checkpointCode = await readFileOrDefault(synced.record.checkpointFilePath, initialCode())
    const changedSinceLastCheckpoint = synced.code !== checkpointCode

    await fs.writeFile(synced.record.checkpointFilePath, synced.code, "utf8")

    return {
      revision: synced.record.revision,
      lessonFilePath: synced.record.lessonFilePath,
      checkpointFilePath: synced.record.checkpointFilePath,
      changedSinceLastCheckpoint,
    }
  }

  export async function status(directory: string, sessionID: string) {
    const existing = await readRecord(directory, sessionID)
    if (!existing) {
      throw new TeachingWorkspaceNotFoundError(sessionID)
    }

    const synced = await syncRecord(directory, existing)
    const checkpointCode = await readFileOrDefault(synced.record.checkpointFilePath, initialCode())

    return {
      revision: synced.record.revision,
      lessonFilePath: synced.record.lessonFilePath,
      checkpointFilePath: synced.record.checkpointFilePath,
      changedSinceLastCheckpoint: synced.code !== checkpointCode,
    }
  }

  export async function setLesson(
    directory: string,
    sessionID: string,
    input: {
      content: string
      language?: TeachingLanguage
    },
  ): Promise<TeachingWorkspaceResponse> {
    const existing = await readRecord(directory, sessionID)
    if (!existing) {
      throw new TeachingWorkspaceNotFoundError(sessionID)
    }

    const synced = await syncRecord(directory, existing)
    const nextLanguage = input.language ?? synced.record.language
    const nextLessonFilePath = TeachingPath.lessonFile(directory, sessionID, nextLanguage)
    const nextCheckpointFilePath = TeachingPath.checkpointFile(directory, sessionID, nextLanguage)
    const nextRecord: TeachingWorkspaceRecord = {
      ...synced.record,
      language: nextLanguage,
      lessonFilePath: nextLessonFilePath,
      checkpointFilePath: nextCheckpointFilePath,
      revision: synced.record.revision + 1,
      timeUpdated: Date.now(),
      fileHash: hashContent(input.content),
    }

    await fs.mkdir(TeachingPath.root(directory, sessionID), { recursive: true })
    await Promise.all([
      fs.writeFile(nextLessonFilePath, input.content, "utf8"),
      fs.writeFile(nextCheckpointFilePath, input.content, "utf8"),
      writeRecord(directory, nextRecord),
    ])

    if (nextLessonFilePath !== synced.record.lessonFilePath) {
      await fs.rm(synced.record.lessonFilePath, { force: true })
    }

    if (nextCheckpointFilePath !== synced.record.checkpointFilePath) {
      await fs.rm(synced.record.checkpointFilePath, { force: true })
    }

    return {
      sessionID,
      workspaceRoot: TeachingPath.root(directory, sessionID),
      language: nextLanguage,
      lessonFilePath: nextLessonFilePath,
      checkpointFilePath: nextCheckpointFilePath,
      revision: nextRecord.revision,
      code: input.content,
    }
  }

  export async function restore(directory: string, sessionID: string): Promise<TeachingWorkspaceResponse> {
    const existing = await readRecord(directory, sessionID)
    if (!existing) {
      throw new TeachingWorkspaceNotFoundError(sessionID)
    }

    const synced = await syncRecord(directory, existing)
    const checkpointCode = await readFileOrDefault(synced.record.checkpointFilePath, initialCode())
    const nextRecord: TeachingWorkspaceRecord = {
      ...synced.record,
      revision: synced.record.revision + 1,
      timeUpdated: Date.now(),
      fileHash: hashContent(checkpointCode),
    }

    await Promise.all([
      fs.writeFile(synced.record.lessonFilePath, checkpointCode, "utf8"),
      writeRecord(directory, nextRecord),
    ])

    return {
      sessionID,
      workspaceRoot: TeachingPath.root(directory, sessionID),
      language: synced.record.language,
      lessonFilePath: synced.record.lessonFilePath,
      checkpointFilePath: synced.record.checkpointFilePath,
      revision: nextRecord.revision,
      code: checkpointCode,
    }
  }
}
