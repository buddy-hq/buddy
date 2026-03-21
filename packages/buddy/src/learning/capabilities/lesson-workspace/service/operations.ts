import fs from 'node:fs/promises'
import { TeachingPath } from '../paths/path'
import type {
  TeachingLanguage,
  TeachingWorkspaceCreateFileRequest,
  TeachingWorkspaceRecord,
  TeachingWorkspaceResponse,
  TeachingWorkspaceUpdateRequest,
} from '../model/types'
import {
  TeachingRevisionConflictError,
  TeachingWorkspaceFileError,
  TeachingWorkspaceNotFoundError,
} from './errors'
import { readActiveDiagnostics } from './diagnostics'
import {
  buildDefaultRelativePath,
  ensureParentDirectory,
  findTrackedFile,
  hashContent,
  initialCode,
  loadRecord,
  normalizeRequestedRelativePath,
  readFileOrDefault,
  replaceFileEntry,
  resolveFile,
  syncDerivedFields,
  syncRecord,
  toWorkspaceResponse,
  writeRecord,
} from './workspace'

async function buildResponse(
  directory: string,
  record: TeachingWorkspaceRecord,
): Promise<TeachingWorkspaceResponse> {
  const synced = await syncRecord(directory, record)
  const lsp = await readActiveDiagnostics(directory, synced.record)

  return toWorkspaceResponse({
    directory,
    record: synced.record,
    code: synced.code,
    lspAvailable: lsp.lspAvailable,
    diagnostics: lsp.diagnostics,
  })
}

async function requireRecord(directory: string, sessionID: string) {
  const record = await loadRecord(directory, sessionID)
  if (!record) {
    throw new TeachingWorkspaceNotFoundError(sessionID)
  }
  return record
}

async function ensure(directory: string, sessionID: string, language: TeachingLanguage = 'ts') {
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
    fs.writeFile(lessonFilePath, code, 'utf8'),
    fs.writeFile(checkpointFilePath, code, 'utf8'),
    writeRecord(directory, record),
  ])

  return buildResponse(directory, record)
}

async function read(directory: string, sessionID: string) {
  const record = await requireRecord(directory, sessionID)
  return buildResponse(directory, record)
}

