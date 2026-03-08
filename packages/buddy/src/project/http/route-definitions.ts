import {
  ErrorSchema,
  ProjectIDPath,
  ProjectInfoSchema,
  ProjectUpdateSchema,
} from "../../openapi/compatibility-schemas.js"
import { compatibilityRoute } from "../../openapi/compatibility-route.js"
import { directoryParameters } from "../../http/openapi.js"
import { directoryDocumentSchema } from "./contracts.js"

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

export {
  currentProjectRoute,
  listProjectsRoute,
  openProjectRoute,
  updateProjectRoute,
}
