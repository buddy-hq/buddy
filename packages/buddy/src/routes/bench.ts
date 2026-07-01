import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import type { DescribeRouteOptions } from "hono-openapi"
import z from "zod"
import { directoryQuerySchema, routeErrors, runRouteTask, withDirectoryRoute } from "../http"
import { assertSessionExistsInDirectory } from "../session"
import { BUDDY_OBJECT_KIND_VALUES } from "../objects"
import {
  BenchContextSnapshotMissingError,
  BenchContextWriteConflictError,
  PublishBenchContextInputSchema,
  PublishBenchContextResponseSchema,
  publishSequencedBenchContext,
  readBenchContext,
} from "../learning/features/bench/context"
import {
  BenchClientActionCompletionResponseSchema,
  BenchClientActionCompletionSchema,
  BenchClientLeaseConflictError,
  BenchClientLeaseReleaseResponseSchema,
  benchClientActionBroker,
} from "../learning/features/bench/client-actions"

const sessionIDParamSchema = z.object({
  sessionID: z.string().min(1),
})

const actionIDParamSchema = z.object({
  actionID: z.string().min(1),
})

const clientLeaseParamSchema = z.object({
  instanceID: z.string().min(1),
})

const clientLeaseReleaseQuerySchema = directoryQuerySchema.extend({
  generation: z.coerce.number().int().nonnegative(),
  leaseEpoch: z.coerce.number().int().positive(),
})

const nullableStringOpenApiSchema = {
  type: "string" as const,
  nullable: true,
}

type OpenApiRequestBodyObject = Extract<
  NonNullable<DescribeRouteOptions["requestBody"]>,
  { content: unknown }
>
type OpenApiRequestBodySchema = NonNullable<OpenApiRequestBodyObject["content"][string]["schema"]>

const stringArrayOpenApiSchema = {
  type: "array" as const,
  items: { type: "string" as const },
}

const benchContextStatusOpenApiSchema = {
  type: "string" as const,
  enum: ["ready", "loading", "dirty", "error", "unavailable"],
}

const buddyObjectRefOpenApiSchema = {
  type: "object" as const,
  required: ["kind", "objectID", "revisionID", "itemID"],
  additionalProperties: false,
  properties: {
    kind: {
      type: "string" as const,
      enum: [...BUDDY_OBJECT_KIND_VALUES],
    },
    objectID: { type: "string" as const },
    revisionID: nullableStringOpenApiSchema,
    itemID: nullableStringOpenApiSchema,
  },
}

const workspaceFileBenchContextTargetOpenApiSchema = {
  type: "object" as const,
  required: ["type", "title", "workspaceRoot", "path", "absolutePath", "route", "status"],
  additionalProperties: false,
  properties: {
    type: { type: "string" as const, enum: ["workspace-file"] },
    title: { type: "string" as const },
    workspaceRoot: { type: "string" as const },
    path: { type: "string" as const },
    absolutePath: { type: "string" as const },
    route: { type: "string" as const },
    status: benchContextStatusOpenApiSchema,
  },
}

const objectBenchContextTargetOpenApiSchema = {
  type: "object" as const,
  required: ["type", "title", "workspaceRoot", "ref", "viewID", "route", "status"],
  additionalProperties: false,
  properties: {
    type: { type: "string" as const, enum: ["object"] },
    title: { type: "string" as const },
    workspaceRoot: { type: "string" as const },
    ref: buddyObjectRefOpenApiSchema,
    viewID: { type: "string" as const },
    route: { type: "string" as const },
    status: benchContextStatusOpenApiSchema,
  },
}

const benchContextTargetOpenApiSchema = {
  oneOf: [workspaceFileBenchContextTargetOpenApiSchema, objectBenchContextTargetOpenApiSchema],
}

const workspaceFileBenchTargetOpenApiSchema = {
  type: "object" as const,
  required: ["type", "path", "viewer"],
  additionalProperties: false,
  properties: {
    type: { type: "string" as const, enum: ["workspace-file"] },
    path: { type: "string" as const },
    viewer: { type: "string" as const, enum: ["markdown", "file"] },
  },
}

const objectBenchTargetOpenApiSchema = {
  type: "object" as const,
  required: ["type", "ref", "viewID"],
  additionalProperties: false,
  properties: {
    type: { type: "string" as const, enum: ["object"] },
    ref: buddyObjectRefOpenApiSchema,
    viewID: { type: "string" as const },
  },
}

const benchTargetOpenApiSchema: OpenApiRequestBodySchema = {
  oneOf: [workspaceFileBenchTargetOpenApiSchema, objectBenchTargetOpenApiSchema],
}

