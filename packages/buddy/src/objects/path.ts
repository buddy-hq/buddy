import path from "node:path"
import { BuddyObjectValidationError } from "./errors"
import {
  BUDDY_DIRECTORY_NAME,
  BuddyObjectIDSchema,
  BuddyObjectKindSchema,
  OBJECTS_DIRECTORY_NAME,
  OBJECTS_VERSION_DIRECTORY_NAME,
  OBJECT_DERIVED_DIRECTORY_NAME,
  OBJECT_INDEX_DIRECTORY_NAME,
  OBJECT_INDEX_FILE_NAME,
  OBJECT_MANIFEST_FILE_NAME,
  OBJECT_REVISIONS_DIRECTORY_NAME,
  OBJECT_SOURCE_DIRECTORY_NAME,
  OBJECT_STATE_DIRECTORY_NAME,
  OBJECT_TOMBSTONE_FILE_NAME,
  type BuddyObjectKind,
} from "./kinds"

function sanitizeObjectKind(kind: string): BuddyObjectKind {
  const parsed = BuddyObjectKindSchema.safeParse(kind)
  if (!parsed.success) {
    throw new BuddyObjectValidationError(`Invalid Buddy object kind '${kind}'.`)
  }
  return parsed.data
}

function sanitizeObjectID(objectID: string): string {
  const parsed = BuddyObjectIDSchema.safeParse(objectID)
  if (!parsed.success) {
    throw new BuddyObjectValidationError(`Invalid Buddy object id '${objectID}'.`)
  }
  return parsed.data
}

function objectRoot(directory: string): string {
  return path.join(
    directory,
    BUDDY_DIRECTORY_NAME,
    OBJECTS_DIRECTORY_NAME,
    OBJECTS_VERSION_DIRECTORY_NAME,
  )
}

function indexRoot(directory: string): string {
  return path.join(objectRoot(directory), OBJECT_INDEX_DIRECTORY_NAME)
}

function indexFile(directory: string): string {
  return path.join(indexRoot(directory), OBJECT_INDEX_FILE_NAME)
}

function kindRoot(directory: string, kind: BuddyObjectKind): string {
  return path.join(objectRoot(directory), sanitizeObjectKind(kind))
}

function kindIndexRoot(directory: string, kind: BuddyObjectKind): string {
  return path.join(kindRoot(directory, kind), OBJECT_INDEX_DIRECTORY_NAME)
}

function objectDirectory(
  directory: string,
  kind: BuddyObjectKind,
  objectID: string,
): string {
  return path.join(kindRoot(directory, kind), sanitizeObjectID(objectID))
}

function manifestFile(directory: string, kind: BuddyObjectKind, objectID: string): string {
  return path.join(objectDirectory(directory, kind, objectID), OBJECT_MANIFEST_FILE_NAME)
}

function tombstoneFile(directory: string, kind: BuddyObjectKind, objectID: string): string {
  return path.join(objectDirectory(directory, kind, objectID), OBJECT_TOMBSTONE_FILE_NAME)
}

function objectFile(
  directory: string,
  kind: BuddyObjectKind,
  objectID: string,
  ...segments: string[]
): string {
  return path.join(objectDirectory(directory, kind, objectID), ...segments)
}

function sourceRoot(directory: string, kind: BuddyObjectKind, objectID: string): string {
  return objectFile(directory, kind, objectID, OBJECT_SOURCE_DIRECTORY_NAME)
}

function revisionsRoot(directory: string, kind: BuddyObjectKind, objectID: string): string {
  return objectFile(directory, kind, objectID, OBJECT_REVISIONS_DIRECTORY_NAME)
}

function derivedRoot(directory: string, kind: BuddyObjectKind, objectID: string): string {
  return objectFile(directory, kind, objectID, OBJECT_DERIVED_DIRECTORY_NAME)
}

function stateRoot(directory: string, kind: BuddyObjectKind, objectID: string): string {
  return objectFile(directory, kind, objectID, OBJECT_STATE_DIRECTORY_NAME)
}

function revisionDirectory(input: {
  directory: string
  kind: BuddyObjectKind
  objectID: string
  revisionID: string
}): string {
  return path.join(
    revisionsRoot(input.directory, input.kind, input.objectID),
    sanitizeObjectID(input.revisionID),
  )
}

function relativeObjectDirectory(kind: BuddyObjectKind, objectID: string): string {
  return path.posix.join(
    BUDDY_DIRECTORY_NAME,
    OBJECTS_DIRECTORY_NAME,
    OBJECTS_VERSION_DIRECTORY_NAME,
    sanitizeObjectKind(kind),
    sanitizeObjectID(objectID),
  )
}

const BuddyObjectPath = {
  derivedRoot,
  indexFile,
  indexRoot,
  kindIndexRoot,
  kindRoot,
  manifestFile,
  objectDirectory,
  objectFile,
  objectRoot,
  relativeObjectDirectory,
  revisionDirectory,
  revisionsRoot,
  sanitizeObjectID,
  sanitizeObjectKind,
  sourceRoot,
  stateRoot,
  tombstoneFile,
}

export { BuddyObjectPath }
