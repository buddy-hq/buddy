import path from "node:path"
import {
  BUDDY_OBJECT_KINDS,
  BuddyObjectPath,
  OBJECT_INDEX_DIRECTORY_NAME,
  OBJECT_STATE_DIRECTORY_NAME,
} from "../../../../objects"

const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]+$/u
const WHITEBOARD_SESSION_INDEX_FILE_NAME = "sessions.json"
const WHITEBOARD_SESSION_STATE_FILE_NAME = "session.json"

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

function sessionIndexFile(directory: string): string {
  return path.join(
    BuddyObjectPath.kindRoot(directory, BUDDY_OBJECT_KINDS.whiteboard),
    OBJECT_INDEX_DIRECTORY_NAME,
    WHITEBOARD_SESSION_INDEX_FILE_NAME,
  )
}

function sessionStateFile(directory: string, objectID: string): string {
  return BuddyObjectPath.objectFile(
    directory,
    BUDDY_OBJECT_KINDS.whiteboard,
    objectID,
    OBJECT_STATE_DIRECTORY_NAME,
    WHITEBOARD_SESSION_STATE_FILE_NAME,
  )
}

const WhiteboardPath = {
  sanitizeSessionID,
  sessionIndexFile,
  sessionStateFile,
}

export { InvalidWhiteboardSessionIDError, WhiteboardPath }
