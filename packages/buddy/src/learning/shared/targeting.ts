import {
  mergeBuddyAndConfiguredAgents,
  resolveConfiguredAgentKey,
  type readProjectConfig,
} from "@buddy/backend/config/runtime"
import {
  isPersona,
  type Persona as BuddyPersona,
  type TeachingWorkspaceState,
} from "@buddy/backend/learning/shared/teaching-vocabulary"
import { getBuddyPersona, getDefaultBuddyPersona } from "../personas/wiring/persona-profiles"
import type { TeachingSessionState } from "./teaching-session-state"
import { SessionTransformValidationError } from "../../session"
import { parsePromptString, type TJsonObject } from "../prompt/utils"
import { parseTExplicitModel, type TExplicitModel } from "./parse-values"

export type TSessionTransformBody = TJsonObject

export function hasExplicitModel<TValue>(value: TValue): value is TValue & TExplicitModel {
  return parseTExplicitModel(value) !== undefined
}

export function hasExplicitCommandModel<TValue>(value: TValue): boolean {
  const text = parsePromptString(value)
  return text !== undefined && text.trim().length > 0
}

export function normalizePersonaTarget(input: {
  body: TSessionTransformBody
  config: Awaited<ReturnType<typeof readProjectConfig>>
  sessionPersona?: BuddyPersona
}) {
  const rawPersona = parsePromptString(input.body.persona)?.trim() ?? ""
  const rawAgent = parsePromptString(input.body.agent)

  if (rawPersona && rawAgent) {
    throw new SessionTransformValidationError('Provide either "persona" or "agent", not both')
  }

  const mergedAgents = mergeBuddyAndConfiguredAgents(input.config.agent ?? {})

  if (rawPersona) {
    if (!isPersona(rawPersona)) {
      throw new SessionTransformValidationError(`Unknown Buddy persona "${rawPersona}"`)
    }

    const persona = getBuddyPersona(rawPersona, input.config.personas)
    if (persona.hidden) {
      throw new SessionTransformValidationError(`Buddy persona "${rawPersona}" is hidden`)
    }

    return {
      personaID: persona.id,
      agent: resolveConfiguredAgentKey(persona.id, mergedAgents),
      includeBuddySystem: true,
    }
  }

  if (rawAgent) {
    // Keep backward compatibility for `agent`: accept persona IDs (enables personaID/includeBuddySystem),
    // then fall back to resolveConfiguredAgentKey for runtime-agent IDs.
    const explicitPersona = isPersona(rawAgent)
      ? getBuddyPersona(rawAgent, input.config.personas)
      : undefined
    if (explicitPersona?.hidden) {
      throw new SessionTransformValidationError(`Buddy persona "${rawAgent}" is hidden`)
    }

    return {
      personaID: explicitPersona ? explicitPersona.id : undefined,
      agent: resolveConfiguredAgentKey(rawAgent, mergedAgents),
      includeBuddySystem: !!explicitPersona,
    }
  }

  if (input.sessionPersona) {
    const persona = getBuddyPersona(input.sessionPersona, input.config.personas)
    return {
      personaID: persona.id,
      agent: resolveConfiguredAgentKey(persona.id, mergedAgents),
      includeBuddySystem: true,
    }
  }

  const persona = getDefaultBuddyPersona({
    defaultPersona: input.config.default_persona,
    primaryUse: input.config.personalization?.primary_use,
    overrides: input.config.personas,
  })

  return {
    personaID: persona.id,
    agent: resolveConfiguredAgentKey(persona.id, mergedAgents),
    includeBuddySystem: true,
  }
}

export function resolveFocusGoalIds(body: TSessionTransformBody): string[] {
  if (!Array.isArray(body.focusGoalIds)) return []
  const ids: string[] = []
  for (const value of body.focusGoalIds) {
    const text = parsePromptString(value)
    if (text === undefined) continue
    const trimmed = text.trim()
    if (trimmed.length > 0) ids.push(trimmed)
  }
  return ids
}

export function assertNoLegacyRuntimeOverrides(body: TSessionTransformBody) {
  const legacyFields = ["strategy", "adaptivity", "currentGoalIds", "intent"] as const
  const present = legacyFields.filter((field) => field in body)
  if (present.length === 0) return

  throw new SessionTransformValidationError(
    `Legacy runtime override fields are no longer supported (${present.join(", ")}).`,
  )
}

export function resolveCurrentSurface(input: {
  personaID: BuddyPersona
  config: Awaited<ReturnType<typeof readProjectConfig>>
  teachingWorkspaceState: TeachingWorkspaceState
}): TeachingSessionState["currentSurface"] {
  const persona = getBuddyPersona(input.personaID, input.config.personas)
  if (input.teachingWorkspaceState === "active" && persona.surfaces.includes("editor")) {
    return "editor"
  }
  return persona.defaultSurface
}
