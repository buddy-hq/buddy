import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import type { ReferenceInfo } from "@buddy/agent-runtime/references"
import {
  createConfigSyncMiddleware,
  directoryQuerySchema,
  ensureAllowedDirectory,
  routeErrors,
  runSdkRoute,
} from "../http"
import { getAgentRuntime } from "../runtime/agent-runtime"

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
}) satisfies z.ZodType<ReferenceInfo>

const referenceListResponseSchema = z.object({
  location: z.object({
    directory: z.string(),
    workspaceID: z.string().optional(),
    project: z.object({
      id: z.string(),
      directory: z.string(),
      canonical: z.string(),
    }),
  }),
  data: z.array(referenceInfoSchema),
})

export const ReferenceRoutes = new Hono().use("*", createConfigSyncMiddleware("reference request")).get(
  "/",
  describeRoute({
    operationId: "reference.list",
    summary: "List configured references",
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

      const runtime = await getAgentRuntime()
      const directory = directoryResult.directory
      const [data, location] = await Promise.all([runtime.references.list(directory), runtime.workspace.location(directory)])
      return c.json({ location, data })
    }),
)
