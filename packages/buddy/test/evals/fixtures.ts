import type { LearnerPromptDigest, TeachingSessionState } from "../../src/learning/runtime/types.js"

export function createDigest(overrides?: Partial<LearnerPromptDigest>): LearnerPromptDigest {
  return {
    coldStart: false,
    workspaceLabel: "Repo",
    workspaceTags: ["tauri"],
    relevantGoalIds: ["goal_1"],
    recommendedNextAction: "guided-practice",
    constraintsSummary: ["Time: short session"],
    openFeedbackActions: [],
    sessionPlanSummary: ["Practice is the next best step."],
    alignmentSummary: [],
    tier1: [],
    tier2: [],
    tier3: [],
    ...overrides,
  }
}

export function createSession(overrides?: Partial<TeachingSessionState>): TeachingSessionState {
  return {
    sessionId: "ses_eval",
    persona: "buddy",
    intentOverride: "practice",
    currentSurface: "curriculum",
    workspaceState: "chat",
    focusGoalIds: ["goal_1"],
    ...overrides,
  }
}
