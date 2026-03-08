import type { LearnerArtifactKind } from "../types.js"
import {
  AssessmentArtifactSchema,
  DecisionArtifactSchema,
  EvidenceArtifactSchema,
  FeedbackArtifactSchema,
  GoalArtifactSchema,
  MessageArtifactSchema,
  PracticeArtifactSchema,
  WorkspaceRecordArtifactKindSchema,
  MisconceptionArtifactSchema,
} from "../types.js"

export const WORKSPACE_ARTIFACT_KINDS = WorkspaceRecordArtifactKindSchema.options

export function schemaForKind(kind: Exclude<LearnerArtifactKind, "workspace-context" | "profile">) {
  if (kind === "goal") return GoalArtifactSchema
  if (kind === "message") return MessageArtifactSchema
  if (kind === "practice") return PracticeArtifactSchema
  if (kind === "assessment") return AssessmentArtifactSchema
  if (kind === "evidence") return EvidenceArtifactSchema
  if (kind === "feedback") return FeedbackArtifactSchema
  if (kind === "misconception") return MisconceptionArtifactSchema
  return DecisionArtifactSchema
}
