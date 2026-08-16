import { useCallback, useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Loader2Icon } from "@/icons/app-icons"
import { cn, toast } from "@buddy/ui"
import { readReaderExternalLink } from "@buddy/reader-contract"
import { readerSourceFormatFromPath } from "@buddy/workspace-file-policy"
import { DocumentReader } from "@/components/readers/document-reader"
import type {
  ReaderAnnotation,
  ReaderRelocation,
  ReaderSelection,
  ReaderSnapshot,
  ReaderSource,
} from "@/components/readers/reader-types"
import { ReaderErrorState } from "@/components/readers/ui/reader-error-state"
import { ResourceCover } from "@/components/resources/resource-cover"
import { language } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { normalizeRelativePath } from "@/lib/workspace-file-paths"
import {
  readingResourceBlobQueryOptions,
  type ResourceFileExtension,
} from "@/state/resources-query"

type DirectoryChatReadingReaderPaneProps = {
  directory: string
  resourceName: string
  resourcePath: string
  objectID?: string
  coverRelpath?: string
  coverExtension?: ResourceFileExtension
  resourceStatus?: "preparing" | "ready" | "unsupported" | "error" | "stale" | "unprocessed"
  onLocationChange?: (location: ReaderRelocation) => void
  onChatSelection?: (selection: ReaderSelection) => void
  onChatSelectionRemoved?: (selectionKey: string) => void
  onAnnotationsChange?: (annotations: ReaderAnnotation[]) => void
}

const NOTEBOOK_PERSISTENCE_SUFFIX_PREFIX = "notebook"
const READER_SOURCE_ID_NAMESPACE = "workspace-reader"
const READER_SOURCE_KEY_SEPARATOR = "\0"
const READER_REVEAL_EASING = "ease-[cubic-bezier(0.23,1,0.32,1)]"
const READER_REVEAL_DURATION_CLASS = "duration-220"
const READER_OPEN_TIMEOUT_MS = 30_000

type ReaderFailureState = {
  sourceKey: string
  error: Error
}

export function shouldStartReaderOpenTimeout(input: {
  hasReaderData: boolean
  ready: boolean
  failed: boolean
  interactionPending: boolean
}): boolean {
  return input.hasReaderData && !input.ready && !input.failed && !input.interactionPending
}

function buildReaderSourceKey(input: {
  directory: string
  resourcePath: string
  dataUpdatedAt: number
}): string {
  return [input.directory, input.resourcePath, input.dataUpdatedAt].join(
    READER_SOURCE_KEY_SEPARATOR,
  )
}

export function buildWorkspaceReaderSourceId(input: {
  directory: string
  resourcePath: string
  objectID?: string
}): string {
  if (input.objectID) {
    return JSON.stringify([READER_SOURCE_ID_NAMESPACE, "object", input.objectID])
  }
  const normalizedDirectory = input.directory.trim().replaceAll("\\", "/").replace(/\/+$/u, "")
  const normalizedPath = normalizeRelativePath(input.resourcePath)
  return JSON.stringify([READER_SOURCE_ID_NAMESPACE, "path", normalizedDirectory, normalizedPath])
}

