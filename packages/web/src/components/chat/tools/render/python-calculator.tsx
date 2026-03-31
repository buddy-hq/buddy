import { BasicTool, ToolOutputPanel, ToolAttachmentGallery } from "../../shared"
import { language } from "@/context/language"
import { readNonEmptyString } from "../../shared/utils"
import type { ToolPartProps } from "../registry"

export function renderPythonCalculatorTool({ state, defaultOpen }: ToolPartProps) {
  const output = state.output || (state.error ?? "")
  const showOutput = output.trim().length > 0
  const value = state.metadata.value
  const valueText = value === undefined ? "" : JSON.stringify(value, null, 2)

  return (
    <BasicTool
      trigger={{ title: language.t("chatTools.python") }}
      status={state.status}
      defaultOpen={defaultOpen ?? state.status !== "pending"}
    >
      {showOutput ? (
        <ToolOutputPanel
          output={output}
          status={state.status}
          copyLabel={language.t("chatTools.copyResult")}
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
