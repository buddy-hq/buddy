import { Hono } from "hono"
import { describeRoute, resolver } from "hono-openapi"
import z from "zod"
import { readGoalsV1File } from "../learning/goals/goals-v1.js"
import { GoalsV1Path } from "../learning/goals/path.js"
import { resolveDirectory } from "../project/directory.js"

const GoalsDocument = z.object({
  path: z.string(),
  raw: z.string().nullable(),
})

export const GoalsRoutes = () =>
  new Hono().get(
    "/",
    describeRoute({
      summary: "Get goals inspector document",
      description: "Get the current .buddy/goals.v1.json content for the current project.",
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
      const doc = await readGoalsV1File(directory)
      return c.json({
        path: doc?.path ?? GoalsV1Path.file(directory),
        raw: doc ? `${JSON.stringify(doc.data, null, 2)}\n` : null,
      })
    },
  )
