import { Hono } from "hono"
import {
  AnyObjectSchema,
  BooleanSchema,
  ErrorSchema,
  MessageWithPartsSchema,
  SessionIDPath,
  SessionInfoSchema,
} from "../openapi"
import { compatibilityRoute } from "../openapi"
import { directoryParameters } from "../http"
import {
  abortSessionRun,
  getSessionById,
  listSessionMessages,
  patchSessionById,
  proxySessionCollection,
  postSessionCommand,
  postSessionPrompt,
} from "../session"
import {
  getTeachingState,
} from "../learning/adapters/http"

const listSessionsRoute = compatibilityRoute({
  operationId: "session.list",
  summary: "List sessions",
  parameters: directoryParameters,
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
})

const createSessionRoute = compatibilityRoute({
  operationId: "session.create",
  summary: "Create a new session",
  parameters: directoryParameters,
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
})

const getSessionRoute = compatibilityRoute({
  operationId: "session.get",
  summary: "Get session by ID",
  parameters: [SessionIDPath, ...directoryParameters],
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
})

const updateSessionRoute = compatibilityRoute({
  operationId: "session.update",
  summary: "Patch session metadata",
  parameters: [SessionIDPath, ...directoryParameters],
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
})

const listSessionMessagesRoute = compatibilityRoute({
  operationId: "session.messages",
  summary: "List session messages",
  parameters: [SessionIDPath, ...directoryParameters],
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
})

const postSessionPromptRoute = compatibilityRoute({
  operationId: "session.prompt",
  summary: "Send a prompt to a session",
  parameters: [SessionIDPath, ...directoryParameters],
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
})

const postSessionCommandRoute = compatibilityRoute({
  operationId: "session.command",
  summary: "Send a slash command to a session",
  parameters: [SessionIDPath, ...directoryParameters],
  requestBody: {
    required: true,
    content: {
      "application/json": { schema: AnyObjectSchema },
    },
  },
  responses: {
    200: {
      description: "Created command message",
      content: {
        "application/json": { schema: MessageWithPartsSchema },
      },
    },
    400: {
      description: "Invalid command payload",
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
})

const getTeachingStateRoute = compatibilityRoute({
  operationId: "session.teachingState",
  summary: "Get Buddy teaching runtime state for a session",
  parameters: [SessionIDPath, ...directoryParameters],
  responses: {
    200: {
      description: "Teaching runtime state",
      content: {
        "application/json": { schema: AnyObjectSchema },
      },
    },
    204: {
      description: "No Buddy teaching state exists for this session yet",
    },
    403: {
      description: "Directory is outside allowed roots",
      content: {
        "application/json": { schema: ErrorSchema },
      },
    },
  },
})

const abortSessionRoute = compatibilityRoute({
  operationId: "session.abort",
  summary: "Abort active session run",
  parameters: [SessionIDPath, ...directoryParameters],
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
})

const listSessionsHandler = proxySessionCollection
const createSessionHandler = proxySessionCollection
const getSessionHandler = getSessionById
const updateSessionHandler = patchSessionById
const listSessionMessagesHandler = listSessionMessages
const postSessionPromptHandler = postSessionPrompt
const postSessionCommandHandler = postSessionCommand
const getTeachingStateHandler = getTeachingState
const abortSessionHandler = abortSessionRun

export const SessionRoutes = (): Hono =>
  new Hono()
    .get("/", listSessionsRoute, listSessionsHandler)
    .post("/", createSessionRoute, createSessionHandler)
    .get("/:sessionID", getSessionRoute, getSessionHandler)
    .patch("/:sessionID", updateSessionRoute, updateSessionHandler)
    .get("/:sessionID/message", listSessionMessagesRoute, listSessionMessagesHandler)
    .post("/:sessionID/message", postSessionPromptRoute, postSessionPromptHandler)
    .post("/:sessionID/command", postSessionCommandRoute, postSessionCommandHandler)
    .get("/:sessionID/teaching-state", getTeachingStateRoute, getTeachingStateHandler)
    .post("/:sessionID/abort", abortSessionRoute, abortSessionHandler)
