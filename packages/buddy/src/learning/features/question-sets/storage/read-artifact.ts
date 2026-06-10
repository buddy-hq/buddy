import type { Dirent } from "node:fs"
import fs from "node:fs/promises"
import { QuestionSetPath } from "./path"
import { SavedQuestionSetArtifactSchema, type PublicQuestionSetArtifact } from "../types"
import { QuestionSetArtifactLoadError, QuestionSetArtifactNotFoundError } from "../errors"
import { validateSavedQuestionSetArtifact, toPublicQuestionSetArtifact } from "./save-artifact"

type QuestionSetArtifactListLoadError = {
  artifactID: string
  message: string
}

type QuestionSetArtifactListResult = {
  artifacts: PublicQuestionSetArtifact[]
  loadErrors: QuestionSetArtifactListLoadError[]
}

type QuestionSetArtifactListEntryResult =
  | {
      artifact: PublicQuestionSetArtifact
      loadError?: never
    }
  | {
      artifact?: never
      loadError: QuestionSetArtifactListLoadError
    }

async function readQuestionSetArtifact(
  directory: string,
  artifactID: string,
): Promise<import("../types").SavedQuestionSetArtifact> {
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

async function listQuestionSetArtifacts(directory: string): Promise<QuestionSetArtifactListResult> {
  let entries: Dirent[]
  try {
    entries = await fs.readdir(QuestionSetPath.root(directory), {
      withFileTypes: true,
    })
  } catch (error) {
    const maybe = error as { code?: string }
    if (maybe.code === "ENOENT") {
      return {
        artifacts: [],
        loadErrors: [],
      }
    }
    throw error
  }

  const results = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry): Promise<QuestionSetArtifactListEntryResult> => {
        try {
          return {
            artifact: await readPublicQuestionSetArtifact(directory, entry.name),
          }
        } catch (error) {
          return {
            loadError: {
              artifactID: entry.name,
              message: new QuestionSetArtifactLoadError(entry.name, error).message,
            },
          }
        }
      }),
  )

  const artifacts: PublicQuestionSetArtifact[] = []
  const loadErrors: QuestionSetArtifactListLoadError[] = []
  for (const result of results) {
    if (result.loadError) {
      loadErrors.push(result.loadError)
    } else {
      artifacts.push(result.artifact)
    }
  }

  return {
    artifacts: artifacts.toSorted((left, right) => right.createdAt.localeCompare(left.createdAt)),
    loadErrors: loadErrors.toSorted((left, right) =>
      left.artifactID.localeCompare(right.artifactID),
    ),
  }
}

export { readQuestionSetArtifact, readPublicQuestionSetArtifact, listQuestionSetArtifacts }

export type { QuestionSetArtifactListLoadError, QuestionSetArtifactListResult }
