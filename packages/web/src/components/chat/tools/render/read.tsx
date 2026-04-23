import { BasicTool } from "../../tools/basic-tool"
import { ToolErrorPanel } from "../../tools/tool-error-panel"
import { ToolEmptyState } from "../../tools/tool-empty-state"
import { language } from "@/context/language"
import type { ToolPartProps } from "../registry"

function readStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === "string")
}

export function renderReadTool({ state, info }: ToolPartProps) {
  const loadedFiles = readStringList(state.metadata.loaded)
  const output = state.output || (state.error ?? "")
  const showOutput = output.trim().length > 0

  return (
    <BasicTool
      trigger={{ title: info.title, subtitle: info.subtitle, args: info.args }}
      status={state.status}
      hideDetails
    >
      {loadedFiles.length > 0 ? (
        <div className="space-y-1 text-xs text-text-weak">
          {loadedFiles.map((loadedFile) => (
            <div key={loadedFile}>
              {language.t("chatTools.loadedPrefix")} {loadedFile}
            </div>
          ))}
        </div>
      ) : state.status === "completed" ? (
        <ToolEmptyState />
      ) : null}
      {state.status === "error" && showOutput ? <ToolErrorPanel error={output} /> : null}
    </BasicTool>
  )
}
