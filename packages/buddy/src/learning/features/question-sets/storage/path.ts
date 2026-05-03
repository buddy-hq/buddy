import path from "node:path"

const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/u

class InvalidQuestionSetArtifactIDError extends Error {
  constructor(artifactID: string) {
    super(`Invalid question-set artifact id '${artifactID}'.`)
    this.name = "InvalidQuestionSetArtifactIDError"
  }
}

class InvalidQuestionSetAttemptIDError extends Error {
  constructor(attemptID: string) {
    super(`Invalid question-set attempt id '${attemptID}'.`)
    this.name = "InvalidQuestionSetAttemptIDError"
  }
}

function root(directory: string): string {
  return path.join(directory, ".buddy", "question-set-artifacts")
}

function sanitizeArtifactID(artifactID: string): string {
  if (!ULID_PATTERN.test(artifactID)) {
    throw new InvalidQuestionSetArtifactIDError(artifactID)
  }

  return artifactID
}

function sanitizeAttemptID(attemptID: string): string {
  if (!ULID_PATTERN.test(attemptID)) {
    throw new InvalidQuestionSetAttemptIDError(attemptID)
  }

  return attemptID
}

function artifactDirectory(directory: string, artifactID: string): string {
  return path.join(root(directory), sanitizeArtifactID(artifactID))
}

function artifactFile(directory: string, artifactID: string): string {
  return path.join(artifactDirectory(directory, artifactID), "artifact.json")
}

function attemptsDirectory(directory: string, artifactID: string): string {
  return path.join(artifactDirectory(directory, artifactID), "attempts")
}

function attemptFile(directory: string, artifactID: string, attemptID: string): string {
  return path.join(attemptsDirectory(directory, artifactID), `${sanitizeAttemptID(attemptID)}.json`)
}

const QuestionSetPath = {
  root,
  sanitizeArtifactID,
  sanitizeAttemptID,
  artifactDirectory,
  artifactFile,
  attemptsDirectory,
  attemptFile,
}

export { InvalidQuestionSetArtifactIDError, InvalidQuestionSetAttemptIDError, QuestionSetPath }
