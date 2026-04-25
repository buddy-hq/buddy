import type { Dirent } from "node:fs"
import fs from "node:fs/promises"
import { QuestionSetPath } from "./path"
import { SavedQuestionSetArtifactSchema, type PublicQuestionSetArtifact } from "./types"
import { QuestionSetArtifactNotFoundError } from "./errors"
import { validateSavedQuestionSetArtifact, toPublicQuestionSetArtifact } from "./save-artifact"

async function readQuestionSetArtifact(
  directory: string,
  artifactID: string,
): Promise<import("./types").SavedQuestionSetArtifact> {
  const safeArtifactID = QuestionSetPath.sanitizeArtifactID(artifactID)

  let artifactText: string
  try {
    artifactText = await fs.readFile(
      QuestionSetPath.artifactFile(directory, safeArtifactID),
      "utf8",
    )
  } catch (error) {
    const maybe = error as { code?: string }
    if (maybe.code === "ENOENT") {
      throw new QuestionSetArtifactNotFoundError(safeArtifactID)
    }
    throw error
  }

  const parsedArtifact = SavedQuestionSetArtifactSchema.parse(JSON.parse(artifactText))
  validateSavedQuestionSetArtifact(parsedArtifact)
  return parsedArtifact
}

async function readPublicQuestionSetArtifact(
  directory: string,
  artifactID: string,
): Promise<PublicQuestionSetArtifact> {
  const saved = await readQuestionSetArtifact(directory, artifactID)
  return toPublicQuestionSetArtifact(saved)
}

async function listQuestionSetArtifacts(directory: string): Promise<PublicQuestionSetArtifact[]> {
  let entries: Dirent[]
  try {
    entries = await fs.readdir(QuestionSetPath.root(directory), {
      withFileTypes: true,
    })
  } catch (error) {
    const maybe = error as { code?: string }
    if (maybe.code === "ENOENT") {
      return []
    }
    throw error
  }

  const artifacts = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        try {
          return await readPublicQuestionSetArtifact(directory, entry.name)
        } catch {
          return undefined
        }
      }),
  )

  return artifacts
    .filter((artifact): artifact is PublicQuestionSetArtifact => artifact !== undefined)
    .toSorted((left, right) => right.createdAt.localeCompare(left.createdAt))
}

export { readQuestionSetArtifact, readPublicQuestionSetArtifact, listQuestionSetArtifacts }
