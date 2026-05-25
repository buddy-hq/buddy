import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import { Schema } from "effect"
import { Project as OpenCodeProject } from "@buddy/opencode-adapter/project"
import { toOpenApiSchema } from "../http/effect-schema"
import {
  directoryQuerySchema,
  ProjectIDParamSchema,
  routeErrors,
  runSdkRoute,
  withDirectoryRoute,
} from "../http"
import { respondWithSdkResult } from "../http/sdk-response"
import { getOpenCodeClient } from "../opencode-runtime/client"
import { updateProjectFromPayload } from "../project"

const projectUpdateBodySchema = toOpenApiSchema(OpenCodeProject.UpdatePayload)

export const ProjectRoutes = new Hono()
  .get(
    "/",
    describeRoute({
      operationId: "project.list",
      summary: "List projects",
      responses: {
        200: {
          description: "OpenCode project list",
          content: {
            "application/json": {
              schema: resolver(toOpenApiSchema(Schema.Array(OpenCodeProject.Info))),
            },
          },
        },
      },
    }),
    (c) => c.json(OpenCodeProject.list()),
  )
  .get(
    "/current",
    describeRoute({
      operationId: "project.current",
      summary: "Get current project",
      responses: {
        200: {
          description: "Current project",
          content: {
            "application/json": { schema: resolver(toOpenApiSchema(OpenCodeProject.Info)) },
          },
        },
        ...routeErrors(403),
      },
    }),
    validator("query", directoryQuerySchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runSdkRoute(c, async () => {
          const client = await getOpenCodeClient(context.directory)
          const result = await client.project.current({ directory: context.directory })
          return respondWithSdkResult(c, result)
        }),
      ),
  )
  .patch(
    "/:projectID",
    describeRoute({
      operationId: "project.update",
      summary: "Update project",
      responses: {
        200: {
          description: "Updated project",
          content: {
            "application/json": { schema: resolver(toOpenApiSchema(OpenCodeProject.Info)) },
          },
        },
        ...routeErrors(400, 404),
      },
    }),
    validator("param", ProjectIDParamSchema),
    validator("json", projectUpdateBodySchema),
    async (c) => {
      const updateResult = await updateProjectFromPayload({
        projectID: c.req.valid("param").projectID,
        payload: c.req.valid("json"),
      })
      if (!updateResult.ok) {
        return c.json({ error: updateResult.error }, updateResult.status)
      }

      return c.json(updateResult.project)
    },
  )
