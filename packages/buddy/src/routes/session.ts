import { Hono } from "hono"
import { createFactory } from "hono/factory"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { Session as OpenCodeSession } from "@buddy/opencode-adapter/session"
import { MessageV2 as OpenCodeMessage } from "@buddy/opencode-adapter/message"
import {
  INTENTS,
  PERSONAS,
  PERSONA_SURFACES,
  WORKSPACE_STATES,
} from "@buddy/backend/learning/shared/teaching-vocabulary"
import {
  routeErrors,
  directoryQuerySchema,
  SessionIDParamSchema,
  booleanJsonResponse,
} from "../http"
import {
  abortSessionRun,
  getSessionById,
  listSessionMessages,
  patchSessionById,
  postSessionCommand,
  postSessionPrompt,
  proxySessionCollection,
} from "../session"
import { getTeachingState } from "../learning/adapters/http"

const sessionRouteFactory = createFactory()

const [listSessionsHandler] = sessionRouteFactory.createHandlers(proxySessionCollection)
const [createSessionHandler] = sessionRouteFactory.createHandlers(proxySessionCollection)
const [getSessionHandler] = sessionRouteFactory.createHandlers(getSessionById)
const [updateSessionHandler] = sessionRouteFactory.createHandlers(patchSessionById)
const [listSessionMessagesHandler] = sessionRouteFactory.createHandlers(listSessionMessages)
const [postSessionPromptHandler] = sessionRouteFactory.createHandlers(postSessionPrompt)
const [postSessionCommandHandler] = sessionRouteFactory.createHandlers(postSessionCommand)
const [getTeachingStateHandler] = sessionRouteFactory.createHandlers(getTeachingState)
const [abortSessionHandler] = sessionRouteFactory.createHandlers(abortSessionRun)

const sessionListQuerySchema = z.object({
  directory: z.string().optional(),
  roots: z.coerce.boolean().optional(),
  start: z.coerce.number().optional(),
  search: z.string().optional(),
  limit: z.coerce.number().optional(),
})

const sessionUpdateBodySchema = z.object({
  title: z.string().optional(),
  time: z
    .object({
      archived: z.number().optional(),
    })
    .optional(),
})

const sessionPromptBodyOpenApiSchema = {
  type: "object" as const,
  required: ["content"],
  additionalProperties: true,
  properties: {
    content: { type: "string" as const },
    parts: {
      type: "array" as const,
      items: { type: "object" as const, additionalProperties: true },
    },
    persona: { type: "string" as const },
    intent: {
      type: "string" as const,
      enum: [...INTENTS],
    },
    focusGoalIds: {
      type: "array" as const,
      items: { type: "string" as const },
    },
    agent: { type: "string" as const },
    model: {
      type: "object" as const,
      additionalProperties: false,
      required: ["providerID", "modelID"],
      properties: {
        providerID: { type: "string" as const },
        modelID: { type: "string" as const },
      },
    },
    variant: { type: "string" as const },
    teaching: {
      type: "object" as const,
      additionalProperties: true,
    },
  },
}

const sessionCommandBodyOpenApiSchema = {
  type: "object" as const,
  required: ["command"],
  additionalProperties: true,
  properties: {
    command: { type: "string" as const },
    arguments: { type: "string" as const },
    parts: {
      type: "array" as const,
      items: { type: "object" as const, additionalProperties: true },
    },
    persona: { type: "string" as const },
    intent: {
      type: "string" as const,
      enum: [...INTENTS],
    },
    agent: { type: "string" as const },
    model: {
      oneOf: [
        { type: "string" as const },
        {
          type: "object" as const,
          additionalProperties: false,
          required: ["providerID", "modelID"],
          properties: {
            providerID: { type: "string" as const },
            modelID: { type: "string" as const },
          },
        },
      ],
    },
    variant: { type: "string" as const },
  },
}

const sessionInteractionBodySchema = z.record(z.string(), z.unknown())

const teachingSessionStateOutboundSchema = z.object({
  kind: z.enum(["message", "command"]),
  createdAt: z.string(),
  payload: z.object({}).passthrough(),
  fullSystemPrompt: z.string().optional(),
})

