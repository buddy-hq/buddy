import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { TeachingPath } from "../path.js"
import type {
  TeachingDiagnostic,
  TeachingLanguage,
  TeachingWorkspaceFile,
  TeachingWorkspaceFileRecord,
  TeachingWorkspaceRecord,
  TeachingWorkspaceResponse,
} from "../types.js"
import { TeachingWorkspaceRecordSchema } from "../types.js"

export type ResolvedTeachingFile = TeachingWorkspaceFile & {
  fileHash: string
}

export function hashContent(value: string) {
  return createHash("sha1").update(value).digest("hex")
}

function isNotFoundError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  )
}

export function initialCode() {
  return ""
}

async function readFileIfPresent(filepath: string) {
  try {
    return await fs.readFile(filepath, "utf8")
  } catch (error) {
    if (isNotFoundError(error)) {
      return undefined
    }
    throw error
  }
}

export async function readFileOrDefault(filepath: string, fallback = "") {
  return (await readFileIfPresent(filepath)) ?? fallback
}

export async function writeRecord(directory: string, record: TeachingWorkspaceRecord) {
  const filepath = TeachingPath.metadata(directory, record.sessionID)
  await fs.writeFile(filepath, JSON.stringify(record, null, 2), "utf8")
}

async function readRecordRaw(directory: string, sessionID: string) {
  const filepath = TeachingPath.metadata(directory, sessionID)
  const raw = await fs.readFile(filepath, "utf8").catch(() => undefined)
  if (!raw) return undefined

  const parsed = JSON.parse(raw) as unknown
  return TeachingWorkspaceRecordSchema.parse(parsed)
}

export function buildDefaultRelativePath(language: TeachingLanguage) {
  return `lesson${TeachingPath.extension(language)}`
}

function normalizeTrackedFiles(record: TeachingWorkspaceRecord) {
  const entries = record.files ?? []
  const seen = new Set<string>()
  const normalized: TeachingWorkspaceFileRecord[] = []

  for (const entry of entries) {
    const inferredLanguage = TeachingPath.languageFromRelativePath(entry.relativePath)
    const relativePath = TeachingPath.normalizeRelativePath(entry.relativePath, inferredLanguage)
    if (seen.has(relativePath)) continue
    seen.add(relativePath)
    normalized.push({
      relativePath,
      fileHash: entry.fileHash,
    })
  }

  if (normalized.length > 0) {
    return normalized
  }

  const relativePath = buildDefaultRelativePath(record.language)
  return [
    {
      relativePath,
      fileHash: record.fileHash,
    },
  ]
}

export function resolveFile(directory: string, sessionID: string, file: TeachingWorkspaceFileRecord): ResolvedTeachingFile {
  return {
    relativePath: file.relativePath,
    filePath: TeachingPath.workspaceFile(directory, sessionID, file.relativePath),
    checkpointFilePath: TeachingPath.checkpointSnapshotFile(directory, sessionID, file.relativePath),
    language: TeachingPath.languageFromRelativePath(file.relativePath),
    fileHash: file.fileHash,
  }
}

function resolveFiles(directory: string, record: TeachingWorkspaceRecord) {
  const files = normalizeTrackedFiles(record)
  return files.map((file) => resolveFile(directory, record.sessionID, file))
}

function getActiveResolvedFile(directory: string, record: TeachingWorkspaceRecord) {
  const resolvedFiles = resolveFiles(directory, record)
  const activeRelativePath = record.activeRelativePath
  const active =
    resolvedFiles.find((file) => file.relativePath === activeRelativePath) ??
    resolvedFiles[0]

  if (!active) {
    throw new Error("Teaching workspace has no tracked files")
  }

  return {
    active,
    resolvedFiles,
  }
}

export function syncDerivedFields(directory: string, record: TeachingWorkspaceRecord) {
  const files = normalizeTrackedFiles(record)
  const { active } = getActiveResolvedFile(directory, {
    ...record,
    files,
  })

  return {
    ...record,
    files,
    activeRelativePath: active.relativePath,
    lessonFilePath: active.filePath,
    checkpointFilePath: active.checkpointFilePath,
    language: active.language,
    fileHash: active.fileHash,
  } satisfies TeachingWorkspaceRecord
}

