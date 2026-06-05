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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isTeachingLanguage(value: unknown): value is TeachingLanguage {
  if (typeof value !== "string") {
    return false
  }
  return TEACHING_LANGUAGE_OPTIONS.some((option) => option.value === value)
}

function isTeachingDiagnosticSeverity(
  value: unknown,
): value is TeachingWorkspace["diagnostics"][number]["severity"] {
  return value === "error" || value === "warning" || value === "info" || value === "hint"
}

function readOptionalString(value: unknown) {
  return typeof value === "string" ? value : undefined
}

function readOptionalCode(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? value : undefined
}

function parseTeachingDiagnostics(value: unknown): TeachingWorkspace["diagnostics"] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }

  const diagnostics: TeachingWorkspace["diagnostics"] = []
  for (const entry of value) {
    if (!isRecord(entry)) {
      return undefined
    }
    if (
      typeof entry.message !== "string" ||
      !isTeachingDiagnosticSeverity(entry.severity) ||
      typeof entry.startLine !== "number" ||
      !Number.isFinite(entry.startLine) ||
      typeof entry.startColumn !== "number" ||
      !Number.isFinite(entry.startColumn) ||
      typeof entry.endLine !== "number" ||
      !Number.isFinite(entry.endLine) ||
      typeof entry.endColumn !== "number" ||
      !Number.isFinite(entry.endColumn)
    ) {
      return undefined
    }
    diagnostics.push({
      message: entry.message,
      severity: entry.severity,
      source: readOptionalString(entry.source),
      code: readOptionalCode(entry.code),
      startLine: entry.startLine,
      startColumn: entry.startColumn,
      endLine: entry.endLine,
      endColumn: entry.endColumn,
    })
  }

  return diagnostics
}

function parseTeachingWorkspaceFiles(value: unknown): TeachingWorkspace["files"] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }

  const files: TeachingWorkspace["files"] = []
  for (const entry of value) {
    if (!isRecord(entry)) {
      return undefined
    }
    if (
      typeof entry.relativePath !== "string" ||
      typeof entry.filePath !== "string" ||
      typeof entry.checkpointFilePath !== "string" ||
      !isTeachingLanguage(entry.language)
    ) {
      return undefined
    }
    files.push({
      relativePath: entry.relativePath,
      filePath: entry.filePath,
      checkpointFilePath: entry.checkpointFilePath,
      language: entry.language,
    })
  }

  return files
}

function parseTeachingWorkspace(value: unknown): TeachingWorkspace | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const diagnostics = parseTeachingDiagnostics(value.diagnostics)
  const files = parseTeachingWorkspaceFiles(value.files)

  if (
    typeof value.sessionID !== "string" ||
    typeof value.workspaceRoot !== "string" ||
    !isTeachingLanguage(value.language) ||
    typeof value.lessonFilePath !== "string" ||
    typeof value.checkpointFilePath !== "string" ||
    files === undefined ||
    typeof value.activeRelativePath !== "string" ||
    typeof value.revision !== "number" ||
    !Number.isFinite(value.revision) ||
    typeof value.code !== "string" ||
    typeof value.lspAvailable !== "boolean" ||
    diagnostics === undefined
  ) {
    return undefined
  }

  return {
    sessionID: value.sessionID,
    workspaceRoot: value.workspaceRoot,
    language: value.language,
    lessonFilePath: value.lessonFilePath,
    checkpointFilePath: value.checkpointFilePath,
    files,
    activeRelativePath: value.activeRelativePath,
    revision: value.revision,
    code: value.code,
    lspAvailable: value.lspAvailable,
    diagnostics,
  }
}

function requireTeachingWorkspace(value: unknown): TeachingWorkspace {
  const workspace = parseTeachingWorkspace(value)
  if (!workspace) {
    throw new Error("Invalid teaching workspace response")
  }
  return workspace
}

function isTeachingConflictPayload(value: unknown): value is TeachingConflictPayload {
  if (!isRecord(value)) return false
  return (
    typeof value.error === "string" &&
    typeof value.revision === "number" &&
    Number.isFinite(value.revision) &&
    typeof value.code === "string" &&
    parseTeachingWorkspaceFiles(value.files) !== undefined &&
    typeof value.activeRelativePath === "string" &&
    typeof value.lessonFilePath === "string" &&
    typeof value.checkpointFilePath === "string" &&
    isTeachingLanguage(value.language) &&
    typeof value.lspAvailable === "boolean" &&
    parseTeachingDiagnostics(value.diagnostics) !== undefined
  )
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

  if (result.response?.status === 409 && isTeachingConflictPayload(result.error)) {
    throw new TeachingConflictError(result.error)
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
