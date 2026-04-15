import { BUDDY } from "./buddy/agent"
import { CODE_BUDDY } from "./code-buddy/agent"
import { MATH_BUDDY } from "./math-buddy/agent"
import { READING_BUDDY } from "./reading-buddy/agent"
import type { DefinedBuddyPersona } from "./define-buddy-persona"

const BUILTIN_BUDDY_PERSONA_DEFINITIONS = [BUDDY, CODE_BUDDY, MATH_BUDDY, READING_BUDDY] as const

type BuiltinBuddyPersonaDefinition = (typeof BUILTIN_BUDDY_PERSONA_DEFINITIONS)[number]

function profileFromDefinition(definition: BuiltinBuddyPersonaDefinition) {
  const { runtime: _runtime, ...profile } = definition
  return profile
}

function cloneBuiltinBuddyPersonaDefinition(
  input: BuiltinBuddyPersonaDefinition,
): BuiltinBuddyPersonaDefinition {
  return {
    ...input,
    surfaces: [...input.surfaces],
    toolDefaults: { ...input.toolDefaults },
    subagentDefaults: { ...input.subagentDefaults },
    contextPolicy: { ...input.contextPolicy },
    runtime: {
      ...input.runtime,
      prompt: input.runtime.prompt,
      ...(input.runtime.permission ? { permission: input.runtime.permission } : {}),
      ...(input.runtime.description ? { description: input.runtime.description } : {}),
    },
  }
}

function builtinBuddyPersonaProfiles(): Array<ReturnType<typeof profileFromDefinition>> {
  return BUILTIN_BUDDY_PERSONA_DEFINITIONS.map((definition) =>
    profileFromDefinition(cloneBuiltinBuddyPersonaDefinition(definition)),
  )
}

function indexBuiltinBuddyPersonaProfiles(): Record<
  BuiltinBuddyPersonaDefinition["id"],
  ReturnType<typeof profileFromDefinition>
> {
  return Object.fromEntries(
    builtinBuddyPersonaProfiles().map((definition) => [definition.id, definition]),
  ) as Record<BuiltinBuddyPersonaDefinition["id"], ReturnType<typeof profileFromDefinition>>
}

export {
  BUILTIN_BUDDY_PERSONA_DEFINITIONS,
  builtinBuddyPersonaProfiles,
  indexBuiltinBuddyPersonaProfiles,
}

export type { BuiltinBuddyPersonaDefinition, DefinedBuddyPersona }
