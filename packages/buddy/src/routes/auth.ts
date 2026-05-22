import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { routeErrors, directoryQuerySchema, ProviderIDParamSchema } from "../http"
import { piRemoveAuth, piSetAuth } from "../pi-backend/auth-actions"

const credentialSetResponseSchema = resolver(z.boolean())
const authCredentialSchema = z.record(z.string(), z.unknown())

export const AuthRoutes = new Hono()
  .put(
    "/:providerID",
    describeRoute({
      operationId: "auth.set",
      summary: "Set provider credentials",
      responses: {
        200: {
          description: "Credentials stored",
          content: {
            "application/json": { schema: credentialSetResponseSchema },
          },
        },
        ...routeErrors(400, 403),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", ProviderIDParamSchema),
    validator("json", authCredentialSchema),
    piSetAuth,
  )
  .delete(
    "/:providerID",
    describeRoute({
      operationId: "auth.remove",
      summary: "Remove provider credentials",
      responses: {
        200: {
          description: "Credentials removed",
          content: {
            "application/json": { schema: credentialSetResponseSchema },
          },
        },
        ...routeErrors(400, 403),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", ProviderIDParamSchema),
    piRemoveAuth,
  )
