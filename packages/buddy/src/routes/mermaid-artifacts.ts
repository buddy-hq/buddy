import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { directoryQuerySchema, routeErrors, runRouteTask, withDirectoryRoute } from "../http"
import {
  listMermaidArtifacts,
  readMermaidArtifact,
} from "../learning/features/diagrams/service/read"
import { mapMermaidArtifactRouteError } from "../learning/features/diagrams/errors"

const artifactIDParamSchema = z.object({
  artifactID: z.string(),
})

const mermaidArtifactResponseSchema = z.object({
  artifactID: z.string().length(64),
  kind: z.literal("mermaid.v1"),
  diagramType: z.string().min(1),
  alt: z.string().min(1),
  caption: z.string().min(1).optional(),
  repairAttempts: z.number().int().nonnegative().max(3),
  repairLog: z.array(z.string().min(1)),
  source: z.string().min(1),
  createdAt: z.string().min(1),
})

const mermaidArtifactListResponseSchema = z.object({
  artifacts: z.array(mermaidArtifactResponseSchema),
})

export const MermaidArtifactRoutes = new Hono()
  .get(
    "/",
    describeRoute({
      operationId: "mermaidArtifacts.list",
      summary: "List persisted Mermaid artifacts",
      responses: {
        200: {
          description: "Workspace Mermaid artifacts",
          content: {
            "application/json": {
              schema: resolver(mermaidArtifactListResponseSchema),
            },
          },
        },
        ...routeErrors(403),
      },
    }),
    validator("query", directoryQuerySchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const artifacts = await listMermaidArtifacts(context.directory)
            return Response.json({ artifacts })
          },
          mapError: mapMermaidArtifactRouteError,
        }),
      ),
  )
  .get(
    "/:artifactID",
    describeRoute({
      operationId: "mermaidArtifacts.read",
      summary: "Read persisted Mermaid artifact source",
      responses: {
        200: {
          description: "Mermaid artifact payload",
          content: {
            "application/json": {
              schema: resolver(mermaidArtifactResponseSchema),
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
