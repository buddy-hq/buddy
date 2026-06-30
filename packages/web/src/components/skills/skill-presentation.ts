import type { InstalledSkillInfo } from "@/state/skills-actions"

type SearchableInstalledSkill = Pick<
  InstalledSkillInfo,
  "name" | "description" | "displayName" | "shortDescription"
>

function matchesInstalledSkillSearch(
  skill: SearchableInstalledSkill,
  query: string,
  additionalTerms: readonly string[] = [],
): boolean {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) {
    return true
  }

  return [
    skill.displayName,
    skill.shortDescription,
    skill.name,
    skill.description,
    ...additionalTerms,
  ].some((value) => value.toLowerCase().includes(normalizedQuery))
}

export { matchesInstalledSkillSearch }

export type { SearchableInstalledSkill }
