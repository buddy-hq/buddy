import { isRecord, parseTString } from "../../tools/types"
import { ToolRow, ToolRowIcon, ToolRowAction, ToolRowSubject } from "../tool-row"
import type { ToolPartProps } from "../registry"

function basename(filePath: string): string {
  const lastSlash = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"))
  return lastSlash >= 0 ? filePath.slice(lastSlash + 1) : filePath
}

/** Renders a native patch tool with its resolved lifecycle action and file targets. */
export function renderApplyPatchTool({ state, icon, info }: ToolPartProps) {
  const files = state.metadata.files
  const patchFiles = Array.isArray(files) ? files.filter(isRecord) : []
  const fileCount = patchFiles.length

  const firstRelativePath = fileCount === 1 ? parseTString(patchFiles[0]?.relativePath) : undefined

  const subject = firstRelativePath
    ? basename(firstRelativePath)
    : fileCount > 1
      ? `${fileCount} files`
      : undefined

  return (
    <ToolRow>
      <ToolRowIcon>{icon?.("size-3.5")}</ToolRowIcon>
      <ToolRowAction>{info.title}</ToolRowAction>
      {subject ? <ToolRowSubject>{subject}</ToolRowSubject> : null}
    </ToolRow>
  )
}
