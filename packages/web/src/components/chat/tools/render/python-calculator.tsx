import { ObjectCard } from "../../tools/object-card"
import { ToolOutputPanel } from "../../tools/tool-output-panel"
import { Media, MediaThumbnail, MultiViewShell, type ImageMediaItem } from "@/components/media"
import { language } from "@/context/language"
import { resolveAssetUrl } from "@/lib/resource-url"
import type { ToolPartProps } from "../registry"

function resolvePlotUrl(url: string): string {
  if (url.startsWith("data:") || url.startsWith("blob:")) return url
  return resolveAssetUrl(url)
}

export function renderPythonCalculatorTool({ state, info }: ToolPartProps) {
  const running = state.status === "pending" || state.status === "running"

  const codeFirstLine =
    typeof state.input.code === "string" ? state.input.code.split("\n")[0]?.trim() : undefined

  if (running) {
    return (
      <ObjectCard title={info.title} badge={language.t("chatTools.python")} status={state.status}>
        <div className="space-y-2 p-4">
          <div className="h-2.5 w-3/5 animate-pulse rounded-sm bg-surface-weak/70" />
          <div className="h-2.5 w-2/5 animate-pulse rounded-sm bg-surface-weak/50" />
        </div>
      </ObjectCard>
    )
  }

  const output = state.output || (state.error ?? "")
  const hasOutput = output.trim().length > 0
  const value = state.metadata.value
  const valueText = value === undefined ? "" : JSON.stringify(value, null, 2)
  const plots = state.attachments.filter((a) => a.mime.startsWith("image/"))
  const hasPlots = plots.length > 0

  return (
    <ObjectCard
      title={language.t("chatTools.python")}
      badge={language.t("chatTools.python")}
      subtitle={codeFirstLine}
      hideStatus
    >
      {hasPlots ? (
        <>
          <MultiViewShell
            items={plots.map((plot) => {
              const url = resolvePlotUrl(plot.url)
              const alt = plot.filename ?? language.t("chatTools.python")
              const mediaItem: ImageMediaItem = {
                kind: "image",
                state: {
                  status: "ready",
                  data: {
                    src: url,
                    alt,
                  },
                },
              }
              return {
                key: plot.id,
                thumbnail: <MediaThumbnail item={mediaItem} />,
                children: (
                  <Media item={mediaItem} className="h-full min-h-0 border-0 shadow-none" />
                ),
              }
            })}
          />
          {hasOutput ? (
            <div className="border-t border-border-base/40 px-3 pb-3">
              <ToolOutputPanel output={output} copyLabel={language.t("chatTools.copyResult")} />
            </div>
          ) : null}
        </>
      ) : hasOutput ? (
        <div className="px-3 pb-3">
          <ToolOutputPanel output={output} copyLabel={language.t("chatTools.copyResult")} />
        </div>
      ) : valueText ? (
        <pre className="p-3 font-mono text-xs text-text-weaker">{valueText}</pre>
      ) : null}
    </ObjectCard>
  )
}
