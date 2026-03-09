import type { Context } from "hono"
import { Hono } from "hono"
import { resolver } from "hono-openapi"
import z from "zod"
import { PERSONA_IDS, TEACHING_INTENT_IDS } from "../learning/agents/core/runtime/vocabulary"
import {
  ArtifactsRequestSchema,
  ArtifactsResponseSchema,
  ErrorSchema,
  LearnerSnapshotSchema,
  PlanRequestSchema,
  PlanResponseSchema,
  WorkspaceRequestSchema,
  WorkspaceResponseSchema,
} from "../openapi"
import { compatibilityRoute } from "../openapi"
import { directoryParameters } from "../http"
import { zodIssuesResponse } from "../http"
import { withDirectoryContext, withJsonBody } from "../http"
import {
  ensurePlanDecision,
  getWorkspaceSnapshot,
  listArtifacts,
  patchWorkspace,
} from "../learning/learner-model"
import {
  LearnerWorkspacePatchSchema,
  parseArtifactListQuery,
  parseDecisionPlanRequest,
  parseSnapshotQuery,
  readWorkspaceStateFromSession,
} from "../learning/adapters/http"

const learnerContextQueryParameters = [
  ...directoryParameters,
  {
    in: "query" as const,
    name: "persona",
    schema: resolver(z.enum(PERSONA_IDS)),
  },
  {
    in: "query" as const,
    name: "intent",
    schema: resolver(z.enum(TEACHING_INTENT_IDS)),
  },
  {
    in: "query" as const,
    name: "goalId",
    schema: resolver(z.array(z.string())),
  },
  {
    in: "query" as const,
    name: "sessionId",
    schema: resolver(z.string()),
  },
  {
    in: "query" as const,
    name: "workspaceState",
    schema: resolver(z.enum(["chat", "interactive"])),
  },
]