const benchRouteSnapshotOpenApiSchema: OpenApiRequestBodySchema = {
  oneOf: [
    {
      type: "object" as const,
      required: ["status"],
      additionalProperties: false,
      properties: {
        status: { type: "string" as const, enum: ["closed"] },
      },
    },
    {
      type: "object" as const,
      required: ["status", "target", "mode"],
      additionalProperties: false,
      properties: {
        status: { type: "string" as const, enum: ["open"] },
        target: benchTargetOpenApiSchema,
        mode: { type: "string" as const, enum: ["docked", "floating"] },
      },
    },
  ],
}

const benchClientLeaseIdentityOpenApiSchema = {
  type: "object" as const,
  required: ["instanceID", "generation", "leaseEpoch"],
  additionalProperties: false,
  properties: {
    instanceID: { type: "string" as const },
    generation: { type: "integer" as const, minimum: 0 },
    leaseEpoch: { type: "integer" as const, minimum: 0 },
  },
}

const benchContextRefOpenApiSchema = {
  type: "object" as const,
  required: ["kind", "value", "note"],
  additionalProperties: false,
  properties: {
    kind: { type: "string" as const, enum: ["file", "object", "resource", "tool", "url"] },
    value: { type: "string" as const },
    note: { type: "string" as const },
  },
}

const benchDrawerContextOpenApiSchema: OpenApiRequestBodySchema = {
  oneOf: [
    {
      type: "object" as const,
      required: ["kind", "presentation"],
      additionalProperties: false,
      properties: {
        kind: { type: "string" as const, enum: ["explorer", "library"] },
        presentation: { type: "string" as const, enum: ["drawer"] },
      },
    },
    { type: "null" as const },
  ],
}

const closedBenchContextOpenApiSchema = {
  type: "object" as const,
  required: ["status"],
  additionalProperties: false,
  properties: {
    status: { type: "string" as const, enum: ["closed"] },
  },
}

const openBenchContextOpenApiSchema = {
  type: "object" as const,
  required: ["status", "target", "drawer", "metadata", "content", "refs", "hints"],
  additionalProperties: false,
  properties: {
    status: { type: "string" as const, enum: ["open"] },
    target: benchContextTargetOpenApiSchema,
    drawer: benchDrawerContextOpenApiSchema,
    metadata: stringArrayOpenApiSchema,
    content: { type: "string" as const },
    refs: {
      type: "array" as const,
      items: benchContextRefOpenApiSchema,
    },
    hints: stringArrayOpenApiSchema,
  },
}

const benchReadContextOutputOpenApiSchema: OpenApiRequestBodySchema = {
  oneOf: [closedBenchContextOpenApiSchema, openBenchContextOpenApiSchema],
}

const publishBenchContextInputOpenApiSchema: OpenApiRequestBodySchema = {
  type: "object" as const,
  required: ["lease", "publicationSequence", "idempotencyKey", "value"],
  additionalProperties: false,
  properties: {
    lease: benchClientLeaseIdentityOpenApiSchema,
    publicationSequence: { type: "integer" as const, minimum: 1 },
    idempotencyKey: { type: "string" as const },
    value: benchReadContextOutputOpenApiSchema,
  },
}

const committedBenchClientActionCompletionOpenApiSchema: OpenApiRequestBodySchema = {
  type: "object" as const,
  required: [
    "outcome",
    "lease",
    "publicationSequence",
    "observedRoute",
    "observedVisibility",
    "drawer",
    "context",
    "changed",
  ],
  additionalProperties: false,
  properties: {
    outcome: { type: "string" as const, enum: ["committed"] },
    lease: benchClientLeaseIdentityOpenApiSchema,
    publicationSequence: { type: "integer" as const, minimum: 1 },
    observedRoute: benchRouteSnapshotOpenApiSchema,
    observedVisibility: { type: "string" as const, enum: ["visible", "parked", "closed"] },
    drawer: { type: ["string", "null"] as const, enum: ["explorer", "library", null] },
    context: benchReadContextOutputOpenApiSchema,
    changed: { type: "boolean" as const },
  },
}

const terminalBenchClientActionCompletionOpenApiSchema: OpenApiRequestBodySchema = {
  type: "object" as const,
  required: ["outcome", "lease", "reason"],
  additionalProperties: false,
  properties: {
    outcome: {
      type: "string" as const,
      enum: ["blocked", "failed", "inactive_session", "superseded"],
    },
    lease: benchClientLeaseIdentityOpenApiSchema,
    reason: {
      type: "string" as const,
      enum: [
        "leave_guard_blocked",
        "navigation_failed",
        "context_sync_failed",
        "session_inactive",
        "newer_command",
      ],
    },
    observedRoute: benchRouteSnapshotOpenApiSchema,
    observedVisibility: { type: "string" as const, enum: ["visible", "parked", "closed"] },
    drawer: { type: ["string", "null"] as const, enum: ["explorer", "library", null] },
  },
}

