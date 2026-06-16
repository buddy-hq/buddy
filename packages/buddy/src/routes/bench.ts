import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { directoryQuerySchema, routeErrors, runRouteTask, withDirectoryRoute } from "../http"
import { assertSessionExistsInDirectory } from "../session"
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

const benchContextTargetOpenApiSchema = {
  type: "object" as const,
  required: [
    "type",
    "artifactKind",
    "title",
    "workspaceRoot",
    "path",
    "absolutePath",
    "resourceID",
    "artifactID",
    "itemID",
    "route",
    "status",
  ],
  additionalProperties: false,
  properties: {
    type: {
      type: "string" as const,
      enum: ["reading", "markdown", "file", "whiteboard", "artifact"],
    },
    artifactKind: {
      type: "string" as const,
      enum: [
        "none",
        "mermaid",
        "html-widget",
        "figure",
        "freeform-figure",
        "media-presentation",
        "question-set",
        "flashcard-deck",
      ],
    },
    title: { type: ["string", "null"] as const },
    workspaceRoot: { type: "string" as const },
    path: { type: ["string", "null"] as const },
    absolutePath: { type: ["string", "null"] as const },
    resourceID: { type: ["string", "null"] as const },
    artifactID: { type: ["string", "null"] as const },
    itemID: { type: ["string", "null"] as const },
    route: { type: "string" as const },
    status: {
      type: "string" as const,
      enum: ["ready", "loading", "dirty", "error", "unavailable"],
    },
  },
}

const benchContextRefOpenApiSchema = {
  type: "object" as const,
  required: ["kind", "value", "note"],
  additionalProperties: false,
  properties: {
    kind: {
      type: "string" as const,
      enum: ["file", "artifact", "resource", "tool", "url"],
    },
    value: { type: "string" as const },
    note: { type: "string" as const },
  },
}

const benchReadContextClosedOutputOpenApiSchema = {
  type: "object" as const,
  required: ["status"],
  additionalProperties: false,
  properties: {
    status: { type: "string" as const, enum: ["closed"] },
  },
}

const benchReadContextOpenOutputOpenApiSchema = {
  type: "object" as const,
  required: ["status", "target", "metadata", "content", "refs", "hints"],
  additionalProperties: false,
  properties: {
    status: { type: "string" as const, enum: ["open"] },
    target: benchContextTargetOpenApiSchema,
    metadata: { type: "array" as const, items: { type: "string" as const } },
    content: { type: "string" as const },
    refs: { type: "array" as const, items: benchContextRefOpenApiSchema },
    hints: { type: "array" as const, items: { type: "string" as const } },
  },
}

const benchReadContextOutputOpenApiSchema = {
  anyOf: [
    benchReadContextClosedOutputOpenApiSchema,
    benchReadContextOpenOutputOpenApiSchema,
  ],
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
            "application/json": {
              schema: resolver(
                z
                  .object({
                    revision: z.number().int().nonnegative(),
                    value: BenchReadContextOutputSchema,
                  })
                  .strict(),
              ),
            },
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
