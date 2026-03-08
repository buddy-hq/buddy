import { Hono } from "hono"
import { Project as OpenCodeProject } from "@buddy/opencode-adapter/project"
import {
  ErrorSchema,
  ProjectIDPath,
  ProjectInfoSchema,
  ProjectUpdateSchema,
} from "../openapi/compatibility-schemas.js"
import { compatibilityRoute } from "../openapi/compatibility-route.js"
import {
  directoryDocumentSchema,
  openProjectFromPayload,
  updateProjectFromPayload,
} from "./handlers/project.js"
import { directoryParameters } from "./shared/openapi.js"
import { withJsonBody } from "./shared/route-helpers.js"
import { proxyToOpenCode } from "./support/proxy.js"

export const ProjectRoutes = (): Hono =>
  new Hono()
    .get(
      "/",
      compatibilityRoute({
        operationId: "project.list",
        summary: "List projects",
        responses: {
          200: {
            description: "OpenCode project list",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: ProjectInfoSchema,
                },
              },
            },
          },
        },
      }),
      (c) => c.json(OpenCodeProject.list()),
    )
    .post(
      "/",
      compatibilityRoute({
        operationId: "project.open",
        summary: "Open project",
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: directoryDocumentSchema },
          },
        },
        responses: {
          200: {
            description: "Opened project directory",
            content: {
              "application/json": { schema: directoryDocumentSchema },
            },
          },
          400: {
            description: "Missing directory",
            content: {
              "application/json": { schema: ErrorSchema },
            },
          },
          403: {
            description: "Directory is outside allowed roots",
            content: {
              "application/json": { schema: ErrorSchema },
            },
          },
        },
      }),
      async (c) => {
        const bodyResult = await withJsonBody(c.req.raw)
        if (!bodyResult.ok) return bodyResult.response

        const openResult = await openProjectFromPayload(bodyResult.value)
        if (!openResult.ok) {
          return c.json({ error: openResult.error }, openResult.status)
        }
        return c.json({ directory: openResult.directory })
      },
    )
    .get(
      "/current",
      compatibilityRoute({
        operationId: "project.current",
        summary: "Get current project",
        parameters: directoryParameters,
        responses: {
          200: {
            description: "Current project",
            content: {
              "application/json": { schema: ProjectInfoSchema },
            },
          },
          403: {
            description: "Directory is outside allowed roots",
            content: {
              "application/json": { schema: ErrorSchema },
            },
          },
        },
      }),
      async (c) => {
        return proxyToOpenCode(c, {
          targetPath: "/project/current",
        })
      },
    )
    .patch(
      "/:projectID",
      compatibilityRoute({
        operationId: "project.update",
        summary: "Update project",
        parameters: [ProjectIDPath],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: ProjectUpdateSchema },
          },
        },
        responses: {
          200: {
            description: "Updated project",
            content: {
              "application/json": { schema: ProjectInfoSchema },
            },
          },
          400: {
            description: "Invalid project update",
            content: {
              "application/json": { schema: ErrorSchema },
            },
          },
          404: {
            description: "Project not found",
            content: {
              "application/json": { schema: ErrorSchema },
            },
          },
        },
      }),
      async (c) => {
        const bodyResult = await withJsonBody(c.req.raw)
        if (!bodyResult.ok) return bodyResult.response

        const updateResult = await updateProjectFromPayload({
          projectID: c.req.param("projectID"),
          payload: bodyResult.value,
        })
        if (!updateResult.ok) {
          return c.json({ error: updateResult.error }, updateResult.status)
        }
        return c.json(updateResult.project)
      },
    )