const benchClientActionCompletionOpenApiSchema: OpenApiRequestBodySchema = {
  oneOf: [
    committedBenchClientActionCompletionOpenApiSchema,
    terminalBenchClientActionCompletionOpenApiSchema,
  ],
}

const storedBenchContextSnapshotOpenApiSchema = {
  type: "object" as const,
  required: ["revision", "value"],
  additionalProperties: false,
  properties: {
    revision: { type: "integer" as const, minimum: 0 },
    value: benchReadContextOutputOpenApiSchema,
  },
}

function mapBenchRouteError(error: unknown): Response | undefined {
  if (error instanceof BenchContextSnapshotMissingError) {
    return Response.json({ error: error.message }, { status: 404 })
  }
  if (
    error instanceof BenchContextWriteConflictError ||
    error instanceof BenchClientLeaseConflictError
  ) {
    return Response.json({ error: error.message }, { status: 409 })
  }
  return undefined
}

export const BenchRoutes = new Hono()
  .put(
    "/session/:sessionID/context",
    describeRoute({
      operationId: "bench.context.publish",
      summary: "Publish the current frontend-authored Bench context snapshot",
      requestBody: {
        required: true,
        content: {
          "application/json": { schema: publishBenchContextInputOpenApiSchema },
        },
      },
      responses: {
        200: {
          description: "Stored Bench context revision",
          content: {
            "application/json": { schema: resolver(PublishBenchContextResponseSchema) },
          },
        },
        ...routeErrors(400, 403, 404, 409),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", sessionIDParamSchema),
    validator("json", PublishBenchContextInputSchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const sessionID = c.req.valid("param").sessionID
            const body = c.req.valid("json")
            await assertSessionExistsInDirectory({
              directory: context.directory,
              sessionID,
              request: c.req.raw,
            })
            if (
              !benchClientActionBroker.validateLease({
                directory: context.directory,
                lease: body.lease,
              })
            ) {
              throw new BenchClientLeaseConflictError(
                "Bench client lease is no longer authoritative.",
              )
            }
            const snapshot = publishSequencedBenchContext({
              directory: context.directory,
              sessionID,
              body,
            })
            return c.json(PublishBenchContextResponseSchema.parse({ revision: snapshot.revision }))
          },
          mapError: mapBenchRouteError,
        }),
      ),
  )
  .delete(
    "/client-lease/:instanceID",
    describeRoute({
      operationId: "bench.clientLease.release",
      summary: "Release an authoritative Bench client lease",
      responses: {
        200: {
          description: "Release result",
          content: {
            "application/json": { schema: resolver(BenchClientLeaseReleaseResponseSchema) },
          },
        },
        ...routeErrors(400, 403),
      },
    }),
    validator("query", clientLeaseReleaseQuerySchema),
    validator("param", clientLeaseParamSchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const query = c.req.valid("query")
            const result = benchClientActionBroker.releaseLease({
              directory: context.directory,
              instanceID: c.req.valid("param").instanceID,
              generation: query.generation,
              leaseEpoch: query.leaseEpoch,
            })
            return c.json(BenchClientLeaseReleaseResponseSchema.parse(result))
          },
          mapError: mapBenchRouteError,
        }),
      ),
  )
  .post(
    "/client-actions/:actionID/complete",
    describeRoute({
      operationId: "bench.clientActions.complete",
      summary: "Complete a required Bench client action",
      requestBody: {
        required: true,
        content: {
          "application/json": { schema: benchClientActionCompletionOpenApiSchema },
        },
      },
      responses: {
        200: {
          description: "Completion result",
          content: {
            "application/json": { schema: resolver(BenchClientActionCompletionResponseSchema) },
          },
        },
        ...routeErrors(400, 403, 409),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", actionIDParamSchema),
    validator("json", BenchClientActionCompletionSchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const result = benchClientActionBroker.completeAction({
              directory: context.directory,
              actionID: c.req.valid("param").actionID,
              completion: c.req.valid("json"),
            })
            return c.json(BenchClientActionCompletionResponseSchema.parse(result))
          },
          mapError: mapBenchRouteError,
        }),
      ),
  )
  .get(
    "/session/:sessionID/context",
    describeRoute({
      operationId: "bench.context.read",
      summary: "Read the stored Bench context snapshot",
      responses: {
        200: {
          description: "Stored Bench context snapshot",
          content: {
            "application/json": { schema: storedBenchContextSnapshotOpenApiSchema },
          },
        },
        ...routeErrors(400, 403, 404),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", sessionIDParamSchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const sessionID = c.req.valid("param").sessionID
            await assertSessionExistsInDirectory({
              directory: context.directory,
              sessionID,
              request: c.req.raw,
            })
            return c.json(readBenchContext({ directory: context.directory, sessionID }))
          },
          mapError: mapBenchRouteError,
        }),
      ),
  )
