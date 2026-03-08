import { resolver } from "hono-openapi"
import z from "zod"
import { PERSONA_IDS, TEACHING_INTENT_IDS } from "../../learning/runtime/types.js"
import {
  ArtifactsRequestSchema,
  ArtifactsResponseSchema,
  ErrorSchema,
  LearnerSnapshotSchema,
  PlanRequestSchema,
  PlanResponseSchema,
  WorkspaceRequestSchema,
  WorkspaceResponseSchema,
} from "../../openapi/compatibility-schemas.js"
import { compatibilityRoute } from "../../openapi/compatibility-route.js"
import { directoryParameters } from "../shared/openapi.js"

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

export {
  learnerArtifactsRoute,
  learnerPlanRoute,
  learnerSnapshotRoute,
  learnerWorkspacePatchRoute,
}
