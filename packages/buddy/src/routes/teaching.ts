import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import {
  activateTeachingWorkspaceFile,
  addTeachingWorkspaceFile,
  checkpointTeachingWorkspace,
  provisionTeachingWorkspace,
  readTeachingWorkspace,
  restoreTeachingWorkspace,
  saveTeachingWorkspace,
} from "../learning/adapters/http"
import {
  TeachingProvisionRequestSchema,
  TeachingWorkspaceActivateFileRequestSchema,
  TeachingWorkspaceCreateFileRequestSchema,
  TeachingWorkspaceResponseSchema,
  TeachingWorkspaceUpdateRequestSchema,
} from "../learning/capabilities"
import { directoryQuerySchema, routeErrors, withDirectoryRoute } from "../http"

const sessionIDParamSchema = z.object({
  sessionID: z.string(),
})

const workspaceOptionalQuerySchema = directoryQuerySchema.extend({
  optional: z.union([z.literal("0"), z.literal("1")]).optional(),
})

const checkpointResponseSchema = z.object({
  revision: z.number().int().nonnegative(),
  lessonFilePath: z.string(),
  checkpointFilePath: z.string(),
})

export const TeachingRoutes = (): Hono =>
  new Hono()
    .post(
      "/session/:sessionID/workspace",
      describeRoute({
        operationId: "teaching.workspace.provision",
        summary: "Provision or reuse session workspace",
        responses: {
          200: {
            description: "Teaching workspace state",
            content: {
              "application/json": { schema: resolver(TeachingWorkspaceResponseSchema) },
            },
          },
          ...routeErrors(400, 403),
        },
      }),
      validator("query", directoryQuerySchema),
      validator("param", sessionIDParamSchema),
      validator("json", TeachingProvisionRequestSchema.optional()),
      async (c) =>
        withDirectoryRoute(c, async (context) => {
          const provisionResult = await provisionTeachingWorkspace({
            directory: context.directory,
            sessionID: c.req.valid("param").sessionID,
            payload: c.req.valid("json") ?? {},
          })
          if (!provisionResult.ok) return provisionResult.response
          return c.json(provisionResult.value)
        }),
    )
    .get(
      "/session/:sessionID/workspace",
      describeRoute({
        operationId: "teaching.workspace.read",
        summary: "Read teaching workspace state",
        responses: {
          200: {
            description: "Teaching workspace state",
            content: {
              "application/json": { schema: resolver(TeachingWorkspaceResponseSchema) },
            },
          },
          204: {
            description: "No workspace provisioned yet",
          },
          ...routeErrors(403, 404),
        },
      }),
      validator("query", workspaceOptionalQuerySchema),
      validator("param", sessionIDParamSchema),
      async (c) =>
        withDirectoryRoute(c, async (context) => {
          const query = c.req.valid("query")
          const workspaceResult = await readTeachingWorkspace({
            directory: context.directory,
            sessionID: c.req.valid("param").sessionID,
            optional: query.optional === "1",
          })
          if (!workspaceResult.ok) return workspaceResult.response
          return c.json(workspaceResult.value)
        }),
    )
    .put(
      "/session/:sessionID/workspace",
      describeRoute({
        operationId: "teaching.workspace.save",
        summary: "Save workspace file contents",
        responses: {
          200: {
            description: "Updated teaching workspace state",
            content: {
              "application/json": { schema: resolver(TeachingWorkspaceResponseSchema) },
            },
          },
          ...routeErrors(400, 403, 404, 409),
        },
      }),
      validator("query", directoryQuerySchema),
      validator("param", sessionIDParamSchema),
      validator("json", TeachingWorkspaceUpdateRequestSchema),
      async (c) =>
        withDirectoryRoute(c, async (context) => {
          const saveResult = await saveTeachingWorkspace({
            directory: context.directory,
            sessionID: c.req.valid("param").sessionID,
            payload: c.req.valid("json"),
          })
          if (!saveResult.ok) return saveResult.response
          return c.json(saveResult.value)
        }),
    )
    .post(
      "/session/:sessionID/file",
      describeRoute({
        operationId: "teaching.workspace.file.create",
        summary: "Add a workspace file",
        responses: {
          200: {
            description: "Updated workspace state",
            content: {
              "application/json": { schema: resolver(TeachingWorkspaceResponseSchema) },
            },
          },
          ...routeErrors(400, 403, 404, 409),
        },
      }),
      validator("query", directoryQuerySchema),
      validator("param", sessionIDParamSchema),
      validator("json", TeachingWorkspaceCreateFileRequestSchema),
      async (c) =>
        withDirectoryRoute(c, async (context) => {
          const addFileResult = await addTeachingWorkspaceFile({
            directory: context.directory,
            sessionID: c.req.valid("param").sessionID,
            payload: c.req.valid("json"),
          })
          if (!addFileResult.ok) return addFileResult.response
          return c.json(addFileResult.value)
        }),
    )
    .post(
      "/session/:sessionID/active-file",
      describeRoute({
        operationId: "teaching.workspace.file.activate",
        summary: "Activate a workspace file",
        responses: {
          200: {
            description: "Updated workspace state",
            content: {
              "application/json": { schema: resolver(TeachingWorkspaceResponseSchema) },
            },
          },
          ...routeErrors(400, 403, 404, 409),
        },
      }),
      validator("query", directoryQuerySchema),
      validator("param", sessionIDParamSchema),
      validator("json", TeachingWorkspaceActivateFileRequestSchema),
      async (c) =>
        withDirectoryRoute(c, async (context) => {
          const activateFileResult = await activateTeachingWorkspaceFile({
            directory: context.directory,
            sessionID: c.req.valid("param").sessionID,
            payload: c.req.valid("json"),
          })
          if (!activateFileResult.ok) return activateFileResult.response
          return c.json(activateFileResult.value)
        }),
    )
    .post(
      "/session/:sessionID/checkpoint",
      describeRoute({
        operationId: "teaching.workspace.checkpoint",
        summary: "Create workspace checkpoint",
        responses: {
          200: {
            description: "Checkpoint result",
            content: {
              "application/json": { schema: resolver(checkpointResponseSchema) },
            },
          },
          ...routeErrors(403, 404),
        },
      }),
      validator("query", directoryQuerySchema),
      validator("param", sessionIDParamSchema),
      async (c) =>
        withDirectoryRoute(c, async (context) => {
          const checkpointResult = await checkpointTeachingWorkspace({
            directory: context.directory,
            sessionID: c.req.valid("param").sessionID,
          })
          if (!checkpointResult.ok) return checkpointResult.response
          return c.json(checkpointResult.value)
        }),
    )
    .post(
      "/session/:sessionID/restore",
      describeRoute({
        operationId: "teaching.workspace.restore",
        summary: "Restore workspace from checkpoint",
        responses: {
          200: {
            description: "Restored workspace state",
            content: {
              "application/json": { schema: resolver(TeachingWorkspaceResponseSchema) },
            },
          },
          ...routeErrors(403, 404),
        },
      }),
      validator("query", directoryQuerySchema),
      validator("param", sessionIDParamSchema),
      async (c) =>
        withDirectoryRoute(c, async (context) => {
          const restoreResult = await restoreTeachingWorkspace({
            directory: context.directory,
            sessionID: c.req.valid("param").sessionID,
          })
          if (!restoreResult.ok) return restoreResult.response
          return c.json(restoreResult.value)
        }),
    )
