import type {
  TeachingWorkspaceCheckpointResponses,
  TeachingWorkspaceFileActivateResponses,
  TeachingWorkspaceFileCreateResponses,
  TeachingWorkspaceProvisionResponses,
  TeachingWorkspaceReadResponses,
  TeachingWorkspaceRestoreResponses,
  TeachingWorkspaceSaveResponses,
} from '@buddy/sdk'
import type { TeachingLanguage, TeachingWorkspace } from './teaching-runtime'
import { buddyResultMessage, getBuddyClient, requireBuddyData } from '../lib/buddy-client'
import { stringifyError } from '../lib/api-client'

export type TeachingConflictPayload = {
  error: string
  revision: number
  code: string
  lessonFilePath: string
}

function isTeachingConflictPayload(value: unknown): value is TeachingConflictPayload {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<TeachingConflictPayload>
  return (
    typeof candidate.error === 'string' &&
    typeof candidate.revision === 'number' &&
    typeof candidate.code === 'string' &&
    typeof candidate.lessonFilePath === 'string'
  )
}

export class TeachingConflictError extends Error {
  payload: TeachingConflictPayload

  constructor(payload: TeachingConflictPayload) {
    super(payload.error)
    this.name = 'TeachingConflictError'
    this.payload = payload
  }
}

export async function ensureTeachingWorkspace(input: {
  directory: string
  sessionID: string
  language?: TeachingLanguage
  persona?: string
}) {
  const result = await getBuddyClient(input.directory).teaching.workspace.provision({
    sessionID: input.sessionID,
    language: input.language,
    persona: input.persona,
  })
  const data: TeachingWorkspaceProvisionResponses[200] = requireBuddyData(result)
  return data as TeachingWorkspace
}

export async function loadTeachingWorkspace(input: { directory: string; sessionID: string }) {
  const result = await getBuddyClient(input.directory).teaching.workspace.read({
    sessionID: input.sessionID,
  })
  if (result.response.status === 204 || result.data === undefined) {
    throw new Error('Teaching workspace is not provisioned for this session.')
  }
  if (!result.response.ok || result.error !== undefined) {
    throw new Error(buddyResultMessage(result))
  }
  return result.data as TeachingWorkspaceReadResponses[200] as TeachingWorkspace
}

export async function probeTeachingWorkspace(input: { directory: string; sessionID: string }) {
  const result = await getBuddyClient(input.directory).teaching.workspace.read({
    sessionID: input.sessionID,
    optional: '1',
  })

  if (result.response.status === 204) {
    return undefined
  }

  if (!result.response.ok || result.error !== undefined || result.data === undefined) {
    throw new Error(buddyResultMessage(result))
  }

  return result.data as TeachingWorkspaceReadResponses[200] as TeachingWorkspace
}

export async function saveTeachingWorkspace(input: {
  directory: string
  sessionID: string
  code: string
  expectedRevision: number
  relativePath?: string
  language?: TeachingLanguage
}) {
  const result = await getBuddyClient(input.directory).teaching.workspace.save({
    sessionID: input.sessionID,
    code: input.code,
    expectedRevision: input.expectedRevision,
    relativePath: input.relativePath,
    language: input.language,
  })

  if (result.response.status === 409 && isTeachingConflictPayload(result.error)) {
    throw new TeachingConflictError(result.error)
  }

  if (!result.response.ok || result.error !== undefined || result.data === undefined) {
    throw new Error(buddyResultMessage(result))
  }

  return result.data as TeachingWorkspaceSaveResponses[200] as TeachingWorkspace
}

export async function checkpointTeachingWorkspace(input: { directory: string; sessionID: string }) {
  const result = await getBuddyClient(input.directory).teaching.workspace.checkpoint({
    sessionID: input.sessionID,
  })
  return requireBuddyData(result) satisfies TeachingWorkspaceCheckpointResponses[200]
}

export async function restoreTeachingWorkspace(input: { directory: string; sessionID: string }) {
  const result = await getBuddyClient(input.directory).teaching.workspace.restore({
    sessionID: input.sessionID,
  })
  const data: TeachingWorkspaceRestoreResponses[200] = requireBuddyData(result)
  return data as TeachingWorkspace
}

export async function createTeachingWorkspaceFile(input: {
  directory: string
  sessionID: string
  relativePath: string
  content?: string
  language?: TeachingLanguage
  activate?: boolean
}) {
  const result = await getBuddyClient(input.directory).teaching.workspace.file.create({
    sessionID: input.sessionID,
    relativePath: input.relativePath,
    content: input.content,
    language: input.language,
    activate: input.activate,
  })
  const data: TeachingWorkspaceFileCreateResponses[200] = requireBuddyData(result)
  return data as TeachingWorkspace
}

export async function activateTeachingWorkspaceFile(input: {
  directory: string
  sessionID: string
  relativePath: string
}) {
  const result = await getBuddyClient(input.directory).teaching.workspace.file.activate({
    sessionID: input.sessionID,
    relativePath: input.relativePath,
  })
  const data: TeachingWorkspaceFileActivateResponses[200] = requireBuddyData(result)
  return data as TeachingWorkspace
}

export { stringifyError }
