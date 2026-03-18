import { ToolHeader } from "../shared/tool-header"
import { ToolOutputPanel } from "../shared/tool-card"
import { unwrapError } from "../shared/utils"
import type { ToolPartProps } from "./registry"

export function GenericTool({ state, info }: ToolPartProps) {
  const running = state.status === "pending" || state.status === "running"
  const showOutput = (state.output || (state.error ? unwrapError(state.error) : "")).trim().length > 0
  const output = state.output || (state.error ? unwrapError(state.error) : "")

  return (
    <div className="w-full rounded-lg border border-border bg-card p-3">
      <ToolHeader info={info} status={state.status} running={running} />
      {state.status === "error" && showOutput ? (
        <ToolOutputPanel output={output} status={state.status} copyLabel="Copy output" />
      ) : null}
    </div>
  )
}
