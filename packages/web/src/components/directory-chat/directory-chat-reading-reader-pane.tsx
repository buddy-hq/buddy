import { useCallback, useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Loader2Icon } from "@/icons/app-icons"
import { cn } from "@buddy/ui"
import {
  FoliateReader,
  type FoliateReaderLocation,
  type FoliateReaderSelection,
  type FoliateReaderSource,
  type FoliateReaderSnapshot,
} from "@/components/readers/foliate-reader"
import type { ReaderAnnotation } from "@/components/readers/foliate-reader-types"
import { FoliateErrorState } from "@/components/readers/ui/foliate-error-state"
import { ResourceCover } from "@/components/resources/resource-cover"
import { language } from "@/context/language"
import {
  isSupportedReadingResourcePath,
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
  onLocationChange?: (location: FoliateReaderLocation) => void
  onChatSelection?: (selection: FoliateReaderSelection) => void
  onChatSelectionRemoved?: (selectionKey: string) => void
  onAnnotationsChange?: (annotations: ReaderAnnotation[]) => void
}

const NOTEBOOK_PERSISTENCE_SUFFIX_PREFIX = "notebook"
const READER_SOURCE_KEY_SEPARATOR = "\0"
const READER_REVEAL_EASING = "ease-[cubic-bezier(0.23,1,0.32,1)]"
const READER_REVEAL_DURATION_CLASS = "duration-220"
const READER_OPEN_TIMEOUT_MS = 30_000

type ReaderErrorState = {
  sourceKey: string
  error: Error
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

export function DirectoryChatReadingReaderPane(props: DirectoryChatReadingReaderPaneProps) {
  const [readerReadySourceKey, setReaderReadySourceKey] = useState<string | null>(null)
  const [readerErrorState, setReaderErrorState] = useState<ReaderErrorState | null>(null)
  const resourceSupported = isSupportedReadingResourcePath(props.resourcePath)
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
  const readerError =
    readerErrorState?.sourceKey === readerSourceKey ? readerErrorState.error : null

  const handleReaderReady = useCallback(
    (_snapshot: FoliateReaderSnapshot) => {
      setReaderReadySourceKey(readerSourceKey)
      setReaderErrorState((current) => (current?.sourceKey === readerSourceKey ? null : current))
    },
    [readerSourceKey],
  )

  const handleReaderError = useCallback(
    (error: Error) => {
      setReaderErrorState({ sourceKey: readerSourceKey, error })
    },
    [readerSourceKey],
  )

  useEffect(() => {
    if (!readerBlobQuery.data || readerReady || readerError) return
    const timeout = setTimeout(() => {
      setReaderErrorState({
        sourceKey: readerSourceKey,
        error: new Error("The document reader did not finish opening this file."),
      })
    }, READER_OPEN_TIMEOUT_MS)
    return () => {
      clearTimeout(timeout)
    }
  }, [readerBlobQuery.data, readerError, readerReady, readerSourceKey])

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
          <Loader2Icon className="size-3.5 animate-spin" />
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

  const readerSource: FoliateReaderSource | null = readerBlobQuery.data
    ? {
        kind: "blob",
        blob: readerBlobQuery.data,
        name: props.resourceName,
      }
    : null

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
    return <FoliateErrorState error={readerError} />
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
        <FoliateReader
          source={readerSource}
          className="h-full min-h-0"
          persistenceSuffix={persistenceSuffix}
          onReady={handleReaderReady}
          onError={handleReaderError}
          onLocationChange={props.onLocationChange}
          onChatSelection={props.onChatSelection}
          onChatSelectionRemoved={props.onChatSelectionRemoved}
          onAnnotationsChange={props.onAnnotationsChange}
        />
      </div>
    </div>
  )
}
