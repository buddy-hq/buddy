import type {
  TeachingWorkspaceCheckpointResponses,
  TeachingWorkspaceFileActivateResponses,
  TeachingWorkspaceFileCreateResponses,
  TeachingWorkspaceProvisionResponses,
  TeachingWorkspaceRestoreResponses,
} from "@buddy/sdk"
import {
  TEACHING_LANGUAGE_OPTIONS,
  type TeachingLanguage,
  type TeachingWorkspace,
} from "./teaching-runtime"
import { buddyResultMessage, getBuddyClient, requireBuddyData } from "../lib/buddy-client"
import { stringifyError } from "../lib/api-client"
import { z } from "zod"
import { parseStringValue, parseWithSchema } from "./parse-external"

export type TeachingConflictPayload = {
  error: string
} & Pick<
  TeachingWorkspace,
  | "revision"
  | "code"
  | "files"
  | "activeRelativePath"
  | "lessonFilePath"
  | "checkpointFilePath"
  | "language"
  | "lspAvailable"
  | "diagnostics"
>

const teachingDiagnosticSchema = z.object({
  message: z.string(),
  severity: z.enum(["error", "warning", "info", "hint"]),
  source: z.string().optional(),
  code: z.union([z.string(), z.number()]).optional(),
  startLine: z.number().finite(),
  startColumn: z.number().finite(),
  endLine: z.number().finite(),
  endColumn: z.number().finite(),
})

const teachingWorkspaceFileFieldsSchema = z.object({
  relativePath: z.string(),
  filePath: z.string(),
  checkpointFilePath: z.string(),
  language: z.string(),
})

const teachingWorkspaceFieldsSchema = z.object({
  sessionID: z.string(),
  workspaceRoot: z.string(),
  language: z.string(),
  lessonFilePath: z.string(),
  checkpointFilePath: z.string(),
  files: z.array(z.unknown()),
  activeRelativePath: z.string(),
  revision: z.number().finite(),
  code: z.string(),
  lspAvailable: z.boolean(),
  diagnostics: z.array(z.unknown()),
})

const teachingConflictFieldsSchema = z.object({
  error: z.string(),
  revision: z.number().finite(),
  code: z.string(),
  files: z.array(z.unknown()),
  activeRelativePath: z.string(),
  lessonFilePath: z.string(),
  checkpointFilePath: z.string(),
  language: z.string(),
  lspAvailable: z.boolean(),
  diagnostics: z.array(z.unknown()),
})

function parseTeachingLanguage<TValue>(value: TValue): TeachingLanguage | undefined {
  const text = parseStringValue(value)
  if (text === undefined) return undefined
  return TEACHING_LANGUAGE_OPTIONS.find((option) => option.value === text)?.value
}

function parseTeachingWorkspaceFile<TValue>(
  value: TValue,
): TeachingWorkspace["files"][number] | undefined {
  const parsed = parseWithSchema(teachingWorkspaceFileFieldsSchema, value)
  if (!parsed) return undefined
  const language = parseTeachingLanguage(parsed.language)
  if (!language) return undefined
  return {
    relativePath: parsed.relativePath,
    filePath: parsed.filePath,
    checkpointFilePath: parsed.checkpointFilePath,
    language,
  }
}

function parseTeachingDiagnostics<TValue>(
  value: TValue,
): TeachingWorkspace["diagnostics"] | undefined {
  if (!Array.isArray(value)) return undefined
  const diagnostics: TeachingWorkspace["diagnostics"] = []
  for (const entry of value) {
    const parsed = parseWithSchema(teachingDiagnosticSchema, entry)
    if (!parsed) return undefined
    diagnostics.push(parsed)
  }
  return diagnostics
}

function parseTeachingWorkspaceFiles<TValue>(
  value: TValue,
): TeachingWorkspace["files"] | undefined {
  if (!Array.isArray(value)) return undefined
  const files: TeachingWorkspace["files"] = []
  for (const entry of value) {
    const parsed = parseTeachingWorkspaceFile(entry)
    if (!parsed) return undefined
    files.push(parsed)
  }
  return files
}

