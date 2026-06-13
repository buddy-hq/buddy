import type { ArtifactKind } from "./kinds"

class ArtifactValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ArtifactValidationError"
  }
}

class ArtifactNotFoundError extends Error {
  constructor(kind: ArtifactKind, artifactID: string) {
    super(`Artifact '${kind}/${artifactID}' was not found.`)
    this.name = "ArtifactNotFoundError"
  }
}

class ArtifactLoadError extends Error {
  constructor(kind: ArtifactKind, artifactID: string, cause: unknown) {
    const causeMessage = cause instanceof Error ? cause.message : String(cause)
    super(`Artifact '${kind}/${artifactID}' could not be loaded: ${causeMessage}`)
    this.name = "ArtifactLoadError"
  }
}

function mapArtifactRouteError(error: unknown): Response | undefined {
  if (error instanceof ArtifactValidationError) {
    return Response.json({ error: error.message }, { status: 400 })
  }
  if (error instanceof ArtifactNotFoundError) {
    return Response.json({ error: error.message }, { status: 404 })
  }
  if (error instanceof ArtifactLoadError) {
    return Response.json({ error: error.message }, { status: 500 })
  }
  return undefined
}

export {
  ArtifactLoadError,
  ArtifactNotFoundError,
  ArtifactValidationError,
  mapArtifactRouteError,
}
