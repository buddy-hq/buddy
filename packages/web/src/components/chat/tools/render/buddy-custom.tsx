import { Badge } from "@buddy/ui"
import { BasicTool } from "../../tools/basic-tool"
import { ToolOutputPanel } from "../../tools/tool-output-panel"
import { ToolAttachmentGallery } from "../tool-attachments"
import { language } from "@/context/language"
import { readNonEmptyString, readNonNegativeInt } from "../../tools/types"
import { titleFromToolName } from "../../utils/tool"
import type { ToolPartProps } from "../registry"

export function renderBuddyCustomTool({ state, tool, defaultOpen }: ToolPartProps) {
  if (tool === "pedagogy_resource_ingest_full_text") {
    const resource = readNonEmptyString(state.metadata.resource)
    const fullTextEstTokens = readNonNegativeInt(state.metadata.fullTextEstTokens)
    const output = state.output || (state.error ?? "")
    const showOutput = output.trim().length > 0

    return (
      <BasicTool
        trigger={{ title: language.t("chatTools.fullText"), subtitle: resource }}
        status={state.status}
        defaultOpen={defaultOpen ?? state.status === "error"}
        hideDetails
      >
        {fullTextEstTokens !== undefined ? (
          <div className="text-xs text-text-weak">
            {language.t("chatTools.tokensLoaded", { count: fullTextEstTokens.toLocaleString() })}
          </div>
        ) : null}
        {state.status === "error" && showOutput ? (
          <ToolOutputPanel
            output={output}
            status={state.status}
            copyLabel={language.t("chatTools.copyOutput")}
          />
        ) : null}
      </BasicTool>
    )
  }

  const output = state.output || (state.error ?? "")
  const showOutput = output.trim().length > 0
  const artifact = readNonEmptyString(state.metadata.artifact)
  const value = state.metadata.value
  const valueText = value === undefined ? "" : JSON.stringify(value, null, 2)
  const shouldDefaultOpen =
    tool === "learner_snapshot_read"
      ? (defaultOpen ?? false)
      : (defaultOpen ?? state.status !== "pending")

  return (
    <BasicTool
      trigger={{ title: titleFromToolName(tool) }}
      status={state.status}
      defaultOpen={shouldDefaultOpen}
    >
      {artifact ? (
        <div>
          <Badge variant="outline" className="text-xs text-text-weak">
            {artifact}
          </Badge>
        </div>
      ) : null}
      {showOutput ? (
        <ToolOutputPanel
          output={output}
          status={state.status}
          copyLabel={language.t("chatTools.copyOutput")}
        />
      ) : null}
      {!showOutput && valueText ? (
        <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border-base bg-background-base p-2 text-xs text-text-weak">
          {valueText}
        </pre>
      ) : null}
      <ToolAttachmentGallery attachments={state.attachments} />
    </BasicTool>
  )
}
