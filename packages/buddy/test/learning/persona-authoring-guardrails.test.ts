import { describe, expect, test } from "bun:test"
import { ConfigSchema } from "../../src/config/contract/schema"
import { PERSONAS } from "../../src/learning/shared/teaching-vocabulary"
import { BUILTIN_BUDDY_PERSONA_DEFINITIONS } from "../../src/learning/personas/wiring/persona.orchestration"
import { BUILTIN_BUDDY_PERSONAS } from "../../src/learning/personas/wiring/persona.orchestration"
import { builtinBuddyPersonaAgents } from "../../src/learning/personas/wiring/persona.orchestration"
import { BUDDY_SUBAGENTS } from "../../src/learning/subagent-manifest"

function sorted(values: string[]): string[] {
  return [...values].toSorted((left, right) => left.localeCompare(right))
}

describe("persona authoring guardrails", () => {
  test("config persona override keys stay aligned with canonical persona IDs", () => {
    const configPersonaKeys = sorted(Object.keys(ConfigSchema.Personas.shape))
    const canonicalPersonaIDs = sorted([...PERSONAS])

    expect(configPersonaKeys).toEqual(canonicalPersonaIDs)
  })

  test("builtin persona registry keys stay aligned with canonical persona IDs", () => {
    const registryPersonaKeys = sorted(Object.keys(BUILTIN_BUDDY_PERSONAS))
    const canonicalPersonaIDs = sorted([...PERSONAS])

    expect(registryPersonaKeys).toEqual(canonicalPersonaIDs)
  })

  test("registered persona agent keys stay aligned with canonical persona IDs", () => {
    const personaAgentKeys = sorted(builtinBuddyPersonaAgents().map(({ key }) => key))
    const canonicalPersonaIDs = sorted([...PERSONAS])

    expect(personaAgentKeys).toEqual(canonicalPersonaIDs)
  })

  test("persona subagent defaults only reference registered subagents", () => {
    const registeredSubagentKeys = new Set<string>(BUDDY_SUBAGENTS.map(({ key }) => key))

    for (const definition of BUILTIN_BUDDY_PERSONA_DEFINITIONS) {
      for (const subagentID of Object.keys(definition.subagentDefaults)) {
        expect(registeredSubagentKeys.has(subagentID)).toBe(true)
      }
    }
  })
})
