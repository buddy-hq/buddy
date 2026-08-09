import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { BuddyObjectIDSchema, mapBuddyObjectRouteError } from "../objects"
import { directoryQuerySchema, routeErrors, runRouteTask, withDirectoryRoute } from "../http"
import { mapWhiteboardRouteError } from "../learning/features/whiteboard/errors"
import {
  createBlankWhiteboardObject,
  readWhiteboardObject,
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
  WhiteboardObjectReadSchema,
  WhiteboardRenderReportSaveResponseSchema,
  WhiteboardRenderReportSchema,
} from "../learning/features/whiteboard/service/types"

const objectIDParamSchema = z.object({
  objectID: BuddyObjectIDSchema,
})
const WHITEBOARD_DIRECT_CREATE_ORIGIN_REASON = "direct-whiteboard-creation"

function mapWhiteboardObjectRouteError(error: unknown): Response | undefined {
  return mapWhiteboardRouteError(error) ?? mapBuddyObjectRouteError(error)
}

export const ObjectWhiteboardRoutes = new Hono()
  .post(
    "/",
    describeRoute({
      operationId: "objectWhiteboard.object.create",
      summary: "Create an empty whiteboard object",
      responses: {
        201: {
          description: "New empty whiteboard object",
          content: {
            "application/json": { schema: resolver(WhiteboardObjectReadSchema) },
          },
        },
        ...routeErrors(400, 403, 500),
      },
    }),
    validator("query", directoryQuerySchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () =>
            c.json(
              await createBlankWhiteboardObject({
                directory: context.directory,
                origin: {
                  kind: "app",
                  reason: WHITEBOARD_DIRECT_CREATE_ORIGIN_REASON,
                },
              }),
              201,
            ),
          mapError: mapWhiteboardObjectRouteError,
        }),
      ),
  )
  .get(
    "/:objectID",
    describeRoute({
      operationId: "objectWhiteboard.object.read",
      summary: "Read a whiteboard object state",
      responses: {
        200: {
          description: "Current whiteboard object state",
          content: {
            "application/json": { schema: resolver(WhiteboardObjectReadSchema) },
          },
        },
        ...routeErrors(400, 403, 404, 410, 500),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", objectIDParamSchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () =>
            c.json(await readWhiteboardObject(context.directory, c.req.valid("param").objectID)),
          mapError: mapWhiteboardObjectRouteError,
        }),
      ),
  )
  .put(
    "/:objectID",
    describeRoute({
      operationId: "objectWhiteboard.object.saveLearnerEdit",
      summary: "Persist a learner edit to a whiteboard object",
      responses: {
        200: {
          description: "Whiteboard object state after updating the current board",
          content: {
            "application/json": { schema: resolver(WhiteboardObjectReadSchema) },
          },
        },
        ...routeErrors(400, 403, 404, 409, 410, 500),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", objectIDParamSchema),
    validator("json", WhiteboardLearnerEditRequestSchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () =>
            c.json(
              await saveWhiteboardLearnerEdit({
                directory: context.directory,
                objectID: c.req.valid("param").objectID,
                edit: c.req.valid("json"),
              }),
            ),
          mapError: mapWhiteboardObjectRouteError,
        }),
      ),
  )
  .put(
    "/:objectID/render-report",
    describeRoute({
      operationId: "objectWhiteboard.object.renderReport.save",
      summary: "Persist rendered layout facts for a whiteboard object",
      responses: {
        200: {
          description: "Render report save status",
          content: {
            "application/json": { schema: resolver(WhiteboardRenderReportSaveResponseSchema) },
          },
        },
        ...routeErrors(400, 403, 404, 410, 500),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", objectIDParamSchema),
    validator("json", WhiteboardRenderReportSchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () =>
            c.json(
              await saveWhiteboardRenderReport({
                directory: context.directory,
                objectID: c.req.valid("param").objectID,
                report: c.req.valid("json"),
              }),
            ),
          mapError: mapWhiteboardObjectRouteError,
        }),
      ),
  )
  .post(
    "/:objectID/share",
    describeRoute({
      operationId: "objectWhiteboard.object.share.create",
      summary: "Create an encrypted Excalidraw share link for a whiteboard object",
      responses: {
        200: {
          description: "Excalidraw share link",
          content: {
            "application/json": { schema: resolver(WhiteboardShareResponseSchema) },
          },
        },
        ...routeErrors(400, 403, 404, 410, 500, 502),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", objectIDParamSchema),
    validator("json", WhiteboardShareRequestSchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            await readWhiteboardObject(context.directory, c.req.valid("param").objectID)
            return c.json(await createExcalidrawShareLink(c.req.valid("json")))
          },
          mapError: mapWhiteboardObjectRouteError,
        }),
      ),
  )

export { mapWhiteboardObjectRouteError }
