import { InvalidMermaidArtifactIDError } from "./path"

class MermaidArtifactNotFoundError extends Error {
  constructor(artifactID: string) {
    super(`Mermaid artifact '${artifactID}' was not found.`)
    this.name = "MermaidArtifactNotFoundError"
  }
}

class MermaidRenderError extends Error {
  readonly diagnostics: readonly string[]
  readonly repairAttempts: number
  readonly repairLog: readonly string[]

  constructor(input: {
    diagnostics: readonly string[]
    repairAttempts: number
    repairLog: string[]
  }) {
    super(input.diagnostics.join(" "))
    this.name = "MermaidRenderError"
    this.diagnostics = [...input.diagnostics]
    this.repairAttempts = input.repairAttempts
    this.repairLog = [...input.repairLog]
  }
}

function mapMermaidArtifactRouteError(error: unknown): Response | undefined {
  if (error instanceof InvalidMermaidArtifactIDError) {
    return Response.json({ error: error.message }, { status: 400 })
  }
  if (error instanceof MermaidArtifactNotFoundError) {
    return Response.json({ error: error.message }, { status: 404 })
  }
  if (error instanceof MermaidRenderError) {
    return Response.json({ error: error.message }, { status: 400 })
  }
  return undefined
}

export { MermaidArtifactNotFoundError, MermaidRenderError, mapMermaidArtifactRouteError }
