import { BasicTool, ToolOutputPanel } from "../../shared"
import { language } from "@/context/language"
import type { ToolPartProps } from "../registry"

export function renderGenericTool({ state, info }: ToolPartProps) {
  const output = state.output || (state.error ?? "")
  const showOutput = output.trim().length > 0

  return (
    <BasicTool
      trigger={{ title: info.title, subtitle: info.subtitle, args: info.args }}
      status={state.status}
      hideDetails
    >
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
