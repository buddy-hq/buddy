import { AnyObjectSchema, ErrorSchema } from "../openapi"
import { compatibilityRoute } from "../openapi"
import { directoryParameters } from "../http"
import { HTTP_STATUS } from "./skills.constants"

const JSON_CONTENT_TYPE = "application/json" as const

const ROUTE_DESCRIPTIONS = {
  directoryForbidden: "Directory is outside allowed roots",
  internalServerError: "Internal server error",
} as const

const ANY_OBJECT_JSON_CONTENT = {
  [JSON_CONTENT_TYPE]: {
    schema: AnyObjectSchema,
  },
} as const

const ERROR_JSON_CONTENT = {
  [JSON_CONTENT_TYPE]: {
    schema: ErrorSchema,
  },
} as const

const REQUIRED_ANY_OBJECT_REQUEST_BODY = {
  required: true,
  content: ANY_OBJECT_JSON_CONTENT,
} as const

export const listSkillsRoute = compatibilityRoute({
  operationId: "skills.list",
  summary: "List installed skills and curated library entries",
  parameters: directoryParameters,
  responses: {
    [HTTP_STATUS.OK]: {
      description: "Skill catalog",
      content: ANY_OBJECT_JSON_CONTENT,
    },
    [HTTP_STATUS.FORBIDDEN]: {
      description: ROUTE_DESCRIPTIONS.directoryForbidden,
      content: ERROR_JSON_CONTENT,
    },
    [HTTP_STATUS.INTERNAL_SERVER_ERROR]: {
      description: "Failed to load skills",
      content: ERROR_JSON_CONTENT,
    },
  },
})

export const createSkillRoute = compatibilityRoute({
  operationId: "skills.create",
  summary: "Create a new Buddy-managed custom skill",
  parameters: directoryParameters,
  requestBody: REQUIRED_ANY_OBJECT_REQUEST_BODY,
  responses: {
    [HTTP_STATUS.OK]: {
      description: "Created skill",
      content: ANY_OBJECT_JSON_CONTENT,
    },
    [HTTP_STATUS.BAD_REQUEST]: {
      description: "Invalid skill payload",
      content: ERROR_JSON_CONTENT,
    },
    [HTTP_STATUS.CONFLICT]: {
      description: "Skill already exists",
      content: ERROR_JSON_CONTENT,
    },
    [HTTP_STATUS.FORBIDDEN]: {
      description: ROUTE_DESCRIPTIONS.directoryForbidden,
      content: ERROR_JSON_CONTENT,
    },
    [HTTP_STATUS.INTERNAL_SERVER_ERROR]: {
      description: ROUTE_DESCRIPTIONS.internalServerError,
      content: ERROR_JSON_CONTENT,
    },
  },
})

export const installLibrarySkillRoute = compatibilityRoute({
  operationId: "skills.library.install",
  summary: "Install a curated library skill into Buddy-managed storage",
  parameters: directoryParameters,
  responses: {
    [HTTP_STATUS.OK]: {
      description: "Installed skill",
      content: ANY_OBJECT_JSON_CONTENT,
    },
    [HTTP_STATUS.BAD_REQUEST]: {
      description: "Invalid library item",
      content: ERROR_JSON_CONTENT,
    },
    [HTTP_STATUS.NOT_FOUND]: {
      description: "Library item not found",
      content: ERROR_JSON_CONTENT,
    },
    [HTTP_STATUS.CONFLICT]: {
      description: "Skill already exists",
      content: ERROR_JSON_CONTENT,
    },
    [HTTP_STATUS.FORBIDDEN]: {
      description: ROUTE_DESCRIPTIONS.directoryForbidden,
      content: ERROR_JSON_CONTENT,
    },
    [HTTP_STATUS.INTERNAL_SERVER_ERROR]: {
      description: ROUTE_DESCRIPTIONS.internalServerError,
      content: ERROR_JSON_CONTENT,
    },
  },
})

export const updateSkillsSettingsRoute = compatibilityRoute({
  operationId: "skills.settings.patch",
  summary: "Update per-project skills settings",
  parameters: directoryParameters,
  requestBody: REQUIRED_ANY_OBJECT_REQUEST_BODY,
  responses: {
    [HTTP_STATUS.OK]: {
      description: "Updated skills settings",
      content: ANY_OBJECT_JSON_CONTENT,
    },
    [HTTP_STATUS.BAD_REQUEST]: {
      description: "Invalid skills settings payload",
      content: ERROR_JSON_CONTENT,
    },
    [HTTP_STATUS.FORBIDDEN]: {
      description: ROUTE_DESCRIPTIONS.directoryForbidden,
      content: ERROR_JSON_CONTENT,
    },
    [HTTP_STATUS.INTERNAL_SERVER_ERROR]: {
      description: ROUTE_DESCRIPTIONS.internalServerError,
      content: ERROR_JSON_CONTENT,
    },
  },
})

export const updateSkillRoute = compatibilityRoute({
  operationId: "skills.update",
  summary: "Update a skill permission rule for this user",
  parameters: directoryParameters,
  requestBody: REQUIRED_ANY_OBJECT_REQUEST_BODY,
  responses: {
    [HTTP_STATUS.OK]: {
      description: "Updated skill state",
      content: ANY_OBJECT_JSON_CONTENT,
    },
    [HTTP_STATUS.BAD_REQUEST]: {
      description: "Invalid skill state",
      content: ERROR_JSON_CONTENT,
    },
    [HTTP_STATUS.NOT_FOUND]: {
      description: "Skill not found",
      content: ERROR_JSON_CONTENT,
    },
    [HTTP_STATUS.FORBIDDEN]: {
      description: ROUTE_DESCRIPTIONS.directoryForbidden,
      content: ERROR_JSON_CONTENT,
    },
    [HTTP_STATUS.INTERNAL_SERVER_ERROR]: {
      description: ROUTE_DESCRIPTIONS.internalServerError,
      content: ERROR_JSON_CONTENT,
    },
  },
})

export const removeSkillRoute = compatibilityRoute({
  operationId: "skills.delete",
  summary: "Remove a Buddy-managed installed skill",
  parameters: directoryParameters,
  responses: {
    [HTTP_STATUS.OK]: {
      description: "Removed skill",
      content: ANY_OBJECT_JSON_CONTENT,
    },
    [HTTP_STATUS.BAD_REQUEST]: {
      description: "Skill cannot be removed",
      content: ERROR_JSON_CONTENT,
    },
    [HTTP_STATUS.NOT_FOUND]: {
      description: "Skill not found",
      content: ERROR_JSON_CONTENT,
    },
    [HTTP_STATUS.FORBIDDEN]: {
      description: ROUTE_DESCRIPTIONS.directoryForbidden,
      content: ERROR_JSON_CONTENT,
    },
    [HTTP_STATUS.INTERNAL_SERVER_ERROR]: {
      description: ROUTE_DESCRIPTIONS.internalServerError,
      content: ERROR_JSON_CONTENT,
    },
  },
})
