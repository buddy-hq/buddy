import z from "zod"
import { SnapshotQuerySchema, WorkspaceRecordArtifactKindSchema } from "../../../learner-model"
import { readTeachingSessionState } from "../../../agent-execution/state/session-state"
import { SURFACES } from "../../../shared/teaching-vocabulary"

export const LearnerWorkspacePatchSchema = z.object({
  workspace: z
    .object({
      label: z.string().optional(),
      tags: z.array(z.string()).optional(),
      pinnedGoalIds: z.array(z.string()).optional(),
      projectConstraints: z.array(z.string()).optional(),
      localToolAvailability: z.array(z.string()).optional(),
      preferredSurfaces: z.array(z.enum(SURFACES)).optional(),
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

export function readWorkspaceStateFromSession(input: { directory: string; sessionId?: string }) {
  if (!input.sessionId) return "chat" as const
  return readTeachingSessionState(input.directory, input.sessionId)?.workspaceState ?? "chat"
}
