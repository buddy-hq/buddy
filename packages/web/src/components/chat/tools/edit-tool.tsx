import { ToolCardWithDetails, ToolOutputPanel, DiagnosticList } from "../shared/tool-card"
import { isRecord, readString, unwrapError } from "../shared/utils"
import { dirname } from "../shared/utils"
import type { ToolPartProps, ToolDiagnostic } from "./registry"

export function EditTool(props: ToolPartProps) {
  return renderFileEditTool(props)
}

export function WriteTool(props: ToolPartProps) {
  return renderFileEditTool(props)
}

function renderFileEditTool({ state, info, tool }: ToolPartProps) {
  const running = state.status === "pending" || state.status === "running"
  const filePath = readString(state.input.filePath)
  const fileDiff = isRecord(state.metadata.filediff) ? state.metadata.filediff : undefined
  const beforeText = typeof fileDiff?.before === "string" ? fileDiff.before : undefined
  const afterText = typeof fileDiff?.after === "string" ? fileDiff.after : undefined
  const writeContent = readString(state.input.content)
  const showOutput = (state.output || (state.error ? unwrapError(state.error) : "")).trim().length > 0
  const output = state.output || (state.error ? unwrapError(state.error) : "")

  const diagnostics: ToolDiagnostic[] = []
  if (filePath && state.metadata.diagnostics) {
    const rawDiagnosticsByFile = isRecord(state.metadata.diagnostics) ? state.metadata.diagnostics : undefined
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
    <ToolCardWithDetails info={info} status={state.status} running={running}>
      {filePath ? <div className="text-xs text-muted-foreground">{dirname(filePath)}</div> : null}
      {beforeText !== undefined || afterText !== undefined ? (
        <div className="grid gap-2 md:grid-cols-2">
          <div>
            <div className="mb-1 text-xs font-semibold text-muted-foreground">Before</div>
            <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted/40 p-2 text-xs text-muted-foreground">
              {beforeText || "(empty)"}
            </pre>
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold text-muted-foreground">After</div>
            <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted/40 p-2 text-xs text-muted-foreground">
              {afterText || "(empty)"}
            </pre>
          </div>
        </div>
      ) : null}
      {writeContent ? (
        <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-background p-2 text-xs text-muted-foreground">
          {writeContent}
        </pre>
      ) : null}
      <DiagnosticList diagnostics={diagnostics.filter((d) => d.severity === 1).slice(0, 3)} />
      {showOutput ? <ToolOutputPanel output={output} status={state.status} copyLabel="Copy output" /> : null}
    </ToolCardWithDetails>
  )
}
