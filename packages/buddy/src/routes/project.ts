import { Hono } from "hono"
import { Project as OpenCodeProject } from "@buddy/opencode-adapter/project"
import {
  DirectoryHeader,
  DirectoryQuery,
  ErrorSchema,
  ProjectIDPath,
  ProjectInfoSchema,
  ProjectUpdateSchema,
} from "../openapi/compatibility-schemas.js"
import { compatibilityRoute } from "../openapi/compatibility-route.js"
import { isAllowedDirectory, resolveDirectory } from "../project/directory.js"
import { proxyToOpenCode } from "./support.js"

const directoryParameters = [DirectoryHeader, DirectoryQuery]
const projectUpdateBodySchema = OpenCodeProject.update.schema.omit({ projectID: true })
const directoryDocumentSchema = {
  type: "object",
  properties: {
    directory: { type: "string" },
  },
  required: ["directory"],
  additionalProperties: false,
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  return "Invalid project update"
}

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
        const payload = await c.req.json().catch(() => undefined)
        const rawDirectory =
          payload && typeof payload === "object" && "directory" in payload
            ? payload.directory
            : undefined

        if (typeof rawDirectory !== "string") {
          return c.json({ error: "Directory is required" }, 400)
        }

        const directory = resolveDirectory(rawDirectory)
        if (!isAllowedDirectory(directory)) {
          return c.json({ error: "Directory is outside allowed roots" }, 403)
        }

        await OpenCodeProject.fromDirectory(directory)
        return c.json({ directory })
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
        const projectID = c.req.param("projectID")
        const payload = await c.req.json().catch(() => undefined)
        const body = projectUpdateBodySchema.safeParse(payload)
        if (!body.success) {
          return c.json({ error: "Invalid project update" }, 400)
        }

        try {
          const project = await OpenCodeProject.update({
            ...body.data,
            projectID,
          })
          return c.json(project)
        } catch (error) {
          const message = errorMessage(error)
          const status = message.startsWith("Project not found:") ? 404 : 400
          return c.json({ error: message }, status)
        }
      },
    )
