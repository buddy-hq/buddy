import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { directoryQuerySchema, routeErrors, runRouteTask, withDirectoryRoute } from "../http"
import { assertSessionExistsInDirectory } from "../session"
import { mapWhiteboardRouteError } from "../learning/features/whiteboard/errors"
import {
  createBlankWhiteboardScene,
  readWhiteboardRevision,
  readWhiteboardSceneLatestRevision,
  readWhiteboardSession,
  saveWhiteboardLearnerEdit,
} from "../learning/features/whiteboard/service/store"
import {
  WhiteboardShareRequestSchema,
  WhiteboardShareResponseSchema,
  createExcalidrawShareLink,
} from "../learning/features/whiteboard/service/share"
import {
  WhiteboardLearnerEditRequestSchema,
  WhiteboardRevisionSchema,
  WhiteboardSessionReadSchema,
} from "../learning/features/whiteboard/service/types"

const sessionIDParamSchema = z.object({
  sessionID: z.string().min(1),
})

const revisionIDParamSchema = sessionIDParamSchema.extend({
  revisionID: z.string().min(1),
})

const sceneIDParamSchema = sessionIDParamSchema.extend({
  sceneID: z.string().min(1),
})

export const WhiteboardRoutes = new Hono()
  .get(
    "/session/:sessionID",
    describeRoute({
      operationId: "whiteboards.read",
      summary: "Read the active session whiteboard",
      responses: {
        200: {
          description: "Current whiteboard state",
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
  .post(
    "/session/:sessionID/share",
    describeRoute({
      operationId: "whiteboards.share.create",
      summary: "Create an encrypted Excalidraw share link for a whiteboard",
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
  .get(
    "/session/:sessionID/scene/:sceneID/latest",
    describeRoute({
      operationId: "whiteboards.scene.latest.read",
      summary: "Read the latest revision for a whiteboard scene",
      responses: {
        200: {
          description: "Latest whiteboard scene revision",
          content: {
            "application/json": { schema: resolver(WhiteboardRevisionSchema) },
          },
        },
        ...routeErrors(400, 403, 404),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", sceneIDParamSchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const params = c.req.valid("param")
            await assertSessionExistsInDirectory({
              directory: context.directory,
              sessionID: params.sessionID,
              request: c.req.raw,
            })
            return c.json(
              await readWhiteboardSceneLatestRevision(
                context.directory,
                params.sessionID,
                params.sceneID,
              ),
            )
          },
          mapError: mapWhiteboardRouteError,
        }),
      ),
  )
  .get(
    "/session/:sessionID/revision/:revisionID",
    describeRoute({
      operationId: "whiteboards.revision.read",
      summary: "Read an immutable whiteboard revision",
      responses: {
        200: {
          description: "Historical whiteboard revision",
          content: {
            "application/json": { schema: resolver(WhiteboardRevisionSchema) },
          },
        },
        ...routeErrors(400, 403, 404),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", revisionIDParamSchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const params = c.req.valid("param")
            await assertSessionExistsInDirectory({
              directory: context.directory,
              sessionID: params.sessionID,
              request: c.req.raw,
            })
            return c.json(
              await readWhiteboardRevision(
                context.directory,
                params.sessionID,
                params.revisionID,
              ),
            )
          },
          mapError: mapWhiteboardRouteError,
        }),
      ),
  )
  .post(
    "/session/:sessionID/scene",
    describeRoute({
      operationId: "whiteboards.scene.create",
      summary: "Create a blank whiteboard scene",
      responses: {
        200: {
          description: "Whiteboard state with a new active scene",
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
            return c.json(await createBlankWhiteboardScene(context.directory, sessionID))
          },
          mapError: mapWhiteboardRouteError,
        }),
      ),
  )
  .put(
    "/session/:sessionID/scene/:sceneID",
    describeRoute({
      operationId: "whiteboards.scene.saveLearnerEdit",
      summary: "Persist a learner-edited whiteboard revision",
      responses: {
        200: {
          description: "Whiteboard state after learner edit",
          content: {
            "application/json": { schema: resolver(WhiteboardSessionReadSchema) },
          },
        },
        ...routeErrors(400, 403, 404, 409),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", sceneIDParamSchema),
    validator("json", WhiteboardLearnerEditRequestSchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const params = c.req.valid("param")
            await assertSessionExistsInDirectory({
              directory: context.directory,
              sessionID: params.sessionID,
              request: c.req.raw,
            })
            return c.json(
              await saveWhiteboardLearnerEdit({
                directory: context.directory,
                sessionID: params.sessionID,
                sceneID: params.sceneID,
                edit: c.req.valid("json"),
              }),
            )
          },
          mapError: mapWhiteboardRouteError,
        }),
      ),
  )
