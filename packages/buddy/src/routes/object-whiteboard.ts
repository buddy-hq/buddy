import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { directoryQuerySchema, routeErrors, runRouteTask, withDirectoryRoute } from "../http"
import { assertSessionExistsInDirectory } from "../session"
import { mapWhiteboardRouteError } from "../learning/features/whiteboard/errors"
import {
  ensureWhiteboardObjectForSession,
  readWhiteboardSession,
  saveWhiteboardLearnerEdit,
  saveWhiteboardRenderReport,
} from "../learning/features/whiteboard/service/store"
import {
  WhiteboardShareRequestSchema,
  WhiteboardShareResponseSchema,
  createExcalidrawShareLink,
} from "../learning/features/whiteboard/service/share"
import {
  WhiteboardLearnerEditRequestSchema,
  WhiteboardRenderReportSaveResponseSchema,
  WhiteboardRenderReportSchema,
  WhiteboardSessionReadSchema,
} from "../learning/features/whiteboard/service/types"

const sessionIDParamSchema = z.object({
  sessionID: z.string().min(1),
})

export const ObjectWhiteboardRoutes = new Hono()
  .get(
    "/session/:sessionID/peek",
    describeRoute({
      operationId: "objectWhiteboard.session.peek",
      summary: "Read existing session whiteboard state without creating an object",
      responses: {
        200: {
          description: "Existing whiteboard object state",
          content: {
            "application/json": { schema: resolver(WhiteboardSessionReadSchema) },
          },
        },
        ...routeErrors(400, 403, 404),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", sessionIDParamSchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const sessionID = c.req.valid("param").sessionID
            await assertSessionExistsInDirectory({
              directory: context.directory,
              sessionID,
              request: c.req.raw,
            })
            return c.json(await readWhiteboardSession(context.directory, sessionID))
          },
          mapError: mapWhiteboardRouteError,
        }),
      ),
  )
  .get(
    "/session/:sessionID",
    describeRoute({
      operationId: "objectWhiteboard.session.read",
      summary: "Read the session whiteboard object state",
      responses: {
        200: {
          description: "Current whiteboard object state",
          content: {
            "application/json": { schema: resolver(WhiteboardSessionReadSchema) },
          },
        },
        ...routeErrors(400, 403, 404),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", sessionIDParamSchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const sessionID = c.req.valid("param").sessionID
            await assertSessionExistsInDirectory({
              directory: context.directory,
              sessionID,
              request: c.req.raw,
            })
            await ensureWhiteboardObjectForSession({
              directory: context.directory,
              sessionID,
            })
            return c.json(await readWhiteboardSession(context.directory, sessionID))
          },
          mapError: mapWhiteboardRouteError,
        }),
      ),
  )
  .put(
    "/session/:sessionID",
    describeRoute({
      operationId: "objectWhiteboard.session.saveLearnerEdit",
      summary: "Persist the learner-edited current whiteboard object state",
      responses: {
        200: {
          description: "Whiteboard object state after updating the current board",
          content: {
            "application/json": { schema: resolver(WhiteboardSessionReadSchema) },
          },
        },
        ...routeErrors(400, 403, 404, 409),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", sessionIDParamSchema),
    validator("json", WhiteboardLearnerEditRequestSchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const sessionID = c.req.valid("param").sessionID
            await assertSessionExistsInDirectory({
              directory: context.directory,
              sessionID,
              request: c.req.raw,
            })
            return c.json(
              await saveWhiteboardLearnerEdit({
                directory: context.directory,
                sessionID,
                edit: c.req.valid("json"),
              }),
            )
          },
          mapError: mapWhiteboardRouteError,
        }),
      ),
  )
  .put(
    "/session/:sessionID/render-report",
    describeRoute({
      operationId: "objectWhiteboard.session.renderReport.save",
      summary: "Persist rendered whiteboard object layout facts for the current board",
      responses: {
        200: {
          description: "Render report save status",
          content: {
            "application/json": { schema: resolver(WhiteboardRenderReportSaveResponseSchema) },
          },
        },
        ...routeErrors(400, 403, 404),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", sessionIDParamSchema),
    validator("json", WhiteboardRenderReportSchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const sessionID = c.req.valid("param").sessionID
            await assertSessionExistsInDirectory({
              directory: context.directory,
              sessionID,
              request: c.req.raw,
            })
            return c.json(
              await saveWhiteboardRenderReport({
                directory: context.directory,
                sessionID,
                report: c.req.valid("json"),
              }),
            )
          },
          mapError: mapWhiteboardRouteError,
        }),
      ),
  )
  .post(
    "/session/:sessionID/share",
    describeRoute({
      operationId: "objectWhiteboard.session.share.create",
      summary: "Create an encrypted Excalidraw share link for a whiteboard object",
      responses: {
        200: {
          description: "Excalidraw share link",
          content: {
            "application/json": { schema: resolver(WhiteboardShareResponseSchema) },
          },
        },
        ...routeErrors(400, 403, 404, 502),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", sessionIDParamSchema),
    validator("json", WhiteboardShareRequestSchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const sessionID = c.req.valid("param").sessionID
            await assertSessionExistsInDirectory({
              directory: context.directory,
              sessionID,
              request: c.req.raw,
            })
            return c.json(await createExcalidrawShareLink(c.req.valid("json")))
          },
          mapError: mapWhiteboardRouteError,
        }),
      ),
  )
