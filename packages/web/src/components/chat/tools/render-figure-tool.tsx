import { ToolHeader } from "../shared/tool-header"
import { CopyAction } from "../shared/copy-action"
import { ToolOutputPanel } from "../shared/tool-card"
import { readString, readNonEmptyString, readNonNegativeInt, isRecord, unwrapError } from "../shared/utils"
import { resolveApiUrl } from "../../../lib/api-client"
import type { ToolPartProps, RenderFigureToolOutput } from "./registry"

function stripUrlCredentials(value: string): string {
  try {
    const url = new URL(value)
    url.username = ""
    url.password = ""
    return url.toString()
  } catch {
    return value
  }
}

export function parseRenderFigureToolOutput(state: ToolPartProps["state"]): RenderFigureToolOutput | undefined {
  const artifact = readString(state.metadata.artifact)
  if (artifact !== "RenderFigureOutput" && artifact !== "RenderFreeformFigureOutput") return undefined

  const value = isRecord(state.metadata.value) ? state.metadata.value : undefined
  if (!value) return undefined

  const figureID = readNonEmptyString(value.figureID)
  const mime = value.mime === "image/svg+xml" ? "image/svg+xml" : undefined
  const url = readNonEmptyString(value.url)
  const alt = readNonEmptyString(value.alt)
  const caption = readNonEmptyString(value.caption)
  const repairAttempts = readNonNegativeInt(value.repairAttempts)

  if (!figureID || !mime || !url || !alt || repairAttempts === undefined) return undefined

  return { figureID, mime, url, alt, caption, repairAttempts }
}

export function RenderFigureTool({ state, info }: ToolPartProps) {
  const running = state.status === "pending" || state.status === "running"
  const renderFigure = state.status === "completed" ? parseRenderFigureToolOutput(state) : undefined
  const output = state.output || (state.error ? unwrapError(state.error) : "")
  const showOutput = output.trim().length > 0

  if (!renderFigure) {
    return (
      <div className="w-full rounded-lg border border-border bg-card p-3">
        <ToolHeader info={info} status={state.status} running={running} />
        {state.status === "error" && showOutput ? (
          <ToolOutputPanel output={output} status={state.status} copyLabel="Copy output" />
        ) : null}
      </div>
    )
  }

  const imageUrl = resolveApiUrl(renderFigure.url)
  const copyableImageUrl = stripUrlCredentials(imageUrl)

  return (
    <div className="w-full rounded-lg border border-border bg-card p-3">
      <ToolHeader info={info} status={state.status} running={running} />
      <figure className="mt-2 rounded-lg border border-border bg-background p-2">
        <img src={imageUrl} alt={renderFigure.alt} loading="lazy" className="h-auto w-full rounded-md" />
      </figure>
      {renderFigure.caption ? <div className="mt-1 text-sm text-muted-foreground">{renderFigure.caption}</div> : null}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <CopyAction value={copyableImageUrl} label="Copy image URL" />
        <span className="text-xs text-muted-foreground">
          {renderFigure.repairAttempts > 0
            ? `repaired ${renderFigure.repairAttempts} ${renderFigure.repairAttempts === 1 ? "time" : "times"}`
            : "rendered automatically from tool output"}
        </span>
      </div>
    </div>
  )
}