export async function ensureParentDirectory(filepath: string) {
  await fs.mkdir(path.dirname(filepath), { recursive: true })
}

async function migrateLegacyRecord(directory: string, record: TeachingWorkspaceRecord) {
  if (record.files && record.files.length > 0) {
    const next = syncDerivedFields(directory, record)
    const changed =
      next.activeRelativePath !== record.activeRelativePath ||
      next.lessonFilePath !== record.lessonFilePath ||
      next.checkpointFilePath !== record.checkpointFilePath ||
      next.language !== record.language ||
      next.fileHash !== record.fileHash

    if (changed) {
      await writeRecord(directory, next)
    }

    return next
  }

  const relativePath = buildDefaultRelativePath(record.language)
  const nextLessonFilePath = TeachingPath.workspaceFile(directory, record.sessionID, relativePath)
  const nextCheckpointFilePath = TeachingPath.checkpointSnapshotFile(directory, record.sessionID, relativePath)
  const lessonCode = await readFileOrDefault(record.lessonFilePath, initialCode())
  const checkpointCode = await readFileOrDefault(record.checkpointFilePath, lessonCode)
  const nextFileHash = hashContent(lessonCode)

  await Promise.all([ensureParentDirectory(nextLessonFilePath), ensureParentDirectory(nextCheckpointFilePath)])
  await Promise.all([
    fs.writeFile(nextLessonFilePath, lessonCode, "utf8"),
    fs.writeFile(nextCheckpointFilePath, checkpointCode, "utf8"),
  ])

  if (record.lessonFilePath !== nextLessonFilePath) {
    await fs.rm(record.lessonFilePath, { force: true })
  }

  if (record.checkpointFilePath !== nextCheckpointFilePath) {
    await fs.rm(record.checkpointFilePath, { force: true })
  }

  const nextRecord: TeachingWorkspaceRecord = {
    ...record,
    lessonFilePath: nextLessonFilePath,
    checkpointFilePath: nextCheckpointFilePath,
    files: [
      {
        relativePath,
        fileHash: nextFileHash,
      },
    ],
    activeRelativePath: relativePath,
    fileHash: nextFileHash,
    timeUpdated: Date.now(),
  }

  await writeRecord(directory, nextRecord)
  return nextRecord
}

export async function loadRecord(directory: string, sessionID: string) {
  const raw = await readRecordRaw(directory, sessionID)
  if (!raw) return undefined
  return migrateLegacyRecord(directory, raw)
}

