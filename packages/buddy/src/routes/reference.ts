import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import {
  directoryQuerySchema,
  ensureAllowedDirectory,
  respondWithSdkResult,
  routeErrors,
  runSdkRoute,
} from "../http"
import { getOpenCodeClient } from "../opencode-runtime/client"

const referenceSourceSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("local"),
    path: z.string(),
    description: z.string().optional(),
    hidden: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("git"),
    repository: z.string(),
    branch: z.string().optional(),
    description: z.string().optional(),
    hidden: z.boolean().optional(),
  }),
])

const referenceInfoSchema = z.object({
  name: z.string(),
  path: z.string(),
  description: z.string().optional(),
  hidden: z.boolean().optional(),
  source: referenceSourceSchema,
})

const referenceListResponseSchema = z.object({
  location: z.object({
    directory: z.string(),
    workspaceID: z.string().optional(),
    project: z.object({
      id: z.string(),
      directory: z.string(),
    }),
  }),
  data: z.array(referenceInfoSchema),
})

export const ReferenceRoutes = new Hono().get(
  "/",
  describeRoute({
    operationId: "reference.list",
    summary: "List OpenCode v2 references",
    responses: {
      200: {
        description: "References available at the requested location",
        content: {
          "application/json": {
            schema: resolver(referenceListResponseSchema),
          },
        },
      },
      ...routeErrors(400, 403),
    },
  }),
  validator("query", directoryQuerySchema),
  async (c) =>
    runSdkRoute(c, async () => {
      const directoryResult = ensureAllowedDirectory(c)
      if (!directoryResult.ok) return directoryResult.response

      const client = await getOpenCodeClient(directoryResult.directory)
      const result = await client.v2.reference.list()
      return respondWithSdkResult(c, result)
    }),
)
