import { readNonEmptyString } from "../../tools/types"
import { ToolRow, ToolRowIcon, ToolRowAction, ToolRowSubject } from "../tool-row"
import type { ToolPartProps } from "../registry"

function parseSkillName(output?: string): string | undefined {
  if (!output) return undefined
  const match = output.match(/<skill_content name="([^"]+)">/)
  return match?.[1]
}

export function renderSkillTool({ state, icon }: ToolPartProps) {
  const skillName =
    readNonEmptyString(state.metadata.name) ??
    readNonEmptyString(state.input.name) ??
    readNonEmptyString(parseSkillName(state.output))

  return (
    <ToolRow>
      <ToolRowIcon>{icon?.("size-3.5")}</ToolRowIcon>
      <ToolRowAction>used skill</ToolRowAction>
      {skillName ? <ToolRowSubject>{skillName}</ToolRowSubject> : null}
    </ToolRow>
  )
}
