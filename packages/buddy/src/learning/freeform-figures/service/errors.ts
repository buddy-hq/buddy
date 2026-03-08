import type { FreeformFigureLintIssue } from "./types.js"

class FreeformFigureNotFoundError extends Error {
  constructor(figureID: string) {
    super(`Freeform figure '${figureID}' was not found.`)
    this.name = "FreeformFigureNotFoundError"
  }
}

class FreeformFigureRenderError extends Error {
  readonly issues: readonly FreeformFigureLintIssue[]

  constructor(issues: readonly FreeformFigureLintIssue[]) {
    super(issues.map((issue) => issue.message).join(" "))
    this.name = "FreeformFigureRenderError"
    this.issues = issues
  }
}

export {
  FreeformFigureNotFoundError,
  FreeformFigureRenderError,
}
