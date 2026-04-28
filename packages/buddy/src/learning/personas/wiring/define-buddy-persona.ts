import { definePromptTemplate } from "../../prompt/template/engine"
import type { BuddyPermissionInput, CoreAgentDefinition } from "../../agent-factories"
import type {
  PersonaContextPolicy,
  PersonaTools,
  SkillDelta,
  SubagentDelta,
} from "../../shared/runtime-types"
import type { SubagentId } from "../../shared/teaching-vocabulary"
import BASE_PERSONA_PROMPT from "../prompts/base.p.md"

type PersonaDomain = "general" | "coding" | "math"
type PersonaSurface = "curriculum" | "editor" | "figure" | "flashcard" | "question-set"
type BuddyPersonaProfileDefinition<Id extends string = string> = {
  id: Id
  label: string
  description: string
  domain: PersonaDomain
  surfaces: readonly PersonaSurface[]
  defaultSurface: PersonaSurface
  hidden: boolean
  tools: PersonaTools
  skills: SkillDelta
  subagents: SubagentDelta<SubagentId>
  context: PersonaContextPolicy
}

type PersonaRuntimeKind = "primary" | "build"

type PersonaRuntimeDefinition = Omit<
  CoreAgentDefinition,
  "mode" | "availableSubagents" | "prompt" | "description"
> & {
  kind: PersonaRuntimeKind
  prompt: string
  description?: string
  permission?: BuddyPermissionInput
}

type BuddyPersonaDefinitionInput<Id extends string> = BuddyPersonaProfileDefinition<Id> & {
  runtime: PersonaRuntimeDefinition
}

type DefinedBuddyPersona<Id extends string = string> = BuddyPersonaDefinitionInput<Id>

const PRIMARY_PERSONA_PERMISSION = {
  question: "allow",
  plan_enter: "allow",
  todoread: "deny",
  todowrite: "deny",
} as const satisfies BuddyPermissionInput

export function defineBuddyPersona<const Id extends string>(
  input: BuddyPersonaDefinitionInput<Id>,
): DefinedBuddyPersona<Id> {
  if (!input.surfaces.includes(input.defaultSurface)) {
    throw new Error(
      `Persona "${input.id}" must include defaultSurface "${input.defaultSurface}" in surfaces`,
    )
  }

  const { runtime, ...profile } = input

  return {
    ...profile,
    surfaces: [...profile.surfaces],
    tools: {
      static: { ...profile.tools.static },
      dynamic: { ...profile.tools.dynamic },
    },
    skills: { ...profile.skills },
    subagents: { ...profile.subagents },
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
    },
  }
}

export { PRIMARY_PERSONA_PERMISSION }

export type {
  BuddyPersonaDefinitionInput,
  BuddyPersonaProfileDefinition,
  DefinedBuddyPersona,
  PersonaRuntimeDefinition,
}
