import type { BuddyPermissionInput, CoreAgentDefinition } from "../../agent-factories"
import type { PersonaContextPolicy } from "../../shared/runtime-types"
import type { PersonaDelegateId, Surface } from "../../shared/teaching-vocabulary"
import { isPersonaDelegateId } from "../../shared/teaching-vocabulary"
import { parseJsonObject, parsePromptStringList } from "../../prompt/utils"
import type { DefinedBuddyFeature } from "../../runtime/define-buddy-feature"

type BuddyPersonaDefinitionInput<Id extends string = string> = {
  id: Id
  label: string
  description: string
  features: readonly DefinedBuddyFeature[]
  defaultSurface: Surface
  hidden: boolean
  context: PersonaContextPolicy
}

type PersonaRuntimeKind = "primary" | "build"

type PersonaSubagentPolicy = {
  denyTools?: readonly string[]
}

type PersonaSubagentConfig = Partial<Record<PersonaDelegateId, true | PersonaSubagentPolicy>>

type PersonaRuntimeDefinition = Omit<
  CoreAgentDefinition,
  "mode" | "availableSubagents" | "prompt" | "description"
> & {
  kind: PersonaRuntimeKind
  prompt: string
  description?: string
  permission?: BuddyPermissionInput
  subagents?: PersonaSubagentConfig
}

type BuddyPersonaFullDefinitionInput<Id extends string> = BuddyPersonaDefinitionInput<Id> & {
  runtime: PersonaRuntimeDefinition
}

type DefinedBuddyPersona<Id extends string = string> = BuddyPersonaFullDefinitionInput<Id>

function cloneSubagentPolicy<TValue>(value: TValue): true | PersonaSubagentPolicy | undefined {
  if (value === true) return true
  const record = parseJsonObject(value)
  if (record === undefined) return undefined
  const denyTools = parsePromptStringList(record.denyTools)
  return denyTools === undefined ? {} : { denyTools }
}

function cloneSubagentConfig(
  config: PersonaSubagentConfig | undefined,
): PersonaSubagentConfig | undefined {
  if (!config) {
    return undefined
  }

  const cloned: PersonaSubagentConfig = {}
  for (const [key, value] of Object.entries(config)) {
    if (!isPersonaDelegateId(key) || value === undefined) continue
    const policy = cloneSubagentPolicy(value)
    if (policy === undefined) continue
    cloned[key] = policy
  }
  return cloned
}

function assertRuntimeSubagentsAreDelegatable(input: {
  personaID: string
  features: readonly DefinedBuddyFeature[]
  subagents: PersonaSubagentConfig | undefined
}): void {
  if (!input.subagents) return

  const internalSubagentIDs = new Set(
    input.features.flatMap((feature) =>
      feature.subagents.filter((subagent) => !subagent.delegatable).map((subagent) => subagent.key),
    ),
  )

  for (const subagentID of Object.keys(input.subagents)) {
    if (!internalSubagentIDs.has(subagentID)) continue
    throw new Error(
      `Persona "${input.personaID}" cannot delegate internal subagent "${subagentID}"`,
    )
  }
}

const PRIMARY_PERSONA_PERMISSION = {
  question: "allow",
  plan_enter: "allow",
} as const satisfies BuddyPermissionInput

export function defineBuddyPersona<const Id extends string>(
  input: BuddyPersonaFullDefinitionInput<Id>,
): DefinedBuddyPersona<Id> {
  assertRuntimeSubagentsAreDelegatable({
    personaID: input.id,
    features: input.features,
    subagents: input.runtime.subagents,
  })

  const derivedSurfaces = new Set<string>()
  for (const feature of input.features) {
    for (const surface of feature.surfaces) {
      derivedSurfaces.add(surface)
    }
  }

  if (!derivedSurfaces.has(input.defaultSurface)) {
    throw new Error(
      `Persona "${input.id}" defaultSurface "${input.defaultSurface}" must exist in derived feature surfaces`,
    )
  }

  const { runtime, ...profile } = input

  return {
    ...profile,
    features: [...profile.features],
    context: { ...profile.context },
    runtime: Object.assign(
      { ...runtime },
      runtime.description ? { description: runtime.description } : undefined,
      { permission: runtime.permission ?? PRIMARY_PERSONA_PERMISSION },
      runtime.subagents ? { subagents: cloneSubagentConfig(runtime.subagents) } : undefined,
    ),
  }
}

export { PRIMARY_PERSONA_PERMISSION }

export type {
  BuddyPersonaDefinitionInput,
  BuddyPersonaFullDefinitionInput,
  DefinedBuddyPersona,
  PersonaSubagentConfig,
  PersonaSubagentPolicy,
  PersonaRuntimeDefinition,
}
