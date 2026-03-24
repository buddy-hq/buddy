import type { Context } from "hono"
import { proxyToOpenCode } from "../../http/proxy"
import { AdvancedMathRuntimeService } from "../../local-runtimes/advanced-math/service"
import { SessionLookupError, SessionTransformValidationError } from "./errors"

export function mapSessionTransformError(
  c: { json: (body: unknown, status?: number) => Response },
  error: unknown,
): Response | undefined {
  if (error instanceof SessionLookupError) {
    return error.response
  }

  if (error instanceof SessionTransformValidationError) {
    return c.json({ error: error.message }, error.status)
  }

  return undefined
}

export async function runSessionTransformProxy(input: {
  c: Context
  targetPath: string
  onTransform: (body: Record<string, unknown>) => Promise<Record<string, unknown>>
  onAccepted?: () => Promise<void>
  rollbackState?: () => void
}): Promise<Response> {
  const response = await proxyToOpenCode(input.c, {
    targetPath: input.targetPath,
    transformJsonBody: input.onTransform,
    forceBusyAs409: true,
    registerPedagogyTools: true,
    registerCurriculumTools: true,
    registerFigureTools: true,
    registerFreeformFigureTools: true,
    registerMermaidTools: true,
    registerGoalTools: true,
    registerLearnerTools: true,
    registerTeachingTools: true,
    registerMathTools: AdvancedMathRuntimeService.isReady(),
  })

  if (!response.ok) {
    input.rollbackState?.()
    return response
  }

  if (input.onAccepted) {
    await input.onAccepted().catch((error) => {
      console.warn("Failed to record learner evidence after accepted prompt:", error)
    })
  }

  return response
}
