import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { directoryQuerySchema, routeErrors, runRouteTask, withDirectoryRoute } from "../http"
import { assertSessionExistsInDirectory } from "../session"
import { BUDDY_OBJECT_KIND_VALUES } from "../objects"
import {
  BenchContextSnapshotMissingError,
  BenchReadContextOutputSchema,
  PublishBenchContextResponseSchema,
  publishBenchContext,
  readBenchContext,
} from "../learning/features/bench/context"

const sessionIDParamSchema = z.object({
  sessionID: z.string().min(1),
})

const nullableStringOpenApiSchema = {
  type: "string" as const,
  nullable: true,
}

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
      enum: BUDDY_OBJECT_KIND_VALUES,
    },
    objectID: { type: "string" as const },
    revisionID: nullableStringOpenApiSchema,
    itemID: nullableStringOpenApiSchema,
  },
}

const workspaceFileBenchContextTargetOpenApiSchema = {
  type: "object" as const,
  required: [
    "type",
    "title",
    "workspaceRoot",
    "path",
    "absolutePath",
    "route",
    "status",
  ],
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
  required: ["status", "target", "metadata", "content", "refs", "hints"],
  additionalProperties: false,
  properties: {
    status: { type: "string" as const, enum: ["open"] },
    target: benchContextTargetOpenApiSchema,
    metadata: stringArrayOpenApiSchema,
    content: { type: "string" as const },
    refs: {
      type: "array" as const,
      items: benchContextRefOpenApiSchema,
    },
    hints: stringArrayOpenApiSchema,
  },
}

const benchReadContextOutputOpenApiSchema = {
  oneOf: [closedBenchContextOpenApiSchema, openBenchContextOpenApiSchema],
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
          "application/json": { schema: benchReadContextOutputOpenApiSchema },
        },
      },
      responses: {
        200: {
          description: "Stored Bench context revision",
          content: {
            "application/json": { schema: resolver(PublishBenchContextResponseSchema) },
          },
        },
        ...routeErrors(400, 403, 404),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", sessionIDParamSchema),
    validator("json", BenchReadContextOutputSchema),
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
            const snapshot = publishBenchContext({
              directory: context.directory,
              sessionID,
              value: c.req.valid("json"),
            })
            return c.json(PublishBenchContextResponseSchema.parse({ revision: snapshot.revision }))
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
