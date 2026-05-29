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
import { HIDDEN_STEPS_ERROR_CLASS_NAME } from "../hidden-steps/styles"
import { isPermissionDenied } from "../tool-permission"
import type { ToolPartProps } from "../registry"

const FULL_TEXT_COVER_CLASS = "w-[9.5rem] max-w-full"

function IngestFullTextTool({ state, directory, onOpenResource }: ToolPartProps) {
  const { resource, fullTextEstTokens, outputPath, truncated } = readIngestFullTextMetadata(state)
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
    fullTextEstTokens !== undefined
      ? estimateApproxWordCountFromTokens(fullTextEstTokens)
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
      <div className="flex w-full max-w-[9.5rem] flex-col gap-2">
        <TextShimmer
          text={language.t("chatTools.readFullText.running")}
          active
          className="text-sm font-medium text-text-base"
        />
        <div className="aspect-[3/4] w-full animate-pulse rounded-xl border border-border-weaker-base bg-surface-weak/40" />
      </div>
    )
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-2">
      <p className="text-sm font-medium text-text-base">
        {approxWordCount !== undefined
          ? language.t("chatTools.readFullTextHeading", {
              count: approxWordCount.toLocaleString(),
            })
          : language.t("chatTools.readFullText")}
      </p>
      {displayTitle ? (
        <p className="line-clamp-2 text-sm leading-snug text-text-weaker">{displayTitle}</p>
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
          {outputPath ? (
            <p className="mt-1 break-all font-mono text-[11px] leading-relaxed text-text-weak">
              {outputPath}
            </p>
          ) : null}
        </div>
      ) : null}
      {hasError ? <pre className={HIDDEN_STEPS_ERROR_CLASS_NAME}>{output}</pre> : null}
    </div>
  )
}

export function renderIngestFullTextTool(props: ToolPartProps) {
  return <IngestFullTextTool {...props} />
}
