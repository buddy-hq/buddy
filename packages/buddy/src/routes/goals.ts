import { Hono } from "hono"
import { describeRoute, resolver } from "hono-openapi"
import z from "zod"
import { LearnerPath } from "../learning/learner/path.js"
import { LearnerService } from "../learning/learner/service.js"
import { resolveDirectory } from "../project/directory.js"

const GoalsDocument = z.object({
  path: z.string(),
  raw: z.string().nullable(),
})

export const GoalsRoutes = () =>
  new Hono().get(
    "/",
    describeRoute({
      summary: "Get workspace goals document",
      description: "Get the current learner-store goals relevant to the current project.",
      operationId: "goals.get",
      responses: {
        200: {
          description: "Goals JSON document",
          content: {
            "application/json": {
              schema: resolver(GoalsDocument),
            },
          },
        },
      },
    }),
    async (c) => {
      const directory = resolveDirectory(
        c.req.header("x-buddy-directory") ?? c.req.header("x-opencode-directory") ?? "",
      )
      const goals = await LearnerService.getWorkspaceGoals(directory)
      return c.json({
        path: LearnerPath.goals(),
        raw: goals.length > 0 ? `${JSON.stringify(goals, null, 2)}\n` : null,
      })
    },
  )
