import { Hono } from "hono"
import { createFactory } from "hono/factory"
import { describeRoute, resolver, validator } from "hono-openapi"
import { Schema } from "effect"
import z from "zod"
import { Session as OpenCodeSession } from "@buddy/opencode-adapter/session"
import { SessionStatus as OpenCodeSessionStatus } from "@buddy/opencode-adapter/session-status"
import { MessageV2 as OpenCodeMessage } from "@buddy/opencode-adapter/message"
import {
  PERSONAS,
  PERSONA_SURFACES,
  TEACHING_WORKSPACE_STATES,
} from "@buddy/backend/learning/shared/teaching-vocabulary"
import { toOpenApiSchema } from "../http/effect-schema"
import {
  routeErrors,
  directoryQuerySchema,
  SessionIDParamSchema,
  booleanJsonResponse,
} from "../http"
import {
  abortSessionRun,
  getSessionMermaidRepairStatus,
  getSessionStatus,
  getSessionById,
  forkSessionById,
  listSessionMessages,
  patchSessionById,
  postSessionCommand,
  postSessionMermaidRepairAsync,
  postSessionSvgRepairAsync,
  postSessionPrompt,
  postSessionPromptAsync,
  proxySessionCollection,
  revertSessionById,
  summarizeSessionById,
  unrevertSessionById,
} from "../session"
import { getTeachingState } from "../learning/adapters/http/session/state-actions"
import {
  SVG_RENDER_MAX_SOURCE_BYTES,
  SVG_REPORTED_FENCE_MAX_BYTES,
  SVG_SOURCE_FORMATS,
  SvgTextSourceSchema,
} from "../learning/features/svg-rendering/service/contracts"
import { readBoundedRequestBody, replayRequestBody } from "../http/bounded-request-body"

const sessionRouteFactory = createFactory()
const SESSION_SVG_REPAIR_ID_MAX_CHARACTERS = 256
const SESSION_SVG_REPAIR_JSON_STRING_EXPANSION_FACTOR = 6
const SESSION_SVG_REPAIR_JSON_FIXED_BYTES = 4 * 1024
const SESSION_SVG_REPAIR_MAX_REQUEST_BODY_BYTES =
  (SVG_REPORTED_FENCE_MAX_BYTES +
    SVG_RENDER_MAX_SOURCE_BYTES +
    SESSION_SVG_REPAIR_ID_MAX_CHARACTERS * 2) *
    SESSION_SVG_REPAIR_JSON_STRING_EXPANSION_FACTOR +
  SESSION_SVG_REPAIR_JSON_FIXED_BYTES

const [listSessionsHandler] = sessionRouteFactory.createHandlers(proxySessionCollection)
const [createSessionHandler] = sessionRouteFactory.createHandlers(proxySessionCollection)
const [getSessionStatusHandler] = sessionRouteFactory.createHandlers(getSessionStatus)
const [getSessionHandler] = sessionRouteFactory.createHandlers(getSessionById)
const [updateSessionHandler] = sessionRouteFactory.createHandlers(patchSessionById)
const [postSessionSummarizeHandler] = sessionRouteFactory.createHandlers(summarizeSessionById)
const [listSessionMessagesHandler] = sessionRouteFactory.createHandlers(listSessionMessages)
const [postSessionPromptHandler] = sessionRouteFactory.createHandlers(postSessionPrompt)
const [postSessionPromptAsyncHandler] = sessionRouteFactory.createHandlers(postSessionPromptAsync)
const [postSessionCommandHandler] = sessionRouteFactory.createHandlers(postSessionCommand)
const [postSessionMermaidRepairAsyncHandler] = sessionRouteFactory.createHandlers(
  postSessionMermaidRepairAsync,
)
const [postSessionSvgRepairAsyncHandler] = sessionRouteFactory.createHandlers(
  postSessionSvgRepairAsync,
)
const [getSessionMermaidRepairStatusHandler] = sessionRouteFactory.createHandlers(
  getSessionMermaidRepairStatus,
)
const [getTeachingStateHandler] = sessionRouteFactory.createHandlers(getTeachingState)
const [abortSessionHandler] = sessionRouteFactory.createHandlers(abortSessionRun)
const [forkSessionHandler] = sessionRouteFactory.createHandlers(forkSessionById)
const [revertSessionHandler] = sessionRouteFactory.createHandlers(revertSessionById)
const [unrevertSessionHandler] = sessionRouteFactory.createHandlers(unrevertSessionById)

