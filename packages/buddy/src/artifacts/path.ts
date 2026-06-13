import path from "node:path"
import {
  ARTIFACT_MANIFEST_FILE_NAME,
  ARTIFACT_SYSTEM_DIRECTORY_NAME,
  ARTIFACTS_DIRECTORY_NAME,
  ArtifactIDSchema,
  ArtifactKindSchema,
  BUDDY_DIRECTORY_NAME,
  type ArtifactKind,
} from "./kinds"
import { ArtifactValidationError } from "./errors"

function sanitizeArtifactKind(kind: string): ArtifactKind {
  const parsed = ArtifactKindSchema.safeParse(kind)
  if (!parsed.success) {
    throw new ArtifactValidationError(`Invalid artifact kind '${kind}'.`)
  }
  return parsed.data
}

function sanitizeArtifactID(artifactID: string): string {
  const parsed = ArtifactIDSchema.safeParse(artifactID)
  if (!parsed.success) {
    throw new ArtifactValidationError(`Invalid artifact id '${artifactID}'.`)
  }
  return parsed.data
}

function artifactRoot(directory: string): string {
  return path.join(directory, BUDDY_DIRECTORY_NAME, ARTIFACTS_DIRECTORY_NAME)
}

function systemDirectory(directory: string, ...segments: string[]): string {
  return path.join(artifactRoot(directory), ARTIFACT_SYSTEM_DIRECTORY_NAME, ...segments)
}

function kindRoot(directory: string, kind: ArtifactKind): string {
  return path.join(artifactRoot(directory), sanitizeArtifactKind(kind))
}

function artifactDirectory(directory: string, kind: ArtifactKind, artifactID: string): string {
  return path.join(kindRoot(directory, kind), sanitizeArtifactID(artifactID))
}

function manifestFile(directory: string, kind: ArtifactKind, artifactID: string): string {
  return path.join(artifactDirectory(directory, kind, artifactID), ARTIFACT_MANIFEST_FILE_NAME)
}

function artifactFile(
  directory: string,
  kind: ArtifactKind,
  artifactID: string,
  ...segments: string[]
): string {
  return path.join(artifactDirectory(directory, kind, artifactID), ...segments)
}

function relativeArtifactDirectory(kind: ArtifactKind, artifactID: string): string {
  return path.posix.join(
    BUDDY_DIRECTORY_NAME,
    ARTIFACTS_DIRECTORY_NAME,
    sanitizeArtifactKind(kind),
    sanitizeArtifactID(artifactID),
  )
}

const ArtifactPath = {
  artifactDirectory,
  artifactFile,
  artifactRoot,
  kindRoot,
  manifestFile,
  relativeArtifactDirectory,
  sanitizeArtifactID,
  sanitizeArtifactKind,
  systemDirectory,
}

export { ArtifactPath }
