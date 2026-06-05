import type { TeachingWorkspaceResponse } from "../model/types"

export class TeachingWorkspaceNotFoundError extends Error {
  constructor(sessionID: string) {
    super(`Teaching workspace not found for session ${sessionID}`)
    this.name = "TeachingWorkspaceNotFoundError"
  }
}

type TeachingRevisionConflictResponse = Pick<
  TeachingWorkspaceResponse,
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

export class TeachingRevisionConflictError extends Error {
  response: TeachingRevisionConflictResponse

  constructor(input: TeachingRevisionConflictResponse) {
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
