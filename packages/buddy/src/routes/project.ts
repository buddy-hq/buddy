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
    async (c) => c.json(await OpenCodeProject.list()),
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
          const { project } = await OpenCodeProject.fromDirectory(context.directory)
          return c.json(project)
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
