import { BasicTool, ToolOutputPanel } from "../../shared"
import { language } from "@/context/language"
import { readString, stripAnsi } from "../../shared/utils"
import type { ToolPartProps } from "../registry"

export function renderBashTool({ state, defaultOpen }: ToolPartProps) {
  const shellCommand = readString(state.input.command) ?? readString(state.metadata.command) ?? ""
  const shellOutput = stripAnsi(state.output || (readString(state.metadata.output) ?? ""))
  const shellText = shellCommand
    ? `$ ${shellCommand}${shellOutput ? `\n\n${shellOutput}` : ""}`
    : shellOutput

  return (
    <BasicTool
      trigger={{ title: language.t("chatTools.shell"), subtitle: shellCommand || undefined }}
      status={state.status}
      defaultOpen={defaultOpen}
    >
      {shellText ? (
        <ToolOutputPanel
          output={shellText}
          status={state.status}
          copyLabel={language.t("chatTools.copyShellOutput")}
        />
      ) : null}
      {!shellText && state.status === "completed" ? (
        <div className="text-xs text-text-weak">{language.t("chatTools.noOutput")}</div>
      ) : null}
    </BasicTool>
  )
}
