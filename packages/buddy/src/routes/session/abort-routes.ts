import type { Hono } from "hono"
import {
  BooleanSchema,
  ErrorSchema,
  SessionIDPath,
} from "../../openapi/compatibility-schemas.js"
import { compatibilityRoute } from "../../openapi/compatibility-route.js"
import { directoryParameters } from "../shared/openapi.js"
import { ensureAllowedDirectory } from "../support/directory.js"
import { normalizeErrorResponse } from "../support/error-normalization.js"
import { fetchOpenCode } from "../support/proxy.js"
import { loadSessionStatus } from "../support/session.js"

export function registerSessionAbortRoutes(app: Hono): Hono {
  return app.post(
    "/:sessionID/abort",
    compatibilityRoute({
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
    }),
    async (c) => {
      const directoryResult = ensureAllowedDirectory(c.req.raw)
      if (!directoryResult.ok) return directoryResult.response

      const sessionID = c.req.param("sessionID")
      const statuses = await loadSessionStatus(directoryResult.directory, c.req.raw)
      const current = statuses?.[sessionID]
      if (!current || current.type === "idle") {
        return c.json(false)
      }

      const response = await fetchOpenCode({
        directory: directoryResult.directory,
        method: c.req.method.toUpperCase(),
        path: `/session/${encodeURIComponent(sessionID)}/abort`,
        headers: new Headers(c.req.raw.headers),
      })
      const normalized = await normalizeErrorResponse(response)

      if (!normalized.ok) return normalized
      return c.json(true)
    },
  )
}
