import { useCallback, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { TextShimmer } from "../text-shimmer"
import { ResourceCover, ResourceCoverButton } from "@/components/resources/resource-cover"
import { language } from "@/context/language"
import {
  RESOURCE_OPEN_SESSION_PREFERENCE_CURRENT,
  findProcessedResourceByKey,
  resourceFileExtensionFromFormat,
  resolveResourceReadingTarget,
  resourcesQueryOptions,
} from "@/state/resources-query"
import {
  estimateApproxWordCountFromTokens,
  readIngestFullTextMetadata,
} from "../full-text-metadata"
import { ACTIVITY_ROW_ERROR_CLASS_NAME } from "../activity-row/styles"
import { isPermissionDenied } from "../tool-permission"
import { parseToolState } from "../parse-tool-state"
import { getToolInfoForPart } from "../tool-info"
import type { ToolPartProps } from "../registry"
import type { MessagePart } from "@/state/chat-types"
import { isChatToolPart } from "../../utils/part-guards"

const FULL_TEXT_COVER_CLASS = "w-[9.5rem] max-w-full"

type IngestFullTextToolProps = ToolPartProps & {
  grouped?: boolean
}

function IngestFullTextTool({
  state,
  info,
  directory,
  onOpenResource,
  grouped,
}: IngestFullTextToolProps) {
  const metadata = readIngestFullTextMetadata(state)
  const { resource, fullTextEstimatedTokens, fullTextPath, truncated } = metadata
  const denied = isPermissionDenied(state)
  const running = state.status === "pending" || state.status === "running"
  const completed = state.status === "completed"
  const output = state.output || (state.error ?? "")
  const hasError = !denied && state.status === "error" && output.trim().length > 0
  const showTruncationNote = !denied && completed && truncated
  const resourcesQuery = useQuery({
    ...resourcesQueryOptions(directory ?? ""),
    enabled: !!directory && !!resource,
  })

  const matchedResource = useMemo(() => {
    if (!resource || !resourcesQuery.data) return undefined
    return findProcessedResourceByKey(resourcesQuery.data.processed, resource)
  }, [resource, resourcesQuery.data])

  const readingTarget = useMemo(() => {
    if (!matchedResource || !resourcesQuery.data) return undefined
    return resolveResourceReadingTarget(matchedResource, resourcesQuery.data.items)
  }, [matchedResource, resourcesQuery.data])

  const displayTitle = matchedResource?.title || matchedResource?.alias || resource
  const extension = resourceFileExtensionFromFormat(matchedResource?.format ?? "") ?? "epub"
  const approxWordCount =
    fullTextEstimatedTokens !== undefined
      ? estimateApproxWordCountFromTokens(fullTextEstimatedTokens)
      : undefined
  const canOpenReading = !!directory && !!onOpenResource && !!readingTarget && completed

  const openReading = useCallback(() => {
    if (!directory || !onOpenResource || !readingTarget) return
    onOpenResource(directory, readingTarget, {
      sessionPreference: RESOURCE_OPEN_SESSION_PREFERENCE_CURRENT,
    })
  }, [directory, onOpenResource, readingTarget])

  if (denied) {
    return <p className="text-sm text-text-weaker">{language.t("chatTools.readFullTextDenied")}</p>
  }

  if (running) {
    return (
      <div className="flex w-[9.5rem] max-w-full flex-col gap-2">
        <TextShimmer text={info.title} active className="text-sm font-medium text-text-base" />
        <div className="aspect-[3/4] w-full animate-pulse rounded-xl border border-border-weaker-base bg-surface-weak/40" />
      </div>
    )
  }

  return (
    <div
      className={
        grouped
          ? "flex w-[9.5rem] max-w-full flex-col gap-2"
          : "flex w-full max-w-sm flex-col gap-2"
      }
    >
      {!grouped ? (
        <p className="text-sm font-medium text-text-base">
          {approxWordCount !== undefined
            ? language.t("chatTools.readFullTextHeading", {
                count: approxWordCount.toLocaleString(),
              })
            : language.t("chatTools.readFullText")}
        </p>
      ) : null}
      {directory && canOpenReading ? (
        <ResourceCoverButton
          className={FULL_TEXT_COVER_CLASS}
          directory={directory}
          coverRelpath={matchedResource?.coverRelpath}
          title={displayTitle ?? resource ?? language.t("chatTools.readFullText")}
          extension={extension}
          ariaLabel={language.t("chatTools.openFullTextResource", {
            name: displayTitle ?? resource ?? language.t("chatTools.readFullText"),
          })}
          onClick={openReading}
        />
      ) : directory ? (
        <ResourceCover
          className={FULL_TEXT_COVER_CLASS}
          directory={directory}
          coverRelpath={matchedResource?.coverRelpath}
          title={displayTitle ?? resource ?? language.t("chatTools.readFullText")}
          extension={extension}
        />
      ) : null}
      {showTruncationNote ? (
        <div className="rounded-md border border-border-warning-base/50 bg-surface-warning-weak px-2.5 py-2 text-xs text-text-base">
          <p>{language.t("chatTools.fullTextTruncatedDetail")}</p>
          {fullTextPath ? (
            <p className="mt-1 break-all font-mono text-[11px] leading-relaxed text-text-weak">
              {fullTextPath}
            </p>
          ) : null}
        </div>
      ) : null}
      {hasError ? <pre className={ACTIVITY_ROW_ERROR_CLASS_NAME}>{output}</pre> : null}
    </div>
  )
}

export function renderIngestFullTextTool(props: ToolPartProps) {
  return <IngestFullTextTool {...props} />
}

function SingleIngestFullTextToolCard({
  part,
  directory,
  onOpenResource,
}: {
  part: MessagePart
  directory?: string
  onOpenResource: ToolPartProps["onOpenResource"]
}) {
  if (!isChatToolPart(part)) return null
  const state = parseToolState(part)
  const info = getToolInfoForPart(part, state)
  if (!info) return null

  return (
    <IngestFullTextTool
      part={part}
      state={state}
      info={info}
      tool={part.tool}
      directory={directory}
      onOpenResource={onOpenResource}
      grouped
    />
  )
}

export function GroupedIngestFullTextToolCard({
  parts,
  directory,
  onOpenResource,
}: {
  parts: MessagePart[]
  directory?: string
  onOpenResource: ToolPartProps["onOpenResource"]
}) {
  return (
    <div className="flex w-full flex-row flex-wrap items-start gap-3">
      {parts.map((part) => (
        <SingleIngestFullTextToolCard
          key={part.id}
          part={part}
          directory={directory}
          onOpenResource={onOpenResource}
        />
      ))}
    </div>
  )
}
