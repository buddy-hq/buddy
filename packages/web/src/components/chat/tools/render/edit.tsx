import { readString } from "../../tools/types"
import { ToolRow, ToolRowIcon, ToolRowAction, ToolRowSubject } from "../tool-row"
import type { ToolPartProps } from "../registry"

function basename(filePath: string): string {
  const lastSlash = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"))
  return lastSlash >= 0 ? filePath.slice(lastSlash + 1) : filePath
}

export function renderEditTool({ state, tool, icon, info }: ToolPartProps) {
  const filePath = readString(state.input.filePath)
  const fileName = filePath ? basename(filePath) : info?.subtitle
  const isWrite = tool === "write"

  return (
    <ToolRow>
      <ToolRowIcon>{icon?.("size-3.5")}</ToolRowIcon>
      <ToolRowAction>{isWrite ? "wrote" : "edited"}</ToolRowAction>
      {fileName ? <ToolRowSubject>{fileName}</ToolRowSubject> : null}
    </ToolRow>
  )
}
