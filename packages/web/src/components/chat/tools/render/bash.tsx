import { BasicTool } from "../../tools/basic-tool"
import { ToolOutputPanel } from "../../tools/tool-output-panel"
import { ToolErrorPanel } from "../../tools/tool-error-panel"
import { language } from "@/context/language"
import { readString } from "../../tools/types"
import { stripAnsi } from "../../utils/path"
import type { ToolPartProps } from "../registry"

export function renderBashTool({ state, defaultOpen }: ToolPartProps) {
  const shellCommand = readString(state.input.command) ?? readString(state.metadata.command) ?? ""
  const shellOutput = stripAnsi(state.output || (readString(state.metadata.output) ?? ""))
  const shellText = shellCommand
    ? `$ ${shellCommand}${shellOutput ? `\n\n${shellOutput}` : ""}`
    : shellOutput
  const hasError = state.status === "error" && shellText.trim().length > 0

  return (
    <BasicTool
      trigger={{ title: language.t("chatTools.shell"), subtitle: shellCommand || undefined }}
      status={state.status}
      defaultOpen={defaultOpen}
    >
      {hasError ? (
        <ToolErrorPanel error={shellText} />
      ) : shellText ? (
        <ToolOutputPanel output={shellText} copyLabel={language.t("chatTools.copyShellOutput")} />
      ) : null}
      {!shellText && state.status === "completed" ? (
        <div className="text-xs text-text-weak">{language.t("chatTools.noOutput")}</div>
      ) : null}
    </BasicTool>
  )
}
