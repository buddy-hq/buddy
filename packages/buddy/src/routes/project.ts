import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import { projectSchema, projectUpdateSchema, toBuddyProject } from "../project/contract"
import { getOpenCodeClient } from "../opencode-runtime/client"
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
    async (c) => runSdkRoute(c, async () => c.json((await (await getOpenCodeClient()).project.list()).map(toBuddyProject))),
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
          const client = await getOpenCodeClient()
          const location = await client.location.get({ location: { directory: context.directory } })
          const project = (await client.project.list()).find((entry) => entry.id === location.project.id)
          if (!project) return c.json({ error: "Project not found" }, 404)
          return c.json({ ...toBuddyProject(project), worktree: location.project.canonical })
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
        return c.json({ error: updateResult.error }, updateResult.status)
      }

      return c.json(updateResult.project)
    },
  )
