import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { mapArtifactRouteError } from "../artifacts"
import { directoryQuerySchema, routeErrors, runRouteTask, withDirectoryRoute } from "../http"
import {
  PROJECT_FILE_NOT_FOUND_ERROR,
  PresentedMediaArtifactManifestSchema,
  PresentedMediaValidationError,
  readPresentedMediaArtifact,
  readPresentedMediaItemAvailability,
  readPresentedMediaRawArtifactResponse,
  resolvePresentedMediaPathInfo,
} from "../learning/features/media-presentations/service/file-media"

const artifactIDParamSchema = z.object({
  artifactID: z.string(),
})

const mediaRawParamSchema = z.object({
  artifactID: z.string(),
  itemID: z.string().min(1),
})

const mediaRawQuerySchema = directoryQuerySchema.extend({
  fileName: z.string().min(1).optional(),
})

const mediaResolveQuerySchema = directoryQuerySchema.extend({
  path: z.string().min(1),
})

const mediaAvailabilityResponseSchema = z.object({
  status: z.enum(["available", "missing", "error"]),
  message: z.string().nullable(),
})

const mediaResolveResponseSchema = z.object({
  inputPath: z.string().min(1),
  absolutePath: z.string().min(1),
  displayPath: z.string().min(1),
  workspacePath: z.string().nullable(),
  fileName: z.string().min(1),
  mediaKind: z.enum([
    "image",
    "pdf",
    "presentation",
    "document",
    "spreadsheet",
    "video",
    "audio",
    "archive",
    "other",
  ]),
  renderMode: z.enum(["image", "audio", "video", "pdf", "file"]),
  mimeType: z.string().nullable(),
  sizeBytes: z.number().int().nonnegative().nullable(),
  modifiedAt: z.string().nullable(),
  actionCapabilities: z.object({
    canOpenDefaultApp: z.boolean(),
    canRevealInFileManager: z.boolean(),
    canOpenInWorkspacePanel: z.boolean(),
  }),
  availability: mediaAvailabilityResponseSchema,
})

function mapMediaRouteError(error: unknown): Response | undefined {
  if (error instanceof PresentedMediaValidationError) {
    const status = error.message === PROJECT_FILE_NOT_FOUND_ERROR ? 404 : 400
    return Response.json({ error: error.message }, { status })
  }
  return mapArtifactRouteError(error)
}

export const MediaPresentationRoutes = new Hono()
  .get(
    "/resolve",
    describeRoute({
      operationId: "mediaPresentation.resolve",
      summary: "Resolve local file presentation metadata",
      responses: {
        200: {
          description: "Resolved file open metadata",
          content: {
            "application/json": {
              schema: resolver(mediaResolveResponseSchema),
            },
          },
        },
        ...routeErrors(400, 403, 404),
      },
    }),
    validator("query", mediaResolveQuerySchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () =>
            Response.json(
              await resolvePresentedMediaPathInfo({
                directory: context.directory,
                path: c.req.valid("query").path,
              }),
            ),
          mapError: mapMediaRouteError,
        }),
      ),
  )
  .get(
    "/:artifactID/items/:itemID/availability",
    describeRoute({
      operationId: "mediaPresentation.availability",
      summary: "Read current availability for a presented media item",
      responses: {
        200: {
          description: "Current media item availability",
          content: {
            "application/json": {
              schema: resolver(mediaAvailabilityResponseSchema),
            },
          },
        },
        ...routeErrors(400, 403, 404),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", mediaRawParamSchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const params = c.req.valid("param")
            return Response.json(
              await readPresentedMediaItemAvailability({
                directory: context.directory,
                artifactID: params.artifactID,
                itemID: params.itemID,
              }),
            )
          },
          mapError: mapMediaRouteError,
        }),
      ),
  )
  .get(
    "/:artifactID",
    describeRoute({
      operationId: "mediaPresentation.read",
      summary: "Read persisted media presentation artifact",
      responses: {
        200: {
          description: "Media presentation artifact",
          content: {
            "application/json": {
              schema: resolver(PresentedMediaArtifactManifestSchema),
            },
          },
        },
        ...routeErrors(400, 403, 404),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", artifactIDParamSchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () =>
            Response.json(
              await readPresentedMediaArtifact(
                context.directory,
                c.req.valid("param").artifactID,
              ),
            ),
          mapError: mapMediaRouteError,
        }),
      ),
  )
  .get(
    "/:artifactID/raw/:itemID",
    describeRoute({
      operationId: "mediaPresentation.raw",
      summary: "Read raw presented media bytes",
      responses: {
        200: {
          description: "Raw presented media bytes",
          content: {
            "application/octet-stream": {
              schema: resolver(z.string()),
            },
          },
        },
        ...routeErrors(400, 403, 404),
      },
    }),
    validator("param", mediaRawParamSchema),
    validator("query", mediaRawQuerySchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const params = c.req.valid("param")
            const query = c.req.valid("query")
            return readPresentedMediaRawArtifactResponse({
              directory: context.directory,
              artifactID: params.artifactID,
              itemID: params.itemID,
              downloadName: query.fileName,
              includeBody: true,
              rangeHeader: c.req.header("range"),
            })
          },
          mapError: mapMediaRouteError,
        }),
      ),
  )
  .on(
    "HEAD",
    "/:artifactID/raw/:itemID",
    validator("param", mediaRawParamSchema),
    validator("query", mediaRawQuerySchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const params = c.req.valid("param")
            const query = c.req.valid("query")
            return readPresentedMediaRawArtifactResponse({
              directory: context.directory,
              artifactID: params.artifactID,
              itemID: params.itemID,
              downloadName: query.fileName,
              includeBody: false,
              rangeHeader: c.req.header("range"),
            })
          },
          mapError: mapMediaRouteError,
        }),
      ),
  )
