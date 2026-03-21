import { Hono } from 'hono'
import { describeRoute, resolver, validator } from 'hono-openapi'
import z from 'zod'
import { Auth as OpenCodeAuth } from '@buddy/opencode-adapter/auth'
import { routeErrors, directoryQuerySchema, ProviderIDParamSchema } from '../http'
import { proxyToOpenCode } from '../http'

const credentialSetResponseSchema = resolver(z.boolean())

export const AuthRoutes = new Hono()
  .put(
    '/:providerID',
    describeRoute({
      operationId: 'auth.set',
      summary: 'Set provider credentials',
      responses: {
        200: {
          description: 'Credentials stored',
          content: {
            'application/json': { schema: credentialSetResponseSchema },
          },
        },
        ...routeErrors(400, 403),
      },
    }),
    validator('query', directoryQuerySchema),
    validator('param', ProviderIDParamSchema),
    validator('json', OpenCodeAuth.Info),
    async (c) => {
      return proxyToOpenCode(c, {
        targetPath: `/auth/${encodeURIComponent(c.req.valid('param').providerID)}`,
      })
    },
  )
  .delete(
    '/:providerID',
    describeRoute({
      operationId: 'auth.remove',
      summary: 'Remove provider credentials',
      responses: {
        200: {
          description: 'Credentials removed',
          content: {
            'application/json': { schema: credentialSetResponseSchema },
          },
        },
        ...routeErrors(400, 403),
      },
    }),
    validator('query', directoryQuerySchema),
    validator('param', ProviderIDParamSchema),
    async (c) => {
      return proxyToOpenCode(c, {
        targetPath: `/auth/${encodeURIComponent(c.req.valid('param').providerID)}`,
      })
    },
  )
