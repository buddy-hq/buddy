import { Hono } from 'hono'
import { describeRoute, resolver } from 'hono-openapi'
import z from 'zod'
import { AdvancedMathRuntimeService } from '../local-runtimes/advanced-math/service'
import { routeErrors } from '../http'

const advancedMathRuntimeStatusSchema = z.object({
  enabled: z.boolean(),
  state: z.enum([
    'not_installed',
    'downloading',
    'installing',
    'ready',
    'repairing',
    'removing',
    'error',
  ]),
  ready: z.boolean(),
  installedVersion: z.string().optional(),
  targetTriple: z.string(),
  executablePath: z.string().optional(),
  lastHealthyAt: z.string().optional(),
  lastError: z.string().optional(),
  progressPercent: z.number().min(0).max(100).optional(),
  progressMessage: z.string().optional(),
  supportedLibraries: z.array(z.string()),
})

export const LocalRuntimeRoutes = new Hono()
  .get(
    '/advanced-math',
    describeRoute({
      operationId: 'localRuntimes.advancedMath.get',
      summary: 'Get the optional advanced math runtime status',
      responses: {
        200: {
          description: 'Advanced math runtime status',
          content: {
            'application/json': { schema: resolver(advancedMathRuntimeStatusSchema) },
          },
        },
        ...routeErrors(500),
      },
    }),
    async (c) => c.json(await AdvancedMathRuntimeService.getStatus()),
  )
  .post(
    '/advanced-math/install',
    describeRoute({
      operationId: 'localRuntimes.advancedMath.install',
      summary: 'Install or repair the optional advanced math runtime',
      responses: {
        200: {
          description: 'Advanced math runtime status',
          content: {
            'application/json': { schema: resolver(advancedMathRuntimeStatusSchema) },
          },
        },
        ...routeErrors(500),
      },
    }),
    async (c) => {
      const status = await AdvancedMathRuntimeService.install()
      return c.json(status, status.state === 'error' ? 500 : 200)
    },
  )
  .delete(
    '/advanced-math/install',
    describeRoute({
      operationId: 'localRuntimes.advancedMath.remove',
      summary: 'Remove the optional advanced math runtime',
      responses: {
        200: {
          description: 'Advanced math runtime status',
          content: {
            'application/json': { schema: resolver(advancedMathRuntimeStatusSchema) },
          },
        },
        ...routeErrors(500),
      },
    }),
    async (c) => c.json(await AdvancedMathRuntimeService.remove()),
  )
