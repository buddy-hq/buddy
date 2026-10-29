import { routeErrorBody } from "../http/route-errors"
import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import { projectSchema, projectUpdateSchema } from "../project/contract"
import { getAgentRuntime } from "../runtime/agent-runtime"
import {
  directoryQuerySchema,
  ProjectIDParamSchema,
  routeErrors,
  runSdkRoute,
  withDirectoryRoute,
} from "../http"
import { updateProjectFromPayload } from "../project"

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
              schema: resolver(projectSchema.array()),
            },
          },
        },
      },
    }),
    async (c) =>
      runSdkRoute(c, async () => c.json(await (await getAgentRuntime()).workspace.projects())),
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
            "application/json": { schema: resolver(projectSchema) },
          },
        },
        ...routeErrors(403),
      },
    }),
    validator("query", directoryQuerySchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runSdkRoute(c, async () => {
          const project = await (await getAgentRuntime()).workspace.project(context.directory)
          if (!project) return c.json(routeErrorBody(404, "Project not found"), 404)
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
            "application/json": { schema: resolver(projectSchema) },
          },
        },
        ...routeErrors(400, 404),
      },
    }),
    validator("param", ProjectIDParamSchema),
    validator("json", projectUpdateSchema),
    async (c) => {
      const updateResult = await updateProjectFromPayload({
        projectID: c.req.valid("param").projectID,
        payload: c.req.valid("json"),
      })
      if (!updateResult.ok) {
        return c.json(routeErrorBody(updateResult.status, updateResult.error), updateResult.status)
      }

      return c.json(updateResult.project)
    },
  )
