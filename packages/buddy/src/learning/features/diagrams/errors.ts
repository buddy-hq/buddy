class InvalidMermaidRenderKeyError extends Error {
  constructor(renderKey: string) {
    super(`Invalid Mermaid render key '${renderKey}'.`)
    this.name = "InvalidMermaidRenderKeyError"
  }
}

class InvalidMermaidRepairRequestIDError extends Error {
  constructor(repairRequestID: string) {
    super(`Invalid Mermaid repair request id '${repairRequestID}'.`)
    this.name = "InvalidMermaidRepairRequestIDError"
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

function mapMermaidObjectRouteError<TError>(error: TError): Response | undefined {
  if (
    error instanceof InvalidMermaidRenderKeyError ||
    error instanceof InvalidMermaidRepairRequestIDError
  ) {
    return Response.json({ error: error.message }, { status: 400 })
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
  InvalidMermaidRenderKeyError,
  InvalidMermaidRepairRequestIDError,
  MermaidRepairRequestNotFoundError,
  MermaidRenderRecordNotFoundError,
  mapMermaidObjectRouteError,
}
