import { AnyObjectSchema, ErrorSchema, McpNamePath } from "../../openapi/compatibility-schemas.js"
import { compatibilityRoute } from "../../openapi/compatibility-route.js"
import { directoryForbiddenResponse, directoryParameters } from "../../http/openapi.js"

const listConfigPersonasRoute = compatibilityRoute({
  operationId: "config.personas",
  summary: "List Buddy personas",
  parameters: directoryParameters,
  responses: {
    200: {
      description: "Buddy personas",
      content: {
        "application/json": {
          schema: {
            type: "array",
            items: AnyObjectSchema,
          },
        },
      },
    },
    400: {
      description: "Invalid config",
      content: {
        "application/json": { schema: ErrorSchema },
      },
    },
    403: {
      ...directoryForbiddenResponse,
    },
  },
})

const listConfigAgentsRoute = compatibilityRoute({
  operationId: "config.agents",
  summary: "List agent configurations",
  parameters: directoryParameters,
  responses: {
    200: {
      description: "Agent configurations",
      content: {
        "application/json": {
          schema: {
            type: "array",
            items: AnyObjectSchema,
          },
        },
      },
    },
    400: {
      description: "Invalid config",
      content: {
        "application/json": { schema: ErrorSchema },
      },
    },
    403: {
      ...directoryForbiddenResponse,
    },
  },
})

const listConfigProvidersRoute = compatibilityRoute({
  operationId: "config.providers",
  summary: "List configured providers",
  parameters: directoryParameters,
  responses: {
    200: {
      description: "Configured providers and defaults",
      content: {
        "application/json": { schema: AnyObjectSchema },
      },
    },
    400: {
      description: "Invalid config",
      content: {
        "application/json": { schema: ErrorSchema },
      },
    },
    403: {
      ...directoryForbiddenResponse,
    },
  },
})

const getProjectConfigRoute = compatibilityRoute({
  operationId: "config.get",
  summary: "Get project config",
  parameters: directoryParameters,
  responses: {
    200: {
      description: "Project config payload",
      content: {
        "application/json": { schema: AnyObjectSchema },
      },
    },
    400: {
      description: "Invalid config",
      content: {
        "application/json": { schema: ErrorSchema },
      },
    },
    403: {
      ...directoryForbiddenResponse,
    },
  },
})

const patchProjectConfigRoute = compatibilityRoute({
  operationId: "config.patch",
  summary: "Patch project config",
  parameters: directoryParameters,
  requestBody: {
    required: true,
    content: {
      "application/json": { schema: AnyObjectSchema },
    },
  },
  responses: {
    200: {
      description: "Updated project config payload",
      content: {
        "application/json": { schema: AnyObjectSchema },
      },
    },
    400: {
      description: "Invalid config",
      content: {
        "application/json": { schema: ErrorSchema },
      },
    },
    403: {
      ...directoryForbiddenResponse,
    },
  },
})

const putProjectMcpConfigRoute = compatibilityRoute({
  operationId: "config.mcp.put",
  summary: "Set project MCP config",
  parameters: [McpNamePath, ...directoryParameters],
  requestBody: {
    required: true,
    content: {
      "application/json": { schema: AnyObjectSchema },
    },
  },
  responses: {
    200: {
      description: "Updated project config payload",
      content: {
        "application/json": { schema: AnyObjectSchema },
      },
    },
    400: {
      description: "Invalid MCP config",
      content: {
        "application/json": { schema: ErrorSchema },
      },
    },
    403: {
      ...directoryForbiddenResponse,
    },
  },
})

export {
  getProjectConfigRoute,
  listConfigAgentsRoute,
  listConfigPersonasRoute,
  listConfigProvidersRoute,
  patchProjectConfigRoute,
  putProjectMcpConfigRoute,
}
