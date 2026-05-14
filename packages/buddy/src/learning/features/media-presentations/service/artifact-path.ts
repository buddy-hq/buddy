import path from "node:path"
import crypto from "node:crypto"

const ARTIFACT_ROOT_NAME = "presented-media-artifacts"
const UUID_PATTERN = /^[a-f0-9-]{36}$/iu

export class PresentedMediaArtifactIDError extends Error {
  constructor(artifactID: string) {
    super(`Invalid presented-media artifact id '${artifactID}'.`)
    this.name = "PresentedMediaArtifactIDError"
  }
}

function root(directory: string): string {
  return path.join(directory, ".buddy", ARTIFACT_ROOT_NAME)
}

function sanitizeArtifactID(artifactID: string): string {
  if (!UUID_PATTERN.test(artifactID)) {
    throw new PresentedMediaArtifactIDError(artifactID)
  }
  return artifactID
}

function artifactDirectory(directory: string, artifactID: string): string {
  return path.join(root(directory), sanitizeArtifactID(artifactID))
}

function manifestFile(directory: string, artifactID: string): string {
  return path.join(artifactDirectory(directory, artifactID), "manifest.json")
}

export const PresentedMediaArtifactPath = {
  artifactDirectory,
  manifestFile,
  root,
  sanitizeArtifactID,
}

export function buildPresentedMediaArtifactID(): string {
  return crypto.randomUUID()
}
