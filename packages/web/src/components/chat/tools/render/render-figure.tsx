import { useState } from "react"
import { language } from "@/context/language"
import { isRecord, readString, readNonEmptyString, readNonNegativeInt } from "../../tools/types"
import { resolveAssetUrl } from "@/lib/resource-url"
import type { ToolPartProps } from "../registry"
import { ImageZoomDialog } from "../image-zoom-dialog"
import { MultiViewShell } from "../multi-view-shell"
import type { MessagePart } from "@/state/chat-types"
import { parseToolState } from "../parse-tool-state"
import { getToolInfo } from "../tool-info"

interface RenderFigureToolOutput {
  figureID: string
  mime: "image/svg+xml"
  url: string
  alt: string
  caption?: string
  repairAttempts: number
}

function readProducerArtifact(
  state: ToolPartProps["state"],
): { artifact: string; value: unknown } | undefined {
  const producerArtifact = isRecord(state.metadata.producerArtifact)
    ? state.metadata.producerArtifact
    : undefined
  const artifact = producerArtifact && readString(producerArtifact.artifact)
  if (!producerArtifact || !artifact) return undefined

  return {
    artifact,
    value: producerArtifact.value,
  }
}

export function parseRenderFigureOutput(
  state: ToolPartProps["state"],
): RenderFigureToolOutput | undefined {
  const producerArtifact = readProducerArtifact(state)
  const artifact = producerArtifact?.artifact ?? readString(state.metadata.artifact)
  if (artifact !== "RenderFigureOutput" && artifact !== "RenderFreeformFigureOutput")
    return undefined

  const value = isRecord(producerArtifact?.value)
    ? producerArtifact.value
    : isRecord(state.metadata.value)
      ? state.metadata.value
      : undefined
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

export function renderRenderFigureTool({ state }: ToolPartProps) {
  const [open, setOpen] = useState(false)
  const running = state.status === "pending" || state.status === "running"
  const renderFigure = state.status === "completed" ? parseRenderFigureOutput(state) : undefined

  if (running) {
    return (
      <div className="w-full h-48 animate-pulse border border-border-base/40 bg-surface-weak/30 rounded-xl" />
    )
  }

  if (!renderFigure) {
    return (
      <div className="w-full p-4 border border-border-base/40 bg-surface-weak/30 rounded-xl text-center text-xs text-text-weak">
        {language.t("chatTools.info.figure")}
      </div>
    )
  }

  const imageUrl = resolveAssetUrl(renderFigure.url)
  const captionText = renderFigure.caption || renderFigure.alt

  return (
    <>
      <div className="relative w-full overflow-hidden border border-border-base/40 bg-surface-weak/20 rounded-xl flex flex-col">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full flex items-center justify-center cursor-zoom-in hover:bg-surface-weak/10 transition-colors focus-visible:outline-none rounded-t-xl rounded-b-none"
        >
          <img
            src={imageUrl}
            alt={renderFigure.alt}
            loading="lazy"
            className="block w-full max-h-[50dvh] object-contain rounded-t-xl rounded-b-none select-none"
          />
        </button>
        {captionText ? (
          <div className="w-full px-3 py-2 border-t border-border-base/30 bg-surface-base/80 text-xs text-text-weaker text-center">
            {captionText}
          </div>
        ) : null}
      </div>

      <ImageZoomDialog
        open={open}
        onOpenChange={setOpen}
        imageUrl={imageUrl}
        title={renderFigure.alt}
        description={renderFigure.caption}
      >
        {captionText ? (
          <p className="px-4 py-1.5 bg-background-base/75 text-text-base text-xs font-medium rounded-full shadow-lg border border-border-base/10 max-w-xl text-center backdrop-blur-sm select-none">
            {captionText}
          </p>
        ) : null}
      </ImageZoomDialog>
    </>
  )
}

function FigureThumbnail({ part }: { part: MessagePart }) {
  const state = parseToolState(part)
  const renderFigure = state.status === "completed" ? parseRenderFigureOutput(state) : undefined
  if (!renderFigure) {
    return <div className="h-full w-full bg-surface-weak/30 animate-pulse rounded-md" />
  }
  const imageUrl = resolveAssetUrl(renderFigure.url)
  return (
    <div className="h-full w-full pointer-events-none flex items-center justify-center bg-background-base rounded-md overflow-hidden">
      <img
        src={imageUrl}
        alt={renderFigure.alt}
        className="block max-h-full max-w-full object-contain select-none"
      />
    </div>
  )
}

function SingleFigureToolCard({ part, directory }: { part: MessagePart; directory?: string }) {
  const state = parseToolState(part)
  const toolName =
    part.type === "tool" && typeof part.tool === "string" ? part.tool : "render_figure"
  const info = getToolInfo(toolName, state)
  return renderRenderFigureTool({
    part,
    state,
    info,
    tool: toolName,
    directory,
  })
}

export function GroupedFigureToolCard({
  parts,
  directory,
}: {
  parts: MessagePart[]
  directory?: string
}) {
  const items = parts.map((part) => {
    return {
      key: part.id,
      thumbnail: <FigureThumbnail part={part} />,
      children: <SingleFigureToolCard part={part} directory={directory} />,
    }
  })

  return (
    <MultiViewShell
      items={items}
      contentClassName="bg-transparent rounded-none border-none p-0 h-auto w-full shadow-none"
      className="mt-2"
      thumbnailSize="lg"
    />
  )
}
