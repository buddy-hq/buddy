import { AnyObjectSchema, ErrorSchema } from "../../openapi/compatibility-schemas.js"
import { compatibilityRoute } from "../../openapi/compatibility-route.js"
import { directoryParameters } from "../../http/openapi.js"

const listSkillsRoute = compatibilityRoute({
  operationId: "skills.list",
  summary: "List installed skills and placeholder library entries",
  parameters: directoryParameters,
  responses: {
    200: {
      description: "Skill catalog",
      content: {
        "application/json": {
          schema: AnyObjectSchema,
        },
      },
    },
    403: {
      description: "Directory is outside allowed roots",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
    500: {
      description: "Failed to load skills",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
  },
})

const createSkillRoute = compatibilityRoute({
  operationId: "skills.create",
  summary: "Create a new Buddy-managed custom skill",
  parameters: directoryParameters,
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: AnyObjectSchema,
      },
    },
  },
  responses: {
    200: {
      description: "Created skill",
      content: {
        "application/json": {
          schema: AnyObjectSchema,
        },
      },
    },
    400: {
      description: "Invalid skill payload",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
    409: {
      description: "Skill already exists",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
    403: {
      description: "Directory is outside allowed roots",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
  },
})

const installLibrarySkillRoute = compatibilityRoute({
  operationId: "skills.library.install",
  summary: "Install a placeholder library skill into Buddy-managed storage",
  parameters: directoryParameters,
  responses: {
    200: {
      description: "Installed skill",
      content: {
        "application/json": {
          schema: AnyObjectSchema,
        },
      },
    },
    400: {
      description: "Invalid library item",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
    404: {
      description: "Library item not found",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
    409: {
      description: "Skill already exists",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
    403: {
      description: "Directory is outside allowed roots",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
  },
})

const updateSkillRoute = compatibilityRoute({
  operationId: "skills.update",
  summary: "Update a skill permission rule for this user",
  parameters: directoryParameters,
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: AnyObjectSchema,
      },
    },
  },
  responses: {
    200: {
      description: "Updated skill state",
      content: {
        "application/json": {
          schema: AnyObjectSchema,
        },
      },
    },
    400: {
      description: "Invalid skill state",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
    404: {
      description: "Skill not found",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
    403: {
      description: "Directory is outside allowed roots",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
  },
})

const removeSkillRoute = compatibilityRoute({
  operationId: "skills.delete",
  summary: "Remove a Buddy-managed installed skill",
  parameters: directoryParameters,
  responses: {
    200: {
      description: "Removed skill",
      content: {
        "application/json": {
          schema: AnyObjectSchema,
        },
      },
    },
    400: {
      description: "Skill cannot be removed",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
    404: {
      description: "Skill not found",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
    403: {
      description: "Directory is outside allowed roots",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
  },
})

export {
  createSkillRoute,
  installLibrarySkillRoute,
  listSkillsRoute,
  removeSkillRoute,
  updateSkillRoute,
}