async function save(directory: string, sessionID: string, input: TeachingWorkspaceUpdateRequest) {
  const existing = await requireRecord(directory, sessionID)
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
    throw new TeachingWorkspaceFileError('Tracked teaching file not found')
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
  const nextCheckpointFilePath = TeachingPath.checkpointSnapshotFile(
    directory,
    sessionID,
    nextRelativePath,
  )
  const checkpointCode = await readFileOrDefault(currentResolved.checkpointFilePath, initialCode())
  const nextFileHash = hashContent(input.code)

  await Promise.all([
    ensureParentDirectory(nextLessonFilePath),
    ensureParentDirectory(nextCheckpointFilePath),
  ])
  await fs.writeFile(nextLessonFilePath, input.code, 'utf8')
  if (nextCheckpointFilePath !== currentResolved.checkpointFilePath) {
    await fs.writeFile(nextCheckpointFilePath, checkpointCode, 'utf8')
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

async function checkpoint(directory: string, sessionID: string) {
  const existing = await requireRecord(directory, sessionID)
  const synced = await syncRecord(directory, existing)
  let changedSinceLastCheckpoint = false

  await Promise.all(
    synced.record.files!.map(async (file) => {
      const lessonFilePath = TeachingPath.workspaceFile(directory, sessionID, file.relativePath)
      const checkpointFilePath = TeachingPath.checkpointSnapshotFile(
        directory,
        sessionID,
        file.relativePath,
      )
      const lessonCode = await readFileOrDefault(lessonFilePath, initialCode())
      const checkpointCode = await readFileOrDefault(checkpointFilePath, initialCode())
      if (lessonCode !== checkpointCode) {
        changedSinceLastCheckpoint = true
      }
      await ensureParentDirectory(checkpointFilePath)
      await fs.writeFile(checkpointFilePath, lessonCode, 'utf8')
    }),
  )

  return {
    revision: synced.record.revision,
    lessonFilePath: synced.record.lessonFilePath,
    checkpointFilePath: synced.record.checkpointFilePath,
    changedSinceLastCheckpoint,
  }
}

async function status(directory: string, sessionID: string) {
  const existing = await requireRecord(directory, sessionID)
  const synced = await syncRecord(directory, existing)

  const changes = await Promise.all(
    synced.record.files!.map(async (file) => {
      const lessonCode = await readFileOrDefault(
        TeachingPath.workspaceFile(directory, sessionID, file.relativePath),
        initialCode(),
      )
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
    trackedFiles: synced.record.files!.map((file) =>
      TeachingPath.workspaceFile(directory, sessionID, file.relativePath),
    ),
  }
}

async function setLesson(
  directory: string,
  sessionID: string,
  input: {
    content: string
    language?: TeachingLanguage
  },
) {
  const existing = await requireRecord(directory, sessionID)
  const synced = await syncRecord(directory, existing)

  const saved = await save(directory, sessionID, {
    code: input.content,
    expectedRevision: synced.record.revision,
    relativePath: synced.record.activeRelativePath,
    language: input.language,
  })

  await fs.writeFile(saved.checkpointFilePath, saved.code, 'utf8')
  return read(directory, sessionID)
}

async function restore(directory: string, sessionID: string) {
  const existing = await requireRecord(directory, sessionID)
  const synced = await syncRecord(directory, existing)
  let changed = false

  const nextFiles = await Promise.all(
    synced.record.files!.map(async (file) => {
      const lessonFilePath = TeachingPath.workspaceFile(directory, sessionID, file.relativePath)
      const checkpointFilePath = TeachingPath.checkpointSnapshotFile(
        directory,
        sessionID,
        file.relativePath,
      )
      const checkpointCode = await readFileOrDefault(checkpointFilePath, initialCode())
      const nextHash = hashContent(checkpointCode)
      if (nextHash !== file.fileHash) {
        changed = true
      }
      await ensureParentDirectory(lessonFilePath)
      await fs.writeFile(lessonFilePath, checkpointCode, 'utf8')
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

async function addFile(
  directory: string,
  sessionID: string,
  input: TeachingWorkspaceCreateFileRequest,
) {
  const existing = await requireRecord(directory, sessionID)
  const synced = await syncRecord(directory, existing)
  const relativePath = normalizeRequestedRelativePath(input.relativePath, input.language)

  if (synced.record.files!.some((file) => file.relativePath === relativePath)) {
    throw new TeachingWorkspaceFileError(`A teaching file already exists at ${relativePath}`)
  }

  const lessonFilePath = TeachingPath.workspaceFile(directory, sessionID, relativePath)
  const checkpointFilePath = TeachingPath.checkpointSnapshotFile(directory, sessionID, relativePath)
  const code = input.content ?? initialCode()
  const fileHash = hashContent(code)

  await Promise.all([
    ensureParentDirectory(lessonFilePath),
    ensureParentDirectory(checkpointFilePath),
  ])
  await Promise.all([
    fs.writeFile(lessonFilePath, code, 'utf8'),
    fs.writeFile(checkpointFilePath, code, 'utf8'),
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

async function trackExistingFile(
  directory: string,
  sessionID: string,
  input: {
    relativePath: string
    activate?: boolean
  },
) {
  const existing = await requireRecord(directory, sessionID)
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
  await fs.writeFile(checkpointFilePath, code, 'utf8')

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

async function activateFile(directory: string, sessionID: string, relativePath: string) {
  const existing = await requireRecord(directory, sessionID)
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

export const TeachingService = {
  ensure,
  read,
  save,
  checkpoint,
  status,
  setLesson,
  restore,
  addFile,
  trackExistingFile,
  activateFile,
}
