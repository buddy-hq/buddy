import { useCallback, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import type { InstalledSkillInfo, SkillPresentation } from "@/state/skills-actions"
import { skillPresentationsQueryOptions } from "@/state/skills-catalog-query"

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

/**
 * How chat surfaces look a skill up by the name it is invoked with.
 *
 * A slash command names a skill; everything a surface needs to *show* that skill
 * — its label, its summary, its artwork — lives with the skill, not with the
 * command. This is the one join between the two, so `/analogy` reads as
 * "Analogies" with its own icon wherever it appears.
 */
type SkillPresentationLookup = (name: string) => SkillPresentation | undefined

function useSkillPresentationLookup(directory?: string): SkillPresentationLookup {
  const { data } = useQuery(skillPresentationsQueryOptions(directory))
  const presentationsByName = useMemo(
    () => new Map((data ?? []).map((presentation) => [presentation.name, presentation] as const)),
    [data],
  )

  return useCallback((name: string) => presentationsByName.get(name), [presentationsByName])
}

export { matchesInstalledSkillSearch, useSkillPresentationLookup }

export type { SearchableInstalledSkill, SkillPresentationLookup }
