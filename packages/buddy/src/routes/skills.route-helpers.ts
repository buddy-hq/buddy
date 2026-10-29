import { SKILL_ROUTE_ACTIONS, SKILL_ROUTE_QUERY } from "./skills.constants"

type SkillToggleInput = {
  action?: "allow" | "deny"
  enabled?: boolean
}

export function shouldRefreshSkillCatalog(refreshValue: string | undefined): boolean {
  if (!refreshValue) return false
  return SKILL_ROUTE_QUERY.refreshValues.has(refreshValue)
}

export function resolveSkillAction(input: SkillToggleInput) {
  return (
    input.action ??
    (input.enabled ? SKILL_ROUTE_ACTIONS.whenEnabled : SKILL_ROUTE_ACTIONS.whenDisabled)
  )
}
