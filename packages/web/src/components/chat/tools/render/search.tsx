import { BasicTool } from "../../tools/basic-tool"
import { ToolErrorPanel } from "../../tools/tool-error-panel"
import { ToolEmptyState } from "../../tools/tool-empty-state"
import { Markdown } from "@/components/markdown/Markdown"
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
      {state.status === "error" && showOutput ? (
        <ToolErrorPanel error={output} />
      ) : showOutput ? (
        <div className="rounded-md border border-border-base bg-background-base px-3 py-2">
          <Markdown text={output} cacheKey={`${part.id}:tool-output`} />
        </div>
      ) : state.status === "completed" ? (
        <ToolEmptyState />
      ) : null}
    </BasicTool>
  )
}
