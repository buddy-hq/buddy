import { resolver } from "hono-openapi"
import z from "zod"
import { PERSONA_IDS, TEACHING_INTENT_IDS } from "../../learning/runtime/types.js"
import {
  AnyObjectSchema,
  ErrorSchema,
  LearnerPlanResponseSchema,
  LearnerSnapshotSchema,
} from "../../openapi/compatibility-schemas.js"
import { compatibilityRoute } from "../../openapi/compatibility-route.js"
import { LearnerArtifactListQuerySchema, LearnerWorkspacePatchSchema } from "../handlers/learner.js"
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
        schema: AnyObjectSchema,
      },
    },
  },
  responses: {
    200: {
      description: "Plan decision",
      content: { "application/json": { schema: LearnerPlanResponseSchema } },
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
      schema: resolver(LearnerArtifactListQuerySchema.shape.kind.unwrap()),
    },
    {
      in: "query" as const,
      name: "goalId",
      schema: resolver(z.string()),
    },
    {
      in: "query" as const,
      name: "status",
      schema: resolver(z.string()),
    },
    {
      in: "query" as const,
      name: "includeRaw",
      schema: resolver(z.boolean()),
    },
  ],
  responses: {
    200: {
      description: "Artifact list",
      content: { "application/json": { schema: AnyObjectSchema } },
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
        schema: resolver(LearnerWorkspacePatchSchema),
      },
    },
  },
  responses: {
    200: {
      description: "Updated workspace/profile",
      content: { "application/json": { schema: AnyObjectSchema } },
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
