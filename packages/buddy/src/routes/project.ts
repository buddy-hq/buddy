import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import {
  routeErrors,
  directoryQuerySchema,
  ProjectIDParamSchema,
  withDirectoryRoute,
} from "../http"
import { updateProjectFromPayload } from "../project"
import { BuddyProjectInfoSchema, BuddyProjectUpdateSchema } from "../project/project-contract"
import { upsertProjectInfoForDirectory, listProjectInfos } from "../project/project-info"

export const ProjectRoutes = new Hono()
  .get(
    "/",
    describeRoute({
      operationId: "project.list",
      summary: "List projects",
      responses: {
        200: {
          description: "Project list",
          content: {
            "application/json": {
              schema: resolver(BuddyProjectInfoSchema.array()),
            },
          },
        },
      },
    }),
    async (c) => c.json(await listProjectInfos()),
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
            "application/json": { schema: resolver(BuddyProjectInfoSchema) },
          },
        },
        ...routeErrors(403),
      },
    }),
    validator("query", directoryQuerySchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        c.json(await upsertProjectInfoForDirectory(context.directory)),
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
            "application/json": { schema: resolver(BuddyProjectInfoSchema) },
          },
        },
        ...routeErrors(400, 404),
      },
    }),
    validator("param", ProjectIDParamSchema),
    validator("json", BuddyProjectUpdateSchema),
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
