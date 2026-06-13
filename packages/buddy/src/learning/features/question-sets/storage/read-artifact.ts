import {
  ARTIFACT_CONTENT_FILES,
  ARTIFACT_KINDS,
  ArtifactPath,
  type ArtifactLoadErrorRecord,
  listArtifactManifests,
  readArtifactJsonFile,
} from "../../../../artifacts"
import {
  QuestionSetArtifactManifestSchema,
  SavedQuestionSetArtifactSchema,
  type PublicQuestionSetArtifact,
  type QuestionSetArtifactManifest,
  type SavedQuestionSetArtifact,
} from "../types"
import { validateSavedQuestionSetArtifact, toPublicQuestionSetArtifact } from "./save-artifact"

type QuestionSetArtifactSummaryListResult = {
  artifacts: QuestionSetArtifactManifest[]
  loadErrors: ArtifactLoadErrorRecord[]
}

async function readQuestionSetArtifact(
  directory: string,
  artifactID: string,
): Promise<SavedQuestionSetArtifact> {
  const safeArtifactID = ArtifactPath.sanitizeArtifactID(artifactID)
  const parsedArtifact = await readArtifactJsonFile({
    directory,
    kind: ARTIFACT_KINDS.questionSet,
    artifactID: safeArtifactID,
    relativePath: ARTIFACT_CONTENT_FILES.questionSet,
    schema: SavedQuestionSetArtifactSchema,
  })
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

async function listQuestionSetArtifactSummaries(
  directory: string,
): Promise<QuestionSetArtifactSummaryListResult> {
  const result = await listArtifactManifests({
    directory,
    kind: ARTIFACT_KINDS.questionSet,
    schema: QuestionSetArtifactManifestSchema,
  })
  return {
    artifacts: result.items,
    loadErrors: result.loadErrors,
  }
}

export {
  readQuestionSetArtifact,
  readPublicQuestionSetArtifact,
  listQuestionSetArtifactSummaries,
}

export type { QuestionSetArtifactSummaryListResult }