const learnerSnapshotRoute = compatibilityRoute({
  operationId: "learner.snapshot",
  summary: "Get learner snapshot",
  parameters: learnerContextQueryParameters,
  responses: {
    200: {
      description: "Learner snapshot",
      content: { "application/json": { schema: LearnerSnapshotSchema } },
    },
    400: {
      description: "Invalid query parameters",
      content: { "application/json": { schema: ErrorSchema } },
    },
    403: {
      description: "Directory is outside allowed roots",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
})

const learnerPlanRoute = compatibilityRoute({
  operationId: "learner.plan",
  summary: "Create or reuse plan decision",
  parameters: learnerContextQueryParameters,
  requestBody: {
    required: false,
    content: {
      "application/json": {
        schema: PlanRequestSchema,
      },
    },
  },
  responses: {
    200: {
      description: "Plan decision",
      content: { "application/json": { schema: PlanResponseSchema } },
    },
    400: {
      description: "Invalid request",
      content: { "application/json": { schema: ErrorSchema } },
    },
    403: {
      description: "Directory is outside allowed roots",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
})

const learnerArtifactsRoute = compatibilityRoute({
  operationId: "learner.artifacts",
  summary: "List learner artifacts",
  parameters: [
    ...directoryParameters,
    {
      in: "query" as const,
      name: "kind",
      schema: ArtifactsRequestSchema.properties.kind,
    },
    {
      in: "query" as const,
      name: "goalId",
      schema: ArtifactsRequestSchema.properties.goalId,
    },
    {
      in: "query" as const,
      name: "status",
      schema: ArtifactsRequestSchema.properties.status,
    },
    {
      in: "query" as const,
      name: "includeRaw",
      schema: ArtifactsRequestSchema.properties.includeRaw,
    },
  ],
  responses: {
    200: {
      description: "Artifact list",
      content: { "application/json": { schema: ArtifactsResponseSchema } },
    },
    400: {
      description: "Invalid query parameters",
      content: { "application/json": { schema: ErrorSchema } },
    },
    403: {
      description: "Directory is outside allowed roots",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
})

const learnerWorkspacePatchRoute = compatibilityRoute({
  operationId: "learner.workspace.patch",
  summary: "Patch learner workspace and profile",
  parameters: directoryParameters,
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: WorkspaceRequestSchema,
      },
    },
  },
  responses: {
    200: {
      description: "Updated workspace/profile",
      content: { "application/json": { schema: WorkspaceResponseSchema } },
    },
    400: {
      description: "Invalid request",
      content: { "application/json": { schema: ErrorSchema } },
    },
    403: {
      description: "Directory is outside allowed roots",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
})

function shouldGenerateDecision(value: unknown) {
  if (!value || typeof value !== "object") return false
  const candidate = value as { generateDecision?: unknown }
  return candidate.generateDecision === true
}

async function learnerSnapshotHandler(c: Context): Promise<Response> {
  const contextResult = withDirectoryContext(c.req.raw)
  if (!contextResult.ok) return contextResult.response

  const parsed = parseSnapshotQuery(contextResult.value.requestURL)
  if (!parsed.success) {
    return zodIssuesResponse(parsed.error)
  }

  const snapshot = await getWorkspaceSnapshot({
    directory: contextResult.value.directory,
    query: {
      ...parsed.data,
      workspaceState:
        parsed.data.workspaceState ??
        readWorkspaceStateFromSession({
          directory: contextResult.value.directory,
          sessionId: parsed.data.sessionId,
        }),
    },
  })
  return c.json(snapshot)
}

async function learnerPlanHandler(c: Context): Promise<Response> {
  const contextResult = withDirectoryContext(c.req.raw)
  if (!contextResult.ok) return contextResult.response

  const bodyResult = await withJsonBody(c.req.raw, {
    optional: true,
    fallbackBody: {},
  })
  if (!bodyResult.ok) return bodyResult.response
  const allowGenerate = shouldGenerateDecision(bodyResult.value)

  const parsed = parseDecisionPlanRequest({
    requestURL: contextResult.value.requestURL,
    body: bodyResult.value,
  })
  if (!parsed.success) {
    return zodIssuesResponse(parsed.error)
  }

  const decision = await ensurePlanDecision({
    directory: contextResult.value.directory,
    query: {
      ...parsed.data,
      workspaceState:
        parsed.data.workspaceState ??
        readWorkspaceStateFromSession({
          directory: contextResult.value.directory,
          sessionId: parsed.data.sessionId,
        }),
    },
    allowGenerate,
  })
  return c.json(decision)
}

async function learnerArtifactsHandler(c: Context): Promise<Response> {
  const contextResult = withDirectoryContext(c.req.raw)
  if (!contextResult.ok) return contextResult.response

  const parsed = parseArtifactListQuery(contextResult.value.requestURL)
  if (!parsed.success) {
    return zodIssuesResponse(parsed.error)
  }

  const artifacts = await listArtifacts({
    directory: contextResult.value.directory,
    kind: parsed.data.kind,
    goalId: parsed.data.goalId,
    status: parsed.data.status,
    includeRaw: parsed.data.includeRaw,
  })

  return c.json({ artifacts })
}

async function learnerWorkspacePatchHandler(c: Context): Promise<Response> {
  const contextResult = withDirectoryContext(c.req.raw)
  if (!contextResult.ok) return contextResult.response

  const bodyResult = await withJsonBody(c.req.raw)
  if (!bodyResult.ok) return bodyResult.response

  const parsed = LearnerWorkspacePatchSchema.safeParse(bodyResult.value)
  if (!parsed.success) {
    return zodIssuesResponse(parsed.error)
  }

  const patched = await patchWorkspace({
    directory: contextResult.value.directory,
    workspace: parsed.data.workspace,
    profile: parsed.data.profile,
  })

  return c.json(patched)
}

export const LearnerRoutes = (): Hono =>
  new Hono()
    .get("/snapshot", learnerSnapshotRoute, learnerSnapshotHandler)
    .post("/plan", learnerPlanRoute, learnerPlanHandler)
    .get("/artifacts", learnerArtifactsRoute, learnerArtifactsHandler)
    .patch("/workspace", learnerWorkspacePatchRoute, learnerWorkspacePatchHandler)
