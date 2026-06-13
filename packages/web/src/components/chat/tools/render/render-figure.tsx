import { language } from "@/context/language"
import { isRecord, readString, readNonEmptyString, readNonNegativeInt } from "../../tools/types"
import { resolveAssetUrl } from "@/lib/resource-url"
import type { ToolPartProps } from "../registry"
import type { MessagePart } from "@/state/chat-types"
import { parseToolState } from "../parse-tool-state"
import { getToolInfo } from "../tool-info"
import { ToolImageGallery, type ToolImageGalleryItem } from "./image-gallery"

type RenderFigureToolOutput = {
  artifactID: string
  mime: "image/svg+xml"
  url: string
  alt: string
  caption?: string
  repairAttempts: number
}

export function parseRenderFigureOutput(
  state: ToolPartProps["state"],
): RenderFigureToolOutput | undefined {
  const artifact = readString(state.metadata.artifact)
  if (artifact !== "RenderFigureOutput" && artifact !== "RenderFreeformFigureOutput")
    return undefined

  const value = isRecord(state.metadata.value) ? state.metadata.value : undefined
  if (!value) return undefined

  const artifactID = readNonEmptyString(value.artifactID)
  const mime = value.mime === "image/svg+xml" ? "image/svg+xml" : undefined
  const url = readNonEmptyString(value.url)
  const alt = readNonEmptyString(value.alt)
  const caption = readNonEmptyString(value.caption)
  const repairAttempts = readNonNegativeInt(value.repairAttempts)

  if (!artifactID || !mime || !url || !alt || repairAttempts === undefined) return undefined

  return { artifactID, mime, url, alt, caption, repairAttempts }
}

function figureGalleryItem(input: {
  id: string
  state: ToolPartProps["state"]
  fallbackTitle: string
  allowUnavailablePlaceholder?: boolean
}): ToolImageGalleryItem | undefined {
  const running = input.state.status === "pending" || input.state.status === "running"
  if (running) {
    return {
      id: input.id,
      src: null,
      alt: input.fallbackTitle,
      title: input.fallbackTitle,
    }
  }

  const renderFigure =
    input.state.status === "completed" ? parseRenderFigureOutput(input.state) : undefined
  if (!renderFigure) {
    if (input.allowUnavailablePlaceholder) {
      return {
        id: input.id,
        src: null,
        alt: input.fallbackTitle,
        title: input.fallbackTitle,
      }
    }
    return undefined
  }

  return {
    id: input.id,
    src: resolveAssetUrl(renderFigure.url),
    alt: renderFigure.alt,
    title: renderFigure.alt,
    caption: renderFigure.caption || renderFigure.alt,
  }
}

function FigureGallery(props: { items: ToolImageGalleryItem[] }) {
  if (props.items.length === 0) {
    return (
      <div className="w-full rounded-xl border border-border-base/40 bg-surface-weak/30 p-4 text-center text-xs text-text-weak">
        {language.t("chatTools.info.figure")}
      </div>
    )
  }

  return (
    <div className="w-full">
      <ToolImageGallery
        dialogDescription="Figure preview"
        contentClassName="h-[24rem]"
        items={props.items}
      />
    </div>
  )
}

export function renderRenderFigureTool({ part, state, info }: ToolPartProps) {
  const item = figureGalleryItem({
    id: part.id,
    state,
    fallbackTitle: info.title,
  })

  return <FigureGallery items={item ? [item] : []} />
}

export function GroupedFigureToolCard({ parts }: { parts: MessagePart[]; directory?: string }) {
  const items = parts
    .map((part) => {
      const state = parseToolState(part)
      const toolName =
        part.type === "tool" && typeof part.tool === "string" ? part.tool : "render_figure"
      return figureGalleryItem({
        id: part.id,
        state,
        fallbackTitle: getToolInfo(toolName, state).title,
        allowUnavailablePlaceholder: true,
      })
    })
    .filter((item): item is ToolImageGalleryItem => item !== undefined)

  return <FigureGallery items={items} />
}
