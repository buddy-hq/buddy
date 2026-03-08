import z from "zod"
import { PERSONA_IDS, TEACHING_INTENT_IDS } from "../../learning/runtime/types.js"
import { readTeachingSessionState } from "../../learning/runtime/session-state.js"
import { LearnerService } from "../../learning/learner/service.js"
import { LearnerStateQuerySchema } from "../../learning/learner/types.js"

export const CurriculumQuerySchema = z.object({
  persona: z.enum(PERSONA_IDS).optional(),
  intent: z.enum(TEACHING_INTENT_IDS).optional(),
  focusGoalIds: z.array(z.string()).optional(),
  sessionId: z.string().optional(),
})

export const LearnerContextPatchSchema = z.object({
  label: z.string().optional(),
  tags: z.array(z.string()).optional(),
  pinnedGoalIds: z.array(z.string()).optional(),
  projectConstraints: z.array(z.string()).optional(),
  localToolAvailability: z.array(z.string()).optional(),
  preferredSurfaces: z.array(z.enum(["chat", "curriculum", "editor", "figure", "quiz"])).optional(),
  motivationContext: z.string().optional(),
  opportunities: z.array(z.string()).optional(),
  userOverride: z.boolean().optional(),
  learnerConstraints: z
    .object({
      background: z.array(z.string()).optional(),
      knownPrerequisites: z.array(z.string()).optional(),
      availableTimePatterns: z.array(z.string()).optional(),
      toolEnvironmentLimits: z.array(z.string()).optional(),
      motivationAnchors: z.array(z.string()).optional(),
      opportunities: z.array(z.string()).optional(),
      learnerPreferences: z.array(z.string()).optional(),
    })
    .optional(),
})

export function parseLearnerStateQuery(input: {
  workspaceId: string
  goalIds: string[]
  conceptTags: string[]
  includeDerived: string | undefined
}) {
  return LearnerStateQuerySchema.safeParse({
    workspaceId: input.workspaceId,
    goalIds: input.goalIds,
    conceptTags: input.conceptTags,
    includeDerived: input.includeDerived ? input.includeDerived !== "false" : true,
  })
}

export async function readScopedLearnerProjections(directory: string) {
  const goalIds = new Set((await LearnerService.getWorkspaceGoals(directory)).map((goal) => goal.goalId))
  const state = await LearnerService.readState()
  const projections = state.projections.progress.length > 0 ? state.projections : await LearnerService.rebuildProjections()

  return {
    progress: projections.progress.filter((record) => goalIds.has(record.goalId)),
    review: projections.review.filter((record) => goalIds.has(record.goalId)),
  }
}

export function readWorkspaceStateFromSession(input: { directory: string; sessionId?: string }): "interactive" | "chat" {
  if (!input.sessionId) return "chat"
  return readTeachingSessionState(input.directory, input.sessionId)?.workspaceState ?? "chat"
}

export function buildLearnerStateQueryFromRequest(input: { requestURL: URL; workspaceId: string }) {
  const query = input.requestURL.searchParams
  return parseLearnerStateQuery({
    workspaceId: query.get("workspaceId") ?? input.workspaceId,
    goalIds: query.has("goalId") ? query.getAll("goalId") : [],
    conceptTags: query.has("conceptTag") ? query.getAll("conceptTag") : [],
    includeDerived: query.get("includeDerived") ?? undefined,
  })
}

export function parseCurriculumViewQuery(requestURL: URL) {
  const query = requestURL.searchParams
  return CurriculumQuerySchema.safeParse({
    persona: query.get("persona") ?? undefined,
    intent: query.get("intent") ?? undefined,
    focusGoalIds: query.has("goalId") ? query.getAll("goalId") : undefined,
    sessionId: query.get("sessionId") ?? undefined,
  })
}

export async function patchWorkspaceLearnerContext(input: {
  directory: string
  patch: z.infer<typeof LearnerContextPatchSchema>
}) {
  const { learnerConstraints, ...workspacePatch } = input.patch
  const [context, constraints] = await Promise.all([
    LearnerService.updateWorkspaceContext(input.directory, workspacePatch),
    learnerConstraints ? LearnerService.updateLearnerConstraints(learnerConstraints) : Promise.resolve(undefined),
  ])

  return {
    workspace: context,
    learnerConstraints: constraints,
  }
}
