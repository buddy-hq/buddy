import { BasicTool } from "../../tools/basic-tool"
import { ToolOutputPanel } from "../../tools/tool-output-panel"
import { DiagnosticList } from "./diagnostic-list"
import { language } from "@/context/language"
import { isRecord, readString } from "../../tools/types"
import type { ToolPartProps } from "../registry"
interface ToolDiagnostic {
  range: {
    start: {
      line: number
      character: number
    }
  }
  message: string
  severity?: number
}

export function renderEditTool({ state, defaultOpen }: ToolPartProps) {
  const filePath = readString(state.input.filePath)
  const fileDiff = isRecord(state.metadata.filediff) ? state.metadata.filediff : undefined
  const beforeText = typeof fileDiff?.before === "string" ? fileDiff.before : undefined
  const afterText = typeof fileDiff?.after === "string" ? fileDiff.after : undefined
  const writeContent = readString(state.input.content)
  const output = state.output || (state.error ?? "")
  const showOutput = output.trim().length > 0

  const diagnostics: ToolDiagnostic[] = []
  if (filePath && state.metadata.diagnostics) {
    const rawDiagnosticsByFile = isRecord(state.metadata.diagnostics)
      ? state.metadata.diagnostics
      : undefined
    if (rawDiagnosticsByFile) {
      const rawDiagnostics = rawDiagnosticsByFile[filePath]
      if (Array.isArray(rawDiagnostics)) {
        for (const entry of rawDiagnostics) {
          if (!isRecord(entry)) continue
          if (!isRecord(entry.range)) continue
          if (!isRecord(entry.range.start)) continue
          if (typeof entry.range.start.line !== "number") continue
          if (typeof entry.range.start.character !== "number") continue
          if (typeof entry.message !== "string") continue
          diagnostics.push({
            range: {
              start: {
                line: entry.range.start.line,
                character: entry.range.start.character,
              },
            },
            message: entry.message,
            severity: typeof entry.severity === "number" ? entry.severity : undefined,
          })
        }
      }
    }
  }

  return (
    <BasicTool
      trigger={{
        title:
          state.input.oldString !== undefined
            ? language.t("chatTools.edit")
            : language.t("chatTools.write"),
        subtitle: filePath ? dirname(filePath) : undefined,
      }}
      status={state.status}
      defaultOpen={defaultOpen}
    >
      {beforeText !== undefined || afterText !== undefined ? (
        <div className="grid gap-2 md:grid-cols-2">
          <div>
            <div className="mb-1 text-xs font-semibold text-text-weak">
              {language.t("chatTools.before")}
            </div>
            <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border-base bg-surface-weak/40 p-2 text-xs text-text-weak">
              {beforeText || language.t("chatTools.empty")}
            </pre>
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold text-text-weak">
              {language.t("chatTools.after")}
            </div>
            <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border-base bg-surface-weak/40 p-2 text-xs text-text-weak">
              {afterText || language.t("chatTools.empty")}
            </pre>
          </div>
        </div>
      ) : null}
      {writeContent ? (
        <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border-base bg-background-base p-2 text-xs text-text-weak">
          {writeContent}
        </pre>
      ) : null}
      <DiagnosticList diagnostics={diagnostics.filter((d) => d.severity === 1).slice(0, 3)} />
      {showOutput ? (
        <ToolOutputPanel
          output={output}
          status={state.status}
          copyLabel={language.t("chatTools.copyOutput")}
        />
      ) : null}
    </BasicTool>
  )
}

function dirname(filePath: string): string {
  const lastSlash = filePath.lastIndexOf("/")
  return lastSlash > 0 ? filePath.slice(0, lastSlash) : filePath
}
