import {
  mergeBuddyAndConfiguredAgents,
  readProjectConfig,
  resolveConfiguredAgentKey,
} from "../../config/compatibility.js"
import { getBuddyPersona, getDefaultBuddyPersona } from "../../personas/catalog.js"
import { isPersonaId, type BuddyPersonaId } from "../../personas/types.js"
import { isTeachingIntentId, type TeachingIntentId, type TeachingSessionState, type WorkspaceState } from "../../learning/runtime/types.js"
import { SessionTransformValidationError } from "./errors.js"

export function hasExplicitModel(value: unknown): value is { providerID: string; modelID: string } {
  if (!value || typeof value !== "object") return false
  if (!("providerID" in value) || !("modelID" in value)) return false
  return typeof value.providerID === "string" && typeof value.modelID === "string"
}

export function hasExplicitCommandModel(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

export function normalizePersonaTarget(input: {
  body: Record<string, unknown>
  config: Awaited<ReturnType<typeof readProjectConfig>>
}) {
  const rawPersona = typeof input.body.persona === "string" ? input.body.persona.trim() : ""
  const rawAgent = typeof input.body.agent === "string" ? input.body.agent : undefined

  if (rawPersona && rawAgent) {
    throw new SessionTransformValidationError('Provide either "persona" or "agent", not both')
  }

  const mergedAgents = mergeBuddyAndConfiguredAgents(input.config.agent ?? {})

  if (rawPersona) {
    if (!isPersonaId(rawPersona)) {
      throw new SessionTransformValidationError(`Unknown Buddy persona "${rawPersona}"`)
    }

    const persona = getBuddyPersona(rawPersona, input.config.personas)
    if (persona.hidden) {
      throw new SessionTransformValidationError(`Buddy persona "${rawPersona}" is hidden`)
    }

    return {
      personaID: persona.id,
      runtimeAgent: resolveConfiguredAgentKey(persona.runtimeAgent, mergedAgents),
      includeBuddySystem: true,
    }
  }

  if (rawAgent) {
    const explicitPersona = isPersonaId(rawAgent) ? getBuddyPersona(rawAgent, input.config.personas) : undefined
    if (explicitPersona?.hidden) {
      throw new SessionTransformValidationError(`Buddy persona "${rawAgent}" is hidden`)
    }

    return {
      personaID: explicitPersona?.id as BuddyPersonaId | undefined,
      runtimeAgent: resolveConfiguredAgentKey(rawAgent, mergedAgents),
      includeBuddySystem: !!explicitPersona,
    }
  }

  const persona = getDefaultBuddyPersona({
    defaultPersona: input.config.default_persona,
    overrides: input.config.personas,
  })

  return {
    personaID: persona.id,
    runtimeAgent: resolveConfiguredAgentKey(persona.runtimeAgent, mergedAgents),
    includeBuddySystem: true,
  }
}

export function resolveIntentOverride(input: {
  body: Record<string, unknown>
  config: Awaited<ReturnType<typeof readProjectConfig>>
}): TeachingIntentId | undefined {
  const raw = typeof input.body.intent === "string" ? input.body.intent.trim() : ""
  if (raw) {
    if (!isTeachingIntentId(raw)) {
      throw new SessionTransformValidationError(`Unknown teaching intent "${raw}"`)
    }
    return raw
  }

  if (input.config.default_intent && isTeachingIntentId(input.config.default_intent)) {
    return input.config.default_intent
  }

  return undefined
}

export function resolveFocusGoalIds(body: Record<string, unknown>): string[] {
  if (!Array.isArray(body.focusGoalIds)) return []
  return body.focusGoalIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
}

export function assertNoLegacyRuntimeOverrides(body: Record<string, unknown>) {
  const legacyFields = ["activity", "strategy", "adaptivity", "currentGoalIds", "activityBundleId"] as const
  const present = legacyFields.filter((field) => field in body)
  if (present.length === 0) return

  throw new SessionTransformValidationError(
    `Legacy runtime override fields are no longer supported (${present.join(", ")}). Use focusGoalIds.`,
  )
}

export function resolveCurrentSurface(input: {
  personaID: BuddyPersonaId
  config: Awaited<ReturnType<typeof readProjectConfig>>
  workspaceState: WorkspaceState
}): TeachingSessionState["currentSurface"] {
  const persona = getBuddyPersona(input.personaID, input.config.personas)
  if (input.workspaceState === "interactive" && persona.surfaces.includes("editor")) {
    return "editor"
  }
  return persona.defaultSurface
}
