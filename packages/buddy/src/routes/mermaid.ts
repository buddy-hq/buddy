import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { directoryQuerySchema, routeErrors, runRouteTask, withDirectoryRoute } from "../http"
import { assertSessionExistsInDirectory } from "../session"
import { mapMermaidArtifactRouteError } from "../learning/features/diagrams/errors"
import {
  createMarkdownMermaidArtifact,
  readMermaidArtifact,
  resolveMermaidRenderRecord,
  storeMermaidRenderRecord,
} from "../learning/features/diagrams/service/store"
import {
  MermaidArtifactReadSchema,
  MermaidRenderContrastAdjustmentSchema,
  MermaidRenderRecordSchema,
  MermaidResolvedRenderRecordSchema,
} from "../learning/features/diagrams/service/types"

const artifactIDParamSchema = z.object({
  artifactID: z.string(),
})

const mermaidResolveRenderQuerySchema = directoryQuerySchema.extend({
  themeSignature: z.string().min(1),
  rendererVersion: z.string().min(1),
  renderConfigVersion: z.coerce.number().int().nonnegative(),
})

const mermaidStoreRenderBodySchema = z.intersection(
  z.object({
    themeSignature: z.string().min(1),
    rendererVersion: z.string().min(1),
    renderConfigVersion: z.number().int().nonnegative(),
  }),
  z.discriminatedUnion("status", [
    z.object({
      status: z.literal("rendered"),
      svg: z.string().min(1),
      contrastAdjustments: z.array(MermaidRenderContrastAdjustmentSchema),
    }),
    z.object({
      status: z.literal("failed"),
      errorMessage: z.string().min(1),
    }),
  ]),
)

const createInlineMermaidArtifactBodySchema = z.object({
  sessionID: z.string().min(1),
  messageID: z.string().min(1),
  partID: z.string().min(1),
  segmentIndex: z.number().int().nonnegative(),
  source: z.string().min(1),
  alt: z.string().trim().min(1).optional(),
  caption: z.string().trim().min(1).optional(),
})

const createInlineMermaidArtifactBodyOpenApiSchema = {
  type: "object" as const,
  required: ["sessionID", "messageID", "partID", "segmentIndex", "source"],
  additionalProperties: false,
  properties: {
    sessionID: { type: "string" as const },
    messageID: { type: "string" as const },
    partID: { type: "string" as const },
    segmentIndex: { type: "integer" as const, minimum: 0 },
    source: { type: "string" as const },
    alt: { type: "string" as const },
    caption: { type: "string" as const },
  },
}

const mermaidStoreRenderBodyOpenApiSchema = {
  type: "object" as const,
  required: ["themeSignature", "rendererVersion", "renderConfigVersion", "status"],
  additionalProperties: false,
  properties: {
    themeSignature: { type: "string" as const },
    rendererVersion: { type: "string" as const },
    renderConfigVersion: { type: "integer" as const, minimum: 0 },
    status: { type: "string" as const, enum: ["rendered", "failed"] },
    svg: { type: "string" as const },
    errorMessage: { type: "string" as const },
    contrastAdjustments: {
      type: "array" as const,
      items: {
        type: "object" as const,
        required: ["selector", "property", "from", "to", "reason"],
        additionalProperties: false,
        properties: {
          selector: { type: "string" as const },
          property: { type: "string" as const, enum: ["fill", "color", "stroke"] },
          from: { type: "string" as const },
          to: { type: "string" as const },
          reason: { type: "string" as const },
        },
      },
    },
  },
}

export const MermaidRoutes = new Hono()
  .post(
    "/inline",
    describeRoute({
      operationId: "mermaid.createInline",
      summary: "Create or read an inline Mermaid artifact for assistant markdown",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: createInlineMermaidArtifactBodyOpenApiSchema,
          },
        },
      },
      responses: {
        200: {
          description: "Inline Mermaid artifact payload",
          content: {
            "application/json": {
              schema: resolver(MermaidArtifactReadSchema),
            },
          },
        },
        ...routeErrors(400, 403, 404),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("json", createInlineMermaidArtifactBodySchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const body = c.req.valid("json")
            await assertSessionExistsInDirectory({
              directory: context.directory,
              sessionID: body.sessionID,
              request: c.req.raw,
            })
            const artifact = await createMarkdownMermaidArtifact({
              directory: context.directory,
              sessionID: body.sessionID,
              messageID: body.messageID,
              partID: body.partID,
              segmentIndex: body.segmentIndex,
              source: body.source,
              alt: body.alt ?? "Mermaid diagram",
              ...(body.caption ? { caption: body.caption } : {}),
            })
            return Response.json(artifact)
          },
          mapError: mapMermaidArtifactRouteError,
        }),
      ),
  )
  .get(
    "/:artifactID",
    describeRoute({
      operationId: "mermaid.read",
      summary: "Read persisted Mermaid artifact source",
      responses: {
        200: {
          description: "Mermaid artifact payload",
          content: {
            "application/json": {
              schema: resolver(MermaidArtifactReadSchema),
            },
          },
        },
        ...routeErrors(400, 403, 404),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", artifactIDParamSchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const artifact = await readMermaidArtifact(
              context.directory,
              c.req.valid("param").artifactID,
            )
            return Response.json(artifact)
          },
          mapError: mapMermaidArtifactRouteError,
        }),
      ),
  )
  .get(
    "/:artifactID/render-record",
    describeRoute({
      operationId: "mermaid.resolveRender",
      summary: "Resolve the persisted Mermaid render record for the current theme",
      responses: {
        200: {
          description: "Resolved Mermaid render record",
          content: {
            "application/json": {
              schema: resolver(MermaidResolvedRenderRecordSchema),
            },
          },
        },
        ...routeErrors(400, 403, 404),
      },
    }),
    validator("query", mermaidResolveRenderQuerySchema),
    validator("param", artifactIDParamSchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const query = c.req.valid("query")
            const resolved = await resolveMermaidRenderRecord(
              context.directory,
              c.req.valid("param").artifactID,
              {
                themeSignature: query.themeSignature,
                rendererVersion: query.rendererVersion,
                renderConfigVersion: query.renderConfigVersion,
              },
            )
            return Response.json(resolved)
          },
          mapError: mapMermaidArtifactRouteError,
        }),
      ),
  )
  .put(
    "/:artifactID/render-record",
    describeRoute({
      operationId: "mermaid.storeRender",
      summary: "Persist a browser Mermaid render result",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: mermaidStoreRenderBodyOpenApiSchema,
          },
        },
      },
      responses: {
        200: {
          description: "Stored Mermaid render record",
          content: {
            "application/json": {
              schema: resolver(MermaidRenderRecordSchema),
            },
          },
        },
        ...routeErrors(400, 403, 404),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", artifactIDParamSchema),
    validator("json", mermaidStoreRenderBodySchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const body = c.req.valid("json")
            const record = await storeMermaidRenderRecord(
              context.directory,
              c.req.valid("param").artifactID,
              body,
            )
            return Response.json(record)
          },
          mapError: mapMermaidArtifactRouteError,
        }),
      ),
  )
