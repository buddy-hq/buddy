import { createHash } from "node:crypto"
import fsp from "node:fs/promises"
import path from "node:path"
import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { directoryQuerySchema, routeErrors, runRouteTask, withDirectoryRoute } from "../http"

const NOTEBOOK_AGENTS_MD_FILE_NAME = "AGENTS.md"

const agentsMdReadResponseSchema = z.object({
  path: z.string(),
  exists: z.boolean(),
  content: z.string(),
  version: z.string().nullable(),
})

const agentsMdWriteBodySchema = z.object({
  content: z.string(),
  expectedVersion: z.string().nullable().optional(),
})

const agentsMdWriteResponseSchema = z.object({
  path: z.string(),
  content: z.string(),
  version: z.string(),
})

class AgentsMdVersionConflictError extends Error {}

function contentVersion(content: string | undefined) {
  if (content === undefined) return null
  return createHash("sha256").update(content, "utf8").digest("hex")
}

function resolveNotebookAgentsMdPath(directory: string) {
  return path.join(directory, NOTEBOOK_AGENTS_MD_FILE_NAME)
}

async function readNotebookAgentsMd(directory: string) {
  const filePath = resolveNotebookAgentsMdPath(directory)
  const content = await fsp.readFile(filePath, "utf8").catch((error: unknown) => {
    const maybe = error as { code?: string }
    if (maybe.code === "ENOENT") {
      return undefined
    }
    throw error
  })

  return {
    path: filePath,
    exists: typeof content === "string",
    content: content ?? "",
    version: contentVersion(content),
  }
}

async function writeNotebookAgentsMd(input: { directory: string; content: string; expectedVersion?: string | null }) {
  const filePath = resolveNotebookAgentsMdPath(input.directory)
  const currentContent = await fsp.readFile(filePath, "utf8").catch((error: unknown) => {
    const maybe = error as { code?: string }
    if (maybe.code === "ENOENT") {
      return undefined
    }
    throw error
  })
  const currentVersion = contentVersion(currentContent)

  if (input.expectedVersion !== undefined && input.expectedVersion !== currentVersion) {
    throw new AgentsMdVersionConflictError("AGENTS.md changed on disk. Reload or overwrite to continue.")
  }

  await fsp.mkdir(path.dirname(filePath), { recursive: true })
  await fsp.writeFile(filePath, input.content, "utf8")

  return {
    path: filePath,
    content: input.content,
    version: contentVersion(input.content) ?? "",
  }
}

function mapAgentsMdRouteError(error: unknown): Response | undefined {
  if (error instanceof AgentsMdVersionConflictError) {
    return Response.json({ error: error.message }, { status: 409 })
  }
  return undefined
}

export const AgentsMdRoutes = (): Hono =>
  new Hono()
    .get(
      "/",
      describeRoute({
        operationId: "agentsMd.read",
        summary: "Read notebook AGENTS.md",
        responses: {
          200: {
            description: "Notebook AGENTS.md state",
            content: {
              "application/json": {
                schema: resolver(agentsMdReadResponseSchema),
              },
            },
          },
          ...routeErrors(403),
        },
      }),
      validator("query", directoryQuerySchema),
      async (c) =>
        withDirectoryRoute(c, async (context) =>
          runRouteTask({
            task: async () => c.json(await readNotebookAgentsMd(context.directory)),
          }),
        ),
    )
    .put(
      "/",
      describeRoute({
        operationId: "agentsMd.save",
        summary: "Create or update notebook AGENTS.md",
        responses: {
          200: {
            description: "Updated notebook AGENTS.md",
            content: {
              "application/json": {
                schema: resolver(agentsMdWriteResponseSchema),
              },
            },
          },
          ...routeErrors(400, 403, 409),
        },
      }),
      validator("query", directoryQuerySchema),
      validator("json", agentsMdWriteBodySchema),
      async (c) =>
        withDirectoryRoute(c, async (context) =>
          runRouteTask({
            task: async () => {
              const payload = c.req.valid("json")
              const saved = await writeNotebookAgentsMd({
                directory: context.directory,
                content: payload.content,
                expectedVersion: payload.expectedVersion,
              })
              return c.json(saved)
            },
            mapError: mapAgentsMdRouteError,
          }),
        ),
    )
