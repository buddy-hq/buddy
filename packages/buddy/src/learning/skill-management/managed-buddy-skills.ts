import { REGISTERED_BUDDY_PERSONAS } from "../personas/registry"

export function managedBuddySkillNames(): string[] {
  const skillNames = new Set<string>()

  for (const persona of REGISTERED_BUDDY_PERSONAS) {
    for (const feature of persona.features) {
      for (const skill of feature.skills) {
        skillNames.add(skill.name)
      }
    }
  }

  return Array.from(skillNames).toSorted((left, right) => left.localeCompare(right))
}
