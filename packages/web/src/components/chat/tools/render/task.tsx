import { BasicTool, ToolOutputPanel } from "../../shared"
import { language } from "@/context/language"
import { readString } from "../../shared/utils"
import type { ToolPartProps } from "../registry"
import { cn } from "@buddy/ui"

export function renderTaskTool({ state, onOpenSession }: ToolPartProps) {
  const childSessionId = readString(state.metadata.sessionId)
  const openChildSession =
    childSessionId && onOpenSession ? () => onOpenSession?.(childSessionId) : undefined
  const output = state.output || (state.error ?? "")
  const showOutput = output.trim().length > 0

  const content = (
    <BasicTool
      trigger={{ title: language.t("chatTools.task") }}
      status={state.status}
      hideDetails={!showOutput || state.status !== "error"}
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

  if (openChildSession && state.status !== "error") {
    return (
      <button
        type="button"
        className={cn(
          "w-full rounded-lg border border-border-base bg-surface-raised-base p-3 text-left transition-colors hover:border-border-hover",
        )}
        onClick={openChildSession}
      >
        {content}
      </button>
    )
  }

  return content
}
