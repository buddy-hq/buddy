import {
  InvalidMermaidArtifactIDError,
  InvalidMermaidRenderKeyError,
  InvalidMermaidRepairRequestIDError,
} from "./service/v2-path"

class MermaidArtifactNotFoundError extends Error {
  constructor(artifactID: string) {
    super(`Mermaid artifact '${artifactID}' was not found.`)
    this.name = "MermaidArtifactNotFoundError"
  }
}

class MermaidRenderRecordNotFoundError extends Error {
  constructor(renderKey: string) {
    super(`Mermaid render record '${renderKey}' was not found.`)
    this.name = "MermaidRenderRecordNotFoundError"
  }
}

class MermaidRepairRequestNotFoundError extends Error {
  constructor(repairRequestID: string) {
    super(`Mermaid repair request '${repairRequestID}' was not found.`)
    this.name = "MermaidRepairRequestNotFoundError"
  }
}

function mapMermaidArtifactRouteError(error: unknown): Response | undefined {
  if (
    error instanceof InvalidMermaidArtifactIDError ||
    error instanceof InvalidMermaidRenderKeyError ||
    error instanceof InvalidMermaidRepairRequestIDError
  ) {
    return Response.json({ error: error.message }, { status: 400 })
  }
  if (error instanceof MermaidArtifactNotFoundError) {
    return Response.json({ error: error.message }, { status: 404 })
  }
  if (error instanceof MermaidRenderRecordNotFoundError) {
    return Response.json({ error: error.message }, { status: 404 })
  }
  if (error instanceof MermaidRepairRequestNotFoundError) {
    return Response.json({ error: error.message }, { status: 404 })
  }
  return undefined
}

export {
  MermaidArtifactNotFoundError,
  MermaidRepairRequestNotFoundError,
  MermaidRenderRecordNotFoundError,
  mapMermaidArtifactRouteError,
}
