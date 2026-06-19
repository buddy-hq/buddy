import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { directoryQuerySchema, routeErrors, runRouteTask, withDirectoryRoute } from "../http"
import { assertSessionExistsInDirectory } from "../session"
import { mapMermaidObjectRouteError as mapMermaidFeatureRouteError } from "../learning/features/diagrams/errors"
import {
  createMarkdownMermaidObject,
  MermaidObjectRenderRecordSchema,
  MermaidObjectResolvedRenderRecordSchema,
  readMermaidObject,
  resolveMermaidObjectRenderRecord,
  storeMermaidObjectRenderRecord,
} from "../learning/features/diagrams/service/store"
import {
  MermaidAutoRepairStateSchema,
  MermaidPreflightRepairSchema,
  MermaidRenderContrastAdjustmentSchema,
} from "../learning/features/diagrams/service/types"
import {
  BuddyObjectIDSchema,
  BuddyObjectOriginSchema,
  mapBuddyObjectRouteError,
  nonEmptyString,
} from "../objects"

const objectIDParamSchema = z
  .object({
    objectID: BuddyObjectIDSchema,
  })
  .strict()

const mermaidReadQuerySchema = directoryQuerySchema.extend({
  revisionID: BuddyObjectIDSchema.optional(),
  renderKey: nonEmptyString.optional(),
})

const mermaidResolveRenderQuerySchema = directoryQuerySchema.extend({
  revisionID: BuddyObjectIDSchema.optional(),
  themeSignature: nonEmptyString,
  rendererVersion: nonEmptyString,
  renderConfigVersion: z.coerce.number().int().nonnegative(),
})

const mermaidStoreRenderQuerySchema = directoryQuerySchema.extend({
  revisionID: BuddyObjectIDSchema.optional(),
})

const mermaidStoreRenderBodySchema = z.intersection(
  z.object({
    themeSignature: nonEmptyString,
    rendererVersion: nonEmptyString,
    renderConfigVersion: z.number().int().nonnegative(),
  }),
  z.discriminatedUnion("status", [
    z.object({
      status: z.literal("rendered"),
      svg: nonEmptyString,
      contrastAdjustments: z.array(MermaidRenderContrastAdjustmentSchema),
    }),
    z.object({
      status: z.literal("failed"),
      errorMessage: nonEmptyString,
    }),
  ]),
)

const createInlineMermaidObjectBodySchema = z
  .object({
    sessionID: nonEmptyString,
    messageID: nonEmptyString,
    partID: nonEmptyString,
    segmentIndex: z.number().int().nonnegative(),
    source: nonEmptyString,
    alt: nonEmptyString.optional(),
    caption: nonEmptyString.optional(),
  })
  .strict()

const mermaidObjectReadResponseSchema = z
  .object({
    objectID: BuddyObjectIDSchema,
    revisionID: BuddyObjectIDSchema,
    kind: z.literal("mermaid"),
    origin: BuddyObjectOriginSchema,
    title: nonEmptyString,
    diagramType: nonEmptyString,
    alt: nonEmptyString,
    caption: nonEmptyString.optional(),
    source: nonEmptyString,
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/u),
    preflightRepairs: z.array(MermaidPreflightRepairSchema),
    autoRepair: MermaidAutoRepairStateSchema,
    renderStatus: z.enum(["ready", "stale", "error"]),
    repairOfObjectID: BuddyObjectIDSchema.nullable(),
    supersedesRevisionID: BuddyObjectIDSchema.nullable(),
    replacementRevisionID: BuddyObjectIDSchema.nullable(),
    render: MermaidObjectRenderRecordSchema.optional(),
  })
  .strict()

function mapMermaidObjectRouteError(error: unknown): Response | undefined {
  return mapBuddyObjectRouteError(error) ?? mapMermaidFeatureRouteError(error)
}

