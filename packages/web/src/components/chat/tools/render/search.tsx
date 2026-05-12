import { ToolRow, ToolRowIcon, ToolRowAction, ToolRowSubject } from "../tool-row"
import type { ToolPartProps } from "../registry"

export function renderSearchTool({ info, tool, icon }: ToolPartProps) {
  const isList = tool === "list"

  return (
    <ToolRow>
      <ToolRowIcon>{icon?.("size-3.5")}</ToolRowIcon>
      <ToolRowAction>{isList ? "listed" : "searched"}</ToolRowAction>
      {info.subtitle ? <ToolRowSubject>{info.subtitle}</ToolRowSubject> : null}
    </ToolRow>
  )
}
