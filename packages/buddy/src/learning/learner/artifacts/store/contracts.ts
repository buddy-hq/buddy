import type {
  AssessmentArtifact,
  DecisionArtifact,
  EvidenceArtifact,
  FeedbackArtifact,
  GoalArtifact,
  MessageArtifact,
  MisconceptionArtifact,
  PracticeArtifact,
} from "../types.js"

export type ArtifactRecord =
  | GoalArtifact
  | MessageArtifact
  | PracticeArtifact
  | AssessmentArtifact
  | EvidenceArtifact
  | FeedbackArtifact
  | MisconceptionArtifact
  | DecisionArtifact

export type ArtifactRecordWithRaw = ArtifactRecord & { raw: string }
