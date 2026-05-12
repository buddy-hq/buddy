import { definePromptTemplate } from "../../prompt/template/engine"
import type { BuddyPermissionInput, CoreAgentDefinition } from "../../agent-factories"
import type { PersonaContextPolicy } from "../../shared/runtime-types"
import type { PersonaDelegateId, Surface } from "../../shared/teaching-vocabulary"
import type { DefinedBuddyFeature } from "../../runtime/define-buddy-feature"
import BASE_PERSONA_PROMPT from "../prompts/base.p.md"

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

function cloneSubagentConfig(
  config: PersonaSubagentConfig | undefined,
): PersonaSubagentConfig | undefined {
  if (!config) {
    return undefined
  }

  return Object.fromEntries(
    Object.entries(config).map(([key, value]) => [
      key,
      value === true ? true : value.denyTools ? { denyTools: [...value.denyTools] } : {},
    ]),
  ) as PersonaSubagentConfig
}

const PRIMARY_PERSONA_PERMISSION = {
  question: "allow",
  plan_enter: "allow",
  todoread: "deny",
  todowrite: "deny",
} as const satisfies BuddyPermissionInput

export function defineBuddyPersona<const Id extends string>(
  input: BuddyPersonaFullDefinitionInput<Id>,
): DefinedBuddyPersona<Id> {
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
    runtime: {
      ...runtime,
      prompt: definePromptTemplate({
        source: BASE_PERSONA_PROMPT,
        debugName: "base-persona-prompt",
      }).render({
        persona_overlay: runtime.prompt.trim(),
      }),
      ...(runtime.description ? { description: runtime.description } : {}),
      permission: runtime.permission ?? PRIMARY_PERSONA_PERMISSION,
      ...(runtime.subagents ? { subagents: cloneSubagentConfig(runtime.subagents) } : {}),
    },
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
