import { ZodError } from 'zod'
import { configErrorMessage, isConfigValidationError } from '../runtime/opencode-sync.js'

export function configRouteValidationResponse(error: unknown): Response | undefined {
  if (error instanceof ZodError) {
    return Response.json({ error: error.message }, { status: 400 })
  }

  return undefined
}

export function mapConfigRouteError(error: unknown): Response | undefined {
  if (isConfigValidationError(error)) {
    return Response.json({ error: configErrorMessage(error) }, { status: 400 })
  }

  return configRouteValidationResponse(error)
}
