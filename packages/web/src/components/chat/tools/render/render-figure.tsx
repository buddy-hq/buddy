import { BasicTool, ToolOutputPanel, CopyAction } from "../../shared"
import { language } from "@/context/language"
import { isRecord, readString, readNonEmptyString, readNonNegativeInt } from "../../shared/utils"
import { resolveApiUrl } from "@/lib/api-client"
import type { ToolPartProps } from "../registry"
import type { RenderFigureToolOutput } from "../types"

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

export function parseRenderFigureOutput(
  state: ToolPartProps["state"],
): RenderFigureToolOutput | undefined {
  const artifact = readString(state.metadata.artifact)
  if (artifact !== "RenderFigureOutput" && artifact !== "RenderFreeformFigureOutput")
    return undefined

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

export function renderRenderFigureTool({ state, info }: ToolPartProps) {
  const renderFigure = state.status === "completed" ? parseRenderFigureOutput(state) : undefined
  const output = state.output || (state.error ?? "")
  const showOutput = output.trim().length > 0

  if (!renderFigure) {
    return (
      <BasicTool
        trigger={{ title: info.title, subtitle: info.subtitle }}
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

  const imageUrl = resolveApiUrl(renderFigure.url)
  const copyableImageUrl = stripUrlCredentials(imageUrl)

  return (
    <BasicTool
      trigger={{ title: info.title, subtitle: info.subtitle }}
      status={state.status}
      hideDetails
    >
      <figure className="rounded-lg border border-border-base bg-background-base p-2">
        <img
          src={imageUrl}
          alt={renderFigure.alt}
          loading="lazy"
          className="h-auto w-full rounded-md"
        />
      </figure>
      {renderFigure.caption ? (
        <div className="mt-1 text-sm text-text-weak">{renderFigure.caption}</div>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <CopyAction value={copyableImageUrl} label={language.t("chatTools.copyImageUrl")} />
        <span className="text-xs text-text-weak">
          {renderFigure.repairAttempts > 0
            ? language.t(
                renderFigure.repairAttempts === 1
                  ? "chatTools.repairedLabel.one"
                  : "chatTools.repairedLabel.other",
                { attempts: renderFigure.repairAttempts },
              )
            : language.t("chatTools.renderedAutomatically")}
        </span>
      </div>
    </BasicTool>
  )
}
