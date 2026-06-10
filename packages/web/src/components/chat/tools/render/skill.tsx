import { readNonEmptyString } from "../../tools/types"
import { getSkillToolRowAction, humanizeSkillDisplayName } from "../../tools/skill-reference"
import { ToolRow, ToolRowIcon, ToolRowAction, ToolRowSubject } from "../tool-row"
import type { ToolPartProps } from "../registry"

function parseSkillName(output?: string): string | undefined {
  if (!output) return undefined
  const match = output.match(/<skill_content name="([^"]+)">/)
  return match?.[1]
}

export function renderSkillTool({ state, icon }: ToolPartProps) {
  const active = state.status === "pending" || state.status === "running"
  const rawSkillName =
    readNonEmptyString(state.metadata.name) ??
    readNonEmptyString(state.input.name) ??
    readNonEmptyString(parseSkillName(state.output))
  const skillName = rawSkillName ? humanizeSkillDisplayName(rawSkillName) : undefined

  return (
    <ToolRow>
      <ToolRowIcon>{icon?.("size-3.5")}</ToolRowIcon>
      <ToolRowAction>{getSkillToolRowAction(active)}:</ToolRowAction>
      {skillName ? <ToolRowSubject>{skillName}</ToolRowSubject> : null}
    </ToolRow>
  )
}
