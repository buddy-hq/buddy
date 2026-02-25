const AnyObjectSchema = {
  type: "object",
  additionalProperties: true,
} as const

const ErrorSchema = {
  type: "object",
  properties: {
    error: {
      type: "string",
    },
  },
  required: ["error"],
  additionalProperties: true,
} as const

const SessionInfoSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    title: { type: "string" },
    time: {
      type: "object",
      properties: {
        created: { type: "number" },
        updated: { type: "number" },
        archived: { type: "number" },
      },
      required: ["created", "updated"],
      additionalProperties: true,
    },
  },
  required: ["id", "title", "time"],
  additionalProperties: true,
} as const

const MessageWithPartsSchema = {
  type: "object",
  properties: {
    info: AnyObjectSchema,
    parts: {
      type: "array",
      items: AnyObjectSchema,
    },
  },
  required: ["info", "parts"],
  additionalProperties: true,
} as const

const PermissionRequestSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    sessionID: { type: "string" },
    permission: { type: "string" },
    patterns: {
      type: "array",
      items: { type: "string" },
    },
    metadata: AnyObjectSchema,
    always: {
      type: "array",
      items: { type: "string" },
    },
    tool: AnyObjectSchema,
  },
  required: ["id", "sessionID", "permission", "patterns", "metadata", "always"],
  additionalProperties: true,
} as const

const ProvidersResponseSchema = {
  type: "object",
  properties: {
    providers: {
      type: "array",
      items: AnyObjectSchema,
    },
    default: {
      type: "object",
      additionalProperties: {
        type: "string",
      },
    },
  },
  required: ["providers", "default"],
  additionalProperties: true,
} as const

const BooleanSchema = { type: "boolean" } as const

const DirectoryHeader = {
  name: "x-buddy-directory",
  in: "header",
  required: false,
  schema: { type: "string" },
} as const

const DirectoryQuery = {
  name: "directory",
  in: "query",
  required: false,
  schema: { type: "string" },
} as const

const SessionIDPath = {
  name: "sessionID",
  in: "path",
  required: true,
  schema: { type: "string" },
} as const

const RequestIDPath = {
  name: "requestID",
  in: "path",
  required: true,
  schema: { type: "string" },
} as const

