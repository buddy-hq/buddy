import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { LSP } from "@buddy/opencode-adapter/lsp"
import { loadOpenCodeApp } from "../opencode/runtime.js"
import { TeachingPath } from "./teaching-path.js"
import type {
  TeachingDiagnostic,
  TeachingLanguage,
  TeachingWorkspaceCreateFileRequest,
  TeachingWorkspaceFile,
  TeachingWorkspaceFileRecord,
  TeachingWorkspaceRecord,
  TeachingWorkspaceResponse,
  TeachingWorkspaceUpdateRequest,
} from "./types.js"
import { TeachingWorkspaceRecordSchema } from "./types.js"

function hashContent(value: string) {
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

function initialCode() {
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

async function readFileOrDefault(filepath: string, fallback = "") {
  return (await readFileIfPresent(filepath)) ?? fallback
}

async function writeRecord(directory: string, record: TeachingWorkspaceRecord) {
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

type ResolvedTeachingFile = TeachingWorkspaceFile & {
  fileHash: string
}

function buildDefaultRelativePath(language: TeachingLanguage) {
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

function resolveFile(directory: string, sessionID: string, file: TeachingWorkspaceFileRecord): ResolvedTeachingFile {
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

function syncDerivedFields(directory: string, record: TeachingWorkspaceRecord) {
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

async function ensureParentDirectory(filepath: string) {
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

async function loadRecord(directory: string, sessionID: string) {
  const raw = await readRecordRaw(directory, sessionID)
  if (!raw) return undefined
  return migrateLegacyRecord(directory, raw)
}

async function buildResponse(directory: string, record: TeachingWorkspaceRecord) {
  const synced = await syncRecord(directory, record)
  const lsp = await readActiveDiagnostics(directory, synced.record)
  return {
    sessionID: synced.record.sessionID,
    workspaceRoot: TeachingPath.root(directory, synced.record.sessionID),
    language: synced.record.language,
    lessonFilePath: synced.record.lessonFilePath,
    checkpointFilePath: synced.record.checkpointFilePath,
    files: synced.record.files!.map((file) => ({
      relativePath: file.relativePath,
      filePath: TeachingPath.workspaceFile(directory, synced.record.sessionID, file.relativePath),
      checkpointFilePath: TeachingPath.checkpointSnapshotFile(directory, synced.record.sessionID, file.relativePath),
      language: TeachingPath.languageFromRelativePath(file.relativePath),
    })),
    activeRelativePath: synced.record.activeRelativePath!,
    revision: synced.record.revision,
    code: synced.code,
    lspAvailable: lsp.lspAvailable,
    diagnostics: lsp.diagnostics,
  } satisfies TeachingWorkspaceResponse
}

function normalizeDiagnosticSeverity(severity?: number): TeachingDiagnostic["severity"] {
  switch (severity) {
    case 1:
      return "error"
    case 2:
      return "warning"
    case 3:
      return "info"
    default:
      return "hint"
  }
}

function normalizeDiagnostics(diagnostics: Array<{
  range?: {
    start?: {
      line?: number
      character?: number
    }
    end?: {
      line?: number
      character?: number
    }
  }
  message?: string
  severity?: number
  source?: string
  code?: string | number
}>): TeachingDiagnostic[] {
  return diagnostics.map((diagnostic) => ({
    message: diagnostic.message ?? "Unknown diagnostic",
    severity: normalizeDiagnosticSeverity(diagnostic.severity),
    source: diagnostic.source,
    code: typeof diagnostic.code === "string" || typeof diagnostic.code === "number" ? diagnostic.code : undefined,
    startLine: (diagnostic.range?.start?.line ?? 0) + 1,
    startColumn: (diagnostic.range?.start?.character ?? 0) + 1,
    endLine: (diagnostic.range?.end?.line ?? diagnostic.range?.start?.line ?? 0) + 1,
    endColumn: (diagnostic.range?.end?.character ?? diagnostic.range?.start?.character ?? 0) + 1,
  }))
}

async function ensureOpenCodeRuntimeForDirectory(directory: string) {
  const app = await loadOpenCodeApp()
  const response = await app.fetch(
    new Request("http://opencode.local/agent", {
      method: "GET",
      headers: {
        "x-opencode-directory": directory,
      },
    }),
  )

  if (!response.ok) {
    throw new Error(`Failed to initialize OpenCode runtime (${response.status})`)
  }
}

async function readActiveDiagnostics(directory: string, record: TeachingWorkspaceRecord) {
  try {
    await ensureOpenCodeRuntimeForDirectory(directory)

    return OpenCodeInstance.provide({
      directory,
      async fn() {
        const filePath = syncDerivedFields(directory, record).lessonFilePath
        const available = await LSP.hasClients(filePath)
        if (!available) {
          return {
            lspAvailable: false,
            diagnostics: [] as TeachingDiagnostic[],
          }
        }

        await LSP.touchFile(filePath, true)
        const diagnostics = await LSP.diagnostics()

        return {
          lspAvailable: true,
          diagnostics: normalizeDiagnostics(diagnostics[filePath] ?? []),
        }
      },
    })
  } catch {
    return {
      lspAvailable: false,
      diagnostics: [] as TeachingDiagnostic[],
    }
  }
}

async function syncRecord(directory: string, record: TeachingWorkspaceRecord) {
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

function normalizeRequestedRelativePath(relativePath: string, language?: TeachingLanguage) {
  const nextLanguage = language ?? TeachingPath.languageFromRelativePath(relativePath)
  return TeachingPath.normalizeRelativePath(relativePath, nextLanguage)
}

function replaceFileEntry(
  files: TeachingWorkspaceFileRecord[],
  currentRelativePath: string,
  nextFile: TeachingWorkspaceFileRecord,
) {
  return files.map((file) => (file.relativePath === currentRelativePath ? nextFile : file))
}

function findTrackedFile(record: TeachingWorkspaceRecord, relativePath?: string) {
  const target = relativePath ?? record.activeRelativePath
  return (record.files ?? []).find((file) => file.relativePath === target)
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

export class TeachingWorkspaceFileError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TeachingWorkspaceFileError"
  }
}

export namespace TeachingService {
  export async function ensure(
    directory: string,
    sessionID: string,
    language: TeachingLanguage = "ts",
  ): Promise<TeachingWorkspaceResponse> {
    const existing = await loadRecord(directory, sessionID)
    if (existing) {
      return buildResponse(directory, existing)
    }

    const workspaceRoot = TeachingPath.root(directory, sessionID)
    const relativePath = buildDefaultRelativePath(language)
    const lessonFilePath = TeachingPath.workspaceFile(directory, sessionID, relativePath)
    const checkpointFilePath = TeachingPath.checkpointSnapshotFile(directory, sessionID, relativePath)
    const code = initialCode()
    const now = Date.now()
    const fileHash = hashContent(code)
    const record: TeachingWorkspaceRecord = {
      sessionID,
      language,
      lessonFilePath,
      checkpointFilePath,
      files: [
        {
          relativePath,
          fileHash,
        },
      ],
      activeRelativePath: relativePath,
      revision: 0,
      timeCreated: now,
      timeUpdated: now,
      fileHash,
    }

    await Promise.all([
      fs.mkdir(workspaceRoot, { recursive: true }),
      fs.mkdir(TeachingPath.filesRoot(directory, sessionID), { recursive: true }),
      fs.mkdir(TeachingPath.checkpointsRoot(directory, sessionID), { recursive: true }),
    ])
    await Promise.all([
      fs.writeFile(lessonFilePath, code, "utf8"),
      fs.writeFile(checkpointFilePath, code, "utf8"),
      writeRecord(directory, record),
    ])

    return buildResponse(directory, record)
  }

  export async function read(directory: string, sessionID: string): Promise<TeachingWorkspaceResponse> {
    const record = await loadRecord(directory, sessionID)
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
    const existing = await loadRecord(directory, sessionID)
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

    const currentFile = findTrackedFile(synced.record, input.relativePath)
    if (!currentFile) {
      throw new TeachingWorkspaceFileError("Tracked teaching file not found")
    }

    const currentResolved = resolveFile(directory, sessionID, currentFile)
    const nextRelativePath = input.language
      ? TeachingPath.normalizeRelativePath(currentFile.relativePath, input.language)
      : currentFile.relativePath

    if (
      nextRelativePath !== currentFile.relativePath &&
      synced.record.files!.some((file) => file.relativePath === nextRelativePath)
    ) {
      throw new TeachingWorkspaceFileError(`A teaching file already exists at ${nextRelativePath}`)
    }

    const nextLessonFilePath = TeachingPath.workspaceFile(directory, sessionID, nextRelativePath)
    const nextCheckpointFilePath = TeachingPath.checkpointSnapshotFile(directory, sessionID, nextRelativePath)
    const checkpointCode = await readFileOrDefault(currentResolved.checkpointFilePath, initialCode())
    const nextFileHash = hashContent(input.code)

    await Promise.all([ensureParentDirectory(nextLessonFilePath), ensureParentDirectory(nextCheckpointFilePath)])
    await fs.writeFile(nextLessonFilePath, input.code, "utf8")
    if (nextCheckpointFilePath !== currentResolved.checkpointFilePath) {
      await fs.writeFile(nextCheckpointFilePath, checkpointCode, "utf8")
      await fs.rm(currentResolved.checkpointFilePath, { force: true })
    }
    if (nextLessonFilePath !== currentResolved.filePath) {
      await fs.rm(currentResolved.filePath, { force: true })
    }

    const nextRecord = syncDerivedFields(directory, {
      ...synced.record,
      files: replaceFileEntry(synced.record.files!, currentFile.relativePath, {
        relativePath: nextRelativePath,
        fileHash: nextFileHash,
      }),
      activeRelativePath: nextRelativePath,
      revision: synced.record.revision + 1,
      timeUpdated: Date.now(),
    })

    await writeRecord(directory, nextRecord)
    return buildResponse(directory, nextRecord)
  }

  export async function checkpoint(directory: string, sessionID: string) {
    const existing = await loadRecord(directory, sessionID)
    if (!existing) {
      throw new TeachingWorkspaceNotFoundError(sessionID)
    }

    const synced = await syncRecord(directory, existing)
    let changedSinceLastCheckpoint = false

    await Promise.all(
      synced.record.files!.map(async (file) => {
        const lessonFilePath = TeachingPath.workspaceFile(directory, sessionID, file.relativePath)
        const checkpointFilePath = TeachingPath.checkpointSnapshotFile(directory, sessionID, file.relativePath)
        const lessonCode = await readFileOrDefault(lessonFilePath, initialCode())
        const checkpointCode = await readFileOrDefault(checkpointFilePath, initialCode())
        if (lessonCode !== checkpointCode) {
          changedSinceLastCheckpoint = true
        }
        await ensureParentDirectory(checkpointFilePath)
        await fs.writeFile(checkpointFilePath, lessonCode, "utf8")
      }),
    )

    return {
      revision: synced.record.revision,
      lessonFilePath: synced.record.lessonFilePath,
      checkpointFilePath: synced.record.checkpointFilePath,
      changedSinceLastCheckpoint,
    }
  }

  export async function status(directory: string, sessionID: string) {
    const existing = await loadRecord(directory, sessionID)
    if (!existing) {
      throw new TeachingWorkspaceNotFoundError(sessionID)
    }

    const synced = await syncRecord(directory, existing)
    const changes = await Promise.all(
      synced.record.files!.map(async (file) => {
        const lessonCode = await readFileOrDefault(TeachingPath.workspaceFile(directory, sessionID, file.relativePath), initialCode())
        const checkpointCode = await readFileOrDefault(
          TeachingPath.checkpointSnapshotFile(directory, sessionID, file.relativePath),
          initialCode(),
        )
        return lessonCode !== checkpointCode
      }),
    )

    return {
      revision: synced.record.revision,
      lessonFilePath: synced.record.lessonFilePath,
      checkpointFilePath: synced.record.checkpointFilePath,
      changedSinceLastCheckpoint: changes.some(Boolean),
      trackedFiles: synced.record.files!.map((file) => TeachingPath.workspaceFile(directory, sessionID, file.relativePath)),
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
    const existing = await loadRecord(directory, sessionID)
    if (!existing) {
      throw new TeachingWorkspaceNotFoundError(sessionID)
    }

    const synced = await syncRecord(directory, existing)
    const saved = await save(directory, sessionID, {
      code: input.content,
      expectedRevision: synced.record.revision,
      relativePath: synced.record.activeRelativePath,
      language: input.language,
    })

    await fs.writeFile(saved.checkpointFilePath, saved.code, "utf8")
    return read(directory, sessionID)
  }

  export async function restore(directory: string, sessionID: string): Promise<TeachingWorkspaceResponse> {
    const existing = await loadRecord(directory, sessionID)
    if (!existing) {
      throw new TeachingWorkspaceNotFoundError(sessionID)
    }

    const synced = await syncRecord(directory, existing)
    let changed = false
    let activeCode = initialCode()

    const nextFiles = await Promise.all(
      synced.record.files!.map(async (file) => {
        const lessonFilePath = TeachingPath.workspaceFile(directory, sessionID, file.relativePath)
        const checkpointFilePath = TeachingPath.checkpointSnapshotFile(directory, sessionID, file.relativePath)
        const checkpointCode = await readFileOrDefault(checkpointFilePath, initialCode())
        const nextHash = hashContent(checkpointCode)
        if (nextHash !== file.fileHash) {
          changed = true
        }
        if (file.relativePath === synced.record.activeRelativePath) {
          activeCode = checkpointCode
        }
        await ensureParentDirectory(lessonFilePath)
        await fs.writeFile(lessonFilePath, checkpointCode, "utf8")
        return {
          ...file,
          fileHash: nextHash,
        }
      }),
    )

    const nextRecord = syncDerivedFields(directory, {
      ...synced.record,
      files: nextFiles,
      revision: changed ? synced.record.revision + 1 : synced.record.revision,
      timeUpdated: changed ? Date.now() : synced.record.timeUpdated,
    })

    if (changed) {
      await writeRecord(directory, nextRecord)
    }
    return buildResponse(directory, nextRecord)
  }

  export async function addFile(
    directory: string,
    sessionID: string,
    input: TeachingWorkspaceCreateFileRequest,
  ): Promise<TeachingWorkspaceResponse> {
    const existing = await loadRecord(directory, sessionID)
    if (!existing) {
      throw new TeachingWorkspaceNotFoundError(sessionID)
    }

    const synced = await syncRecord(directory, existing)
    const relativePath = normalizeRequestedRelativePath(input.relativePath, input.language)

    if (synced.record.files!.some((file) => file.relativePath === relativePath)) {
      throw new TeachingWorkspaceFileError(`A teaching file already exists at ${relativePath}`)
    }

    const lessonFilePath = TeachingPath.workspaceFile(directory, sessionID, relativePath)
    const checkpointFilePath = TeachingPath.checkpointSnapshotFile(directory, sessionID, relativePath)
    const code = input.content ?? initialCode()
    const fileHash = hashContent(code)

    await Promise.all([ensureParentDirectory(lessonFilePath), ensureParentDirectory(checkpointFilePath)])
    await Promise.all([
      fs.writeFile(lessonFilePath, code, "utf8"),
      fs.writeFile(checkpointFilePath, code, "utf8"),
    ])

    const activate = input.activate !== false
    const nextRecord = syncDerivedFields(directory, {
      ...synced.record,
      files: [...synced.record.files!, { relativePath, fileHash }],
      activeRelativePath: activate ? relativePath : synced.record.activeRelativePath,
      revision: synced.record.revision + 1,
      timeUpdated: Date.now(),
    })

    await writeRecord(directory, nextRecord)
    return buildResponse(directory, nextRecord)
  }

  export async function trackExistingFile(
    directory: string,
    sessionID: string,
    input: {
      relativePath: string
      activate?: boolean
    },
  ): Promise<TeachingWorkspaceResponse> {
    const existing = await loadRecord(directory, sessionID)
    if (!existing) {
      throw new TeachingWorkspaceNotFoundError(sessionID)
    }

    const synced = await syncRecord(directory, existing)
    const relativePath = normalizeRequestedRelativePath(input.relativePath)

    if (synced.record.files!.some((file) => file.relativePath === relativePath)) {
      throw new TeachingWorkspaceFileError(`A teaching file already exists at ${relativePath}`)
    }

    const lessonFilePath = TeachingPath.workspaceFile(directory, sessionID, relativePath)
    const checkpointFilePath = TeachingPath.checkpointSnapshotFile(directory, sessionID, relativePath)
    const code = await readFileOrDefault(lessonFilePath, initialCode())
    const fileHash = hashContent(code)

    await ensureParentDirectory(checkpointFilePath)
    await fs.writeFile(checkpointFilePath, code, "utf8")

    const activate = input.activate !== false
    const nextRecord = syncDerivedFields(directory, {
      ...synced.record,
      files: [...synced.record.files!, { relativePath, fileHash }],
      activeRelativePath: activate ? relativePath : synced.record.activeRelativePath,
      revision: synced.record.revision + 1,
      timeUpdated: Date.now(),
    })

    await writeRecord(directory, nextRecord)
    return buildResponse(directory, nextRecord)
  }

  export async function activateFile(
    directory: string,
    sessionID: string,
    relativePath: string,
  ): Promise<TeachingWorkspaceResponse> {
    const existing = await loadRecord(directory, sessionID)
    if (!existing) {
      throw new TeachingWorkspaceNotFoundError(sessionID)
    }

    const synced = await syncRecord(directory, existing)
    const nextRelativePath = normalizeRequestedRelativePath(relativePath)

    if (!synced.record.files!.some((file) => file.relativePath === nextRelativePath)) {
      throw new TeachingWorkspaceFileError(`Tracked teaching file not found: ${nextRelativePath}`)
    }

    if (synced.record.activeRelativePath === nextRelativePath) {
      return buildResponse(directory, synced.record)
    }

    const nextRecord = syncDerivedFields(directory, {
      ...synced.record,
      activeRelativePath: nextRelativePath,
      timeUpdated: Date.now(),
    })

    await writeRecord(directory, nextRecord)
    return buildResponse(directory, nextRecord)
  }
}
