import { Hono } from 'hono'
import { describeRoute, resolver, validator } from 'hono-openapi'
import z from 'zod'
import {
  mapAgentsMdConflictError,
  readNotebookAgentsMd,
  saveNotebookAgentsMd,
} from '../agents-md/service'
import { directoryQuerySchema, routeErrors, runRouteTask, withDirectoryRoute } from '../http'

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

export const AgentsMdRoutes = new Hono()
  .get(
    '/',
    describeRoute({
      operationId: 'agentsMd.read',
      summary: 'Read notebook AGENTS.md',
      responses: {
        200: {
          description: 'Notebook AGENTS.md state',
          content: {
            'application/json': {
              schema: resolver(agentsMdReadResponseSchema),
            },
          },
        },
        ...routeErrors(403),
      },
    }),
    validator('query', directoryQuerySchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => c.json(await readNotebookAgentsMd(context.directory)),
        }),
      ),
  )
  .put(
    '/',
    describeRoute({
      operationId: 'agentsMd.save',
      summary: 'Create or update notebook AGENTS.md',
      responses: {
        200: {
          description: 'Updated notebook AGENTS.md',
          content: {
            'application/json': {
              schema: resolver(agentsMdWriteResponseSchema),
            },
          },
        },
        ...routeErrors(400, 403, 409),
      },
    }),
    validator('query', directoryQuerySchema),
    validator('json', agentsMdWriteBodySchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const payload = c.req.valid('json')
            const saved = await saveNotebookAgentsMd({
              directory: context.directory,
              content: payload.content,
              expectedVersion: payload.expectedVersion,
            })
            return c.json(saved)
          },
          mapError: mapAgentsMdConflictError,
        }),
      ),
  )
