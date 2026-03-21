import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import { Project as OpenCodeProject } from "@buddy/opencode-adapter/project"
import { routeErrors, directoryQuerySchema, ProjectIDParamSchema } from "../http"
import { proxyToOpenCode } from "../http"
import { updateProjectFromPayload } from "../project"

const projectUpdateBodySchema = OpenCodeProject.update.schema.omit({
  projectID: true,
})

export const ProjectRoutes = (): Hono =>
  new Hono()
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
                schema: resolver(OpenCodeProject.Info.array()),
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
              "application/json": { schema: resolver(OpenCodeProject.Info) },
            },
          },
          ...routeErrors(403),
        },
      }),
      validator("query", directoryQuerySchema),
      async (c) =>
        proxyToOpenCode(c, {
          targetPath: "/project/current",
        }),
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
              "application/json": { schema: resolver(OpenCodeProject.Info) },
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
