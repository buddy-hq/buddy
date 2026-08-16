import { NATIVE_RESOURCE_FORMATS } from "@buddy/workspace-file-policy"
import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { directoryQuerySchema, routeErrors, runRouteTask, withDirectoryRoute } from "../http"
import {
  copyNativeResourceToNotebook,
  NotebookUploadError,
} from "../notebook-uploads/notebook-upload-service"

const NotebookUploadCreateBodySchema = z
  .object({
    sourcePath: z.string().trim().min(1),
  })
  .strict()

const NotebookUploadSchema = z
  .object({
    uploadID: z.string().length(10),
    displayName: z.string().min(1),
    format: z.enum(NATIVE_RESOURCE_FORMATS),
    mime: z.string().min(1),
    workspacePath: z.string().min(1),
    absolutePath: z.string().min(1),
    sizeBytes: z.number().int().nonnegative(),
  })
  .strict()

function mapNotebookUploadRouteError<TError>(error: TError): Response | undefined {
  if (!(error instanceof NotebookUploadError)) return undefined
  return Response.json({ error: error.message }, { status: 400 })
}

export const NotebookUploadRoutes = new Hono().post(
  "/",
  describeRoute({
    operationId: "notebookUpload.create",
    summary: "Copy a native document attachment into the active notebook",
    responses: {
      200: {
        description: "Completed notebook upload",
        content: {
          "application/json": { schema: resolver(NotebookUploadSchema) },
        },
      },
      ...routeErrors(400, 403),
    },
  }),
  validator("query", directoryQuerySchema),
  validator("json", NotebookUploadCreateBodySchema),
  async (c) =>
    withDirectoryRoute(c, async (context) =>
      runRouteTask({
        task: async () =>
          c.json(
            await copyNativeResourceToNotebook({
              directory: context.directory,
              sourcePath: c.req.valid("json").sourcePath,
            }),
          ),
        mapError: mapNotebookUploadRouteError,
      }),
    ),
)
