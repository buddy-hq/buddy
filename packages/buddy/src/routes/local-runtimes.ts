import { Hono } from "hono"
import { describeRoute, resolver } from "hono-openapi"
import z from "zod"
import { AdvancedMathRuntimeService } from "../local-runtimes/advanced-math/service"
import { StandardsRuntimeService } from "../local-runtimes/standards/service"
import { routeErrors } from "../http"

const localRuntimeStateSchema = z.enum([
  "not_installed",
  "downloading",
  "installing",
  "ready",
  "repairing",
  "removing",
  "error",
])

const advancedMathRuntimeStatusSchema = z.object({
  enabled: z.boolean(),
  state: localRuntimeStateSchema,
  ready: z.boolean(),
  installedRuntimeVersion: z.string().optional(),
  targetTriple: z.string(),
  executablePath: z.string().optional(),
  lastHealthyAt: z.string().optional(),
  lastError: z.string().optional(),
  progressPercent: z.number().min(0).max(100).optional(),
  progressMessage: z.string().optional(),
  supportedLibraries: z.array(z.string()),
})

const standardsRuntimeStatusSchema = z.object({
  enabled: z.boolean(),
  state: localRuntimeStateSchema,
  ready: z.boolean(),
  installedDatasetVersion: z.string().optional(),
  installedArchiveChecksum: z.string().optional(),
  databasePath: z.string().optional(),
  lastHealthyAt: z.string().optional(),
  lastError: z.string().optional(),
  progressPercent: z.number().min(0).max(100).optional(),
  progressMessage: z.string().optional(),
})

export const LocalRuntimeRoutes = new Hono()
  .get(
    "/advanced-math",
    describeRoute({
      operationId: "localRuntimes.advancedMath.get",
      summary: "Get the optional advanced math runtime status",
      responses: {
        200: {
          description: "Advanced math runtime status",
          content: {
            "application/json": { schema: resolver(advancedMathRuntimeStatusSchema) },
          },
        },
        ...routeErrors(500),
      },
    }),
    async (c) => c.json(await AdvancedMathRuntimeService.getStatus()),
  )
  .post(
    "/advanced-math/install",
    describeRoute({
      operationId: "localRuntimes.advancedMath.install",
      summary: "Install or repair the optional advanced math runtime",
      responses: {
        200: {
          description: "Advanced math runtime status",
          content: {
            "application/json": { schema: resolver(advancedMathRuntimeStatusSchema) },
          },
        },
        ...routeErrors(500),
      },
    }),
    async (c) => {
      const status = await AdvancedMathRuntimeService.install()
      return c.json(status, status.state === "error" ? 500 : 200)
    },
  )
  .delete(
    "/advanced-math/install",
    describeRoute({
      operationId: "localRuntimes.advancedMath.remove",
      summary: "Remove the optional advanced math runtime",
      responses: {
        200: {
          description: "Advanced math runtime status",
          content: {
            "application/json": { schema: resolver(advancedMathRuntimeStatusSchema) },
          },
        },
        ...routeErrors(500),
      },
    }),
    async (c) => c.json(await AdvancedMathRuntimeService.remove()),
  )
  .get(
    "/standards",
    describeRoute({
      operationId: "localRuntimes.standards.get",
      summary: "Get the optional standards runtime status",
      responses: {
        200: {
          description: "Standards runtime status",
          content: {
            "application/json": { schema: resolver(standardsRuntimeStatusSchema) },
          },
        },
        ...routeErrors(500),
      },
    }),
    async (c) => c.json(await StandardsRuntimeService.getStatus()),
  )
  .post(
    "/standards/install",
    describeRoute({
      operationId: "localRuntimes.standards.install",
      summary: "Install or repair the optional standards runtime",
      responses: {
        200: {
          description: "Standards runtime status",
          content: {
            "application/json": { schema: resolver(standardsRuntimeStatusSchema) },
          },
        },
        ...routeErrors(500),
      },
    }),
    async (c) => {
      const status = await StandardsRuntimeService.install()
      return c.json(status, status.state === "error" ? 500 : 200)
    },
  )
  .delete(
    "/standards/install",
    describeRoute({
      operationId: "localRuntimes.standards.remove",
      summary: "Remove the optional standards runtime",
      responses: {
        200: {
          description: "Standards runtime status",
          content: {
            "application/json": { schema: resolver(standardsRuntimeStatusSchema) },
          },
        },
        ...routeErrors(500),
      },
    }),
    async (c) => c.json(await StandardsRuntimeService.remove()),
  )
