import { Hono } from "hono"
import { describeRoute, resolver } from "hono-openapi"
import z from "zod"
import { runRouteTask } from "../http"
import { agentRuntimeV1ImportReport } from "../runtime/agent-runtime"
import { runtimeUpgradeState } from "../runtime/runtime-upgrade"

const upgradeSchema = z.object({
  state: z.enum(["idle", "copying", "migrating", "ready", "failed"]),
  error: z.string().optional(),
})

const importSchema = z.union([
  z.object({ status: z.enum(["required", "completed"]) }),
  z.object({
    status: z.literal("running"),
    progress: z.object({
      label: z.string(),
      numerator: z.number().int().nonnegative().optional(),
      denominator: z.number().int().nonnegative().optional(),
    }),
  }),
  z.object({ status: z.literal("error"), error: z.string() }),
])

const v1ImportResponseSchema = z.object({
  upgrade: upgradeSchema,
  import: importSchema.nullable(),
  importRan: z.boolean(),
  skipped: z.array(z.object({ id: z.string(), at: z.number(), error: z.string() })),
  content: z.array(
    z.object({
      sessionID: z.string(),
      subtaskPrompts: z.number().int().nonnegative(),
      subtaskResults: z.number().int().nonnegative(),
      assistantFiles: z.number().int().nonnegative(),
    }),
  ),
})

export type RuntimeV1ImportResponse = z.infer<typeof v1ImportResponseSchema>

export function readRuntimeV1Import(): RuntimeV1ImportResponse {
  const upgrade = runtimeUpgradeState()
  const report = agentRuntimeV1ImportReport()
  return v1ImportResponseSchema.parse({
    upgrade:
      upgrade.state === "failed"
        ? { state: "failed", error: upgrade.error }
        : { state: upgrade.state },
    import: report?.status ?? null,
    importRan: report?.importRan ?? false,
    skipped: report?.skipped ?? [],
    content: report?.content ?? [],
  })
}

export const RuntimeRoutes = new Hono().get(
  "/v1-import",
  describeRoute({
    operationId: "runtime.v1Import.status",
    summary: "Report the import of chats from the previous version",
    responses: {
      200: {
        description: "Upgrade and import status",
        content: {
          "application/json": { schema: resolver(v1ImportResponseSchema) },
        },
      },
    },
  }),
  async (c) =>
    runRouteTask({
      task: async () => c.json(readRuntimeV1Import()),
    }),
)
