import path from "node:path"

const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]+$/u

class InvalidWhiteboardSessionIDError extends Error {
  constructor(sessionID: string) {
    super(`Invalid whiteboard session id '${sessionID}'.`)
    this.name = "InvalidWhiteboardSessionIDError"
  }
}

function sanitizeSessionID(sessionID: string): string {
  if (!SESSION_ID_PATTERN.test(sessionID)) {
    throw new InvalidWhiteboardSessionIDError(sessionID)
  }
  return sessionID
}

function root(directory: string): string {
  return path.join(directory, ".buddy", "whiteboards-v1")
}

function sessionFile(directory: string, sessionID: string): string {
  return path.join(root(directory), `${sanitizeSessionID(sessionID)}.json`)
}

const WhiteboardPath = {
  root,
  sanitizeSessionID,
  sessionFile,
}

export { InvalidWhiteboardSessionIDError, WhiteboardPath }