export async function syncRecord(directory: string, record: TeachingWorkspaceRecord) {
  const normalized = syncDerivedFields(directory, record)
  const files = normalized.files ?? []

  let changed = false
  let activeCode = initialCode()

  const nextFiles = (
    await Promise.all(
      files.map(async (file) => {
        const filePath = TeachingPath.workspaceFile(directory, normalized.sessionID, file.relativePath)
        const checkpointFilePath = TeachingPath.checkpointSnapshotFile(directory, normalized.sessionID, file.relativePath)
        const code = await readFileIfPresent(filePath)
        if (code === undefined) {
          changed = true
          await fs.rm(checkpointFilePath, { force: true })
          return undefined
        }

        const nextHash = hashContent(code)
        if (nextHash !== file.fileHash) {
          changed = true
        }
        if (file.relativePath === normalized.activeRelativePath) {
          activeCode = code
        }
        return {
          ...file,
          fileHash: nextHash,
        }
      }),
    )
  ).filter((file): file is TeachingWorkspaceFileRecord => Boolean(file))

  if (nextFiles.length === 0) {
    const fallbackRelativePath = buildDefaultRelativePath(normalized.language)
    const fallbackFilePath = TeachingPath.workspaceFile(directory, normalized.sessionID, fallbackRelativePath)
    const fallbackCheckpointPath = TeachingPath.checkpointSnapshotFile(directory, normalized.sessionID, fallbackRelativePath)
    const fallbackCode = initialCode()
    const fallbackHash = hashContent(fallbackCode)

    await Promise.all([ensureParentDirectory(fallbackFilePath), ensureParentDirectory(fallbackCheckpointPath)])
    await Promise.all([
      fs.writeFile(fallbackFilePath, fallbackCode, "utf8"),
      fs.writeFile(fallbackCheckpointPath, fallbackCode, "utf8"),
    ])

    nextFiles.push({
      relativePath: fallbackRelativePath,
      fileHash: fallbackHash,
    })
    activeCode = fallbackCode
    changed = true
  }

  const activeRelativePath =
    normalized.activeRelativePath && nextFiles.some((file) => file.relativePath === normalized.activeRelativePath)
      ? normalized.activeRelativePath
      : nextFiles[0]?.relativePath

  let nextRecord = syncDerivedFields(directory, {
    ...normalized,
    files: nextFiles,
    activeRelativePath,
  })

  if (changed) {
    nextRecord = {
      ...nextRecord,
      revision: normalized.revision + 1,
      timeUpdated: Date.now(),
    }
  }

  const derivedChanged =
    nextRecord.activeRelativePath !== record.activeRelativePath ||
    nextRecord.lessonFilePath !== record.lessonFilePath ||
    nextRecord.checkpointFilePath !== record.checkpointFilePath ||
    nextRecord.language !== record.language ||
    nextRecord.fileHash !== record.fileHash ||
    JSON.stringify(nextRecord.files) !== JSON.stringify(record.files)

  if (changed || derivedChanged) {
    await writeRecord(directory, nextRecord)
  }

  if (!activeCode && nextRecord.activeRelativePath) {
    const activePath = TeachingPath.workspaceFile(directory, nextRecord.sessionID, nextRecord.activeRelativePath)
    activeCode = await readFileOrDefault(activePath, initialCode())
  }

  return {
    record: nextRecord,
    code: activeCode,
  }
}

export function normalizeRequestedRelativePath(relativePath: string, language?: TeachingLanguage) {
  const nextLanguage = language ?? TeachingPath.languageFromRelativePath(relativePath)
  return TeachingPath.normalizeRelativePath(relativePath, nextLanguage)
}

export function replaceFileEntry(
  files: TeachingWorkspaceFileRecord[],
  currentRelativePath: string,
  nextFile: TeachingWorkspaceFileRecord,
) {
  return files.map((file) => (file.relativePath === currentRelativePath ? nextFile : file))
}

export function findTrackedFile(record: TeachingWorkspaceRecord, relativePath?: string) {
  const target = relativePath ?? record.activeRelativePath
  return (record.files ?? []).find((file) => file.relativePath === target)
}

export function toWorkspaceResponse(input: {
  directory: string
  record: TeachingWorkspaceRecord
  code: string
  lspAvailable: boolean
  diagnostics: TeachingDiagnostic[]
}): TeachingWorkspaceResponse {
  return {
    sessionID: input.record.sessionID,
    workspaceRoot: TeachingPath.root(input.directory, input.record.sessionID),
    language: input.record.language,
    lessonFilePath: input.record.lessonFilePath,
    checkpointFilePath: input.record.checkpointFilePath,
    files: input.record.files!.map((file) => ({
      relativePath: file.relativePath,
      filePath: TeachingPath.workspaceFile(input.directory, input.record.sessionID, file.relativePath),
      checkpointFilePath: TeachingPath.checkpointSnapshotFile(input.directory, input.record.sessionID, file.relativePath),
      language: TeachingPath.languageFromRelativePath(file.relativePath),
    })),
    activeRelativePath: input.record.activeRelativePath!,
    revision: input.record.revision,
    code: input.code,
    lspAvailable: input.lspAvailable,
    diagnostics: input.diagnostics,
  } satisfies TeachingWorkspaceResponse
}
