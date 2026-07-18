import { ACTIVITY_ROW_ERROR_CLASS_NAME } from "../activity-row/styles"
import { ToolRow, ToolRowIcon, ToolRowAction, ToolRowDenied } from "../tool-row"
import { isPermissionDenied } from "../tool-permission"
import type { ToolPartProps } from "../registry"

export function renderGenericTool({ state, info, icon }: ToolPartProps) {
  const denied = isPermissionDenied(state)
  const output = state.output || (state.error ?? "")
  const showOutput = !denied && output.trim().length > 0

  return (
    <div className="flex flex-col gap-1.5">
      <ToolRow>
        <ToolRowIcon>{icon?.("size-3.5")}</ToolRowIcon>
        <ToolRowAction>{info.title}</ToolRowAction>
        {denied ? <ToolRowDenied /> : null}
      </ToolRow>
      {state.status === "error" && showOutput ? (
        <pre className={ACTIVITY_ROW_ERROR_CLASS_NAME}>{output}</pre>
      ) : null}
    </div>
  )
}
