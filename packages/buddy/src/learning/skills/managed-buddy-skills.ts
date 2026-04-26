import { REGISTERED_BUDDY_PERSONAS } from "../personas/registered-personas"

export function managedBuddySkillNames(): string[] {
  const skillNames = new Set<string>()

  for (const persona of REGISTERED_BUDDY_PERSONAS) {
    for (const skillName of Object.keys(persona.skillDefaults)) {
      skillNames.add(skillName)
    }
  }

  return Array.from(skillNames).toSorted((left, right) => left.localeCompare(right))
}
