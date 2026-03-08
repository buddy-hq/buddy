import z from "zod"
import {
  PERSONA_IDS,
  TEACHING_INTENT_IDS,
  WORKSPACE_STATES,
} from "../../learning/runtime/types.js"
import {
  DecisionPlanRequestSchema,
  SnapshotQuerySchema,
  WorkspaceRecordArtifactKindSchema,
} from "../../learning/learner/artifacts/types.js"
import { readTeachingSessionState } from "../../learning/runtime/session-state.js"

export const LearnerWorkspacePatchSchema = z.object({
  workspace: z
    .object({
      label: z.string().optional(),
      tags: z.array(z.string()).optional(),
      pinnedGoalIds: z.array(z.string()).optional(),
      projectConstraints: z.array(z.string()).optional(),
      localToolAvailability: z.array(z.string()).optional(),
      preferredSurfaces: z.array(z.enum(["chat", "curriculum", "editor", "figure", "quiz"])).optional(),
      motivationContext: z.string().optional(),
      opportunities: z.array(z.string()).optional(),
      userOverride: z.boolean().optional(),
    })
    .optional(),
  profile: z
    .object({
      background: z.array(z.string()).optional(),
      knownPrerequisites: z.array(z.string()).optional(),
      availableTimePatterns: z.array(z.string()).optional(),
      toolEnvironmentLimits: z.array(z.string()).optional(),
      motivationAnchors: z.array(z.string()).optional(),
      learnerPreferences: z.array(z.string()).optional(),
    })
    .optional(),
})

export const LearnerArtifactListQuerySchema = z.object({
  kind: WorkspaceRecordArtifactKindSchema.optional(),
  goalId: z.string().optional(),
  status: z.string().optional(),
  includeRaw: z.boolean().optional(),
})

const SnapshotQueryRequestSchema = z.object({
  persona: z.enum(PERSONA_IDS).optional(),
  intent: z.enum(TEACHING_INTENT_IDS).optional(),
  goalIds: z.array(z.string()).optional(),
  sessionId: z.string().optional(),
  workspaceState: z.enum(WORKSPACE_STATES).optional(),
})

const PlanRequestBodySchema = z.object({
  persona: z.enum(PERSONA_IDS).optional(),
  intent: z.enum(TEACHING_INTENT_IDS).optional(),
  goalIds: z.array(z.string()).optional(),
  sessionId: z.string().optional(),
  workspaceState: z.enum(WORKSPACE_STATES).optional(),
})

export function parseSnapshotQuery(requestURL: URL) {
  const query = requestURL.searchParams
  return SnapshotQuerySchema.safeParse({
    persona: query.get("persona") ?? undefined,
    intent: query.get("intent") ?? undefined,
    focusGoalIds: query.has("goalId") ? query.getAll("goalId") : undefined,
    sessionId: query.get("sessionId") ?? undefined,
    workspaceState: query.get("workspaceState") ?? undefined,
  })
}

export function parseArtifactListQuery(requestURL: URL) {
  const query = requestURL.searchParams
  const includeRaw = query.get("includeRaw")
  return LearnerArtifactListQuerySchema.safeParse({
    kind: query.get("kind") ?? undefined,
    goalId: query.get("goalId") ?? undefined,
    status: query.get("status") ?? undefined,
    includeRaw: includeRaw === null ? undefined : includeRaw === "true",
  })
}

export function parseDecisionPlanRequest(input: {
  requestURL: URL
  body: unknown
}) {
  const queryResult = SnapshotQueryRequestSchema.safeParse({
    persona: input.requestURL.searchParams.get("persona") ?? undefined,
    intent: input.requestURL.searchParams.get("intent") ?? undefined,
    goalIds: input.requestURL.searchParams.has("goalId")
      ? input.requestURL.searchParams.getAll("goalId")
      : undefined,
    sessionId: input.requestURL.searchParams.get("sessionId") ?? undefined,
    workspaceState: input.requestURL.searchParams.get("workspaceState") ?? undefined,
  })
  if (!queryResult.success) {
    return queryResult
  }

  const bodyResult = PlanRequestBodySchema.safeParse(input.body)
  if (!bodyResult.success) {
    return bodyResult
  }

  return DecisionPlanRequestSchema.safeParse({
    persona: bodyResult.data.persona ?? queryResult.data.persona,
    intent: bodyResult.data.intent ?? queryResult.data.intent,
    focusGoalIds: bodyResult.data.goalIds ?? queryResult.data.goalIds,
    sessionId: bodyResult.data.sessionId ?? queryResult.data.sessionId,
    workspaceState: bodyResult.data.workspaceState ?? queryResult.data.workspaceState,
  })
}

export function readWorkspaceStateFromSession(input: { directory: string; sessionId?: string }) {
  if (!input.sessionId) return "chat" as const
  return readTeachingSessionState(input.directory, input.sessionId)?.workspaceState ?? "chat"
}
