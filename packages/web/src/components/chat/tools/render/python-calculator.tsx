import { BasicTool } from "../../tools/basic-tool"
import { ToolOutputPanel } from "../../tools/tool-output-panel"
import { ToolErrorPanel } from "../../tools/tool-error-panel"
import { ToolAttachmentGallery } from "../tool-attachments"
import { language } from "@/context/language"
import type { ToolPartProps } from "../registry"

export function renderPythonCalculatorTool({ state, defaultOpen }: ToolPartProps) {
  const output = state.output || (state.error ?? "")
  const hasContent = output.trim().length > 0
  const hasError = state.status === "error" && hasContent
  const value = state.metadata.value
  const valueText = value === undefined ? "" : JSON.stringify(value, null, 2)

  return (
    <BasicTool
      trigger={{ title: language.t("chatTools.python") }}
      status={state.status}
      defaultOpen={defaultOpen ?? state.status !== "pending"}
    >
      {hasError ? (
        <ToolErrorPanel error={output} />
      ) : hasContent ? (
        <ToolOutputPanel output={output} copyLabel={language.t("chatTools.copyResult")} />
      ) : null}
      {!hasContent && valueText ? (
        <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border-base bg-background-base p-2 text-xs text-text-weak">
          {valueText}
        </pre>
      ) : null}
      <ToolAttachmentGallery attachments={state.attachments} />
    </BasicTool>
  )
}
