import { Hono } from "hono"
import { resolver } from "hono-openapi"
import z from "zod"
import { LearnerPath } from "../learning/learner/path.js"
import { LearnerService } from "../learning/learner/service.js"
import { ErrorSchema } from "../openapi/compatibility-schemas.js"
import { compatibilityRoute } from "../openapi/compatibility-route.js"
import { directoryParameters } from "./shared/openapi.js"
import { withDirectoryContext } from "./shared/route-helpers.js"

const GoalsDocument = z.object({
  path: z.string(),
  raw: z.string().nullable(),
})

export const GoalsRoutes = () =>
  new Hono().get(
    "/",
    compatibilityRoute({
      summary: "Get workspace goals document",
      description: "Get the current learner-store goals relevant to the current project.",
      operationId: "goals.get",
      parameters: directoryParameters,
      responses: {
        200: {
          description: "Goals JSON document",
          content: {
            "application/json": {
              schema: resolver(GoalsDocument),
            },
          },
        },
        403: {
          description: "Directory is outside allowed roots",
          content: {
            "application/json": { schema: ErrorSchema },
          },
        },
      },
    }),
    async (c) => {
      const contextResult = withDirectoryContext(c.req.raw)
      if (!contextResult.ok) return contextResult.response

      const goals = await LearnerService.getWorkspaceGoals(contextResult.value.directory)
      return c.json({
        path: LearnerPath.goals(),
        raw: goals.length > 0 ? `${JSON.stringify(goals, null, 2)}\n` : null,
      })
    },
  )