export const ObjectMermaidRoutes = new Hono()
  .post(
    "/inline",
    describeRoute({
      operationId: "objectMermaid.createInline",
      summary: "Create or read an inline Mermaid object for assistant markdown",
      responses: {
        200: {
          description: "Inline Mermaid object payload",
          content: {
            "application/json": {
              schema: resolver(mermaidObjectReadResponseSchema),
            },
          },
        },
        ...routeErrors(400, 403, 404, 410, 500),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("json", createInlineMermaidObjectBodySchema),
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
            const object = await createMarkdownMermaidObject({
              directory: context.directory,
              sessionID: body.sessionID,
              messageID: body.messageID,
              partID: body.partID,
              segmentIndex: body.segmentIndex,
              source: body.source,
              alt: body.alt ?? "Mermaid diagram",
              ...(body.caption ? { caption: body.caption } : {}),
            })
            return c.json(mermaidObjectReadResponseSchema.parse(object))
          },
          mapError: mapMermaidObjectRouteError,
        }),
      ),
  )
  .get(
    "/:objectID/source",
    describeRoute({
      operationId: "objectMermaid.readSource",
      summary: "Read persisted Mermaid object source",
      responses: {
        200: {
          description: "Mermaid object payload",
          content: {
            "application/json": {
              schema: resolver(mermaidObjectReadResponseSchema),
            },
          },
        },
        ...routeErrors(400, 403, 404, 410, 500),
      },
    }),
    validator("query", mermaidReadQuerySchema),
    validator("param", objectIDParamSchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const params = c.req.valid("param")
            const query = c.req.valid("query")
            const object = await readMermaidObject({
              directory: context.directory,
              objectID: params.objectID,
              revisionID: query.revisionID,
              renderKey: query.renderKey,
            })
            return c.json(mermaidObjectReadResponseSchema.parse(object))
          },
          mapError: mapMermaidObjectRouteError,
        }),
      ),
  )
  .get(
    "/:objectID/render-record",
    describeRoute({
      operationId: "objectMermaid.resolveRender",
      summary: "Resolve the persisted Mermaid object render record for the current theme",
      responses: {
        200: {
          description: "Resolved Mermaid object render record",
          content: {
            "application/json": {
              schema: resolver(MermaidObjectResolvedRenderRecordSchema),
            },
          },
        },
        ...routeErrors(400, 403, 404, 410, 500),
      },
    }),
    validator("query", mermaidResolveRenderQuerySchema),
    validator("param", objectIDParamSchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const params = c.req.valid("param")
            const query = c.req.valid("query")
            const resolved = await resolveMermaidObjectRenderRecord(
              context.directory,
              params.objectID,
              {
                revisionID: query.revisionID,
                themeSignature: query.themeSignature,
                rendererVersion: query.rendererVersion,
                renderConfigVersion: query.renderConfigVersion,
              },
            )
            return c.json(resolved)
          },
          mapError: mapMermaidObjectRouteError,
        }),
      ),
  )
  .put(
    "/:objectID/render-record",
    describeRoute({
      operationId: "objectMermaid.storeRender",
      summary: "Persist a browser Mermaid object render result",
      responses: {
        200: {
          description: "Stored Mermaid object render record",
          content: {
            "application/json": {
              schema: resolver(MermaidObjectRenderRecordSchema),
            },
          },
        },
        ...routeErrors(400, 403, 404, 410, 500),
      },
    }),
    validator("query", mermaidStoreRenderQuerySchema),
    validator("param", objectIDParamSchema),
    validator("json", mermaidStoreRenderBodySchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const params = c.req.valid("param")
            const query = c.req.valid("query")
            const body = c.req.valid("json")
            const record = await storeMermaidObjectRenderRecord(
              context.directory,
              params.objectID,
              {
                revisionID: query.revisionID,
                ...body,
              },
            )
            return c.json(record)
          },
          mapError: mapMermaidObjectRouteError,
        }),
      ),
  )
