import { BasicTool } from "../../tools/basic-tool"
import { Markdown } from "@/components/Markdown"
import type { ToolPartProps } from "../registry"

export function renderSearchTool({ part, state, defaultOpen, info }: ToolPartProps) {
  const output = state.output || (state.error ?? "")
  const showOutput = output.trim().length > 0

  return (
    <BasicTool
      trigger={{ title: info.title, subtitle: info.subtitle }}
      status={state.status}
      defaultOpen={defaultOpen}
    >
      {showOutput ? (
        <div className="rounded-md border border-border-base bg-background-base px-3 py-2">
          <Markdown text={output} cacheKey={`${part.id}:tool-output`} />
        </div>
      ) : null}
    </BasicTool>
  )
}
