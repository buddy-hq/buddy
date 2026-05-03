import { InvalidQuestionSetArtifactIDError } from "./storage/path"

class QuestionSetArtifactNotFoundError extends Error {
  constructor(artifactID: string) {
    super(`Question-set artifact '${artifactID}' was not found.`)
    this.name = "QuestionSetArtifactNotFoundError"
  }
}

class QuestionSetValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "QuestionSetValidationError"
  }
}

function mapQuestionSetRouteError(error: unknown): Response | undefined {
  if (error instanceof InvalidQuestionSetArtifactIDError) {
    return Response.json({ error: error.message }, { status: 400 })
  }
  if (error instanceof QuestionSetArtifactNotFoundError) {
    return Response.json({ error: error.message }, { status: 404 })
  }
  if (error instanceof QuestionSetValidationError) {
    return Response.json({ error: error.message }, { status: 400 })
  }
  return undefined
}

export { QuestionSetArtifactNotFoundError, QuestionSetValidationError, mapQuestionSetRouteError }
