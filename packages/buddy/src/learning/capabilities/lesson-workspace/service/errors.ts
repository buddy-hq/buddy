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
