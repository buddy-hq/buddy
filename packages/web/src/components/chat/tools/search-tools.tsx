import { ToolCardWithDetails } from "../shared/tool-card"
import { Markdown } from "@/components/Markdown"
import { unwrapError } from "../shared/utils"
import type { ToolPartProps } from "./registry"

function SearchTool({ part, state, info }: ToolPartProps) {
  const running = state.status === "pending" || state.status === "running"
  const output = state.output || (state.error ? unwrapError(state.error) : "")
  const showOutput = output.trim().length > 0

  return (
    <ToolCardWithDetails info={info} status={state.status} running={running}>
      {showOutput ? (
        <div className="rounded-md border border-border bg-background px-3 py-2">
          <Markdown text={output} cacheKey={`${part.id}:tool-output`} />
        </div>
      ) : null}
    </ToolCardWithDetails>
  )
}

export function ListTool(props: ToolPartProps) {
  return <SearchTool {...props} />
}

export function GlobTool(props: ToolPartProps) {
  return <SearchTool {...props} />
}

export function GrepTool(props: ToolPartProps) {
  return <SearchTool {...props} />
}
