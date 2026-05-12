import { ToolRow, ToolRowIcon, ToolRowAction, ToolRowSubject, ToolRowArg } from "../tool-row"
import type { ToolPartProps } from "../registry"

export function renderReadTool({ info, icon }: ToolPartProps) {
  return (
    <ToolRow>
      <ToolRowIcon>{icon?.("size-3.5")}</ToolRowIcon>
      <ToolRowAction>read</ToolRowAction>
      {info.subtitle ? <ToolRowSubject>{info.subtitle}</ToolRowSubject> : null}
      {info.args?.map((arg) => (
        <ToolRowArg key={arg}>{arg}</ToolRowArg>
      ))}
    </ToolRow>
  )
}
