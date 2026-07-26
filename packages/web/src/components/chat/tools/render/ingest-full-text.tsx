import { useCallback, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { toast } from "@buddy/ui"
import { TextShimmer } from "../text-shimmer"
import { ResourceCover, ResourceCoverButton } from "@/components/resources/resource-cover"
import { language } from "@/context/language"
import {
  findProcessedResourceByKey,
  resolveResourceReadingTarget,
  resourcesQueryOptions,
} from "@/state/resources-query"
import type { ResourceRecord } from "@/state/resource-actions"
import {
  estimateApproxWordCountFromTokens,
  readIngestFullTextMetadata,
} from "../full-text-metadata"
import { ACTIVITY_ROW_ERROR_CLASS_NAME } from "../activity-row/styles"
import { stringifyError } from "@/lib/api-client"
import {
  WORKSPACE_FILE_OPEN_TARGET_DEFAULT_APP,
  WORKSPACE_FILE_OPEN_TARGET_READING,
} from "@/lib/workspace-file-open"
import {
  absoluteWorkspaceFilePath,
  fileExtensionFromPath,
  fileNameFromPath,
  normalizeRelativePath,
} from "@/lib/workspace-file-paths"
import { useWorkspaceFileOpen, type WorkspaceFileActionInput } from "@/lib/use-workspace-file-open"
import { usePlatform } from "@/context/platform"
import { isPermissionDenied } from "../tool-permission"
import { parseToolState } from "../parse-tool-state"
import { getToolInfoForPart } from "../tool-info"
import type { ToolPartProps } from "../registry"
import type { MessagePart } from "@/state/chat-types"
import { isChatToolPart } from "../../utils/part-guards"

const FULL_TEXT_COVER_CLASS = "w-[9.5rem] max-w-full"
const FULL_TEXT_FALLBACK_EXTENSION = "file"
const FULL_TEXT_FALLBACK_FILE_NAME = `resource.${FULL_TEXT_FALLBACK_EXTENSION}`

type FullTextCardResource = Pick<
  ResourceRecord,
  "alias" | "format" | "sourceOriginRelpath" | "sourceRelpath"
>

export function resolveFullTextResourceFilePresentation(input: {
  resourceKey?: string
  record?: FullTextCardResource
}) {
  const sourcePath = normalizeRelativePath(
    input.record?.sourceOriginRelpath ?? input.record?.sourceRelpath ?? "",
  )
  const alias = input.record?.alias || input.resourceKey || ""
  const aliasExtension = fileExtensionFromPath(alias)
  const sourceExtension = fileExtensionFromPath(sourcePath)
  const format = input.record?.format.trim().toLowerCase() ?? ""
  const extension = aliasExtension || sourceExtension || format || FULL_TEXT_FALLBACK_EXTENSION
  const fileName =
    (aliasExtension ? alias : fileNameFromPath(sourcePath) || alias) ||
    (extension === FULL_TEXT_FALLBACK_EXTENSION
      ? FULL_TEXT_FALLBACK_FILE_NAME
      : `resource.${extension}`)

  return {
    extension,
    fileName,
    sourcePath: sourcePath || undefined,
  }
}

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
  const platform = usePlatform()
  const { resolvePlan, executePrimary } = useWorkspaceFileOpen(directory, onOpenResource)
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
  const filePresentation = resolveFullTextResourceFilePresentation({
    resourceKey: resource,
    record: matchedResource,
  })
  const approxWordCount =
    fullTextEstimatedTokens !== undefined
      ? estimateApproxWordCountFromTokens(fullTextEstimatedTokens)
      : undefined
  const resourcePath = readingTarget?.path ?? filePresentation.sourcePath
  const resourceName = readingTarget?.name ?? filePresentation.fileName
  const resourceObjectID = readingTarget?.objectID ?? matchedResource?.objectID
  const resourceStatus = readingTarget?.status ?? matchedResource?.status
  const sourceSizeBytes = matchedResource?.sourceSizeBytes
  const canOpenDefaultApp = platform.openPath !== undefined
  const openInput = useMemo<WorkspaceFileActionInput | undefined>(() => {
    if (!directory || !resourcePath || !matchedResource) return undefined
    return {
      path: resourcePath,
      absolutePath: absoluteWorkspaceFilePath({
        directory,
        path: resourcePath,
      }),
      name: resourceName,
      ...(resourceObjectID ? { objectID: resourceObjectID } : {}),
      ...(resourceStatus ? { resourceStatus } : {}),
      ...(sourceSizeBytes !== undefined ? { sizeBytes: sourceSizeBytes } : {}),
      available: completed && matchedResource.status === "ready",
      canOpenInBuddy: true,
      canOpenDefaultApp,
      canReveal: false,
    }
  }, [
    canOpenDefaultApp,
    completed,
    directory,
    matchedResource,
    resourceName,
    resourceObjectID,
    resourcePath,
    resourceStatus,
    sourceSizeBytes,
  ])
  const primaryOpenTarget = openInput ? resolvePlan(openInput).primaryTarget : undefined
  const canOpenResource = primaryOpenTarget !== undefined

  const openResource = useCallback(() => {
    if (!openInput) return
    void executePrimary(openInput).catch((error: unknown) => {
      toast.error(stringifyError(error))
    })
  }, [executePrimary, openInput])

  const openResourceLabel =
    primaryOpenTarget === WORKSPACE_FILE_OPEN_TARGET_READING
      ? language.t("chatTools.openFullTextResource", {
          name: displayTitle ?? resource ?? language.t("chatTools.readFullText"),
        })
      : primaryOpenTarget === WORKSPACE_FILE_OPEN_TARGET_DEFAULT_APP
        ? language.t("chatTools.openFullTextResourceInDefaultApp", {
            name: displayTitle ?? resource ?? language.t("chatTools.readFullText"),
          })
        : language.t("chatTools.openFullTextResourceInBench", {
            name: displayTitle ?? resource ?? language.t("chatTools.readFullText"),
          })

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
      {directory && canOpenResource ? (
        <ResourceCoverButton
          className={FULL_TEXT_COVER_CLASS}
          directory={directory}
          coverRelpath={matchedResource?.coverRelpath}
          title={displayTitle ?? resource ?? language.t("chatTools.readFullText")}
          extension={filePresentation.extension}
          fileName={filePresentation.fileName}
          ariaLabel={openResourceLabel}
          onClick={openResource}
        />
      ) : directory ? (
        <ResourceCover
          className={FULL_TEXT_COVER_CLASS}
          directory={directory}
          coverRelpath={matchedResource?.coverRelpath}
          title={displayTitle ?? resource ?? language.t("chatTools.readFullText")}
          extension={filePresentation.extension}
          fileName={filePresentation.fileName}
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