export const COMPATIBILITY_OPENAPI_PATHS: Record<string, Record<string, unknown>> = {
  "/api/health": {
    get: {
      operationId: "health.check",
      summary: "Health check",
      responses: {
        200: {
          description: "Health payload",
          content: {
            "application/json": { schema: AnyObjectSchema },
          },
        },
      },
    },
  },
  "/api/event": {
    get: {
      operationId: "event.stream",
      summary: "Server events stream",
      parameters: [DirectoryQuery, DirectoryHeader],
      responses: {
        200: {
          description: "Server-sent events stream",
          content: {
            "text/event-stream": {
              schema: { type: "string" },
            },
          },
        },
      },
    },
  },
  "/api/global/config": {
    get: {
      operationId: "global.config.get",
      summary: "Get global config",
      responses: {
        200: {
          description: "Global configuration payload",
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
      },
    },
    patch: {
      operationId: "global.config.patch",
      summary: "Patch global config",
      requestBody: {
        required: true,
        content: {
          "application/json": { schema: AnyObjectSchema },
        },
      },
      responses: {
        200: {
          description: "Updated global configuration",
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
      },
    },
  },
  "/api/global/dispose": {
    post: {
      operationId: "global.dispose",
      summary: "Dispose all global runtime instances",
      responses: {
        200: {
          description: "Disposal response",
          content: {
            "application/json": { schema: AnyObjectSchema },
          },
        },
      },
    },
  },
  "/api/config/agents": {
    get: {
      operationId: "config.agents",
      summary: "List agent configurations",
      parameters: [DirectoryHeader, DirectoryQuery],
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
        403: {
          description: "Directory is outside allowed roots",
          content: {
            "application/json": { schema: ErrorSchema },
          },
        },
      },
    },
  },
  "/api/config": {
    get: {
      operationId: "config.get",
      summary: "Get project config",
      parameters: [DirectoryHeader, DirectoryQuery],
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
          description: "Directory is outside allowed roots",
          content: {
            "application/json": { schema: ErrorSchema },
          },
        },
      },
    },
    patch: {
      operationId: "config.patch",
      summary: "Patch project config",
      parameters: [DirectoryHeader, DirectoryQuery],
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
          description: "Directory is outside allowed roots",
          content: {
            "application/json": { schema: ErrorSchema },
          },
        },
      },
    },
  },
  "/api/config/providers": {
    get: {
      operationId: "config.providers",
      summary: "Get provider catalog",
      parameters: [DirectoryHeader, DirectoryQuery],
      responses: {
        200: {
          description: "Providers and defaults",
          content: {
            "application/json": { schema: ProvidersResponseSchema },
          },
        },
        403: {
          description: "Directory is outside allowed roots",
          content: {
            "application/json": { schema: ErrorSchema },
          },
        },
      },
    },
  },
  "/api/permission": {
    get: {
      operationId: "permission.list",
      summary: "List pending permission requests",
      parameters: [DirectoryHeader, DirectoryQuery],
      responses: {
        200: {
          description: "Pending permission requests",
          content: {
            "application/json": {
              schema: {
                type: "array",
                items: PermissionRequestSchema,
              },
            },
          },
        },
        403: {
          description: "Directory is outside allowed roots",
          content: {
            "application/json": { schema: ErrorSchema },
          },
        },
      },
    },
  },
  "/api/permission/{requestID}/reply": {
    post: {
      operationId: "permission.reply",
      summary: "Reply to a permission request",
      parameters: [RequestIDPath, DirectoryHeader, DirectoryQuery],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                reply: {
                  type: "string",
                  enum: ["once", "always", "reject"],
                },
                message: {
                  type: "string",
                },
              },
              required: ["reply"],
              additionalProperties: true,
            },
          },
        },
      },
      responses: {
        200: {
          description: "Permission reply accepted",
          content: {
            "application/json": { schema: BooleanSchema },
          },
        },
        403: {
          description: "Directory is outside allowed roots",
          content: {
            "application/json": { schema: ErrorSchema },
          },
        },
      },
    },
  },
  "/api/session": {
    get: {
      operationId: "session.list",
      summary: "List sessions",
      parameters: [DirectoryHeader, DirectoryQuery],
      responses: {
        200: {
          description: "Session list",
          content: {
            "application/json": {
              schema: {
                type: "array",
                items: SessionInfoSchema,
              },
            },
          },
        },
        403: {
          description: "Directory is outside allowed roots",
          content: {
            "application/json": { schema: ErrorSchema },
          },
        },
      },
    },
    post: {
      operationId: "session.create",
      summary: "Create a new session",
      parameters: [DirectoryHeader, DirectoryQuery],
      requestBody: {
        required: false,
        content: {
          "application/json": { schema: AnyObjectSchema },
        },
      },
      responses: {
        200: {
          description: "Created session",
          content: {
            "application/json": { schema: SessionInfoSchema },
          },
        },
        403: {
          description: "Directory is outside allowed roots",
          content: {
            "application/json": { schema: ErrorSchema },
          },
        },
      },
    },
  },
  "/api/session/{sessionID}": {
    get: {
      operationId: "session.get",
      summary: "Get session by ID",
      parameters: [SessionIDPath, DirectoryHeader, DirectoryQuery],
      responses: {
        200: {
          description: "Session info",
          content: {
            "application/json": { schema: SessionInfoSchema },
          },
        },
        404: {
          description: "Session not found",
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
    },
    patch: {
      operationId: "session.update",
      summary: "Patch session metadata",
      parameters: [SessionIDPath, DirectoryHeader, DirectoryQuery],
      requestBody: {
        required: true,
        content: {
          "application/json": { schema: AnyObjectSchema },
        },
      },
      responses: {
        200: {
          description: "Updated session info",
          content: {
            "application/json": { schema: SessionInfoSchema },
          },
        },
        403: {
          description: "Directory is outside allowed roots",
          content: {
            "application/json": { schema: ErrorSchema },
          },
        },
      },
    },
  },
  "/api/session/{sessionID}/message": {
    get: {
      operationId: "session.messages",
      summary: "List session messages",
      parameters: [SessionIDPath, DirectoryHeader, DirectoryQuery],
      responses: {
        200: {
          description: "Message list",
          content: {
            "application/json": {
              schema: {
                type: "array",
                items: MessageWithPartsSchema,
              },
            },
          },
        },
        403: {
          description: "Directory is outside allowed roots",
          content: {
            "application/json": { schema: ErrorSchema },
          },
        },
      },
    },
    post: {
      operationId: "session.prompt",
      summary: "Send a prompt to a session",
      parameters: [SessionIDPath, DirectoryHeader, DirectoryQuery],
      requestBody: {
        required: true,
        content: {
          "application/json": { schema: AnyObjectSchema },
        },
      },
      responses: {
        200: {
          description: "Created user message",
          content: {
            "application/json": { schema: MessageWithPartsSchema },
          },
        },
        400: {
          description: "Invalid prompt payload",
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
        409: {
          description: "Session is already running",
          content: {
            "application/json": { schema: ErrorSchema },
          },
        },
      },
    },
  },
  "/api/session/{sessionID}/abort": {
    post: {
      operationId: "session.abort",
      summary: "Abort active session run",
      parameters: [SessionIDPath, DirectoryHeader, DirectoryQuery],
      responses: {
        200: {
          description: "Whether a running session was aborted",
          content: {
            "application/json": { schema: BooleanSchema },
          },
        },
        403: {
          description: "Directory is outside allowed roots",
          content: {
            "application/json": { schema: ErrorSchema },
          },
        },
      },
    },
  },
}
