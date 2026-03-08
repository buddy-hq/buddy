import type { Hono } from "hono"
import {
  AnyObjectSchema,
  ErrorSchema,
  MessageWithPartsSchema,
  SessionIDPath,
} from "../../openapi/compatibility-schemas.js"
import { compatibilityRoute } from "../../openapi/compatibility-route.js"
import { directoryParameters } from "../shared/openapi.js"
import { withConfigSync } from "../shared/route-helpers.js"
import { createSessionCommandTransform } from "./command-transform.js"
import { createSessionMessageTransform } from "./message-transform.js"
import { mapSessionTransformError, runSessionTransformProxy } from "./proxy-transform.js"
import type { SessionTransformContext } from "./transform-types.js"

export function registerSessionInteractionRoutes(app: Hono): Hono {
  return app
    .post(
      "/:sessionID/message",
      compatibilityRoute({
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
      }),
      async (c) => {
        const syncResult = await withConfigSync(c.req.raw, {
          operation: "prompt",
        })
        if (!syncResult.ok) return syncResult.response

        const sessionID = c.req.param("sessionID")

        const transformContext: SessionTransformContext = {
          directory: syncResult.value.directory,
          sessionID,
          request: c.req.raw,
        }
        const promptTransform = createSessionMessageTransform({
          context: transformContext,
        })

        try {
          return await runSessionTransformProxy({
            c,
            targetPath: `/session/${encodeURIComponent(sessionID)}/message`,
            onAccepted: promptTransform.onAccepted,
            rollbackState: promptTransform.rollbackState,
            onTransform: promptTransform.onTransform,
          })
        } catch (error) {
          promptTransform.rollbackState?.()
          const response = mapSessionTransformError(c, error)
          if (response) return response
          throw error
        }
      },
    )
    .post(
      "/:sessionID/command",
      compatibilityRoute({
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
      }),
      async (c) => {
        const syncResult = await withConfigSync(c.req.raw, {
          operation: "command",
        })
        if (!syncResult.ok) return syncResult.response

        const sessionID = c.req.param("sessionID")

        const transformContext: SessionTransformContext = {
          directory: syncResult.value.directory,
          sessionID,
          request: c.req.raw,
        }
        const commandTransform = createSessionCommandTransform({
          context: transformContext,
        })

        try {
          return await runSessionTransformProxy({
            c,
            targetPath: `/session/${encodeURIComponent(sessionID)}/command`,
            rollbackState: commandTransform.rollbackState,
            onTransform: commandTransform.onTransform,
          })
        } catch (error) {
          commandTransform.rollbackState?.()
          const response = mapSessionTransformError(c, error)
          if (response) return response
          throw error
        }
      },
    )
}
