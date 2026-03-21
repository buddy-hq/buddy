import { Badge } from "@buddy/ui"
import { ToolCardWithDetails, ToolOutputPanel } from "../shared/tool-card"
import { readString, unwrapError, titleFromToolName } from "../shared/utils"
import type { ToolPartProps } from "./registry"
import { ToolAttachmentGallery } from "../shared/tool-attachments"

export function PythonCalculatorTool({ state, info, defaultOpen }: ToolPartProps) {
  const running = state.status === "pending" || state.status === "running"
  const showOutput =
    (state.output || (state.error ? unwrapError(state.error) : "")).trim().length > 0
  const output = state.output || (state.error ? unwrapError(state.error) : "")
  const value = state.metadata.value
  const valueText = value === undefined ? "" : JSON.stringify(value, null, 2)

  return (
    <ToolCardWithDetails
      info={info}
      status={state.status}
      running={running}
      defaultOpen={defaultOpen ?? state.status !== "pending"}
    >
      {showOutput ? (
        <ToolOutputPanel output={output} status={state.status} copyLabel="Copy result" />
      ) : null}
      {!showOutput && valueText ? (
        <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-background p-2 text-xs text-muted-foreground">
          {valueText}
        </pre>
      ) : null}
      <ToolAttachmentGallery attachments={state.attachments} />
    </ToolCardWithDetails>
  )
}

export function SkillTool({ state, info }: ToolPartProps) {
  const running = state.status === "pending" || state.status === "running"

  return (
    <div className="w-full rounded-lg border border-border bg-card p-3">
      <ToolHeader info={info} status={state.status} running={running} />
    </div>
  )
}

import { ToolHeader } from "../shared/tool-header"

export function BuddyCustomTool({ state, info, tool, defaultOpen }: ToolPartProps) {
  const running = state.status === "pending" || state.status === "running"
  const showOutput =
    (state.output || (state.error ? unwrapError(state.error) : "")).trim().length > 0
  const output = state.output || (state.error ? unwrapError(state.error) : "")
  const artifact = readString(state.metadata.artifact)
  const value = state.metadata.value
  const valueText = value === undefined ? "" : JSON.stringify(value, null, 2)

  return (
    <ToolCardWithDetails
      info={{ ...info, title: titleFromToolName(tool) }}
      status={state.status}
      running={running}
      defaultOpen={defaultOpen ?? state.status !== "pending"}
    >
      {artifact ? (
        <div>
          <Badge variant="outline" className="text-xs text-muted-foreground">
            {artifact}
          </Badge>
        </div>
      ) : null}
      {showOutput ? (
        <ToolOutputPanel output={output} status={state.status} copyLabel="Copy output" />
      ) : null}
      {!showOutput && valueText ? (
        <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-background p-2 text-xs text-muted-foreground">
          {valueText}
        </pre>
      ) : null}
      <ToolAttachmentGallery attachments={state.attachments} />
    </ToolCardWithDetails>
  )
}
