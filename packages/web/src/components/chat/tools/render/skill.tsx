import { readNonEmptyString } from "../../tools/types"
import { getSkillToolRowAction, humanizeSkillDisplayName } from "../../tools/skill-reference"
import { ToolRow, ToolRowIcon, ToolRowAction, ToolRowSubject } from "../tool-row"
import type { ToolPartProps } from "../registry"

export function renderSkillTool({ state, icon }: ToolPartProps) {
  const active = state.status === "pending" || state.status === "running"
  const rawSkillName = readNonEmptyString(state.summary?.subject)
  const skillName = rawSkillName ? humanizeSkillDisplayName(rawSkillName) : undefined

  return (
    <ToolRow>
      <ToolRowIcon>{icon?.("size-3.5")}</ToolRowIcon>
      <ToolRowAction>{getSkillToolRowAction(active)}:</ToolRowAction>
      {skillName ? <ToolRowSubject>{skillName}</ToolRowSubject> : null}
    </ToolRow>
  )
}