function parseTeachingWorkspace<TValue>(value: TValue): TeachingWorkspace | undefined {
  const parsed = parseWithSchema(teachingWorkspaceFieldsSchema, value)
  if (!parsed) return undefined
  const language = parseTeachingLanguage(parsed.language)
  const files = parseTeachingWorkspaceFiles(parsed.files)
  const diagnostics = parseTeachingDiagnostics(parsed.diagnostics)
  if (!language || files === undefined || diagnostics === undefined) return undefined
  return {
    sessionID: parsed.sessionID,
    workspaceRoot: parsed.workspaceRoot,
    language,
    lessonFilePath: parsed.lessonFilePath,
    checkpointFilePath: parsed.checkpointFilePath,
    files,
    activeRelativePath: parsed.activeRelativePath,
    revision: parsed.revision,
    code: parsed.code,
    lspAvailable: parsed.lspAvailable,
    diagnostics,
  }
}

function requireTeachingWorkspace<TValue>(value: TValue): TeachingWorkspace {
  const workspace = parseTeachingWorkspace(value)
  if (!workspace) {
    throw new Error("Invalid teaching workspace response")
  }
  return workspace
}

function parseTeachingConflictPayload<TValue>(value: TValue): TeachingConflictPayload | undefined {
  const parsed = parseWithSchema(teachingConflictFieldsSchema, value)
  if (!parsed) return undefined
  const language = parseTeachingLanguage(parsed.language)
  const files = parseTeachingWorkspaceFiles(parsed.files)
  const diagnostics = parseTeachingDiagnostics(parsed.diagnostics)
  if (!language || files === undefined || diagnostics === undefined) return undefined
  return {
    error: parsed.error,
    revision: parsed.revision,
    code: parsed.code,
    files,
    activeRelativePath: parsed.activeRelativePath,
    lessonFilePath: parsed.lessonFilePath,
    checkpointFilePath: parsed.checkpointFilePath,
    language,
    lspAvailable: parsed.lspAvailable,
    diagnostics,
  }
}

export class TeachingConflictError extends Error {
  payload: TeachingConflictPayload

  constructor(payload: TeachingConflictPayload) {
    super(payload.error)
    this.name = "TeachingConflictError"
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
  return requireTeachingWorkspace(data)
}

export async function loadTeachingWorkspace(input: { directory: string; sessionID: string }) {
  const result = await getBuddyClient(input.directory).teaching.workspace.read({
    sessionID: input.sessionID,
  })
  if (!result.response || !result.response.ok || result.error !== undefined) {
    throw new Error(buddyResultMessage(result))
  }
  if (result.response.status === 204) {
    throw new Error("Teaching workspace is not provisioned for this session.")
  }
  if (result.data === undefined) {
    throw new Error(buddyResultMessage(result))
  }
  return requireTeachingWorkspace(result.data)
}

export async function probeTeachingWorkspace(input: { directory: string; sessionID: string }) {
  const result = await getBuddyClient(input.directory).teaching.workspace.read({
    sessionID: input.sessionID,
    optional: "1",
  })

  if (result.response?.status === 204) {
    return undefined
  }

  if (
    !result.response ||
    !result.response.ok ||
    result.error !== undefined ||
    result.data === undefined
  ) {
    throw new Error(buddyResultMessage(result))
  }

  return requireTeachingWorkspace(result.data)
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

  if (result.response?.status === 409) {
    const conflict = parseTeachingConflictPayload(result.error)
    if (conflict) {
      throw new TeachingConflictError(conflict)
    }
  }

  if (
    !result.response ||
    !result.response.ok ||
    result.error !== undefined ||
    result.data === undefined
  ) {
    throw new Error(buddyResultMessage(result))
  }

  return requireTeachingWorkspace(result.data)
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
  return requireTeachingWorkspace(data)
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
  return requireTeachingWorkspace(data)
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
  return requireTeachingWorkspace(data)
}

export { stringifyError }
