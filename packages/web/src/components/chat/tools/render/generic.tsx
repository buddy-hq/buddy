import { BasicTool } from "../../tools/basic-tool"
import { ToolErrorPanel } from "../../tools/tool-error-panel"
import { ToolEmptyState } from "../../tools/tool-empty-state"
import type { ToolPartProps } from "../registry"

export function renderGenericTool({ state, info }: ToolPartProps) {
  const output = state.output || (state.error ?? "")
  const showOutput = output.trim().length > 0

  return (
    <BasicTool
      trigger={{ title: info.title, subtitle: info.subtitle, args: info.args }}
      status={state.status}
      hideDetails
    >
      {state.status === "error" && showOutput ? (
        <ToolErrorPanel error={output} />
      ) : state.status === "completed" && !showOutput ? (
        <ToolEmptyState />
      ) : null}
    </BasicTool>
  )
}
