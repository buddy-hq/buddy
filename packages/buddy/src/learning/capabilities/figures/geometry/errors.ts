import { InvalidFigureIDError } from "./path"
import { type FigureValidationIssue } from "./validate"

class FigureNotFoundError extends Error {
  constructor(figureID: string) {
    super(`Figure '${figureID}' was not found.`)
    this.name = "FigureNotFoundError"
  }
}

class FigureRenderError extends Error {
  readonly issues: readonly FigureValidationIssue[]

  constructor(issues: readonly FigureValidationIssue[]) {
    super(issues.map((issue) => issue.message).join(" "))
    this.name = "FigureRenderError"
    this.issues = issues
  }
}

function mapFigureRouteError(error: unknown): Response | undefined {
  if (error instanceof InvalidFigureIDError) {
    return Response.json({ error: error.message }, { status: 400 })
  }
  if (error instanceof FigureNotFoundError) {
    return Response.json({ error: error.message }, { status: 404 })
  }
  if (error instanceof FigureRenderError) {
    return Response.json({ error: error.message }, { status: 400 })
  }
  return undefined
}

export { FigureNotFoundError, FigureRenderError, mapFigureRouteError }
