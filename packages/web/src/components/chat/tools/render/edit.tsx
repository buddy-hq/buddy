import { readString } from "../../tools/types"
import { ToolRow, ToolRowIcon, ToolRowAction, ToolRowSubject } from "../tool-row"
import type { ToolPartProps } from "../registry"

function basename(filePath: string): string {
  const lastSlash = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"))
  return lastSlash >= 0 ? filePath.slice(lastSlash + 1) : filePath
}

/** Renders a native file tool with its resolved lifecycle action and file target. */
export function renderEditTool({ state, icon, info }: ToolPartProps) {
  const filePath = readString(state.input.filePath)
  const fileName = filePath ? basename(filePath) : info?.subtitle

  return (
    <ToolRow>
      <ToolRowIcon>{icon?.("size-3.5")}</ToolRowIcon>
      <ToolRowAction>{info.title}</ToolRowAction>
      {fileName ? <ToolRowSubject>{fileName}</ToolRowSubject> : null}
    </ToolRow>
  )
}
