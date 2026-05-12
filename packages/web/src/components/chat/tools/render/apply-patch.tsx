import { isRecord } from "../../tools/types"
import { ToolRow, ToolRowIcon, ToolRowAction, ToolRowSubject } from "../tool-row"
import type { ToolPartProps } from "../registry"

function basename(filePath: string): string {
  const lastSlash = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"))
  return lastSlash >= 0 ? filePath.slice(lastSlash + 1) : filePath
}

export function renderApplyPatchTool({ state, icon }: ToolPartProps) {
  const running = state.status === "pending" || state.status === "running"

  const files = state.metadata.files
  const patchFiles = Array.isArray(files) ? files.filter(isRecord) : []
  const fileCount = patchFiles.length

  const firstRelativePath =
    fileCount === 1 && typeof patchFiles[0]?.relativePath === "string"
      ? patchFiles[0].relativePath
      : undefined

  const subject = firstRelativePath
    ? basename(firstRelativePath)
    : fileCount > 1
      ? `${fileCount} files`
      : undefined

  return (
    <ToolRow>
      <ToolRowIcon>{icon?.("size-3.5")}</ToolRowIcon>
      <ToolRowAction>{running ? "patching" : "patched"}</ToolRowAction>
      {subject ? <ToolRowSubject>{subject}</ToolRowSubject> : null}
    </ToolRow>
  )
}
