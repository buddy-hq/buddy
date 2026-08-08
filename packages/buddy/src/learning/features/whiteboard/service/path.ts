import {
  BUDDY_OBJECT_KINDS,
  BuddyObjectPath,
  OBJECT_STATE_DIRECTORY_NAME,
} from "../../../../objects"
import path from "node:path"

const WHITEBOARD_OBJECT_STATE_FILE_NAME = "whiteboard.json"
const LEGACY_WHITEBOARD_SESSION_STATE_FILE_NAME = "session.json"
const WHITEBOARD_CREATION_RESERVATION_DIRECTORY_NAME = "creation-reservations"

function objectStateFile(directory: string, objectID: string): string {
  return BuddyObjectPath.objectFile(
    directory,
    BUDDY_OBJECT_KINDS.whiteboard,
    objectID,
    OBJECT_STATE_DIRECTORY_NAME,
    WHITEBOARD_OBJECT_STATE_FILE_NAME,
  )
}

function legacySessionStateFile(directory: string, objectID: string): string {
  return BuddyObjectPath.objectFile(
    directory,
    BUDDY_OBJECT_KINDS.whiteboard,
    objectID,
    OBJECT_STATE_DIRECTORY_NAME,
    LEGACY_WHITEBOARD_SESSION_STATE_FILE_NAME,
  )
}

function creationReservationFile(directory: string, reservationDigest: string): string {
  return path.join(
    BuddyObjectPath.kindIndexRoot(directory, BUDDY_OBJECT_KINDS.whiteboard),
    WHITEBOARD_CREATION_RESERVATION_DIRECTORY_NAME,
    `${reservationDigest}.json`,
  )
}

const WhiteboardPath = {
  creationReservationFile,
  legacySessionStateFile,
  objectStateFile,
}

export { WhiteboardPath }