const teachingSessionStateSchema = z.object({
  sessionId: z.string(),
  persona: z.enum(PERSONAS),
  intent: z.enum(INTENTS),
  currentSurface: z.enum(PERSONA_SURFACES),
  workspaceState: z.enum(WORKSPACE_STATES),
  focusGoalIds: z.array(z.string()),
  lastLlmOutbound: teachingSessionStateOutboundSchema.optional(),
  llmOutboundHistory: z.array(teachingSessionStateOutboundSchema).optional(),
})

export const SessionRoutes = new Hono()
  .get(
    "/",
    describeRoute({
      operationId: "session.list",
      summary: "List sessions",
      responses: {
        200: {
          description: "Session list",
          content: {
            "application/json": {
              schema: resolver(OpenCodeSession.Info.array()),
            },
          },
        },
        ...routeErrors(403),
      },
    }),
    validator("query", sessionListQuerySchema),
    listSessionsHandler,
  )
  .post(
    "/",
    describeRoute({
      operationId: "session.create",
      summary: "Create a new session",
      responses: {
        200: {
          description: "Created session",
          content: {
            "application/json": { schema: resolver(OpenCodeSession.Info) },
          },
        },
        ...routeErrors(403),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("json", OpenCodeSession.create.schema.optional()),
    createSessionHandler,
  )
  .get(
    "/:sessionID",
    describeRoute({
      operationId: "session.get",
      summary: "Get session by ID",
      responses: {
        200: {
          description: "Session info",
          content: {
            "application/json": { schema: resolver(OpenCodeSession.Info) },
          },
        },
        ...routeErrors(403, 404),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", SessionIDParamSchema),
    getSessionHandler,
  )
  .patch(
    "/:sessionID",
    describeRoute({
      operationId: "session.update",
      summary: "Patch session metadata",
      responses: {
        200: {
          description: "Updated session info",
          content: {
            "application/json": { schema: resolver(OpenCodeSession.Info) },
          },
        },
        ...routeErrors(403, 404),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", SessionIDParamSchema),
    validator("json", sessionUpdateBodySchema),
    updateSessionHandler,
  )
  .get(
    "/:sessionID/message",
    describeRoute({
      operationId: "session.messages",
      summary: "List session messages",
      responses: {
        200: {
          description: "Message list",
          content: {
            "application/json": {
              schema: resolver(OpenCodeMessage.WithParts.array()),
            },
          },
        },
        ...routeErrors(403, 404),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", SessionIDParamSchema),
    listSessionMessagesHandler,
  )
  .post(
    "/:sessionID/message",
    describeRoute({
      operationId: "session.prompt",
      summary: "Send a prompt to a session",
      requestBody: {
        required: true,
        content: {
          "application/json": { schema: sessionPromptBodyOpenApiSchema },
        },
      },
      responses: {
        200: {
          description: "Created user message",
          content: {
            "application/json": { schema: resolver(OpenCodeMessage.WithParts) },
          },
        },
        ...routeErrors(400, 403, 409),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", SessionIDParamSchema),
    validator("json", sessionInteractionBodySchema),
    postSessionPromptHandler,
  )
  .post(
    "/:sessionID/command",
    describeRoute({
      operationId: "session.command",
      summary: "Send a slash command to a session",
      requestBody: {
        required: true,
        content: {
          "application/json": { schema: sessionCommandBodyOpenApiSchema },
        },
      },
      responses: {
        200: {
          description: "Created command message",
          content: {
            "application/json": { schema: resolver(OpenCodeMessage.WithParts) },
          },
        },
        ...routeErrors(400, 403, 409),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", SessionIDParamSchema),
    validator("json", sessionInteractionBodySchema),
    postSessionCommandHandler,
  )
  .get(
    "/:sessionID/teaching-state",
    describeRoute({
      operationId: "session.teachingState",
      summary: "Get Buddy teaching runtime state for a session",
      responses: {
        200: {
          description: "Teaching runtime state",
          content: {
            "application/json": { schema: resolver(teachingSessionStateSchema) },
          },
        },
        204: {
          description: "No Buddy teaching state exists for this session yet",
        },
        ...routeErrors(403),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", SessionIDParamSchema),
    getTeachingStateHandler,
  )
  .post(
    "/:sessionID/abort",
    describeRoute({
      operationId: "session.abort",
      summary: "Abort active session run",
      responses: {
        200: {
          description: "Whether a running session was aborted",
          content: {
            "application/json": booleanJsonResponse,
          },
        },
        ...routeErrors(403),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", SessionIDParamSchema),
    abortSessionHandler,
  )
