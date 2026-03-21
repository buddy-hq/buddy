import { LearnerArtifactStore } from './repository/store'
import type { SnapshotQuery, WorkspaceRecordArtifactKind } from './repository/types'
import { LearnerSnapshotCompiler, type LearnerSnapshot } from './projections/snapshot'
import { recordAssessmentEvent } from './workflows/record-assessment'
import { recordLearnerMessageEvent } from './workflows/observe-message'
import { ensurePlanDecision } from './workflows/plan'
import { recordPracticeEvent } from './workflows/record-practice'
import { ensureWorkspaceContext, patchWorkspace, replaceGoalSet } from './workflows/workspace'
export { ensureWorkspaceContext, patchWorkspace, replaceGoalSet }
export { recordLearnerMessageEvent, recordPracticeEvent, recordAssessmentEvent, ensurePlanDecision }
export { learnerTools } from './tools/tools'
export { ensureLearnerToolsRegistered } from './tools/register'
export { LearnerArtifactPath } from './repository/path'
export { LearnerArtifactStore } from './repository/store'
export { hashDecisionInput } from './repository/bridge'
export {
  DecisionArtifactSchema,
  DecisionPlanRequestSchema,
  EvidenceArtifactSchema,
  FeedbackArtifactSchema,
  GoalArtifactSchema,
  LearnerArtifactSchema,
  MisconceptionArtifactSchema,
  ProfileArtifactSchema,
  SnapshotPlanSchema,
  SnapshotQuerySchema,
  WorkspaceContextArtifactSchema,
  WorkspaceRecordArtifactKindSchema,
} from './repository/types'
export { SessionPlanSchema } from './model/types'
export type { GoalArtifact, SnapshotQuery, WorkspaceRecordArtifactKind } from './repository/types'
export type { LearnerSnapshot } from './projections/snapshot'

export async function getWorkspaceSnapshot(input: {
  directory: string
  query: SnapshotQuery
}): Promise<LearnerSnapshot> {
  return LearnerSnapshotCompiler.compile({
    directory: input.directory,
    query: input.query,
  })
}

export async function listArtifacts(input: {
  directory: string
  kind?: WorkspaceRecordArtifactKind
  goalId?: string
  status?: string
  includeRaw?: boolean
}) {
  return LearnerArtifactStore.listArtifacts(input)
}

export async function runSafetySweep() {
  await LearnerArtifactStore.ensureProfile()
  return {
    feedbackUpdated: false,
  }
}

export const LearnerService = {
  ensureWorkspaceContext,
  getWorkspaceSnapshot,
  listArtifacts,
  patchWorkspace,
  replaceGoalSet,
  recordLearnerMessageEvent,
  recordPracticeEvent,
  recordAssessmentEvent,
  ensurePlanDecision,
  runSafetySweep,
}
