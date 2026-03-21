import { createHash } from 'node:crypto'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { Global } from '../storage'

const AGENTS_MD_FILE_NAME = 'AGENTS.md'

export type AgentsMdState = {
  path: string
  exists: boolean
  content: string
  version: string | null
}

export type AgentsMdSaveResult = {
  path: string
  content: string
  version: string
}

export class AgentsMdVersionConflictError extends Error {}

export function mapAgentsMdConflictError(error: unknown): Response | undefined {
  if (error instanceof AgentsMdVersionConflictError) {
    return Response.json({ error: error.message }, { status: 409 })
  }
  return undefined
}

function contentVersion(content: string | undefined) {
  if (content === undefined) return null
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

async function readFileContent(filePath: string) {
  return fsp.readFile(filePath, 'utf8').catch((error: unknown) => {
    const maybe = error as { code?: string }
    if (maybe.code === 'ENOENT') {
      return undefined
    }
    throw error
  })
}

async function readAgentsMd(filePath: string): Promise<AgentsMdState> {
  const content = await readFileContent(filePath)
  return {
    path: filePath,
    exists: typeof content === 'string',
    content: content ?? '',
    version: contentVersion(content),
  }
}

async function saveAgentsMd(input: {
  filePath: string
  content: string
  expectedVersion?: string | null
  conflictMessage: string
}): Promise<AgentsMdSaveResult> {
  const currentContent = await readFileContent(input.filePath)
  const currentVersion = contentVersion(currentContent)

  if (input.expectedVersion !== undefined && input.expectedVersion !== currentVersion) {
    throw new AgentsMdVersionConflictError(input.conflictMessage)
  }

  await fsp.mkdir(path.dirname(input.filePath), { recursive: true })
  await fsp.writeFile(input.filePath, input.content, 'utf8')

  return {
    path: input.filePath,
    content: input.content,
    version: contentVersion(input.content) ?? '',
  }
}

function resolveNotebookAgentsMdPath(directory: string) {
  return path.join(directory, AGENTS_MD_FILE_NAME)
}

async function resolveGlobalAgentsMdPath() {
  return path.join(Global.Path.config, AGENTS_MD_FILE_NAME)
}

export async function readNotebookAgentsMd(directory: string) {
  return readAgentsMd(resolveNotebookAgentsMdPath(directory))
}

export async function saveNotebookAgentsMd(input: {
  directory: string
  content: string
  expectedVersion?: string | null
}) {
  return saveAgentsMd({
    filePath: resolveNotebookAgentsMdPath(input.directory),
    content: input.content,
    expectedVersion: input.expectedVersion,
    conflictMessage: 'AGENTS.md changed on disk. Reload or overwrite to continue.',
  })
}

export async function readGlobalAgentsMd() {
  const filePath = await resolveGlobalAgentsMdPath()
  return readAgentsMd(filePath)
}

export async function saveGlobalAgentsMd(input: {
  content: string
  expectedVersion?: string | null
}) {
  const filePath = await resolveGlobalAgentsMdPath()
  return saveAgentsMd({
    filePath,
    content: input.content,
    expectedVersion: input.expectedVersion,
    conflictMessage: 'Global AGENTS.md changed on disk. Reload or overwrite to continue.',
  })
}