const sessionListQuerySchema = z.object({
  directory: z.string().optional(),
  roots: z.coerce.boolean().optional(),
  start: z.coerce.number().optional(),
  search: z.string().optional(),
  limit: z.coerce.number().optional(),
})

const sessionMessagesQuerySchema = directoryQuerySchema.extend({
  limit: z.coerce.number().optional(),
  before: z.string().optional(),
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
    reading: {
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

const sessionSummarizeBodySchema = z.object({
  providerID: z.string().min(1),
  modelID: z.string().min(1),
  auto: z.boolean().optional(),
})

const sessionSummarizeBodyOpenApiSchema = {
  type: "object" as const,
  required: ["providerID", "modelID"],
  additionalProperties: false,
  properties: {
    providerID: { type: "string" as const },
    modelID: { type: "string" as const },
    auto: { type: "boolean" as const },
  },
}

const sessionMermaidRepairBodySchema = z.object({
  objectID: z.string().min(1),
  failedRenderKey: z.string().min(1),
})

const sessionSvgRepairBodySchema = z.object({
  assistantMessageID: z.string().min(1).max(SESSION_SVG_REPAIR_ID_MAX_CHARACTERS),
  partID: z.string().min(1).max(SESSION_SVG_REPAIR_ID_MAX_CHARACTERS),
  segmentIndex: z.number().int().nonnegative(),
  rawFence: z
    .string()
    .min(1)
    .refine(
      (rawFence) => Buffer.byteLength(rawFence, "utf8") <= SVG_REPORTED_FENCE_MAX_BYTES,
      `Reported chemistry fence exceeds the ${SVG_REPORTED_FENCE_MAX_BYTES}-byte limit.`,
    ),
  format: z.enum(SVG_SOURCE_FORMATS),
  source: SvgTextSourceSchema,
}).strict()

const sessionSvgRepairBodyOpenApiSchema = {
  type: "object" as const,
  required: [
    "assistantMessageID",
    "partID",
    "segmentIndex",
    "rawFence",
    "format",
    "source",
  ],
  additionalProperties: false,
  properties: {
    assistantMessageID: {
      type: "string" as const,
      maxLength: SESSION_SVG_REPAIR_ID_MAX_CHARACTERS,
    },
    partID: {
      type: "string" as const,
      maxLength: SESSION_SVG_REPAIR_ID_MAX_CHARACTERS,
    },
    segmentIndex: { type: "integer" as const, minimum: 0 },
    rawFence: { type: "string" as const, maxLength: SVG_REPORTED_FENCE_MAX_BYTES },
    format: { type: "string" as const, enum: [...SVG_SOURCE_FORMATS] },
    source: { type: "string" as const, maxLength: SVG_RENDER_MAX_SOURCE_BYTES },
  },
}

const svgRepairStatusResponseSchema = z.object({
  repairRequestID: z.string().min(1),
  status: z.enum(["running", "validated", "exhausted"]),
})

const sessionMermaidRepairBodyOpenApiSchema = {
  type: "object" as const,
  required: ["objectID", "failedRenderKey"],
  additionalProperties: false,
  properties: {
    objectID: { type: "string" as const },
    failedRenderKey: { type: "string" as const },
  },
}

const mermaidRepairStatusResponseSchema = z.object({
  repairRequestID: z.string().min(1),
  status: z.enum(["running", "succeeded", "exhausted"]),
  replacementRevisionID: z.string().min(1).optional(),
  lastErrorMessage: z.string().min(1).optional(),
})

const MermaidRepairRequestIDParamSchema = z.object({
  repairRequestID: z.string().min(1),
})

const sessionRevertBodySchema = z.object({
  messageID: z.string().min(1),
  partID: z.string().min(1).optional(),
})

const sessionRevertBodyOpenApiSchema = {
  type: "object" as const,
  required: ["messageID"],
  additionalProperties: false,
  properties: {
    messageID: { type: "string" as const },
    partID: { type: "string" as const },
  },
}

const sessionForkBodySchema = z.object({
  messageID: z.string().min(1),
})

const sessionForkBodyOpenApiSchema = {
  type: "object" as const,
  required: ["messageID"],
  additionalProperties: false,
  properties: {
    messageID: { type: "string" as const },
  },
}

const teachingSessionStateOutboundSchema = z.object({
  kind: z.enum(["message", "command"]),
  createdAt: z.string(),
  payload: z.object({}).passthrough(),
  fullSystemPrompt: z.string().optional(),
})

const sessionRuntimeActionSchema = z.enum(["allow", "deny"])

const resolvedSessionRuntimeSchema = z.object({
  persona: z.enum(PERSONAS),
  teachingWorkspaceState: z.enum(TEACHING_WORKSPACE_STATES),
    enabledFeatureIDs: z.array(z.string()),
  access: z.object({
    tools: z.record(z.string(), sessionRuntimeActionSchema),
    skills: z.record(z.string(), sessionRuntimeActionSchema),
    subagents: z.record(z.string(), sessionRuntimeActionSchema),
  }),
  ui: z.object({
    visibleSurfaces: z.array(z.enum(PERSONA_SURFACES)),
    defaultSurface: z.enum(PERSONA_SURFACES),
  }),
})

const teachingSessionStateSchema = z.object({
  sessionId: z.string(),
  persona: z.enum(PERSONAS),
  currentSurface: z.enum(PERSONA_SURFACES),
  teachingWorkspaceState: z.enum(TEACHING_WORKSPACE_STATES),
  sessionRuntime: resolvedSessionRuntimeSchema.optional(),
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
              schema: resolver(toOpenApiSchema(Schema.Array(OpenCodeSession.Info))),
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
            "application/json": { schema: resolver(toOpenApiSchema(OpenCodeSession.Info)) },
          },
        },
        ...routeErrors(403),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("json", toOpenApiSchema(Schema.optional(OpenCodeSession.create.schema))),
    createSessionHandler,
  )
  .get(
    "/status",
    describeRoute({
      operationId: "session.status",
      summary: "Get session status",
      responses: {
        200: {
          description: "Session status map",
          content: {
            "application/json": {
              schema: resolver(
                toOpenApiSchema(Schema.Record(Schema.String, OpenCodeSessionStatus.Info)),
              ),
            },
          },
        },
        ...routeErrors(403),
      },
    }),
    validator("query", directoryQuerySchema),
    getSessionStatusHandler,
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
            "application/json": { schema: resolver(toOpenApiSchema(OpenCodeSession.Info)) },
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
            "application/json": { schema: resolver(toOpenApiSchema(OpenCodeSession.Info)) },
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
              schema: resolver(toOpenApiSchema(Schema.Array(OpenCodeMessage.WithParts))),
            },
          },
        },
        ...routeErrors(403, 404),
      },
    }),
    validator("query", sessionMessagesQuerySchema),
    validator("param", SessionIDParamSchema),
    listSessionMessagesHandler,
  )
  .post(
    "/:sessionID/summarize",
    describeRoute({
      operationId: "session.summarize",
      summary: "Compact a session",
      requestBody: {
        required: true,
        content: {
          "application/json": { schema: sessionSummarizeBodyOpenApiSchema },
        },
      },
      responses: {
        200: {
          description: "Whether the session compaction completed",
          content: {
            "application/json": booleanJsonResponse,
          },
        },
        ...routeErrors(400, 403, 409),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", SessionIDParamSchema),
    validator("json", sessionSummarizeBodySchema),
    postSessionSummarizeHandler,
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
            "application/json": { schema: resolver(toOpenApiSchema(OpenCodeMessage.WithParts)) },
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
    "/:sessionID/prompt_async",
    describeRoute({
      operationId: "session.promptAsync",
      summary: "Queue a prompt for asynchronous session processing",
      requestBody: {
        required: true,
        content: {
          "application/json": { schema: sessionPromptBodyOpenApiSchema },
        },
      },
      responses: {
        204: {
          description: "Prompt accepted",
        },
        ...routeErrors(400, 403, 409),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", SessionIDParamSchema),
    validator("json", sessionInteractionBodySchema),
    postSessionPromptAsyncHandler,
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
            "application/json": { schema: resolver(toOpenApiSchema(OpenCodeMessage.WithParts)) },
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
  .post(
    "/:sessionID/mermaid-repair-async",
    describeRoute({
      operationId: "session.mermaidRepairAsync",
      summary: "Queue a Mermaid auto-repair prompt for a failed browser render",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: sessionMermaidRepairBodyOpenApiSchema,
          },
        },
      },
      responses: {
        200: {
          description: "Mermaid repair request accepted or exhausted immediately",
          content: {
            "application/json": {
              schema: resolver(mermaidRepairStatusResponseSchema),
            },
          },
        },
        ...routeErrors(400, 403, 404, 409, 413),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", SessionIDParamSchema),
    validator("json", sessionMermaidRepairBodySchema),
    postSessionMermaidRepairAsyncHandler,
  )
  .post(
    "/:sessionID/svg-repair-async",
    describeRoute({
      operationId: "session.svgRepairAsync",
      summary: "Queue an SVG auto-repair prompt for a failed native render",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: sessionSvgRepairBodyOpenApiSchema,
          },
        },
      },
      responses: {
        200: {
          description: "SVG repair request accepted or already recorded",
          content: {
            "application/json": {
              schema: resolver(svgRepairStatusResponseSchema),
            },
          },
        },
        ...routeErrors(400, 403, 404, 409, 413),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", SessionIDParamSchema),
    async (c, next) => {
      const result = await readBoundedRequestBody(
        c.req.raw,
        SESSION_SVG_REPAIR_MAX_REQUEST_BODY_BYTES,
      )
      if (result.status === "too_large") {
        return c.json({ error: "SVG repair request exceeds the request size limit." }, 413)
      }
      c.req.raw = replayRequestBody(c.req.raw, result.body)
      await next()
    },
    validator("json", sessionSvgRepairBodySchema),
    postSessionSvgRepairAsyncHandler,
  )
  .get(
    "/:sessionID/mermaid-repair/:repairRequestID",
    describeRoute({
      operationId: "session.mermaidRepairStatus",
      summary: "Get Mermaid auto-repair request status",
      responses: {
        200: {
          description: "Mermaid repair request status",
          content: {
            "application/json": {
              schema: resolver(mermaidRepairStatusResponseSchema),
            },
          },
        },
        ...routeErrors(400, 403, 404),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", SessionIDParamSchema.merge(MermaidRepairRequestIDParamSchema)),
    getSessionMermaidRepairStatusHandler,
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
    "/:sessionID/fork",
    describeRoute({
      operationId: "session.fork",
      summary: "Fork a session from a message",
      requestBody: {
        required: true,
        content: {
          "application/json": { schema: sessionForkBodyOpenApiSchema },
        },
      },
      responses: {
        200: {
          description: "Forked session",
          content: {
            "application/json": { schema: resolver(toOpenApiSchema(OpenCodeSession.Info)) },
          },
        },
        ...routeErrors(400, 403, 404, 409),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", SessionIDParamSchema),
    validator("json", sessionForkBodySchema),
    forkSessionHandler,
  )
  .post(
    "/:sessionID/revert",
    describeRoute({
      operationId: "session.revert",
      summary: "Undo session messages and file changes to a message",
      requestBody: {
        required: true,
        content: {
          "application/json": { schema: sessionRevertBodyOpenApiSchema },
        },
      },
      responses: {
        200: {
          description: "Updated session after revert",
          content: {
            "application/json": { schema: resolver(toOpenApiSchema(OpenCodeSession.Info)) },
          },
        },
        ...routeErrors(400, 403, 404, 409),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", SessionIDParamSchema),
    validator("json", sessionRevertBodySchema),
    revertSessionHandler,
  )
  .post(
    "/:sessionID/unrevert",
    describeRoute({
      operationId: "session.unrevert",
      summary: "Restore reverted session messages and file changes",
      responses: {
        200: {
          description: "Updated session after restoring reverted state",
          content: {
            "application/json": { schema: resolver(toOpenApiSchema(OpenCodeSession.Info)) },
          },
        },
        ...routeErrors(403, 404, 409),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", SessionIDParamSchema),
    unrevertSessionHandler,
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