export function DirectoryChatReadingReaderPane(props: DirectoryChatReadingReaderPaneProps) {
  const platform = usePlatform()
  const [readerReadySourceKey, setReaderReadySourceKey] = useState<string | null>(null)
  const [readerErrorState, setReaderErrorState] = useState<ReaderFailureState | null>(null)
  const [readerInteractionSourceKey, setReaderInteractionSourceKey] = useState<string | null>(null)
  const readerFormat = readerSourceFormatFromPath(props.resourcePath)
  const resourceSupported = readerFormat !== null
  const readerBlobQuery = useQuery({
    ...readingResourceBlobQueryOptions(props.directory, props.resourcePath),
    enabled: Boolean(props.resourcePath) && resourceSupported,
  })
  const readerSourceKey = buildReaderSourceKey({
    directory: props.directory,
    resourcePath: props.resourcePath,
    dataUpdatedAt: readerBlobQuery.dataUpdatedAt,
  })
  const readerReady = readerReadySourceKey === readerSourceKey
  const readerInteractionPending = readerInteractionSourceKey === readerSourceKey
  const readerError =
    readerErrorState?.sourceKey === readerSourceKey ? readerErrorState.error : null
  const readerSource = useMemo<ReaderSource | null>(() => {
    if (!readerBlobQuery.data || !readerFormat) return null
    return {
      kind: "blob",
      blob: readerBlobQuery.data,
      name: props.resourceName,
      sourceId: buildWorkspaceReaderSourceId(
        Object.assign(
          {
            directory: props.directory,
            resourcePath: props.resourcePath,
          },
          props.objectID ? { objectID: props.objectID } : undefined,
        ),
      ),
      format: readerFormat,
    }
  }, [
    props.directory,
    props.objectID,
    props.resourceName,
    props.resourcePath,
    readerBlobQuery.data,
    readerFormat,
  ])

  const handleReaderReady = useCallback(
    (_snapshot: ReaderSnapshot) => {
      setReaderReadySourceKey(readerSourceKey)
      setReaderInteractionSourceKey((current) => (current === readerSourceKey ? null : current))
      setReaderErrorState((current) => (current?.sourceKey === readerSourceKey ? null : current))
    },
    [readerSourceKey],
  )

  const handleReaderError = useCallback(
    (error: Error) => {
      setReaderInteractionSourceKey((current) => (current === readerSourceKey ? null : current))
      setReaderErrorState({ sourceKey: readerSourceKey, error })
    },
    [readerSourceKey],
  )

  const handleOpenExternalLink = useCallback(
    (href: string) => {
      const safeHref = readReaderExternalLink(href)
      if (!safeHref) {
        toast.error("This document link type is not supported.")
        return
      }
      platform.openLink(safeHref)
    },
    [platform],
  )

  const handleOpeningInteractionChange = useCallback(
    (pending: boolean) => {
      setReaderInteractionSourceKey((current) => {
        if (pending) return readerSourceKey
        return current === readerSourceKey ? null : current
      })
    },
    [readerSourceKey],
  )

  useEffect(() => {
    if (
      !shouldStartReaderOpenTimeout({
        hasReaderData: Boolean(readerBlobQuery.data),
        ready: readerReady,
        failed: Boolean(readerError),
        interactionPending: readerInteractionPending,
      })
    ) {
      return
    }
    const timeout = setTimeout(() => {
      setReaderErrorState({
        sourceKey: readerSourceKey,
        error: new Error("The document reader did not finish opening this file."),
      })
    }, READER_OPEN_TIMEOUT_MS)
    return () => {
      clearTimeout(timeout)
    }
  }, [readerBlobQuery.data, readerError, readerInteractionPending, readerReady, readerSourceKey])

  function renderOpeningState(label: string) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-5 px-6">
        {props.coverExtension ? (
          <ResourceCover
            directory={props.directory}
            coverRelpath={props.coverRelpath}
            title={props.resourceName}
            extension={props.coverExtension}
            className="w-[clamp(12rem,28vw,22rem)] shadow-[0_18px_60px_color-mix(in_oklab,var(--surface-strong)_16%,transparent)]"
          />
        ) : (
          <div className="aspect-[3/4] w-[clamp(12rem,28vw,22rem)] rounded-xl border border-border-weaker-base bg-surface-raised-stronger shadow-[0_18px_60px_color-mix(in_oklab,var(--surface-strong)_16%,transparent)]" />
        )}

        <div className="inline-flex items-center gap-2 rounded-full border border-border-base/50 bg-surface-raised-base/88 px-3 py-1.5 text-xs text-text-weaker shadow-sm backdrop-blur">
          <Loader2Icon className="size-3.5 animate-spin motion-reduce:animate-none" />
          {label}
        </div>
      </div>
    )
  }

  if (!props.resourcePath) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="max-w-xl rounded-2xl border border-border-critical-base/40 bg-surface-critical-base/10 px-4 py-3 text-sm text-icon-critical-base">
          {language.t("sidebar.resourcesSelectFile")}
        </div>
      </div>
    )
  }

  if (!resourceSupported) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="max-w-xl rounded-2xl border border-border-critical-base/40 bg-surface-critical-base/10 px-4 py-3 text-sm text-icon-critical-base">
          {language.t("sidebar.resourcesUnsupportedInReader")}
        </div>
      </div>
    )
  }

  if (readerBlobQuery.isPending) {
    return (
      <div className="h-full bg-background-base">
        <div className="sr-only">{language.t("projectExplorer.loadingFile")}</div>
        {renderOpeningState(language.t("projectExplorer.loadingFile"))}
      </div>
    )
  }

  if (readerBlobQuery.error) {
    const message =
      readerBlobQuery.error instanceof Error
        ? readerBlobQuery.error.message
        : String(readerBlobQuery.error)
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="max-w-xl rounded-2xl border border-border-critical-base/40 bg-surface-critical-base/10 px-4 py-3 text-sm text-icon-critical-base">
          {message}
        </div>
      </div>
    )
  }

  if (readerError) {
    return <ReaderErrorState error={readerError} />
  }

  if (!readerSource) {
    return null
  }

  const persistenceSuffix = props.objectID
    ? `${NOTEBOOK_PERSISTENCE_SUFFIX_PREFIX}:${props.objectID}`
    : undefined
  const readerSettled = readerReady

  return (
    <div className="relative h-full min-h-0 overflow-hidden bg-background-base">
      <div
        aria-hidden={readerSettled}
        className={cn(
          "pointer-events-none absolute inset-0 z-10 transition-[opacity,transform,filter] motion-reduce:transition-none",
          READER_REVEAL_DURATION_CLASS,
          READER_REVEAL_EASING,
          readerSettled ? "scale-[1.015] opacity-0 blur-[2px]" : "scale-100 opacity-100 blur-0",
        )}
      >
        {renderOpeningState(language.t("projectExplorer.loadingFile"))}
      </div>

      <div
        className={cn(
          "h-full transition-[opacity,transform,filter] motion-reduce:transition-none",
          READER_REVEAL_DURATION_CLASS,
          READER_REVEAL_EASING,
          readerSettled ? "scale-100 opacity-100 blur-0" : "scale-[0.985] opacity-0 blur-[6px]",
        )}
      >
        <DocumentReader
          source={readerSource}
          className="h-full min-h-0"
          persistenceSuffix={persistenceSuffix}
          onReady={handleReaderReady}
          onError={handleReaderError}
          onLocationChange={props.onLocationChange}
          onChatSelection={props.onChatSelection}
          onChatSelectionRemoved={props.onChatSelectionRemoved}
          onAnnotationsChange={props.onAnnotationsChange}
          onOpenExternalLink={handleOpenExternalLink}
          onOpeningInteractionChange={handleOpeningInteractionChange}
        />
      </div>
    </div>
  )
}
