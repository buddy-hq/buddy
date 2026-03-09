import type { Context } from "hono"
import { Hono } from "hono"
import { Project as OpenCodeProject } from "@buddy/opencode-adapter/project"
import {
  ErrorSchema,
  ProjectIDPath,
  ProjectInfoSchema,
  ProjectUpdateSchema,
} from "../openapi"
import { compatibilityRoute } from "../openapi"
import { directoryParameters } from "../http"
import { withJsonBody } from "../http"
import { proxyToOpenCode } from "../http"
import { openProjectFromPayload, updateProjectFromPayload } from "../project"

const directoryDocumentSchema = {
  type: "object",
  properties: {
    directory: { type: "string" },
  },
  required: ["directory"],
  additionalProperties: false,
}

const listProjectsRoute = compatibilityRoute({
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
})

const openProjectRoute = compatibilityRoute({
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
})

const currentProjectRoute = compatibilityRoute({
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
})

const updateProjectRoute = compatibilityRoute({
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
})

function listProjectsHandler(c: Context): Response {
  return c.json(OpenCodeProject.list())
}

async function openProjectHandler(c: Context): Promise<Response> {
  const bodyResult = await withJsonBody(c.req.raw)
  if (!bodyResult.ok) return bodyResult.response

  const openResult = await openProjectFromPayload(bodyResult.value)
  if (!openResult.ok) {
    return c.json({ error: openResult.error }, openResult.status)
  }

  return c.json({ directory: openResult.directory })
}

async function currentProjectHandler(c: Context): Promise<Response> {
  return proxyToOpenCode(c, {
    targetPath: "/project/current",
  })
}

async function updateProjectHandler(c: Context): Promise<Response> {
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
}

export const ProjectRoutes = (): Hono =>
  new Hono()
    .get("/", listProjectsRoute, listProjectsHandler)
    .post("/", openProjectRoute, openProjectHandler)
    .get("/current", currentProjectRoute, currentProjectHandler)
    .patch("/:projectID", updateProjectRoute, updateProjectHandler)
