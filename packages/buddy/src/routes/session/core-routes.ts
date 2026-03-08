import type { Hono } from "hono"
import {
  AnyObjectSchema,
  ErrorSchema,
  MessageWithPartsSchema,
  SessionIDPath,
  SessionInfoSchema,
} from "../../openapi/compatibility-schemas.js"
import { compatibilityRoute } from "../../openapi/compatibility-route.js"
import { isJsonContentType, safeReadJson } from "../shared/http.js"
import { directoryParameters } from "../shared/openapi.js"
import { ensureSessionExistsInDirectory } from "./lookup.js"
import { ensureAllowedDirectory } from "../support/directory.js"
import { normalizeErrorResponse } from "../support/error-normalization.js"
import { fetchOpenCode, proxyToOpenCode } from "../support/proxy.js"
import { isSessionInRequestedProject } from "../support/session.js"

export function registerSessionCoreRoutes(app: Hono): Hono {
  return app
    .get(
      "/",
      compatibilityRoute({
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
      }),
      async (c) => {
        return proxyToOpenCode(c, {
          targetPath: "/session",
        })
      },
    )
    .post(
      "/",
      compatibilityRoute({
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
      }),
      async (c) => {
        return proxyToOpenCode(c, {
          targetPath: "/session",
        })
      },
    )
    .get(
      "/:sessionID",
      compatibilityRoute({
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
      }),
      async (c) => {
        const directoryResult = ensureAllowedDirectory(c.req.raw)
        if (!directoryResult.ok) return directoryResult.response

        const sessionID = c.req.param("sessionID")
        const response = await fetchOpenCode({
          directory: directoryResult.directory,
          method: "GET",
          path: `/session/${encodeURIComponent(sessionID)}`,
          query: new URL(c.req.url).search,
          headers: new Headers(c.req.raw.headers),
        })

        const normalized = await normalizeErrorResponse(response)
        if (!normalized.ok) return normalized
        if (!isJsonContentType(normalized.headers.get("content-type"))) return normalized

        const session = await safeReadJson(normalized, { clone: true })
        const matchesProject = await isSessionInRequestedProject(directoryResult.directory, session)
        if (!matchesProject) {
          return c.json({ error: "Session not found" }, 404)
        }

        return normalized
      },
    )
    .patch(
      "/:sessionID",
      compatibilityRoute({
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
      }),
      async (c) => {
        const directoryResult = ensureAllowedDirectory(c.req.raw)
        if (!directoryResult.ok) return directoryResult.response

        const sessionID = c.req.param("sessionID")
        const lookupResponse = await ensureSessionExistsInDirectory({
          directory: directoryResult.directory,
          sessionID,
          request: c.req.raw,
        })
        if (lookupResponse) return lookupResponse

        return proxyToOpenCode(c, {
          targetPath: `/session/${encodeURIComponent(sessionID)}`,
        })
      },
    )
    .get(
      "/:sessionID/message",
      compatibilityRoute({
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
          403: {
            description: "Directory is outside allowed roots",
            content: {
              "application/json": { schema: ErrorSchema },
            },
          },
        },
      }),
      async (c) => {
        const sessionID = c.req.param("sessionID")
        return proxyToOpenCode(c, {
          targetPath: `/session/${encodeURIComponent(sessionID)}/message`,
        })
      },
    )
}
