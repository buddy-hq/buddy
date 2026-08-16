import { resolver } from "hono-openapi"
import z from "zod"

export const JSON_CONTENT_TYPE = "application/json" as const

export const RouteErrorSchema = z
  .object({
    error: z.string(),
  })
  .meta({ ref: "RouteError" })

export const jsonErrorContent = {
  [JSON_CONTENT_TYPE]: { schema: resolver(RouteErrorSchema) },
} as const

const ERROR_DESCRIPTIONS = new Map([
  [400, "Bad request"],
  [403, "Directory is outside allowed roots"],
  [404, "Not found"],
  [409, "Conflict"],
  [413, "Payload too large"],
  [500, "Internal server error"],
])

export function routeErrors(...codes: number[]) {
  return Object.fromEntries(
    codes.map((code) => [
      code,
      {
        description: ERROR_DESCRIPTIONS.get(code) ?? "Request failed",
        content: jsonErrorContent,
      },
    ]),
  )
}

export const directoryHeaderParameter = {
  name: "x-buddy-directory",
  in: "header" as const,
  required: false,
  schema: { type: "string" as const },
}

export const directoryQueryParameter = {
  name: "directory",
  in: "query" as const,
  required: false,
  schema: { type: "string" as const },
}

export const directoryParameters = [directoryHeaderParameter, directoryQueryParameter]

export const directoryQuerySchema = z.object({
  directory: z.string().optional(),
})

export const SessionIDParamSchema = z.object({
  sessionID: z.string(),
})

export const RequestIDParamSchema = z.object({
  requestID: z.string(),
})

export const ProviderIDParamSchema = z.object({
  providerID: z.string(),
})

export const ProjectIDParamSchema = z.object({
  projectID: z.string(),
})

export const McpNameParamSchema = z.object({
  name: z.string(),
})

export const SkillIDParamSchema = z.object({
  skillID: z.string(),
})

export const SkillNameParamSchema = z.object({
  name: z.string(),
})

export const directoryForbiddenResponse = {
  description: "Directory is outside allowed roots",
  content: jsonErrorContent,
}

export const booleanJsonResponse = {
  schema: resolver(z.boolean()),
} as const
