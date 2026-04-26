import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import {
  PERSONAS,
  PERSONA_SURFACES,
  WORKSPACE_STATES,
} from "@buddy/backend/learning/shared/teaching-vocabulary"
import { directoryQuerySchema, routeErrors, withDirectoryRoute, zodIssuesResponse } from "../http"
import {
  EvidenceArtifactSchema,
  FeedbackArtifactSchema,
  GoalArtifactSchema,
  LearnerArtifactSchema,
  MisconceptionArtifactSchema,
  ProfileArtifactSchema,
  WorkspaceContextArtifactSchema,
  WorkspaceRecordArtifactKindSchema,
} from "../learning/learner-model/repository/types"
import { getWorkspaceSnapshot, listArtifacts } from "../learning/learner-model"
import { patchWorkspace } from "../learning/learner-model/workflows/workspace"
import {
  LearnerWorkspacePatchSchema,
  parseArtifactListQuery,
  parseSnapshotQuery,
  readWorkspaceStateFromSession,
} from "../learning/adapters/http/learner-model/http-request"

const learnerSnapshotQuerySchema = directoryQuerySchema.extend({
  persona: z.enum(PERSONAS).optional(),
  goalId: z.union([z.string(), z.array(z.string())]).optional(),
  sessionId: z.string().optional(),
  workspaceState: z.enum(WORKSPACE_STATES).optional(),
})

const runtimeProfileSchema = z.object({
  persona: z.enum(PERSONAS),
  capabilityEnvelope: z.object({
    visibleSurfaces: z.array(z.enum(PERSONA_SURFACES)),
    defaultSurface: z.enum(PERSONA_SURFACES),
    tools: z.record(z.string(), z.enum(["allow", "deny"])),
    subagents: z.record(z.string(), z.enum(["allow", "deny", "prefer"])),
    skills: z.record(z.string(), z.enum(["allow", "deny"])),
  }),
})

const learnerSnapshotResponseSchema = z.object({
  workspace: WorkspaceContextArtifactSchema,
  profile: ProfileArtifactSchema,
  goals: z.array(GoalArtifactSchema),
  activeMisconceptions: z.array(MisconceptionArtifactSchema),
  openFeedback: z.array(FeedbackArtifactSchema),
  recentEvidence: z.array(EvidenceArtifactSchema),
  constraintsSummary: z.array(z.string()),
  sections: z.array(
    z.object({
      title: z.string(),
      items: z.array(z.string()),
    }),
  ),
  markdown: z.string(),
  decisionInputFingerprint: z.string(),
  runtimeContext: z.object({
    workspaceState: z.enum(WORKSPACE_STATES),
  }),
  runtimeProfile: runtimeProfileSchema,
})

const learnerArtifactsResponseSchema = z.object({
  artifacts: z.array(LearnerArtifactSchema),
})

const learnerWorkspaceResponseSchema = z.object({
  workspace: WorkspaceContextArtifactSchema,
  profile: ProfileArtifactSchema,
})

export const LearnerRoutes = new Hono()
  .get(
    "/snapshot",
    describeRoute({
      operationId: "learner.snapshot",
      summary: "Get learner snapshot",
      responses: {
        200: {
          description: "Learner snapshot",
          content: { "application/json": { schema: resolver(learnerSnapshotResponseSchema) } },
        },
        ...routeErrors(400, 403),
      },
    }),
    validator("query", learnerSnapshotQuerySchema),
    async (c) =>
      withDirectoryRoute(c, async (context) => {
        const parsed = parseSnapshotQuery(context.requestURL)
        if (!parsed.success) {
          return zodIssuesResponse(parsed.error)
        }

        const snapshot = await getWorkspaceSnapshot({
          directory: context.directory,
          query: {
            ...parsed.data,
            workspaceState:
              parsed.data.workspaceState ??
              readWorkspaceStateFromSession({
                directory: context.directory,
                sessionId: parsed.data.sessionId,
              }),
          },
        })
        return c.json(snapshot)
      }),
  )
  .get(
    "/artifacts",
    describeRoute({
      operationId: "learner.artifacts",
      summary: "List learner artifacts",
      responses: {
        200: {
          description: "Artifact list",
          content: { "application/json": { schema: resolver(learnerArtifactsResponseSchema) } },
        },
        ...routeErrors(400, 403),
      },
    }),
    validator(
      "query",
      directoryQuerySchema.extend({
        kind: WorkspaceRecordArtifactKindSchema.optional(),
        goalId: z.string().optional(),
        status: z.string().optional(),
        includeRaw: z.union([z.literal("true"), z.literal("false")]).optional(),
      }),
    ),
    async (c) =>
      withDirectoryRoute(c, async (context) => {
        const parsed = parseArtifactListQuery(context.requestURL)
        if (!parsed.success) {
          return zodIssuesResponse(parsed.error)
        }

        const artifacts = await listArtifacts({
          directory: context.directory,
          kind: parsed.data.kind,
          goalId: parsed.data.goalId,
          status: parsed.data.status,
          includeRaw: parsed.data.includeRaw,
        })

        return c.json({ artifacts })
      }),
  )
  .patch(
    "/workspace",
    describeRoute({
      operationId: "learner.workspace.patch",
      summary: "Patch learner workspace and profile",
      responses: {
        200: {
          description: "Updated workspace/profile",
          content: { "application/json": { schema: resolver(learnerWorkspaceResponseSchema) } },
        },
        ...routeErrors(400, 403),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("json", LearnerWorkspacePatchSchema),
    async (c) =>
      withDirectoryRoute(c, async (context) => {
        const payload = c.req.valid("json")
        const patched = await patchWorkspace({
          directory: context.directory,
          workspace: payload.workspace,
          profile: payload.profile,
        })
        return c.json(patched)
      }),
  )
